import type {
  AccountRole,
  AuthEmbedSsoRequest,
  AuthLoginRequest,
  AuthLoginResponse,
  AuthSubUser,
  JwtUser,
} from "@chatai/contracts";
import { createHash, randomBytes } from "node:crypto";
import type { Kysely } from "kysely";
import type { FastifyInstance } from "fastify";
import type { CachePort } from "../../cache/cache-port.js";
import { buildCacheKeys } from "../../cache/keys.js";
import type { Database } from "../../db/schema.js";
import { AppError, UnauthorizedError } from "../../shared/errors.js";
import { verifyAltchaPayload } from "./altcha.service.js";
import { verifyPassword } from "./password.service.js";
import {
  chatAiSubAccountTypes,
  dbSubAccountType,
  deriveAccountRole,
  deriveAccountType,
  canManageWorkflowTemplates,
  getRolePermissions,
} from "./permissions.js";
import type { SmpEmbedDecryptPort } from "./smp-embed-decrypt-port.js";
import { canStartSupportInvestigation } from "./support-investigation-access.js";
import {
  createAuthSessionStore,
  type ActiveSessionRow,
  type AuthSessionKind,
  type AuthSessionStore,
} from "./auth-session-store.js";

const ACCESS_TOKEN_EXPIRES_IN_SECONDS = 20 * 60;
const REFRESH_TOKEN_EXPIRES_IN_DAYS = 14;
export const REFRESH_TOKEN_EXPIRES_IN_SECONDS =
  REFRESH_TOKEN_EXPIRES_IN_DAYS * 24 * 60 * 60;
const SESSION_CACHE_TTL_SECONDS = 5 * 60;
const NEGATIVE_SESSION_CACHE_TTL_SECONDS = 60;
const EMBED_HANDOFF_TOKEN_MAX_AGE_SECONDS = 10 * 60;

type SubUserCredentialRow = {
  id: number;
  name: string;
  password_hash: string;
  role: string;
  type: number;
  uid: number;
};

export type LoginRequestMetadata = {
  ip?: string;
  userAgent?: string;
};

export class InvalidCredentialsError extends AppError {
  constructor() {
    super("INVALID_CREDENTIALS", "用户名或密码错误", 401);
  }
}

export class InvalidEmbedTicketError extends AppError {
  constructor() {
    super("EMBED_SSO_REJECTED", "当前账号不可用", 401);
  }
}

export class InvalidEmbedHandoffTokenError extends AppError {
  constructor() {
    super("EMBED_HANDOFF_REJECTED", "登录信息已失效", 401);
  }
}

export type AuthSessionTokens = {
  accessToken: string;
  cookiesChanged: boolean;
  expiresIn: number;
  refreshToken?: string;
  refreshTokenExpiresIn: number;
  subUser?: AuthSubUser;
  tokenType: "Bearer";
};

export async function loginWithE2eUser(app: FastifyInstance, metadata: LoginRequestMetadata = {}) {
  if (process.env.NODE_ENV === "production") {
    throw new UnauthorizedError();
  }

  if (process.env.E2E_LOGIN_ENABLED !== "true") {
    throw new AppError(
      "E2E_LOGIN_NOT_ENABLED",
      "E2E 登录未启用，请在后端本地环境配置 E2E_LOGIN_ENABLED=true",
      503,
    );
  }

  const rawUserId = process.env.E2E_LOGIN_USER_ID?.trim();
  const userId = Number(rawUserId);
  if (!rawUserId || !Number.isSafeInteger(userId) || userId <= 0) {
    throw new AppError(
      "E2E_LOGIN_USER_NOT_CONFIGURED",
      "E2E 登录账号未配置，请在后端本地环境配置 E2E_LOGIN_USER_ID",
      503,
    );
  }

  const subUser = await findActiveSubUser(app.db, userId, "app");
  if (!subUser) {
    throw new AppError(
      "E2E_LOGIN_USER_NOT_FOUND",
      "E2E_LOGIN账号不存在或已停用，请检查 E2E_LOGIN_USER_ID",
      503,
    );
  }

  return issueAuthSession(app, subUser, metadata, "app");
}

