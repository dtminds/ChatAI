import type { JwtUser } from "@chatai/contracts";
import type { Kysely } from "kysely";
import type { CachePort } from "../../cache/cache-port.js";
import {
  invalidateSession,
  invalidateSubUserSessions,
} from "../../cache/invalidation.js";
import { buildCacheKeys } from "../../cache/keys.js";
import type { Database } from "../../db/schema.js";

export type AuthSessionKind = "app" | "embed";

type AuthSessionTable =
  | "xy_wap_embed_sub_user_session"
  | "xy_wap_embed_sub_user_embed_session";

export type ActiveSessionRow = {
  expires_at: Date;
  id: number;
  refresh_token_hash: string;
  revoked_at: Date | null;
  session_version: number;
  sub_user_id: number;
};

export type CreatedSession = {
  expiresAt: Date;
  id: number;
  sessionVersion: number;
};

type SessionMetadata = {
  ip?: string;
  userAgent?: string;
};

type SessionInvalidationLogger = {
  warn(details: Record<string, unknown>, message: string): void;
};

export class AuthSessionStore {
  readonly cacheKeys: ReturnType<typeof buildCacheKeys>;
  readonly kind: AuthSessionKind;
  private readonly table: AuthSessionTable;

  constructor(
    private readonly db: Kysely<Database>,
    private readonly cache: CachePort | undefined,
    baseCacheKeys: ReturnType<typeof buildCacheKeys>,
    kind: AuthSessionKind,
    private readonly logger?: SessionInvalidationLogger,
  ) {
    this.kind = kind;
    this.table = kind === "embed"
      ? "xy_wap_embed_sub_user_embed_session"
      : "xy_wap_embed_sub_user_session";
    this.cacheKeys = createSessionCacheKeys(baseCacheKeys, kind);
  }

  async create(
    subUserId: number,
    refreshTokenHash: string,
    expiresAt: Date,
    metadata: SessionMetadata,
  ): Promise<CreatedSession> {
    if (this.kind === "embed") {
      await this.deleteInactiveEmbedSessions(subUserId);
      await this.db
        .insertInto("xy_wap_embed_sub_user_embed_session")
        .values({
          expires_at: expiresAt,
          ip: metadata.ip ?? null,
          last_used_at: null,
          refresh_token_hash: refreshTokenHash,
          revoked_at: null,
          session_version: 1,
          sub_user_id: subUserId,
          user_agent: metadata.userAgent ?? null,
        })
        .execute();

      const session = await this.db
        .selectFrom("xy_wap_embed_sub_user_embed_session")
        .select(["id", "session_version", "expires_at"])
        .where("refresh_token_hash", "=", refreshTokenHash)
        .executeTakeFirstOrThrow();

      return {
        expiresAt: session.expires_at,
        id: session.id,
        sessionVersion: session.session_version,
      };
    }

    await this.db
      .insertInto("xy_wap_embed_sub_user_session")
      .values({
        expires_at: expiresAt,
        ip: metadata.ip ?? null,
        last_used_at: null,
        refresh_token_hash: refreshTokenHash,
        revoked_at: null,
        session_version: 1,
        sub_user_id: subUserId,
        user_agent: metadata.userAgent ?? null,
      })
      .onDuplicateKeyUpdate((expressionBuilder) => ({
        expires_at: expiresAt,
        ip: metadata.ip ?? null,
        last_used_at: null,
        refresh_token_hash: refreshTokenHash,
        revoked_at: null,
        session_version: expressionBuilder("session_version", "+", 1),
        user_agent: metadata.userAgent ?? null,
      }))
      .execute();

    const session = await this.db
      .selectFrom("xy_wap_embed_sub_user_session")
      .select(["id", "session_version", "expires_at"])
      .where("sub_user_id", "=", subUserId)
      .orderBy("id", "desc")
      .executeTakeFirstOrThrow();

    return {
      expiresAt: session.expires_at,
      id: session.id,
      sessionVersion: session.session_version,
    };
  }

