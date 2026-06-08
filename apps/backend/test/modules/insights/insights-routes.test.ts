import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildMockedApp } from "../../helpers/build-mocked-app";

describe("insights routes", () => {
  let previousInsightUidAllowlist: string | undefined;

  beforeEach(() => {
    previousInsightUidAllowlist = process.env.INSIGHTS_WORKER_UID_ALLOWLIST;
    delete process.env.INSIGHTS_WORKER_UID_ALLOWLIST;
  });

  afterEach(() => {
    if (previousInsightUidAllowlist === undefined) {
      delete process.env.INSIGHTS_WORKER_UID_ALLOWLIST;
    } else {
      process.env.INSIGHTS_WORKER_UID_ALLOWLIST = previousInsightUidAllowlist;
    }
  });

  it("serves authenticated P0 insight data and commands", async () => {
    const { app, authorization, db } = await createInsightsApp("operator");

    const overview = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/insights/overview?from=2026-06-01&to=2026-06-30",
    });
    const overviewSessions = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/insights/overview/sessions?page=2&pageSize=1&keyword=%E7%89%A9%E6%B5%81&resolutionStatus=unresolved&analysisStatus=ready&problemScope=unresolved&tagCode=logistics_issue&entityName=%E7%99%BD%E8%89%B2%E7%BE%BD%E7%BB%92%E6%9C%8D&intentCode=logistics_delay",
    });
    const quality = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/insights/quality?from=2026-06-01&to=2026-06-30&page=1&pageSize=1&passed=false",
    });
    const business = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/insights/business",
    });
    const businessRelatedSessions = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/insights/business/related-sessions?dimension=intent&topicCode=logistics_delay&page=1&pageSize=20",
    });
    const followUps = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/insights/follow-ups?from=2026-06-01T00:00:00.000%2B08:00&to=2026-06-30T23:59:59.999%2B08:00&priority=high&status=open&page=1&pageSize=1",
    });
    const detail = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/insights/sessions/501",
    });
    const status = await app.inject({
      headers: {
        authorization,
        "x-workbench-client": "chat-ai-ui",
      },
      method: "PATCH",
      payload: { status: "done" },
      url: "/api/server/insights/action-items/801/status",
    });
    const reopenedStatus = await app.inject({
      headers: {
        authorization,
        "x-workbench-client": "chat-ai-ui",
      },
      method: "PATCH",
      payload: { status: "open" },
      url: "/api/server/insights/action-items/801/status",
    });
    const createdActionItem = await app.inject({
      headers: {
        authorization,
        "x-workbench-client": "chat-ai-ui",
      },
      method: "POST",
      payload: {
        conversationId: "301",
        dueHint: "今天内",
        priority: "high",
        sessionId: "501",
        title: "回访物流状态",
      },
      url: "/api/server/insights/action-items",
    });
    const rescan = await app.inject({
      headers: {
        authorization,
        "x-workbench-client": "chat-ai-ui",
      },
      method: "POST",
      payload: {
        analysisScope: "classification",
        from: "2026-06-01T00:00:00.000Z",
        to: "2026-06-02T00:00:00.000Z",
      },
      url: "/api/server/insights/jobs/rescan",
    });
    const rescanTasks = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/insights/jobs/rescan",
    });

    expect(overview.statusCode).toBe(200);
    expect(overview.json()).toMatchObject({
      data: {
        actionItemsOpen: 1,
        resolution: {
          noCustomerProblem: 0,
          partiallyResolved: 0,
          resolved: 0,
          unknown: 0,
          unresolved: 1,
        },
        totalSessions: 1,
        unresolvedSessions: 1,
      },
      success: true,
    });
    expect(overview.json().data.sessions).toBeUndefined();
    expect(overviewSessions.statusCode).toBe(200);
    expect(overviewSessions.json()).toMatchObject({
      data: {
        items: [
          expect.objectContaining({
            problemSummary: "客户反馈物流异常",
            sessionId: "501",
          }),
        ],
        page: 2,
        pageSize: 1,
        total: 1,
        totalPages: 1,
      },
      success: true,
    });
    expect(quality.statusCode).toBe(200);
    expect(
      db.selectBuilders.some((builder) =>
        builder.wheres.some((call) => call[0] === "session.started_at" && call[1] === ">=")
          && builder.wheres.some((call) => call[0] === "session.started_at" && call[1] === "<="),
      ),
    ).toBe(true);
    expect(quality.json().data.qualityResults[0]).toMatchObject({
      conversationId: "301",
      passed: false,
      passedRules: 1,
      rules: [
        { passed: false, ruleCode: "reply_quality", ruleName: "回复质量" },
        { passed: true, ruleCode: "clear_next_step", ruleName: "明确下一步" },
      ],
      sessionId: "501",
      totalRules: 2,
    });
    expect(quality.json().data.qualityResultsPage).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 1,
      totalPages: 1,
    });
    expect(business.statusCode).toBe(200);
    expect(business.json().data).toMatchObject({
      entityHotspots: [
        expect.objectContaining({
          code: "sku-1",
          name: "白色羽绒服",
        }),
      ],
      tagDistribution: [
        expect.objectContaining({
          code: "logistics_issue",
          name: "物流异常",
        }),
      ],
    });
    expect(businessRelatedSessions.statusCode).toBe(200);
    expect(businessRelatedSessions.json()).toMatchObject({
      data: {
        items: [
          expect.objectContaining({
            problemSummary: "客户反馈物流异常",
            sessionId: "501",
          }),
        ],
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      },
      success: true,
    });
    expect(followUps.statusCode).toBe(200);
    expect(
      db.selectBuilders.some((builder) =>
        builder.wheres.some((call) => call[0] === "action.priority" && call[1] === "=" && call[2] === "high")
          && builder.wheres.some((call) => call[0] === "session.started_at" && call[1] === ">=")
          && builder.wheres.some((call) => call[0] === "session.started_at" && call[1] === "<="),
      ),
    ).toBe(true);
    expect(followUps.json().data.items).toHaveLength(1);
    expect(followUps.json().data.items[0]).toMatchObject({
      actionItemId: "801",
      createdAt: 1_780_244_000_000,
      sessionId: "501",
    });
    expect(followUps.json().data.items[0]).not.toHaveProperty("evidenceMessageIds");
    expect(followUps.json().data.items[0]).not.toHaveProperty("lastCustomerMessageAt");
    expect(followUps.json().data).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 1,
      totalPages: 1,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.evidenceMessages.map((item: { messageId: string }) => item.messageId)).toEqual([
      "9001",
      "9002",
    ]);
    expect(detail.json().data.tags).toEqual([
      expect.objectContaining({
        evidenceMessageIds: ["9002"],
        tagCode: "logistics_issue",
      }),
    ]);
    expect(detail.json().data.sentiment).toEqual([
      expect.objectContaining({
        evidenceMessageIds: ["9002"],
        polarity: "negative",
      }),
    ]);
    expect(detail.json().data.entities).toEqual([
      expect.objectContaining({
        entityName: "白色羽绒服",
        evidenceMessageIds: ["9002"],
      }),
    ]);
    expect(detail.json().data.intents).toEqual([
      expect.objectContaining({
        intentCode: "logistics_delay",
        evidenceMessageIds: ["9002"],
      }),
    ]);
    expect(detail.json().data.faqCandidates).toEqual([
      expect.objectContaining({
        evidenceMessageIds: ["9002"],
        question: "物流停滞怎么处理",
      }),
    ]);
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      data: {
        actionItemId: "801",
        status: "done",
      },
      success: true,
    });
    expect(reopenedStatus.statusCode).toBe(200);
    expect(reopenedStatus.json()).toMatchObject({
      data: {
        actionItemId: "801",
        status: "open",
      },
      success: true,
    });
    expect(createdActionItem.statusCode).toBe(200);
    expect(createdActionItem.json()).toMatchObject({
      data: {
        actionItemId: "8101",
      },
      success: true,
    });
    expect(rescan.statusCode).toBe(200);
    expect(rescan.json()).toMatchObject({
      data: {
        jobId: "8802",
        status: "accepted",
        taskId: "9901",
      },
      success: true,
    });
    expect(rescanTasks.statusCode).toBe(200);
    expect(rescanTasks.json()).toMatchObject({
      data: {
        items: [
          expect.objectContaining({
            analysisScope: "classification",
            progressText: "0 / 0",
            status: "pending",
            taskId: "9901",
          }),
        ],
        total: 1,
      },
      success: true,
    });
    expect(db.updatedActionStatus).toMatchObject({ id: 801, status: "open" });
    expect(db.insertedActionItem).toMatchObject({
      conversation_id: 301,
      created_by_sub_user_id: 1,
      session_id: 501,
      snapshot_id: null,
      source_type: "manual",
      title: "回访物流状态",
      uid: 9001,
    });
    expect(db.insertedRescanTask).toMatchObject({
      analysis_scope: "classification",
      uid: 9001,
    });
    expect(db.insertedJob).toMatchObject({
      analysis_scope: "classification",
      job_type: "sync_messages",
      rescan_task_id: 9901,
      uid: 9001,
    });
    expect(db.insertedJob?.idempotency_key).toMatch(/^rescan:9001:classification:2026-06-01T00:00:00\.000Z:2026-06-02T00:00:00\.000Z:/);
    expect(db.rescanTaskListQueries[0]).toMatchObject({ limit: 10, offset: 0 });

    await app.close();
  });

  it("rejects malformed rescan task pagination before querying data", async () => {
    const admin = await createInsightsApp("admin");

    const response = await admin.app.inject({
      headers: { authorization: admin.authorization },
      method: "GET",
      url: "/api/server/insights/jobs/rescan?page=abc&pageSize=xyz",
    });

    await admin.app.close();

    expect(response.statusCode).toBe(400);
    expect(admin.db.rescanTaskListQueries).toHaveLength(0);
  });

  it("returns action status update misses as a business error envelope", async () => {
    const { app, authorization } = await createInsightsApp("operator");

    const response = await app.inject({
      headers: {
        authorization,
        "x-workbench-client": "chat-ai-ui",
      },
      method: "PATCH",
      payload: { status: "done" },
      url: "/api/server/insights/action-items/404/status",
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      error: {
        code: "INSIGHT_ACTION_ITEM_NOT_FOUND",
        message: "待处理事项不存在",
      },
      success: false,
    });
  });

  it("rejects manual action item titles longer than the database column", async () => {
    const { app, authorization, db } = await createInsightsApp("operator");

    const response = await app.inject({
      headers: {
        authorization,
        "x-workbench-client": "chat-ai-ui",
      },
      method: "POST",
      payload: {
        conversationId: "301",
        priority: "high",
        sessionId: "501",
        title: "回".repeat(256),
      },
      url: "/api/server/insights/action-items",
    });

    await app.close();

    expect(response.statusCode).toBe(400);
    expect(db.insertedActionItem).toBeUndefined();
  });

  it("allows only admins to read settings", async () => {
    const operator = await createInsightsApp("operator");
    const forbidden = await operator.app.inject({
      headers: { authorization: operator.authorization },
      method: "GET",
      url: "/api/server/insights/settings",
    });
    await operator.app.close();

    const admin = await createInsightsApp("admin");
    const allowed = await admin.app.inject({
      headers: { authorization: admin.authorization },
      method: "GET",
      url: "/api/server/insights/settings",
    });
    await admin.app.close();

    expect(forbidden.statusCode).toBe(403);
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toMatchObject({
      data: {
        featureConfig: {
          insightEnabled: false,
          intentEnabled: true,
          qaEnabled: true,
        },
        sessionization: {
          idleTimeoutMinutes: 120,
        },
      },
      success: true,
    });
  });

  it("allows settings access when an admin role is not the first role", async () => {
    const admin = await createInsightsApp("operator", {
      roles: ["operator", "admin"],
    });

    const response = await admin.app.inject({
      headers: { authorization: admin.authorization },
      method: "GET",
      url: "/api/server/insights/settings",
    });

    await admin.app.close();

    expect(response.statusCode).toBe(200);
  });

  it("looks up bigint sub user ids without coercing them through Number", async () => {
    const subUserId = "9007199254740993";
    const operator = await createInsightsApp("operator", {
      subUserId,
    });

    const response = await operator.app.inject({
      headers: { authorization: operator.authorization },
      method: "GET",
      url: "/api/server/insights/overview",
    });

    await operator.app.close();

    expect(response.statusCode).toBe(200);
    expect(operator.db.selectBuilders.some((builder) =>
      builder.wheres.some((where) => where[0] === "id" && where[2] === subUserId)
    )).toBe(true);
  });

  it("accepts offset date-time insight filters", async () => {
    const operator = await createInsightsApp("operator");

    const response = await operator.app.inject({
      headers: { authorization: operator.authorization },
      method: "GET",
      url: "/api/server/insights/overview?from=2026-05-31T00:00:00.000%2B08:00&to=2026-06-06T23:59:59.999%2B08:00",
    });

    await operator.app.close();

    expect(response.statusCode).toBe(200);
  });

  it("rejects malformed insight date filters before querying data", async () => {
    const operator = await createInsightsApp("operator");

    const response = await operator.app.inject({
      headers: { authorization: operator.authorization },
      method: "GET",
      url: "/api/server/insights/overview?from=not-a-date&to=2026-06-30",
    });

    await operator.app.close();

    expect(response.statusCode).toBe(400);
  });

  it("allows admins to update tenant insight feature switches", async () => {
    const admin = await createInsightsApp("admin");

    const response = await admin.app.inject({
      headers: { authorization: admin.authorization },
      method: "PUT",
      payload: {
        entityEnabled: false,
        insightEnabled: true,
        intentEnabled: true,
        labelEnabled: true,
        qaEnabled: true,
        todoEnabled: false,
      },
      url: "/api/server/insights/settings/feature-config",
    });

    await admin.app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        entityEnabled: false,
        insightEnabled: true,
        intentEnabled: true,
        labelEnabled: true,
        qaEnabled: true,
        todoEnabled: false,
      },
      success: true,
    });
    expect(admin.db.upsertedFeatureConfig).toMatchObject({
      entity_enabled: 0,
      insight_enabled: 1,
      intent_enabled: 1,
      label_enabled: 1,
      qa_enabled: 1,
      todo_enabled: 0,
      uid: 9001,
    });
    expect(admin.db.upsertedFeatureConfig?.last_enable_time).toBeGreaterThan(0);
  });

  it("marks insight unavailable in settings when the uid is not allowed", async () => {
    process.env.INSIGHTS_WORKER_UID_ALLOWLIST = "9002";
    const admin = await createInsightsApp("admin");

    const response = await admin.app.inject({
      headers: { authorization: admin.authorization },
      method: "GET",
      url: "/api/server/insights/settings",
    });

    await admin.app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        featureConfig: {
          insightAvailable: false,
        },
      },
      success: true,
    });
  });

  it("marks insight available in settings when the uid is allowed", async () => {
    process.env.INSIGHTS_WORKER_UID_ALLOWLIST = "9001";
    const admin = await createInsightsApp("admin");

    const response = await admin.app.inject({
      headers: { authorization: admin.authorization },
      method: "GET",
      url: "/api/server/insights/settings",
    });

    await admin.app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        featureConfig: {
          insightAvailable: true,
        },
      },
      success: true,
    });
  });

  it("blocks enabling tenant insights when the uid is not allowed", async () => {
    process.env.INSIGHTS_WORKER_UID_ALLOWLIST = "9002";
    const admin = await createInsightsApp("admin");

    const response = await admin.app.inject({
      headers: { authorization: admin.authorization },
      method: "PUT",
      payload: {
        entityEnabled: true,
        insightEnabled: true,
        intentEnabled: true,
        labelEnabled: true,
        qaEnabled: true,
        todoEnabled: true,
      },
      url: "/api/server/insights/settings/feature-config",
    });

    await admin.app.close();

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: "INSIGHT_NOT_AVAILABLE",
      },
      success: false,
    });
    expect(admin.db.upsertedFeatureConfig).toBeUndefined();
  });

  it("queues cleanup when admins disable tenant insights", async () => {
    const admin = await createInsightsApp("admin", {
      initialFeatureConfig: {
        entity_enabled: 1,
        insight_enabled: 1,
        intent_enabled: 1,
        label_enabled: 1,
        last_enable_time: 1_780_243_000_000,
        qa_enabled: 1,
        todo_enabled: 1,
      },
    });

    const response = await admin.app.inject({
      headers: { authorization: admin.authorization },
      method: "PUT",
      payload: {
        entityEnabled: true,
        insightEnabled: false,
        intentEnabled: true,
        labelEnabled: true,
        qaEnabled: true,
        todoEnabled: true,
      },
      url: "/api/server/insights/settings/feature-config",
    });

    await admin.app.close();

    expect(response.statusCode).toBe(200);
    expect(admin.db.upsertedFeatureConfig).toMatchObject({
      insight_enabled: 0,
      last_enable_time: 1_780_243_000_000,
      uid: 9001,
    });
    expect(admin.db.insertedJob).toMatchObject({
      analysis_scope: "all",
      job_type: "cleanup_disabled_insights",
      status: "pending",
      target_id: "1780243000000",
      target_type: "uid",
      uid: 9001,
    });
    expect(admin.db.insertedJob?.idempotency_key).toBe("cleanup_disabled_insights:9001:1780243000000");
  });

  it("returns empty business config lists when the config tables are empty", async () => {
    const admin = await createInsightsApp("admin", {
      entityDictionaryRows: [],
      intentConfigRows: [],
      labelConfigRows: [],
      qaRuleConfigRows: [],
    });

    const response = await admin.app.inject({
      headers: { authorization: admin.authorization },
      method: "GET",
      url: "/api/server/insights/settings",
    });

    await admin.app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        entityDictionary: [],
        intentConfigs: [],
        labelConfigs: [],
        qaRuleConfigs: [],
        sessionization: {
          idleTimeoutMinutes: 120,
        },
      },
      success: true,
    });
  });
});