export async function loginWithPassword(
  app: FastifyInstance,
  payload: AuthLoginRequest,
  metadata: LoginRequestMetadata = {},
): Promise<AuthSessionTokens> {
  const altcha = await verifyAltchaPayload(payload.altcha);

  if (!altcha.verified) {
    throw new InvalidCredentialsError();
  }

  const subUser = await findActiveSubUserCredential(app.db, payload.account);

  if (!subUser) {
    throw new InvalidCredentialsError();
  }

  if (!(await verifyPassword(subUser.password_hash, payload.password))) {
    throw new InvalidCredentialsError();
  }

  return issueAuthSession(app, subUser, metadata, "app");
}

export async function loginWithSmpEmbed(
  app: FastifyInstance,
  payload: AuthEmbedSsoRequest,
  decryptPort: SmpEmbedDecryptPort,
  metadata: LoginRequestMetadata = {},
  currentCredentials: {
    accessToken?: string;
    refreshToken?: string;
  } = {},
): Promise<AuthSessionTokens> {
  const decryptedToken = await decryptPort.decrypt(payload.token);
  const identity = parseEmbedHandoffToken(decryptedToken);

  if (!identity) {
    throw new InvalidEmbedHandoffTokenError();
  }

  const { subUserId, uid } = identity;

  const subUser = await findActiveSubUser(app.db, subUserId, "embed");

  if (!subUser || subUser.uid !== uid) {
    throw new InvalidEmbedTicketError();
  }

  const store = createAuthSessionStore(app, "embed");
  const currentAccess = await readValidCurrentAccess(
    app,
    currentCredentials.accessToken,
    "embed",
  );

  if (currentAccess) {
    if (
      currentAccess.user.subUserId === String(subUser.id)
      && currentAccess.user.uid === subUser.uid
    ) {
      return {
        accessToken: currentAccess.accessToken,
        cookiesChanged: false,
        expiresIn: currentAccess.expiresIn,
        refreshTokenExpiresIn: REFRESH_TOKEN_EXPIRES_IN_SECONDS,
        subUser: mapAuthSubUser(subUser),
        tokenType: "Bearer",
      };
    }

    await store.revoke(currentAccess.user);
    return issueAuthSession(app, subUser, metadata, "embed", store);
  }

  const currentRefreshSession = currentCredentials.refreshToken
    ? await store.findActiveByRefreshTokenHash(
      hashRefreshToken(currentCredentials.refreshToken),
    )
    : undefined;

  if (
    currentRefreshSession
    && currentRefreshSession.sub_user_id !== subUser.id
  ) {
    await store.revokeById(currentRefreshSession);
  }

  if (currentCredentials.refreshToken) {
    const refreshed = await refreshSession(
      app,
      currentCredentials.refreshToken,
      "embed",
      store,
      { subUserId: subUser.id, uid: subUser.uid },
      currentRefreshSession,
    );

    if (
      refreshed
      && refreshed.subUser?.subUserId === String(subUser.id)
      && refreshed.subUser.uid === subUser.uid
    ) {
      return refreshed;
    }
  }

  return issueAuthSession(app, subUser, metadata, "embed", store);
}

async function issueAuthSession(
  app: FastifyInstance,
  subUser: {
    id: number;
    name: string;
    role?: string | null;
    type?: number | null;
    uid: number;
  },
  metadata: LoginRequestMetadata,
  kind: AuthSessionKind,
  store = createAuthSessionStore(app, kind),
): Promise<AuthSessionTokens> {
  const refreshToken = createRefreshToken();
  const session = await store.create(
    subUser.id,
    hashRefreshToken(refreshToken),
    createRefreshExpiry(),
    {
      ip: metadata.ip,
      userAgent: metadata.userAgent,
    },
  );
  const subUserId = String(subUser.id);
  await store.invalidateSubUserSessions(subUserId);
  await writeSessionCache(
    app.cache,
    store.cacheKeys,
    {
      expiresAt: session.expiresAt,
      sessionId: String(session.id),
      sessionVersion: session.sessionVersion,
      subUserId,
    },
  );
  const accountRole = deriveAccountRole(subUser);
  const accessToken = signAccessToken(
    app,
    subUserId,
    subUser.uid,
    session,
    accountRole,
    kind,
  );

  return {
    accessToken,
    cookiesChanged: true,
    expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
    refreshToken,
    refreshTokenExpiresIn: REFRESH_TOKEN_EXPIRES_IN_SECONDS,
    subUser: mapAuthSubUser(subUser),
    tokenType: "Bearer",
  };
}

