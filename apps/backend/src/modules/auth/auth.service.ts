import type {
  AccountRole,
  AuthLoginRequest,
  AuthLoginResponse,
  AuthSubUser,
  JwtUser,
} from "@chatai/contracts";
import { createHash, randomBytes } from "node:crypto";
import type { Kysely } from "kysely";
import type { FastifyInstance } from "fastify";
import type { CachePort } from "../../cache/cache-port.js";
import {
  invalidateSession,
  invalidateSubUserSessions,
} from "../../cache/invalidation.js";
import { buildCacheKeys } from "../../cache/keys.js";
import type { Database } from "../../db/schema.js";
import { AppError, UnauthorizedError } from "../../shared/errors.js";
import { verifyAltchaPayload } from "./altcha.service.js";
import { verifyPassword } from "./password.service.js";
import {
  deriveAccountRole,
  deriveAccountType,
  getRolePermissions,
} from "./permissions.js";

const ACCESS_TOKEN_EXPIRES_IN_SECONDS = 20 * 60;
const REFRESH_TOKEN_EXPIRES_IN_DAYS = 14;
export const REFRESH_TOKEN_EXPIRES_IN_SECONDS =
  REFRESH_TOKEN_EXPIRES_IN_DAYS * 24 * 60 * 60;
const SESSION_CACHE_TTL_SECONDS = 5 * 60;
const NEGATIVE_SESSION_CACHE_TTL_SECONDS = 60;

type SubUserCredentialRow = {
  id: number;
  name: string;
  password_hash: string;
  role: string;
  type: number;
  uid: number;
};

type SessionRow = {
  expires_at: Date;
  id: number;
  refresh_token_hash: string;
  revoked_at: Date | null;
  session_version: number;
  sub_user_id: number;
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

export type AuthSessionTokens = {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresIn: number;
  subUser?: AuthSubUser;
  tokenType: "Bearer";
};

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

  const session = await createOrReplaceSession(app.db, subUser.id, {
    ip: metadata.ip,
    userAgent: metadata.userAgent,
  });
  const subUserId = String(subUser.id);
  await invalidateSubUserSessions(app.cache, app.cacheKeys, subUserId, app.log);
  await writeSessionCache(
    app.cache,
    app.cacheKeys,
    {
      expiresAt: session.expiresAt,
      sessionId: String(session.id),
      sessionVersion: session.sessionVersion,
      subUserId,
    },
  );
  const accountRole = deriveAccountRole(subUser);
  const accessToken = signAccessToken(app, subUserId, session, accountRole);

  return {
    accessToken,
    expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
    refreshToken: session.refreshToken,
    refreshTokenExpiresIn: REFRESH_TOKEN_EXPIRES_IN_SECONDS,
    subUser: mapAuthSubUser(subUser),
    tokenType: "Bearer",
  };
}

export async function refreshAccessToken(
  app: FastifyInstance,
  refreshToken: string,
): Promise<AuthSessionTokens> {
  const session = await findActiveSessionByRefreshToken(app.db, refreshToken);

  if (!session) {
    throw new UnauthorizedError();
  }

  await touchSession(app.db, session.id);

  const subUser = await findActiveSubUser(app.db, session.sub_user_id);

  if (!subUser) {
    throw new UnauthorizedError();
  }

  return {
    accessToken: signAccessToken(app, String(session.sub_user_id), {
      id: session.id,
      sessionVersion: session.session_version,
    }, deriveAccountRole(subUser)),
    expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
    refreshToken,
    refreshTokenExpiresIn: REFRESH_TOKEN_EXPIRES_IN_SECONDS,
    subUser: mapAuthSubUser(subUser),
    tokenType: "Bearer",
  };
}

export async function getCurrentSession(
  app: FastifyInstance,
  user: JwtUser,
): Promise<AuthLoginResponse["subUser"]> {
  if (!user.subUserId) {
    throw new UnauthorizedError();
  }

  const subUser = await app.db
    .selectFrom("xy_wap_embed_sub_user")
    .select(["id", "name", "role", "type", "uid"])
    .where("id", "=", user.subUserId as never)
    .where("status", "=", 1)
    .executeTakeFirst();

  if (!subUser) {
    throw new UnauthorizedError();
  }

  return mapAuthSubUser(subUser);
}

export async function revokeSession(app: FastifyInstance, user: JwtUser) {
  await app.db
    .updateTable("xy_wap_embed_sub_user_session")
    .set({
      revoked_at: new Date(),
    })
    .where("id", "=", Number(user.sessionId))
    .where("sub_user_id", "=", user.subUserId as never)
    .where("session_version", "=", user.sessionVersion)
    .where("revoked_at", "is", null)
    .execute();

  await invalidateSession(app.cache, app.cacheKeys, user.sessionId, app.log);

  return { revoked: true };
}

