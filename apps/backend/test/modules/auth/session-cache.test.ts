import { describe, expect, it, vi } from "vitest";
import type { CachePort } from "../../../src/cache/cache-port.js";
import {
  loginWithPassword,
  revokeSession,
  verifyAccessSession,
} from "../../../src/modules/auth/auth.service.js";

vi.mock("../../../src/modules/auth/altcha.service.js", () => ({
  verifyAltchaPayload: vi.fn(async () => ({ verified: true })),
}));

vi.mock("../../../src/modules/auth/password.service.js", () => ({
  verifyPassword: vi.fn(async () => true),
}));

function createCache(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));

  return {
    del: vi.fn(async (...keys: string[]) => {
      for (const key of keys) {
        store.delete(key);
      }
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    sadd: vi.fn(async () => undefined),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    smembers: vi.fn(async () => null),
  } satisfies CachePort;
}

function createSessionDb(row?: {
  expires_at?: Date;
  id: number;
  session_version: number;
  sub_user_id: number;
}) {
  const calls: string[] = [];

  return {
    calls,
    selectFrom(table: string) {
      calls.push(table);
      const wheres: Array<[string, string, unknown]> = [];
      const builder = {
        executeTakeFirst: async () => {
          if (!row) {
            return undefined;
          }

          return wheres.every(([column, operator, value]) => {
            const key = column.split(".").at(-1) ?? column;
            const rowValue = row[key as keyof typeof row];

            if (operator === "=") {
              return String(rowValue) === String(value);
            }

            if (operator === "is" && value === null) {
              return true;
            }

            if (operator === ">") {
              return (row.expires_at ?? new Date(Date.now() + 1000)) > (value as Date);
            }

            return true;
          })
            ? { id: row.id, expires_at: row.expires_at ?? new Date(Date.now() + 1000) }
            : undefined;
        },
        select: () => builder,
        where: (column: string, operator: string, value: unknown) => {
          wheres.push([column, operator, value]);
          return builder;
        },
      };

      return builder;
    },
  } as never;
}

function createLoginDb(
  onSessionWrite: (values: Record<string, unknown>) => void,
  sessionOverrides: Partial<{
    expires_at: Date | number | string;
    id: number;
    session_version: number;
  }> = {},
) {
  const session = {
    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    id: 501,
    refresh_token_hash: "hash",
    revoked_at: null,
    session_version: 2,
    sub_user_id: 101,
    ...sessionOverrides,
  };

  return {
    insertInto(table: string) {
      if (table !== "xy_wap_embed_sub_user_session") {
        throw new Error(`Unexpected insert table: ${table}`);
      }

      const builder = {
        execute: async () => [],
        onDuplicateKeyUpdate: () => builder,
        values: (values: Record<string, unknown>) => {
          onSessionWrite(values);
          return builder;
        },
      };

      return builder;
    },
    selectFrom(table: string) {
      const builder = {
        executeTakeFirst: async () => {
          if (table === "xy_wap_embed_sub_user") {
            return {
              id: 101,
              name: "客服一号",
              password_hash: "hash",
              role: "operator",
              type: 0,
              uid: 9001,
            };
          }

          if (table === "xy_wap_embed_sub_user_session") {
            return session;
          }

          throw new Error(`Unexpected select table: ${table}`);
        },
        executeTakeFirstOrThrow: async () => session,
        orderBy: () => builder,
        select: () => builder,
        where: () => builder,
      };

      return builder;
    },
  } as never;
}

describe("verifyAccessSession cache", () => {
  it("accepts a matching positive session cache without querying DB", async () => {
    const cache = createCache({
      "chatai:auth:session:501": JSON.stringify({
        expiresAtMs: Date.now() + 60_000,
        sessionVersion: 1,
        subUserId: "101",
        valid: true,
      }),
    });
    const db = createSessionDb();

    await expect(
      verifyAccessSession(db, {
        roles: ["operator"],
        sessionId: "501",
        sessionVersion: 1,
        subUserId: "101",
        uid: 9001,
      }, cache),
    ).resolves.toBe(true);
    expect(db.calls).toEqual([]);
  });

  it("falls back to DB when cached session fields do not match", async () => {
    const cache = createCache({
      "chatai:auth:session:501": JSON.stringify({
        expiresAtMs: Date.now() + 60_000,
        sessionVersion: 1,
        subUserId: "101",
        valid: true,
      }),
    });
    const db = createSessionDb({
      id: 501,
      session_version: 2,
      sub_user_id: 101,
    });

    await expect(
      verifyAccessSession(db, {
        roles: ["operator"],
        sessionId: "501",
        sessionVersion: 2,
        subUserId: "101",
        uid: 9001,
      }, cache),
    ).resolves.toBe(true);
    expect(db.calls).toEqual(["xy_wap_embed_sub_user_session"]);
    expect(cache.sadd).toHaveBeenCalledWith(
      "chatai:auth:session-index:101",
      ["501"],
      14 * 24 * 60 * 60,
    );
  });

  it("falls back to DB for legacy negative session cache entries", async () => {
    const cache = createCache({
      "chatai:auth:session:501": JSON.stringify({ valid: false }),
    });
    const db = createSessionDb({
      id: 501,
      session_version: 1,
      sub_user_id: 101,
    });

    await expect(
      verifyAccessSession(db, {
        roles: ["operator"],
        sessionId: "501",
        sessionVersion: 1,
        subUserId: "101",
        uid: 9001,
      }, cache),
    ).resolves.toBe(true);
    expect(db.calls).toEqual(["xy_wap_embed_sub_user_session"]);
    expect(cache.sadd).toHaveBeenCalledWith(
      "chatai:auth:session-index:101",
      ["501"],
      14 * 24 * 60 * 60,
    );
  });

  it("falls back to DB for JSON primitive session cache entries", async () => {
    const cache = createCache({
      "chatai:auth:session:501": "null",
    });
    const db = createSessionDb({
      id: 501,
      session_version: 1,
      sub_user_id: 101,
    });

    await expect(
      verifyAccessSession(db, {
        roles: ["operator"],
        sessionId: "501",
        sessionVersion: 1,
        subUserId: "101",
        uid: 9001,
      }, cache),
    ).resolves.toBe(true);
    expect(db.calls).toEqual(["xy_wap_embed_sub_user_session"]);
  });

  it("does not let a stale-version negative cache reject a newer valid session", async () => {
    const cache = createCache();
    const staleVersionDb = createSessionDb({
      id: 501,
      session_version: 2,
      sub_user_id: 101,
    });

    await expect(
      verifyAccessSession(staleVersionDb, {
        roles: ["operator"],
        sessionId: "501",
        sessionVersion: 1,
        subUserId: "101",
        uid: 9001,
      }, cache),
    ).resolves.toBe(false);
    expect(cache.set).toHaveBeenCalledWith(
      "chatai:auth:session:501",
      expect.stringContaining("\"valid\":false"),
      60,
    );

    const currentVersionDb = createSessionDb({
      id: 501,
      session_version: 2,
      sub_user_id: 101,
    });

    await expect(
      verifyAccessSession(currentVersionDb, {
        roles: ["operator"],
        sessionId: "501",
        sessionVersion: 2,
        subUserId: "101",
        uid: 9001,
      }, cache),
    ).resolves.toBe(true);
    expect(currentVersionDb.calls).toEqual(["xy_wap_embed_sub_user_session"]);
  });

  it("rejects access tokens without a tenant uid", async () => {
    const cache = createCache();
    const db = createSessionDb({
      id: 501,
      session_version: 1,
      sub_user_id: 101,
    });

    await expect(
      verifyAccessSession(db, {
        roles: ["operator"],
        sessionId: "501",
        sessionVersion: 1,
        subUserId: "101",
      } as never, cache),
    ).resolves.toBe(false);
    expect(db.calls).toEqual([]);
  });
});

describe("revokeSession cache invalidation", () => {
  it("deletes the current session cache after revoking the DB session", async () => {
    const cache = createCache();
    const app = {
      cache,
      cacheKeys: {
        authSession: (sessionId: string) => `chatai:auth:session:${sessionId}`,
      },
      db: {
        updateTable: () => {
          const builder = {
            execute: vi.fn(async () => []),
            set: () => builder,
            where: () => builder,
          };

          return builder;
        },
      },
      log: { warn: vi.fn() },
    };

    await expect(
      revokeSession(app as never, {
        roles: ["operator"],
        sessionId: "501",
        sessionVersion: 1,
        subUserId: "101",
        uid: 9001,
      }),
    ).resolves.toEqual({ revoked: true });
    expect(cache.del).toHaveBeenCalledWith("chatai:auth:session:501");
  });
});

describe("loginWithPassword cache invalidation", () => {
  it("clears old cached sessions for a reused sub-user session row", async () => {
    const cache = {
      ...createCache(),
      smembers: vi.fn(async () => ["501"]),
    };
    const sessionWrite = vi.fn();
    const app = {
      cache,
      cacheKeys: {
        authSession: (sessionId: string) => `chatai:auth:session:${sessionId}`,
        authSessionIndex: (subUserId: string) => `chatai:auth:session-index:${subUserId}`,
      },
      db: createLoginDb(sessionWrite),
      jwt: {
        sign: vi.fn(() => "access-token"),
      },
      log: { warn: vi.fn() },
    };

    await expect(
      loginWithPassword(app as never, {
        account: "agent001",
        altcha: "mock-altcha",
        password: "correct-password",
      }),
    ).resolves.toMatchObject({
      accessToken: "access-token",
    });
    expect(cache.smembers).toHaveBeenCalledWith("chatai:auth:session-index:101");
    expect(cache.del).toHaveBeenCalledWith("chatai:auth:session:501");
    expect(cache.del).toHaveBeenCalledWith("chatai:auth:session-index:101");
    expect(cache.set).toHaveBeenCalledWith(
      "chatai:auth:session:501",
      expect.stringContaining("\"sessionVersion\":2"),
      expect.any(Number),
    );
    expect(app.jwt.sign).toHaveBeenCalledWith(expect.objectContaining({
      subUserId: "101",
      uid: 9001,
    }));
    expect(sessionWrite).toHaveBeenCalled();
  });

  it("writes session cache when DB returns session expiry as a string", async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const cache = createCache();
    const app = {
      cache,
      cacheKeys: {
        authSession: (sessionId: string) => `chatai:auth:session:${sessionId}`,
        authSessionIndex: (subUserId: string) => `chatai:auth:session-index:${subUserId}`,
      },
      db: createLoginDb(vi.fn(), { expires_at: expiresAt }),
      jwt: {
        sign: vi.fn(() => "access-token"),
      },
      log: { warn: vi.fn() },
    };

    await expect(
      loginWithPassword(app as never, {
        account: "agent001",
        altcha: "mock-altcha",
        password: "correct-password",
      }),
    ).resolves.toMatchObject({
      accessToken: "access-token",
    });
    expect(cache.set).toHaveBeenCalledWith(
      "chatai:auth:session:501",
      JSON.stringify({
        expiresAtMs: new Date(expiresAt).getTime(),
        sessionVersion: 2,
        subUserId: "101",
        valid: true,
      }),
      expect.any(Number),
    );
    expect(cache.sadd).toHaveBeenCalledWith(
      "chatai:auth:session-index:101",
      ["501"],
      14 * 24 * 60 * 60,
    );
  });

  it("skips session cache writes when DB returns an invalid session expiry", async () => {
    const cache = createCache();
    const app = {
      cache,
      cacheKeys: {
        authSession: (sessionId: string) => `chatai:auth:session:${sessionId}`,
        authSessionIndex: (subUserId: string) => `chatai:auth:session-index:${subUserId}`,
      },
      db: createLoginDb(vi.fn(), { expires_at: "invalid-date" }),
      jwt: {
        sign: vi.fn(() => "access-token"),
      },
      log: { warn: vi.fn() },
    };

    await expect(
      loginWithPassword(app as never, {
        account: "agent001",
        altcha: "mock-altcha",
        password: "correct-password",
      }),
    ).resolves.toMatchObject({
      accessToken: "access-token",
    });
    expect(cache.set).not.toHaveBeenCalled();
    expect(cache.sadd).not.toHaveBeenCalled();
  });
});