export async function refreshAccessToken(
  app: FastifyInstance,
  refreshToken: string,
  kind: AuthSessionKind = "app",
): Promise<AuthSessionTokens> {
  const refreshed = await refreshSession(app, refreshToken, kind);

  if (!refreshed) {
    throw new UnauthorizedError();
  }

  return refreshed;
}

export async function getCurrentSession(
  app: FastifyInstance,
  user: JwtUser,
  kind: AuthSessionKind,
): Promise<AuthLoginResponse["subUser"]> {
  if (!user.subUserId) {
    throw new UnauthorizedError();
  }

  const subUser = await findActiveSubUser(app.db, Number(user.subUserId), kind);

  if (!subUser) {
    throw new UnauthorizedError();
  }

  return mapAuthSubUser(subUser, user.accessMode === "support_readonly");
}

export async function revokeSession(
  app: FastifyInstance,
  user: JwtUser,
  kind: AuthSessionKind = "app",
) {
  if (user.accessMode === "support_readonly") {
    return { revoked: true };
  }

  await createAuthSessionStore(app, kind).revoke(user);

  return { revoked: true };
}

export async function verifyAccessSession(
  db: Kysely<Database>,
  user: JwtUser,
  cache?: CachePort,
  cacheKeys: ReturnType<typeof buildCacheKeys> = buildCacheKeys("chatai:"),
  kind: AuthSessionKind = "app",
): Promise<boolean> {
  const sessionId = Number(user.sessionId);

  if (
    !Number.isSafeInteger(sessionId) ||
    !user.subUserId ||
    !Number.isSafeInteger(user.sessionVersion) ||
    !Number.isSafeInteger(user.uid) ||
    user.uid <= 0
    || !isSessionKindAllowed(user, kind)
  ) {
    return false;
  }

  const store = createAuthSessionStore({ cache, cacheKeys, db }, kind);
  const sessionKey = store.cacheKeys.authSession(user.sessionId);
  const cachedSession = await readSessionCache(cache, sessionKey);

  if (
    cachedSession?.valid === false &&
    shouldRejectNegativeSessionCache(cachedSession, user)
  ) {
    return false;
  }

  if (
    isPositiveSessionCache(cachedSession) &&
    cachedSession.subUserId === user.subUserId &&
    cachedSession.sessionVersion === user.sessionVersion &&
    cachedSession.expiresAtMs > Date.now()
  ) {
    return true;
  }

  const session = await store.findActiveAccessSession(user);

  if (!session) {
    await cache?.set(
      sessionKey,
      JSON.stringify({
        sessionVersion: user.sessionVersion,
        subUserId: user.subUserId,
        valid: false,
      }),
      NEGATIVE_SESSION_CACHE_TTL_SECONDS,
    );
    return false;
  }

  const ttlSeconds = Math.max(
    1,
    Math.min(
      SESSION_CACHE_TTL_SECONDS,
      Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000),
    ),
  );
  await writeSessionCache(
    cache,
    store.cacheKeys,
    {
      expiresAt: new Date(session.expires_at),
      sessionId: user.sessionId,
      sessionVersion: user.sessionVersion,
      subUserId: user.subUserId,
    },
    ttlSeconds,
  );

  return true;
}

async function findActiveSubUserCredential(
  db: Kysely<Database>,
  account: string,
): Promise<SubUserCredentialRow | undefined> {
  const normalizedAccount = account.trim();

  if (!normalizedAccount) {
    return undefined;
  }

  return db
    .selectFrom("xy_wap_embed_sub_user")
    .select(["id", "name", "password_hash", "role", "type", "uid"])
    .where("account", "=", normalizedAccount)
    .where("status", "=", 1)
    .where("type", "in", chatAiSubAccountTypes)
    .executeTakeFirst();
}

async function findActiveSubUser(
  db: Kysely<Database>,
  subUserId: number,
  kind: AuthSessionKind,
) {
  let query = db
    .selectFrom("xy_wap_embed_sub_user")
    .select(["id", "name", "role", "type", "uid"])
    .where("id", "=", subUserId)
    .where("status", "=", 1);

  query = kind === "embed"
    ? query.where("type", "=", dbSubAccountType.embed)
    : query.where("type", "in", chatAiSubAccountTypes);

  return query.executeTakeFirst();
}