  async findActiveByRefreshTokenHash(
    refreshTokenHash: string,
  ): Promise<ActiveSessionRow | undefined> {
    return this.db
      .selectFrom(this.table)
      .select([
        "expires_at",
        "id",
        "refresh_token_hash",
        "revoked_at",
        "session_version",
        "sub_user_id",
      ])
      .where("refresh_token_hash", "=", refreshTokenHash)
      .where("revoked_at", "is", null)
      .where("expires_at", ">", new Date())
      .executeTakeFirst();
  }

  async findActiveAccessSession(user: JwtUser) {
    return this.db
      .selectFrom(this.table)
      .select(["id", "expires_at"])
      .where("id", "=", Number(user.sessionId))
      .where("sub_user_id", "=", user.subUserId as never)
      .where("session_version", "=", user.sessionVersion)
      .where("revoked_at", "is", null)
      .where("expires_at", ">", new Date())
      .executeTakeFirst();
  }

  async touch(sessionId: number) {
    await this.db
      .updateTable(this.table)
      .set({ last_used_at: new Date() })
      .where("id", "=", sessionId)
      .execute();
  }

  async revoke(user: JwtUser) {
    await this.db
      .updateTable(this.table)
      .set({ revoked_at: new Date() })
      .where("id", "=", Number(user.sessionId))
      .where("sub_user_id", "=", user.subUserId as never)
      .where("session_version", "=", user.sessionVersion)
      .where("revoked_at", "is", null)
      .execute();

    await invalidateSession(
      this.cache,
      this.cacheKeys,
      user.sessionId,
      this.logger,
    );
  }

  async revokeById(session: Pick<ActiveSessionRow, "id" | "session_version" | "sub_user_id">) {
    await this.db
      .updateTable(this.table)
      .set({ revoked_at: new Date() })
      .where("id", "=", session.id)
      .where("sub_user_id", "=", session.sub_user_id)
      .where("session_version", "=", session.session_version)
      .where("revoked_at", "is", null)
      .execute();

    await invalidateSession(
      this.cache,
      this.cacheKeys,
      String(session.id),
      this.logger,
    );
  }

  async revokeSubUserSessions(subUserId: number) {
    await this.db
      .updateTable(this.table)
      .set({
        revoked_at: new Date(),
        update_time: new Date(),
      })
      .where("sub_user_id", "=", subUserId)
      .where("revoked_at", "is", null)
      .execute();
    await this.invalidateSubUserSessions(subUserId);
  }

  async expireSubUserAccessTokens(subUserId: number) {
    await this.db
      .updateTable(this.table)
      .set((expressionBuilder) => ({
        session_version: expressionBuilder("session_version", "+", 1),
        update_time: new Date(),
      }))
      .where("sub_user_id", "=", subUserId)
      .where("revoked_at", "is", null)
      .execute();
    await this.invalidateSubUserSessions(subUserId);
  }

  invalidateSubUserSessions(subUserId: string | number) {
    return invalidateSubUserSessions(
      this.cache,
      this.cacheKeys,
      subUserId,
      this.logger,
    );
  }

  private async deleteInactiveEmbedSessions(subUserId: number) {
    await this.db
      .deleteFrom("xy_wap_embed_sub_user_embed_session")
      .where("sub_user_id", "=", subUserId)
      .where((expressionBuilder) => expressionBuilder.or([
        expressionBuilder("revoked_at", "is not", null),
        expressionBuilder("expires_at", "<=", new Date()),
      ]))
      .execute();
  }
}

export function createAuthSessionStore(
  app: {
    cache?: CachePort;
    cacheKeys: ReturnType<typeof buildCacheKeys>;
    db: Kysely<Database>;
    log?: SessionInvalidationLogger;
  },
  kind: AuthSessionKind,
) {
  return new AuthSessionStore(
    app.db,
    app.cache,
    app.cacheKeys,
    kind,
    app.log,
  );
}

function createSessionCacheKeys(
  baseCacheKeys: ReturnType<typeof buildCacheKeys>,
  kind: AuthSessionKind,
): ReturnType<typeof buildCacheKeys> {
  if (kind === "app") {
    return baseCacheKeys;
  }

  return {
    authSession: (sessionId) => baseCacheKeys.authSession(`embed:${sessionId}`),
    authSessionIndex: (subUserId) =>
      baseCacheKeys.authSessionIndex(`embed:${subUserId}`),
    seatAccess: baseCacheKeys.seatAccess,
  };
}
