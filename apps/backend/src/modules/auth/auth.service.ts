import type {
  AuthLoginRequest,
  AuthLoginResponse,
  AuthRefreshResponse,
  JwtUser,
} from "@chatai/contracts";
import { createHash, randomBytes } from "node:crypto";
import type { Kysely } from "kysely";
import type { FastifyInstance } from "fastify";
import type { Database } from "../../db/schema.js";
import { AppError, ServiceUnavailableError, UnauthorizedError } from "../../shared/errors.js";
import { verifyAltchaPayload } from "./altcha.service.js";
import { verifyPassword } from "./password.service.js";

const ACCESS_TOKEN_EXPIRES_IN_SECONDS = 20 * 60;
const REFRESH_TOKEN_EXPIRES_IN_DAYS = 14;

type SubUserCredentialRow = {
  id: number;
  name: string;
  password_hash: string;
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

export async function loginWithPassword(
  app: FastifyInstance,
  payload: AuthLoginRequest,
  metadata: LoginRequestMetadata = {},
): Promise<AuthLoginResponse> {
  const altcha = await verifyAltchaPayload(payload.altcha);

  if (!altcha.verified) {
    throw new InvalidCredentialsError();
  }

  if (!app.db) {
    throw new ServiceUnavailableError("DATABASE_NOT_CONFIGURED", "登录服务暂不可用");
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
  const accessToken = signAccessToken(app, subUserId, session);

  return {
    accessToken,
    expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
    refreshToken: session.refreshToken,
    subUser: {
      displayName: subUser.name,
      subUserId,
    },
    tokenType: "Bearer",
  };
}

export async function refreshAccessToken(
  app: FastifyInstance,
  refreshToken: string,
): Promise<AuthRefreshResponse> {
  if (!app.db) {
    throw new ServiceUnavailableError("DATABASE_NOT_CONFIGURED", "登录服务暂不可用");
  }

  const session = await findActiveSessionByRefreshToken(app.db, refreshToken);

  if (!session) {
    throw new UnauthorizedError();
  }

  await touchSession(app.db, session.id);

  return {
    accessToken: signAccessToken(app, String(session.sub_user_id), {
      id: session.id,
      sessionVersion: session.session_version,
    }),
    expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
    refreshToken,
    tokenType: "Bearer",
  };
}

export async function revokeSession(app: FastifyInstance, user: JwtUser) {
  if (!app.db) {
    throw new ServiceUnavailableError("DATABASE_NOT_CONFIGURED", "登录服务暂不可用");
  }

  await app.db
    .updateTable("xy_wap_embed_sub_user_session")
    .set({
      revoked_at: new Date(),
    })
    .where("id", "=", Number(user.sessionId))
    .where("sub_user_id", "=", Number(user.subUserId))
    .where("session_version", "=", user.sessionVersion)
    .where("revoked_at", "is", null)
    .execute();

  return { revoked: true };
}

export async function verifyAccessSession(
  db: Kysely<Database>,
  user: JwtUser,
): Promise<boolean> {
  const sessionId = Number(user.sessionId);
  const subUserId = Number(user.subUserId);

  if (
    !Number.isSafeInteger(sessionId) ||
    !Number.isSafeInteger(subUserId) ||
    !Number.isSafeInteger(user.sessionVersion)
  ) {
    return false;
  }

  const session = await db
    .selectFrom("xy_wap_embed_sub_user_session")
    .select(["id"])
    .where("id", "=", sessionId)
    .where("sub_user_id", "=", subUserId)
    .where("session_version", "=", user.sessionVersion)
    .where("revoked_at", "is", null)
    .where("expires_at", ">", new Date())
    .executeTakeFirst();

  return Boolean(session);
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
    .select(["id", "name", "password_hash"])
    .where("account", "=", normalizedAccount)
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
    .select(["id", "session_version"])
    .where("sub_user_id", "=", subUserId)
    .orderBy("id", "desc")
    .executeTakeFirstOrThrow();

  return {
    id: session.id,
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
) {
  return app.jwt.sign({
    roles: ["agent"],
    sessionId: String(session.id),
    sessionVersion: session.sessionVersion,
    subUserId,
  });
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