async function refreshSession(
  app: FastifyInstance,
  refreshToken: string,
  kind: AuthSessionKind,
  store = createAuthSessionStore(app, kind),
  expectedIdentity?: { subUserId: number; uid: number },
  knownSession?: ActiveSessionRow,
): Promise<AuthSessionTokens | undefined> {
  if (!refreshToken.trim()) {
    return undefined;
  }

  const session = knownSession ?? await store.findActiveByRefreshTokenHash(
    hashRefreshToken(refreshToken),
  );

  if (
    !session
    || (expectedIdentity && session.sub_user_id !== expectedIdentity.subUserId)
  ) {
    return undefined;
  }

  const subUser = await findActiveSubUser(app.db, session.sub_user_id, kind);

  if (!subUser || (expectedIdentity && subUser.uid !== expectedIdentity.uid)) {
    return undefined;
  }

  await store.touch(session.id);

  return {
    accessToken: signAccessToken(
      app,
      String(session.sub_user_id),
      subUser.uid,
      {
        id: session.id,
        sessionVersion: session.session_version,
      },
      deriveAccountRole(subUser),
      kind,
    ),
    cookiesChanged: true,
    expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
    refreshToken,
    refreshTokenExpiresIn: REFRESH_TOKEN_EXPIRES_IN_SECONDS,
    subUser: mapAuthSubUser(subUser),
    tokenType: "Bearer",
  };
}

async function readValidCurrentAccess(
  app: FastifyInstance,
  accessToken: string | undefined,
  kind: AuthSessionKind,
) {
  if (!accessToken) {
    return undefined;
  }

  try {
    const user = app.jwt.verify<JwtUser & { exp?: number }>(accessToken);
    const valid = await verifyAccessSession(
      app.db,
      user,
      app.cache,
      app.cacheKeys,
      kind,
    );

    if (!valid) {
      return undefined;
    }

    const expiresIn = typeof user.exp === "number"
      ? Math.max(1, user.exp - Math.floor(Date.now() / 1000))
      : ACCESS_TOKEN_EXPIRES_IN_SECONDS;

    return { accessToken, expiresIn, user };
  } catch {
    return undefined;
  }
}

function signAccessToken(
  app: FastifyInstance,
  subUserId: string,
  uid: number,
  session: { id: number; sessionVersion: number },
  role: AccountRole = "operator",
  kind: AuthSessionKind = "app",
) {
  return app.jwt.sign({
    roles: [role],
    sessionKind: kind,
    sessionId: String(session.id),
    sessionVersion: session.sessionVersion,
    subUserId,
    uid,
  });
}

function isSessionKindAllowed(user: JwtUser, kind: AuthSessionKind) {
  if (kind === "embed") {
    return user.sessionKind === "embed";
  }

  return user.sessionKind === undefined || user.sessionKind === "app";
}

async function writeSessionCache(
  cache: CachePort | undefined,
  cacheKeys: ReturnType<typeof buildCacheKeys>,
  session: {
    expiresAt: Date | number | string;
    sessionId: string;
    sessionVersion: number;
    subUserId: string;
  },
  ttlSeconds?: number,
) {
  const expiresAtMs = new Date(session.expiresAt).getTime();

  if (!Number.isFinite(expiresAtMs)) {
    return;
  }

  const resolvedTtlSeconds =
    ttlSeconds ??
    Math.max(
      1,
      Math.min(
        SESSION_CACHE_TTL_SECONDS,
        Math.floor((expiresAtMs - Date.now()) / 1000),
      ),
    );
  const sessionKey = cacheKeys.authSession(session.sessionId);
  const indexKey = cacheKeys.authSessionIndex(session.subUserId);
  const value = JSON.stringify({
    expiresAtMs,
    sessionVersion: session.sessionVersion,
    subUserId: session.subUserId,
    valid: true,
  });

  if (cache?.setSessionWithIndex) {
    await cache.setSessionWithIndex({
      indexKey,
      indexTtlSeconds: REFRESH_TOKEN_EXPIRES_IN_SECONDS,
      sessionId: session.sessionId,
      sessionKey,
      sessionTtlSeconds: resolvedTtlSeconds,
      value,
    });
    return;
  }

  await cache?.set(sessionKey, value, resolvedTtlSeconds);
  await cache?.sadd(indexKey, [session.sessionId], REFRESH_TOKEN_EXPIRES_IN_SECONDS);
}

