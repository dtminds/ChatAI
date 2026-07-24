import { describe, expect, it } from "vitest";
import { countUserMemoryRunItems, nextShanghaiRunAt, parseStoredUserMemoryDocument, resolveCandidateSessionLimit, resolveTerminalRunStatus, resolveUserMemoryCustomerLimit, summarizeEvidenceContent, UserMemoryService } from "../../../../src/modules/ai-hosting/user-memory/user-memory-service.js";

describe("user memory service policies", () => {
  it("scales the candidate session limit with the customer quota", () => {
    expect(resolveUserMemoryCustomerLimit({ resolve: () => 100 }, 1)).toBe(100);
    expect(() => resolveUserMemoryCustomerLimit({ resolve: () => 300 }, 1)).toThrow("AGENT_USER_MEMORY_CUSTOMER_LIMIT_UNSUPPORTED");
    expect(resolveCandidateSessionLimit(100)).toBe(200);
    expect(resolveCandidateSessionLimit(200)).toBe(400);
    expect(resolveCandidateSessionLimit(500)).toBe(1000);
  });

  it("schedules the next Asia/Shanghai 02:00 boundary", () => {
    expect(nextShanghaiRunAt(Date.parse("2026-07-24T01:00:00+08:00")).toISOString()).toBe("2026-07-23T18:00:00.000Z");
    expect(nextShanghaiRunAt(Date.parse("2026-07-24T03:00:00+08:00")).toISOString()).toBe("2026-07-24T18:00:00.000Z");
  });

  it("keeps skipped-only runs successful and mixed failures partial", () => {
    expect(resolveTerminalRunStatus({ success: 0, failure: 0, skipped: 2 })).toBe("succeeded");
    expect(resolveTerminalRunStatus({ success: 1, failure: 1, skipped: 0 })).toBe("partial");
    expect(resolveTerminalRunStatus({ success: 0, failure: 2, skipped: 0 })).toBe("failed");
  });

  it("recomputes terminal counters from current item states", () => {
    expect(countUserMemoryRunItems([
      { status: "succeeded" },
      { status: "failed" },
      { status: "skipped" },
      { status: "canceled" },
      { status: "prepared" },
    ])).toEqual({ success: 1, failure: 1, skipped: 1 });
  });

  it("persists recomputed counters when disabling an active run", async () => {
    const runUpdates: Array<Record<string, unknown>> = [];
    let config = {
      active_run_id: 7,
      enabled: 1,
      generation: 2,
      id: 3,
      next_run_at: new Date(),
      uid: 272,
    };
    const selectQuery = (table: string) => {
      const builder = {
        execute: async () => table === "xy_wap_embed_agent_user_memory_run_item"
          ? [{ status: "succeeded" }, { status: "failed" }, { status: "skipped" }, { status: "canceled" }]
          : [],
        executeTakeFirst: async () => table === "xy_wap_embed_agent_user_memory_config" ? config : undefined,
        executeTakeFirstOrThrow: async () => config,
        forUpdate: () => builder,
        orderBy: () => builder,
        select: () => builder,
        selectAll: () => builder,
        where: () => builder,
      };
      return builder;
    };
    const updateQuery = (table: string) => {
      const builder = {
        execute: async () => ({ numUpdatedRows: 1n }),
        executeTakeFirstOrThrow: async () => ({ numUpdatedRows: 1n }),
        set: (next: Record<string, unknown>) => {
          if (table === "xy_wap_embed_agent_user_memory_run") runUpdates.push(next);
          if (table === "xy_wap_embed_agent_user_memory_config") {
            config = { ...config, active_run_id: null, enabled: Number(next.enabled), next_run_at: null };
          }
          return builder;
        },
        where: () => builder,
      };
      return builder;
    };
    const trx = { selectFrom: selectQuery, updateTable: updateQuery };
    const db = {
      selectFrom: selectQuery,
      transaction: () => ({ execute: (callback: (transaction: typeof trx) => unknown) => callback(trx) }),
    };

    const overview = await new UserMemoryService(db as never).updateSettings(272, false);

    expect(overview.enabled).toBe(false);
    expect(runUpdates).toContainEqual(expect.objectContaining({
      failure_count: 1,
      skipped_count: 1,
      status: "canceled",
      success_count: 1,
    }));
  });

  it("renders readable evidence text before falling back to compact JSON", () => {
    expect(summarizeEvidenceContent({ text: " 偏好无糖 " })).toBe("偏好无糖");
    expect(summarizeEvidenceContent({ type: "image", url: "https://example.com/a.png" })).toBe('{"type":"image","url":"https://example.com/a.png"}');
  });

  it("returns the stable data-invalid error instead of treating corrupt stored JSON as an empty document", () => {
    expect(() => parseStoredUserMemoryDocument("not-json")).toThrow(expect.objectContaining({ code: "AGENT_USER_MEMORY_DATA_INVALID", statusCode: 500 }));
  });
});
