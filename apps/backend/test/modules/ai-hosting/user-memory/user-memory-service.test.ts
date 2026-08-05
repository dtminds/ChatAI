import { Kysely, MysqlDialect } from "kysely";
import { describe, expect, it } from "vitest";
import type { Database } from "../../../../src/db/schema.js";
import { buildUserMemoryCustomerListQuery, countUserMemoryRunItems, nextShanghaiRunAt, parseStoredUserMemoryDocument, resolveCandidateSessionLimit, resolveTerminalRunStatus, resolveUserMemoryCustomerLimit, summarizeEvidenceContent, sumUserMemoryChanges, UserMemoryService } from "../../../../src/modules/ai-hosting/user-memory/user-memory-service.js";

function createCompileOnlyDb() {
  return new Kysely<Database>({ dialect: new MysqlDialect({ pool: {} as never }) });
}

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

  it("scopes customer-memory pagination to the current tenant and operator seats", () => {
    const db = createCompileOnlyDb();
    const adminQuery = buildUserMemoryCustomerListQuery(db, {
      platform: 5,
      uid: 272,
    }).select("memory.id").compile();
    const operatorQuery = buildUserMemoryCustomerListQuery(db, {
      platform: 5,
      subUserId: 101,
      uid: 272,
    }).select("memory.id").compile();

    expect(adminQuery.sql).toContain("`memory`.`uid` = ?");
    expect(adminQuery.sql).toContain("`memory`.`platform` = ?");
    expect(adminQuery.sql.toLowerCase()).toContain("json_length(memory.memories_json");
    expect(adminQuery.sql).not.toContain("relation.sub_id");
    expect(adminQuery.parameters).toContain(5);
    expect(operatorQuery.sql).toContain("relation.sub_id = ?");
    expect(operatorQuery.parameters).toContain(101);
  });

  it("recomputes terminal counters from current item states", () => {
    expect(countUserMemoryRunItems([
      { status: "succeeded" },
      { status: "failed" },
      { status: "skipped" },
      { status: "canceled" },
      { status: "prepared" },
    ])).toEqual({ success: 1, failure: 1, skipped: 1 });
    expect(sumUserMemoryChanges([
      { memory_added_count: 2, memory_removed_count: 0, memory_updated_count: 1 },
      { memory_added_count: null, memory_removed_count: null, memory_updated_count: null },
      { memory_added_count: 0, memory_removed_count: 1, memory_updated_count: 0 },
    ])).toEqual({ added: 2, removed: 1, updated: 1 });
  });

  it("resolves customer identity for run items without exposing the external ID as a name", async () => {
    const run = {
      id: 9,
      quota_date: new Date("2026-07-23T00:00:00+08:00"),
      scheduled_for: new Date("2026-07-24T02:00:00+08:00"),
      execution_mode: "sync",
      status: "succeeded",
      phase: "completed",
      customer_limit: 100,
      candidate_session_limit: 200,
      candidate_session_count: 1,
      candidate_customer_count: 1,
      selected_customer_count: 1,
      success_count: 1,
      failure_count: 0,
      skipped_count: 0,
      input_tokens: 10,
      output_tokens: 5,
      started_at: null,
      finished_at: null,
      last_error_code: null,
    };
    const runItem = {
      id: 2,
      platform: 5,
      third_external_userid: "external-customer-id",
      session_count: 1,
      message_count: 5,
      status: "succeeded",
      attempt_count: 1,
      input_tokens: 10,
      output_tokens: 5,
      last_error_code: null,
      finished_at: null,
    };
    const selectQuery = (table: string) => {
      const builder = {
        execute: async () => table === "xy_wap_embed_agent_user_memory_run_item"
          ? [runItem]
          : table === "xy_wap_embed_contact"
            ? [{ platform: 5, third_external_userid: "external-customer-id", avatar: "avatar.png", name: "张三", real_name: "" }]
            : [],
        executeTakeFirst: async () => table === "xy_wap_embed_agent_user_memory_run" ? run : undefined,
        limit: () => builder,
        orderBy: () => builder,
        select: () => builder,
        selectAll: () => builder,
        where: () => builder,
      };
      return builder;
    };
    const service = new UserMemoryService({ selectFrom: selectQuery } as never);

    const detail = await service.getRunDetail(272, 9, {});

    expect(detail.items).toEqual([
      expect.objectContaining({
        avatarUrl: "avatar.png",
        customerName: "张三",
        thirdExternalUserId: "external-customer-id",
      }),
    ]);
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

    const overview = await new UserMemoryService(db as never).updateSettings(272, { enabled: false });

    expect(overview.enabled).toBe(false);
    expect(runUpdates).toContainEqual(expect.objectContaining({
      failure_count: 1,
      memory_added_count: 0,
      memory_removed_count: 0,
      memory_updated_count: 0,
      skipped_count: 1,
      status: "canceled",
      success_count: 1,
    }));
  });

  it("updates the extraction instruction without changing the enable generation", async () => {
    const configUpdates: Array<Record<string, unknown>> = [];
    let config = {
      active_run_id: null,
      enabled: 1,
      enabled_at: 1,
      extraction_instruction: "旧指引",
      generation: 4,
      id: 3,
      next_run_at: new Date(),
      uid: 272,
    };
    const selectQuery = (table: string) => {
      const builder = {
        executeTakeFirst: async () => table === "xy_wap_embed_agent_user_memory_config" ? config : undefined,
        executeTakeFirstOrThrow: async () => config,
        forUpdate: () => builder,
        orderBy: () => builder,
        selectAll: () => builder,
        where: () => builder,
      };
      return builder;
    };
    const updateQuery = () => {
      const builder = {
        executeTakeFirstOrThrow: async () => ({ numUpdatedRows: 1n }),
        set: (next: Record<string, unknown>) => {
          configUpdates.push(next);
          config = { ...config, ...next };
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

    const overview = await new UserMemoryService(db as never).updateSettings(272, {
      extractionInstruction: "  重点关注客户主动表达的尺码和面料偏好  ",
    });

    expect(configUpdates).toEqual([{
      extraction_instruction: "重点关注客户主动表达的尺码和面料偏好",
    }]);
    expect(config.generation).toBe(4);
    expect(overview).toMatchObject({
      enabled: true,
      extractionInstruction: "重点关注客户主动表达的尺码和面料偏好",
    });
  });

  it("renders readable evidence text before falling back to compact JSON", () => {
    expect(summarizeEvidenceContent({ text: " 偏好无糖 " })).toBe("偏好无糖");
    expect(summarizeEvidenceContent({ type: "image", url: "https://example.com/a.png" })).toBe('{"type":"image","url":"https://example.com/a.png"}');
  });

  it("returns the stable data-invalid error instead of treating corrupt stored JSON as an empty document", () => {
    expect(() => parseStoredUserMemoryDocument("not-json")).toThrow(expect.objectContaining({ code: "AGENT_USER_MEMORY_DATA_INVALID", statusCode: 500 }));
  });

  it("keeps expired memories in customer management details", async () => {
    const expiresAt = Date.now() - 1;
    const row = {
      id: 1,
      last_auto_quota_date: null,
      last_auto_updated_at: null,
      manual_updated_at: null,
      memories_json: JSON.stringify({
        schemaVersion: 1,
        nextItemId: 2,
        manual: [{
          id: 1,
          category: "recent_intent",
          content: "上周计划购买礼服",
          createdAt: expiresAt - 1,
          updatedAt: expiresAt - 1,
          expiresAt,
          updatedBySubUserId: 101,
        }],
        ai: [],
      }),
      version: 1,
    };
    const selectBuilder = {
      executeTakeFirst: async () => row,
      selectAll: () => selectBuilder,
      where: () => selectBuilder,
    };
    const service = new UserMemoryService({
      selectFrom: () => selectBuilder,
    } as never);

    const detail = await service.getCustomer(272, {
      platform: 5,
      thirdExternalUserId: "customer-1",
      customerName: "张三",
    });

    expect(detail.items).toEqual([
      expect.objectContaining({
        id: 1,
        content: "上周计划购买礼服",
        expiresAt,
      }),
    ]);
  });

  it("creates then updates and deletes a manual memory through JSON persistence", async () => {
    const customer = { platform: 5, thirdExternalUserId: "customer-1", customerName: "张三" };
    let row: {
      id: number;
      memories_json: string;
      version: number;
      manual_updated_at: number | null;
      last_auto_quota_date: Date | null;
      last_auto_updated_at: number | null;
    } | undefined;
    const selectBuilder = {
      executeTakeFirst: async () => row,
      forUpdate: () => selectBuilder,
      selectAll: () => selectBuilder,
      where: () => selectBuilder,
    };
    const trx = {
      selectFrom: () => selectBuilder,
      insertInto: () => ({
        values: (values: { memories_json: string; version: number; manual_updated_at: number }) => ({
          execute: async () => {
            row = {
              id: 1,
              memories_json: values.memories_json,
              version: values.version,
              manual_updated_at: values.manual_updated_at,
              last_auto_quota_date: null,
              last_auto_updated_at: null,
            };
            return { insertId: 1n, numInsertedOrUpdatedRows: 1n };
          },
        }),
      }),
      updateTable: () => ({
        set: (values: { memories_json: string; version: number; manual_updated_at: number }) => ({
          where: () => ({
            where: () => ({
              executeTakeFirstOrThrow: async () => {
                if (!row) throw new Error("missing row");
                row = { ...row, memories_json: values.memories_json, version: values.version, manual_updated_at: values.manual_updated_at };
                return { numUpdatedRows: 1n };
              },
            }),
          }),
        }),
      }),
    };
    const db = {
      selectFrom: () => selectBuilder,
      transaction: () => ({ execute: (callback: (transaction: typeof trx) => unknown) => callback(trx) }),
    };
    const service = new UserMemoryService(db as never);

    const created = await service.createManual(272, customer, 101, {
      category: "customer_profile",
      content: "家有儿童",
      expectedVersion: 0,
      expiresAt: Date.now() - 1,
    });
    expect(created.items).toEqual([expect.objectContaining({ id: 1, content: "家有儿童", expiresAt: null, source: "manual" })]);
    expect(created.version).toBe(1);

    const second = await service.createManual(272, customer, 101, {
      category: "preference",
      content: "偏好无糖",
      expectedVersion: 1,
      expiresAt: null,
    });
    expect(second.items.map((item) => item.id)).toEqual([2, 1]);

    const updated = await service.updateManual(272, customer, 1, 101, {
      category: "preference",
      content: "仅发送文字消息",
      expectedVersion: 2,
    });
    expect(updated.items.map((item) => item.id)).toEqual([2, 1]);
    expect(updated.items).toContainEqual(expect.objectContaining({ id: 1, category: "preference", content: "仅发送文字消息" }));
    expect(updated.version).toBe(3);

    const deleted = await service.deleteManual(272, customer, 1, 101, { expectedVersion: 3 });
    expect(deleted.items).toEqual([expect.objectContaining({ id: 2, content: "偏好无糖" })]);
    expect(deleted.version).toBe(4);
  });
});