type SessionCacheValue =
  | {
      expiresAtMs: number;
      sessionVersion: number;
      subUserId: string;
      valid: true;
    }
  | {
      sessionVersion?: number;
      subUserId?: string;
      valid: false;
    };

async function readSessionCache(cache: CachePort | undefined, key: string) {
  let cached: string | null | undefined;

  try {
    cached = await cache?.get(key);
  } catch {
    return undefined;
  }

  if (!cached) {
    return undefined;
  }

  try {
    const value = JSON.parse(cached) as Partial<SessionCacheValue>;

    if (!value || typeof value !== "object") {
      return undefined;
    }

    if (value.valid === false) {
      return {
        sessionVersion: typeof value.sessionVersion === "number"
          ? value.sessionVersion
          : undefined,
        subUserId: typeof value.subUserId === "string" ? value.subUserId : undefined,
        valid: false,
      } satisfies SessionCacheValue;
    }

    if (
      value.valid === true &&
      typeof value.subUserId === "string" &&
      typeof value.sessionVersion === "number" &&
      Number.isSafeInteger(value.sessionVersion) &&
      typeof value.expiresAtMs === "number" &&
      Number.isFinite(value.expiresAtMs)
    ) {
      return {
        expiresAtMs: value.expiresAtMs,
        sessionVersion: value.sessionVersion,
        subUserId: value.subUserId,
        valid: true,
      } satisfies SessionCacheValue;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function isPositiveSessionCache(
  value: SessionCacheValue | undefined,
): value is Extract<SessionCacheValue, { valid: true }> {
  return value?.valid === true;
}

function shouldRejectNegativeSessionCache(
  value: Extract<SessionCacheValue, { valid: false }>,
  user: JwtUser,
) {
  if (value.subUserId === undefined || value.sessionVersion === undefined) {
    return false;
  }

  return value.subUserId === user.subUserId && value.sessionVersion === user.sessionVersion;
}

function mapAuthSubUser(row: {
  id: number;
  name: string;
  role?: string | null;
  type?: number | null;
  uid: number;
}, supportReadOnly = false): AuthSubUser {
  const role = deriveAccountRole(row);
  const supportInvestigationAllowed = !supportReadOnly && canStartSupportInvestigation({
    subUserId: String(row.id),
    uid: row.uid,
  });
  const permissions = getRolePermissions(role);
  if (canManageWorkflowTemplates({ subUserId: String(row.id), uid: row.uid })) {
    permissions.push("workflow_template_manage");
  }

  return {
    ...(supportReadOnly ? { accessMode: "support_readonly" as const } : {}),
    accountType: deriveAccountType(row.type),
    ...(supportInvestigationAllowed ? { canStartSupportInvestigation: true } : {}),
    displayName: row.name,
    permissions,
    role,
    subUserId: String(row.id),
    uid: row.uid,
  };
}

function createRefreshToken() {
  return randomBytes(32).toString("base64url");
}

function hashRefreshToken(refreshToken: string) {
  return createHash("sha256").update(refreshToken).digest("hex");
}

function createRefreshExpiry() {
  return new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000);
}

function parsePositiveInteger(value: string) {
  const normalized = value.trim();

  if (!/^[1-9]\d*$/.test(normalized)) {
    return undefined;
  }

  const parsed = Number(normalized);

  if (!Number.isSafeInteger(parsed)) {
    return undefined;
  }

  return parsed;
}

function parseEmbedHandoffToken(value: string) {
  const parts = value.trim().split("_");

  if (parts.length !== 3) {
    return undefined;
  }

  const subUserId = parsePositiveInteger(parts[0] ?? "");
  const uid = parsePositiveInteger(parts[1] ?? "");
  const issuedAtSeconds = parsePositiveInteger(parts[2] ?? "");

  if (
    subUserId === undefined
    || uid === undefined
    || issuedAtSeconds === undefined
  ) {
    return undefined;
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - issuedAtSeconds;

  if (ageSeconds < 0 || ageSeconds > EMBED_HANDOFF_TOKEN_MAX_AGE_SECONDS) {
    return undefined;
  }

  return { subUserId, uid };
}