export async function verifyAccessSession(
  db: Kysely<Database>,
  user: JwtUser,
  cache?: CachePort,
  cacheKeys: ReturnType<typeof buildCacheKeys> = buildCacheKeys("chatai:"),
): Promise<boolean> {
  const sessionId = Number(user.sessionId);

  if (
    !Number.isSafeInteger(sessionId) ||
    !user.subUserId ||
    !Number.isSafeInteger(user.sessionVersion)
  ) {
    return false;
  }

  const sessionKey = cacheKeys.authSession(user.sessionId);
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

  const session = await db
    .selectFrom("xy_wap_embed_sub_user_session")
    .select(["id", "expires_at"])
    .where("id", "=", sessionId)
    .where("sub_user_id", "=", user.subUserId as never)
    .where("session_version", "=", user.sessionVersion)
    .where("revoked_at", "is", null)
    .where("expires_at", ">", new Date())
    .executeTakeFirst();

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
    cacheKeys,
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
    .executeTakeFirst();
}

async function findActiveSubUser(db: Kysely<Database>, subUserId: number) {
  return db
    .selectFrom("xy_wap_embed_sub_user")
    .select(["id", "name", "role", "type", "uid"])
    .where("id", "=", subUserId)
    .where("status", "=", 1)
    .executeTakeFirst();
}

async function createOrReplaceSession(
  db: Kysely<Database>,
  subUserId: number,
  metadata: { ip?: string; userAgent?: string },
) {
  const refreshToken = createRefreshToken();
  const expiresAt = createRefreshExpiry();

  await db
    .insertInto("xy_wap_embed_sub_user_session")
    .values({
      expires_at: expiresAt,
      ip: metadata.ip ?? null,
      last_used_at: null,
      refresh_token_hash: hashRefreshToken(refreshToken),
      revoked_at: null,
      session_version: 1,
      sub_user_id: subUserId,
      user_agent: metadata.userAgent ?? null,
    })
    .onDuplicateKeyUpdate((expressionBuilder) => ({
      expires_at: expiresAt,
      ip: metadata.ip ?? null,
      last_used_at: null,
      refresh_token_hash: hashRefreshToken(refreshToken),
      revoked_at: null,
      session_version: expressionBuilder("session_version", "+", 1),
      user_agent: metadata.userAgent ?? null,
    }))
    .execute();

  const session = await db
    .selectFrom("xy_wap_embed_sub_user_session")
    .select(["id", "session_version", "expires_at"])
    .where("sub_user_id", "=", subUserId)
    .orderBy("id", "desc")
    .executeTakeFirstOrThrow();

  return {
    id: session.id,
    expiresAt: session.expires_at,
    refreshToken,
    sessionVersion: session.session_version,
  };
}

async function findActiveSessionByRefreshToken(
  db: Kysely<Database>,
  refreshToken: string,
): Promise<SessionRow | undefined> {
  if (!refreshToken.trim()) {
    return undefined;
  }

  return db
    .selectFrom("xy_wap_embed_sub_user_session")
    .select([
      "expires_at",
      "id",
      "refresh_token_hash",
      "revoked_at",
      "session_version",
      "sub_user_id",
    ])
    .where("refresh_token_hash", "=", hashRefreshToken(refreshToken))
    .where("revoked_at", "is", null)
    .where("expires_at", ">", new Date())
    .executeTakeFirst();
}

async function touchSession(db: Kysely<Database>, sessionId: number) {
  await db
    .updateTable("xy_wap_embed_sub_user_session")
    .set({
      last_used_at: new Date(),
    })
    .where("id", "=", sessionId)
    .execute();
}

function signAccessToken(
  app: FastifyInstance,
  subUserId: string,
  session: { id: number; sessionVersion: number },
  role: AccountRole = "operator",
) {
  return app.jwt.sign({
    roles: [role],
    sessionId: String(session.id),
    sessionVersion: session.sessionVersion,
    subUserId,
  });
}

async function writeSessionCache(
  cache: CachePort | undefined,
  cacheKeys: ReturnType<typeof buildCacheKeys>,
  session: {
    expiresAt: Date;
    sessionId: string;
    sessionVersion: number;
    subUserId: string;
  },
  ttlSeconds?: number,
) {
  const resolvedTtlSeconds =
    ttlSeconds ??
    Math.max(
      1,
      Math.min(
        SESSION_CACHE_TTL_SECONDS,
        Math.floor((session.expiresAt.getTime() - Date.now()) / 1000),
      ),
    );
  const sessionKey = cacheKeys.authSession(session.sessionId);
  const indexKey = cacheKeys.authSessionIndex(session.subUserId);
  const value = JSON.stringify({
    expiresAtMs: session.expiresAt.getTime(),
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
    return true;
  }

  return value.subUserId === user.subUserId && value.sessionVersion === user.sessionVersion;
}

function mapAuthSubUser(row: {
  id: number;
  name: string;
  role?: string | null;
  type?: number | null;
  uid: number;
}): AuthSubUser {
  const role = deriveAccountRole(row);

  return {
    accountType: deriveAccountType(row.type),
    displayName: row.name,
    permissions: getRolePermissions(role),
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