async function createInsightsApp(
  role: "admin" | "operator" | "owner" | "viewer",
  options: {
    entityDictionaryRows?: unknown[];
    initialFeatureConfig?: Record<string, unknown>;
    intentConfigRows?: unknown[];
    labelConfigRows?: unknown[];
    qaRuleConfigRows?: unknown[];
    roles?: Array<"admin" | "operator" | "owner" | "viewer">;
    subUserId?: string;
  } = {},
) {
  const app = await buildMockedApp();
  const subUserId = options.subUserId ?? "1";
  const token = app.jwt.sign({
    roles: options.roles ?? [role],
    sessionId: "501",
    sessionVersion: 1,
    subUserId,
  });
  const db = createInsightsDbMock({ ...options, subUserId });

  app.db = db as never;

  return {
    app,
    authorization: `Bearer ${token}`,
    db,
  };
}

function createInsightsDbMock(options: {
  entityDictionaryRows?: unknown[];
  initialFeatureConfig?: Record<string, unknown>;
  intentConfigRows?: unknown[];
  labelConfigRows?: unknown[];
  qaRuleConfigRows?: unknown[];
  subUserId?: string;
} = {}) {
  const state = {
    insertedActionItem: undefined as Record<string, unknown> | undefined,
    insertedJob: undefined as Record<string, unknown> | undefined,
    insertedRescanTask: undefined as Record<string, unknown> | undefined,
    insightCurrentSelectCount: 0,
    rescanTaskListQueries: [] as Array<{ limit?: unknown; offset?: unknown }>,
    selectBuilders: [] as Array<{ wheres: Array<[string, string, unknown]> }>,
    upsertedFeatureConfig: undefined as Record<string, unknown> | undefined,
    updatedActionStatus: undefined as { id: number | undefined; status: string | undefined } | undefined,
    insertInto(table: string) {
      if (
        table !== "xy_wap_embed_insight_job"
        && table !== "xy_wap_embed_insight_rescan_task"
        && table !== "xy_wap_embed_insight_feature_config"
        && table !== "xy_wap_embed_session_action_item"
      ) {
        throw new Error(`Unexpected insert table: ${table}`);
      }

      const builder = {
        execute: async () => ({}),
        executeTakeFirst: async () => ({}),
        executeTakeFirstOrThrow: async () => ({
          insertId: table === "xy_wap_embed_insight_rescan_task"
            ? 9901
            : table === "xy_wap_embed_session_action_item"
              ? 8101
              : 8802,
        }),
        ignore: () => builder,
        onDuplicateKeyUpdate: (values: Record<string, unknown>) => {
          state.upsertedFeatureConfig = {
            ...state.upsertedFeatureConfig,
            ...values,
          };
          return builder;
        },
        values: (values: Record<string, unknown>) => {
          if (table === "xy_wap_embed_insight_rescan_task") {
            state.insertedRescanTask = values;
          } else if (table === "xy_wap_embed_insight_feature_config") {
            state.upsertedFeatureConfig = values;
          } else if (table === "xy_wap_embed_session_action_item") {
            state.insertedActionItem = values;
          } else {
            state.insertedJob = values;
          }
          return builder;
        },
      };

      return builder;
    },
    selectFrom(table: string | ((eb: unknown) => unknown)) {
      const wheres: Array<[string, string, unknown]> = [];
      const joins: Array<{ conditions: Array<[string, string, unknown]>; table: string }> = [];

      function createBuilder(result: unknown[] | ((builder: {
        groupByCalls: unknown[][];
        joins: Array<{ conditions: Array<[string, string, unknown]>; table: string }>;
        selectCalls: unknown[][];
        wheres: Array<[string, string, unknown]>;
      }) => unknown[])) {
        const builder = {
          $call: (callback: (query: typeof builder) => typeof builder) => callback(builder),
          groupByCalls: [] as unknown[][],
          havingCalls: [] as unknown[][],
          joins,
          limitValue: undefined as unknown,
          offsetValue: undefined as unknown,
          selectCalls: [] as unknown[][],
          wheres,
          execute: async () => typeof result === "function" ? result(builder) : result,
          executeTakeFirst: async () => {
            const rows = typeof result === "function" ? result(builder) : result;
            return rows[0];
          },
          groupBy: (...args: unknown[]) => {
            builder.groupByCalls.push(args);
            return builder;
          },
          having: (...args: unknown[]) => {
            builder.havingCalls.push(args);
            return builder;
          },
          innerJoin: (joinTable: string, callback?: (join: ReturnType<typeof createJoinBuilder>) => unknown) => {
            if (callback) {
              const joinBuilder = createJoinBuilder();
              callback(joinBuilder);
              joins.push({ conditions: joinBuilder.conditions, table: joinTable });
            }
            return builder;
          },
          leftJoin: (joinTable: string, callback?: (join: ReturnType<typeof createJoinBuilder>) => unknown) => {
            if (callback) {
              const joinBuilder = createJoinBuilder();
              callback(joinBuilder);
              joins.push({ conditions: joinBuilder.conditions, table: joinTable });
            }
            return builder;
          },
          limit: (limit: unknown) => {
            builder.limitValue = limit;
            return builder;
          },
          offset: (offset: unknown) => {
            builder.offsetValue = offset;
            return builder;
          },
          orderBy: () => builder,
          select: (...args: unknown[]) => {
            builder.selectCalls.push(args);
            return builder;
          },
          where: (column: unknown, operator?: string, value?: unknown) => {
            wheres.push([String(column), operator ?? "", value]);
            return builder;
          },
        };

        state.selectBuilders.push(builder);

        return builder;
      }

      if (typeof table === "function") {
        return createBuilder([{ total_count: 1 }]);
      }

      if (table === "xy_wap_embed_sub_user_session") {
        return createBuilder([
          {
            expires_at: new Date(Date.now() + 1000),
            id: "501",
            refresh_token_hash: "hash",
            revoked_at: null,
            session_version: 1,
            sub_user_id: options.subUserId ?? "1",
          },
        ]);
      }

      if (table === "xy_wap_embed_sub_user") {
        return createBuilder([
          {
            id: options.subUserId ?? 1,
            platform: 5,
            status: 1,
            uid: 9001,
          },
        ]);
      }

      if (table === "xy_wap_embed_sessionization_config") {
        return createBuilder([
          {
            analysis_delay_minutes: 10,
            hard_max_duration_hours: 48,
            idle_timeout_minutes: 120,
            late_arrival_window_minutes: 30,
            preset: "custom",
          },
        ]);
      }

      if (table === "xy_wap_embed_insight_analysis_policy") {
        return createBuilder([
          {
            final_analysis_enabled: 1,
            live_analysis_enabled: 1,
            live_min_interval_minutes: 15,
            live_min_new_meaningful_messages: 20,
            low_confidence_threshold: "0.6000",
            min_analysis_messages: 5,
            rule_fallback_enabled: 1,
          },
        ]);
      }

      if (table === "xy_wap_embed_insight_feature_config") {
        return createBuilder(() => [
          {
            entity_enabled: state.upsertedFeatureConfig?.entity_enabled
              ?? options.initialFeatureConfig?.entity_enabled
              ?? 1,
            insight_enabled: state.upsertedFeatureConfig?.insight_enabled
              ?? options.initialFeatureConfig?.insight_enabled
              ?? 0,
            intent_enabled: state.upsertedFeatureConfig?.intent_enabled
              ?? options.initialFeatureConfig?.intent_enabled
              ?? 1,
            label_enabled: state.upsertedFeatureConfig?.label_enabled
              ?? options.initialFeatureConfig?.label_enabled
              ?? 1,
            last_enable_time: state.upsertedFeatureConfig?.last_enable_time
              ?? options.initialFeatureConfig?.last_enable_time
              ?? null,
            qa_enabled: state.upsertedFeatureConfig?.qa_enabled
              ?? options.initialFeatureConfig?.qa_enabled
              ?? 1,
            todo_enabled: state.upsertedFeatureConfig?.todo_enabled
              ?? options.initialFeatureConfig?.todo_enabled
              ?? 1,
          },
        ]);
      }

      if (table === "xy_wap_embed_insight_label_config") {
        return createBuilder(options.labelConfigRows ?? [
          {
            description: null,
            status: 1,
            id: 1,
            include_in_statistics: 1,
            label_code: "price_sensitive",
            label_name: "价格敏感",
            negative_examples_json: null,
            positive_examples_json: null,
          },
        ]);
      }

      if (table === "xy_wap_embed_insight_intent_config") {
        return createBuilder(options.intentConfigRows ?? [
          {
            aliases_json: JSON.stringify(["查快递"]),
            description: "客户咨询发货、快递或物流异常",
            status: 1,
            id: 1,
            include_in_statistics: 1,
            intent_code: "logistics_delay",
            intent_name: "物流异常",
            negative_examples_json: JSON.stringify(["咨询退款到账"]),
            positive_examples_json: JSON.stringify(["快递一直没更新"]),
            sort_order: 10,
          },
        ]);
      }

      if (table === "xy_wap_embed_insight_qa_rule_config") {
        return createBuilder(options.qaRuleConfigRows ?? [
          {
            applicable_scene: null,
            description: null,
            status: 1,
            id: 1,
            judgment_criteria: null,
            negative_examples_json: null,
            positive_examples_json: null,
            rule_code: "problem_resolution",
            rule_name: "客户问题是否解决",
            severity: "high",
          },
        ]);
      }

      if (table === "xy_wap_embed_insight_entity_dictionary") {
        return createBuilder(options.entityDictionaryRows ?? [
          {
            aliases_json: JSON.stringify(["白鸭绒外套"]),
            attributes_json: null,
            canonical_name: "白色羽绒服",
            status: 1,
            entity_type: "product",
            id: 1,
            include_in_aggregation: 1,
          },
        ]);
      }

      if (table === "xy_wap_embed_conversation") {
        return createBuilder([
          {
            id: 301,
            platform: 5,
            third_external_userid: "customer-1",
            third_userid: "seat-1",
            uid: 9001,
          },
        ]);
      }

      if (table === "xy_wap_embed_logical_session") {
        return createBuilder([
          {
            conversation_id: 301,
            id: 501,
            uid: 9001,
          },
        ]);
      }

      if (table === "xy_wap_embed_contact") {
        return createBuilder([
          {
            avatar: "https://example.com/customer-1.png",
            name: "张三",
            real_name: "",
            third_external_userid: "customer-1",
          },
        ]);
      }

      if (table === "xy_wap_embed_user_seat") {
        return createBuilder([
          {
            id: 11,
            third_avatar: "https://example.com/agent-1.png",
            third_user_name: "客服一号",
            third_userid: "seat-1",
          },
        ]);
      }

      if (table === "xy_wap_embed_session_insight_current as current") {
        return createBuilder((builder) => {
          state.insightCurrentSelectCount += 1;
          const selectedAliases = collectSelectAliases(builder.selectCalls);

          if (selectedAliases.has("logical_sessions")) {
            return [{
              action_items_open: 1,
              agent_messages: 3,
              consulting_customers: 1,
              customer_messages: 5,
              failed: 0,
              logical_sessions: 1,
              messages: 8,
              no_customer_problem_sessions: 0,
              partial: 0,
              partially_resolved_sessions: 0,
              problem_sessions: 1,
              ready: 1,
              resolved_sessions: 0,
              stale: 0,
              unknown_sessions: 0,
              unresolved_resolution_sessions: 1,
              unresolved_sessions: 1,
            }];
          }

          if (
            selectedAliases.has("action_items_open") &&
            (selectedAliases.has("session_id") || selectedAliases.has("session.id as session_id"))
          ) {
            return [{
              action_items_open: 1,
              analyzed_sessions: 1,
              date: "2026-06-01",
              session_id: 501,
              started_at: 1_780_243_200_000,
              unresolved_sessions: 1,
            }];
          }

          if (selectedAliases.has("date")) {
            return [{
              agent_messages: 3,
              consulting_customers: 1,
              customer_messages: 5,
              date: "2026-06-01",
              logical_sessions: 1,
              messages: 8,
            }];
          }

          if (selectedAliases.has("total_rules")) {
            return [
              {
                agent_avatar_url: "https://example.com/agent-1.png",
                agent_name: "客服一号",
                agent_seat_id: "seat-1",
                conversation_id: 301,
                customer_summary: "客户反馈物流异常",
                failed_rules: 1,
                last_customer_message_at: 1_780_244_100_000,
                passed_rules: 1,
                session_id: 501,
                snapshot_id: 7001,
                third_external_userid: "customer-1",
                total_rules: 2,
              },
            ];
          }

          if (selectedAliases.has("qa.id as qa_finding_id")) {
            return [
              {
                passed: 0,
                qa_finding_id: 701,
                reason: "物流进度未确认",
                rule_code: "reply_quality",
                rule_name: "回复质量",
                session_id: 501,
                severity: "high",
              },
              {
                passed: 1,
                qa_finding_id: 702,
                reason: "客服明确说明下一步",
                rule_code: "clear_next_step",
                rule_name: "明确下一步",
                session_id: 501,
                severity: "medium",
              },
            ];
          }

          if (selectedAliases.has("total_count")) {
            return [{ total_count: 1 }];
          }

          if (selectedAliases.has("count") && selectedAliases.size === 1) {
            return [{ count: 1 }];
          }

          return [
            {
              agent_message_count: 3,
              conversation_id: 301,
              current_snapshot_id: 7001,
              customer_message_count: 5,
              ended_at: 1_780_245_000_000,
              generated_at: 1_780_245_100_000,
              last_message_at: 1_780_244_950_000,
              message_count: 8,
              phase: "final",
              problem_detected: 1,
              problem_summary: "客户反馈物流异常",
              resolution_status: "unresolved",
              session_id: 501,
              started_at: 1_780_243_200_000,
              status: "ready",
              summary_session_title: "查物流",
              summary_text: "客服要求客户等待",
              unresolved_reason: "售后/物流/退款进度未确认",
            },
          ];
        });
      }

      if (table === "xy_wap_embed_session_action_item as action") {
        return createBuilder((builder) => {
          const actionId = builder.wheres.find(([column]) => column === "action.id")?.[2];

          if (actionId === 404) {
            return [];
          }

          return [
          {
            action_id: 801,
            action_status: "open",
            action_type: "logistics_check",
            conversation_id: 301,
            created_at: 1_780_244_000_000,
            priority: "high",
            resolution_status: "unresolved",
            session_id: 501,
            snapshot_id: 7001,
            title: "确认快递状态",
            total_count: 1,
            uid: 9001,
          },
          ];
        });
      }

      if (table === "xy_wap_embed_session_action_item") {
        return createBuilder([
          {
            action_open_count: 1,
            snapshot_id: 7001,
          },
        ]);
      }

      if (table === "xy_wap_embed_insight_rescan_task") {
        return createBuilder((builder) => {
          if (
            builder.selectCalls.some((call) => String(call[0]).includes("countAll"))
              || builder.selectCalls.some((call) => typeof call[0] === "function")
          ) {
            return [{ count: state.insertedRescanTask ? 1 : 0 }];
          }

          if (builder.offsetValue !== undefined) {
            state.rescanTaskListQueries.push({
              limit: builder.limitValue,
              offset: builder.offsetValue,
            });
          }

          if (!state.insertedRescanTask) {
            return [];
          }

          const row = {
            analysis_scope: state.insertedRescanTask.analysis_scope ?? "classification",
            create_time: new Date("2026-06-01T00:00:00.000Z"),
            created_by: null,
            failed_sessions: 0,
            finished_at: null,
            from_time: state.insertedRescanTask.from_time ?? new Date("2026-06-01T00:00:00.000Z"),
            id: 9901,
            queued_sessions: 0,
            started_at: null,
            status: "pending",
            succeeded_sessions: 0,
            to_time: state.insertedRescanTask.to_time ?? new Date("2026-06-02T00:00:00.000Z"),
            total_sessions: 0,
            update_time: new Date("2026-06-01T00:00:00.000Z"),
          };
          const activeStatuses = builder.wheres.find(([column, operator]) =>
            column === "status" && operator === "in"
          )?.[2];

          if (Array.isArray(activeStatuses) && !activeStatuses.includes(row.status)) {
            return [];
          }

          return [row];
        });
      }

      if (table === "xy_wap_embed_insight_evidence") {
        return createBuilder([
          {
            dimension_record_id: 1001,
            dimension_type: "tag",
            source_message_id: 9002,
          },
          {
            dimension_record_id: 1101,
            dimension_type: "sentiment",
            source_message_id: 9002,
          },
          {
            dimension_record_id: 1201,
            dimension_type: "entity",
            source_message_id: 9002,
          },
          {
            dimension_record_id: 1301,
            dimension_type: "intent",
            source_message_id: 9002,
          },
          {
            dimension_record_id: 1401,
            dimension_type: "faq_candidate",
            source_message_id: 9002,
          },
          {
            dimension_record_id: 701,
            dimension_type: "qa_finding",
            source_message_id: 9002,
          },
          {
            dimension_record_id: 601,
            dimension_type: "risk",
            source_message_id: 9002,
          },
        ]);
      }

      if (table === "xy_wap_embed_insight_evidence as evidence") {
        return createBuilder([
          {
            action_id: 801,
            agent_avatar_url: "https://example.com/agent.png",
            agent_name: "客服一号",
            agent_seat_id: "seat-1",
            conversation_id: 301,
            evidence_message_id: 9002,
            last_customer_message_at: 1_780_244_100_000,
            passed: 0,
            qa_finding_id: 701,
            reason: "物流进度未确认",
            rule_code: "reply_quality",
            rule_name: "回复质量",
            session_id: 501,
            severity: "high",
            snapshot_id: 7001,
            third_external_userid: "customer-1",
            total_count: 1,
          },
          {
            agent_avatar_url: "https://example.com/agent.png",
            agent_name: "客服一号",
            agent_seat_id: "seat-1",
            conversation_id: 301,
            evidence_message_id: 9001,
            last_customer_message_at: 1_780_244_000_000,
            passed: 0,
            qa_finding_id: 701,
            reason: "物流进度未确认",
            rule_code: "reply_quality",
            rule_name: "回复质量",
            session_id: 501,
            severity: "high",
            snapshot_id: 7001,
            third_external_userid: "customer-1",
            total_count: 1,
          },
        ]);
      }

      if (table === "xy_wap_embed_session_sentiment") {
        return createBuilder([
          {
            confidence: "0.8200",
            id: 1101,
            polarity: "negative",
            reason: "客户明确表达物流不更新的不满",
          },
        ]);
      }

      if (table === "xy_wap_embed_session_tag") {
        return createBuilder([
          {
            confidence: "0.9100",
            id: 1001,
            snapshot_id: 7001,
            tag_code: "logistics_issue",
            tag_name: "物流异常",
            uid: 9001,
          },
        ]);
      }

      if (table === "xy_wap_embed_session_tag as tag") {
        return createBuilder([
          {
            code: "logistics_issue",
            mention_count: 1,
            name: "物流异常",
            session_id: 501,
            snapshot_id: 7001,
            started_at: 1_780_243_200_000,
            uid: 9001,
          },
        ]);
      }

      if (table === "xy_wap_embed_session_entity") {
        return createBuilder([
          {
            entity_id: "sku-1",
            entity_name: "白色羽绒服",
            entity_type: "product",
            id: 1201,
            sentiment: "negative",
            snapshot_id: 7001,
            uid: 9001,
          },
        ]);
      }

      if (table === "xy_wap_embed_session_entity as entity") {
        return createBuilder([
          {
            code: "sku-1",
            entity_id: "sku-1",
            entity_name: "白色羽绒服",
            entity_type: "product",
            mention_count: 2,
            name: "白色羽绒服",
            negative_count: 1,
            risk_session_count: 1,
            sentiment: "negative",
            session_id: 501,
            session_count: 1,
            snapshot_id: 7001,
            started_at: 1_780_243_200_000,
            type: "product",
            uid: 9001,
          },
        ]);
      }

      if (table === "xy_wap_embed_session_intent") {
        return createBuilder([
          {
            confidence: "0.8400",
            id: 1301,
            intent_code: "logistics_delay",
            intent_label: "物流异常",
            snapshot_id: 7001,
            uid: 9001,
          },
        ]);
      }

      if (table === "xy_wap_embed_session_intent as intent") {
        return createBuilder([
          {
            code: "logistics_delay",
            count: 1,
            intent_code: "logistics_delay",
            intent_label: "物流异常",
            mention_count: 1,
            name: "物流异常",
            session_id: 501,
            snapshot_id: 7001,
            started_at: 1_780_243_200_000,
            uid: 9001,
          },
        ]);
      }

      if (table === "xy_wap_embed_session_faq_candidate") {
        return createBuilder([
          {
            answer_hint: "先核实物流停滞节点，再告知预计回复时间",
            id: 1401,
            question: "物流停滞怎么处理",
            status: "candidate",
            uid: 9001,
          },
        ]);
      }

      if (table === "xy_wap_embed_session_problem_resolution") {
        return createBuilder([
          {
            problem_summary: "客户反馈物流异常",
            snapshot_id: 7001,
          },
        ]);
      }

      if (table === "xy_wap_embed_session_qa_finding") {
        return createBuilder((builder) => {
          const selectedAliases = collectSelectAliases(builder.selectCalls);

          if (selectedAliases.has("id as qa_finding_id")) {
            return [
              {
                passed: 0,
                qa_finding_id: 701,
                rule_code: "reply_quality",
                rule_name: "回复质量",
                snapshot_id: 7001,
              },
              {
                passed: 1,
                qa_finding_id: 702,
                rule_code: "clear_next_step",
                rule_name: "明确下一步",
                snapshot_id: 7001,
              },
            ];
          }

          return [
            {
              qa_finding_id: 701,
              qa_passed: 0,
              qa_reason: "未确认物流进展",
              qa_rule_code: "reply_quality",
              qa_rule_name: "回复质量",
              qa_severity: "high",
            },
          ];
        });
      }

      if (table === "xy_wap_embed_msg_audit_info as message") {
        return createBuilder([
          {
            chat_type: 1,
            content: JSON.stringify({ content: "帮您催一下快递" }),
            conversation_id: 301,
            from_type: 1,
            id: 9001,
            msgtime: 1_780_244_000_000,
            msgtype: "text",
            sender_name: "客服一号",
            third_from_id: "seat-1",
            third_user_id: "seat-1",
          },
          {
            chat_type: 1,
            content: JSON.stringify({ content: "还没收到货，物流也不更新" }),
            conversation_id: 301,
            from_type: 2,
            id: 9002,
            msgtime: 1_780_244_100_000,
            msgtype: "text",
            sender_name: "张三",
            third_from_id: "customer-1",
            third_user_id: "seat-1",
          },
        ]);
      }

      if (table === "xy_wap_embed_logical_session_message as session_message") {
        return createBuilder([
          {
            chat_type: 1,
            conversation_external_id: "customer-1",
            conversation_group_id: "",
            conversation_id: 301,
            group_seat_id: null,
            platform: 5,
            seat_id: 11,
            session_id: 501,
            third_userid: "seat-1",
            uid: 9001,
          },
        ]);
      }

      throw new Error(`Unexpected select table: ${table}`);
    },
    updateTable(table: string) {
      if (table !== "xy_wap_embed_session_action_item") {
        throw new Error(`Unexpected update table: ${table}`);
      }

      const wheres: Array<[string, string, unknown]> = [];
      let updateValues: Record<string, unknown> = {};
      const builder = {
        executeTakeFirst: async () => {
          const id = wheres.find(([column]) => column === "id")?.[2] as number | undefined;
          state.updatedActionStatus = { id, status: String(updateValues.status) };
          return { numAffectedRows: 1n };
        },
        set: (values: Record<string, unknown>) => {
          updateValues = values;
          return builder;
        },
        where: (column: string, operator: string, value: unknown) => {
          wheres.push([column, operator, value]);
          return builder;
        },
      };

      return builder;
    },
  };

  return state;
}

function createJoinBuilder() {
  return {
    conditions: [] as Array<[string, string, unknown]>,
    on(column: string, operator: string, value: unknown) {
      this.conditions.push([column, operator, value]);
      return this;
    },
    onRef(left: string, operator: string, right: string) {
      this.conditions.push([left, operator, right]);
      return this;
    },
  };
}

function collectSelectAliases(selectCalls: unknown[][]) {
  return new Set(selectCalls
    .flatMap((call) => call)
    .flatMap((item) => Array.isArray(item) ? item : [item])
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (item && typeof item === "object") {
        const candidate = item as {
          alias?: string;
          expression?: { alias?: string };
          node?: { alias?: { name?: string } };
        };

        return candidate.alias
          ?? candidate.expression?.alias
          ?? candidate.node?.alias?.name
          ?? "";
      }

      return "";
    })
    .filter(Boolean));
}
