import { describe, expect, it, vi } from "vitest";
import { InsightsRepository } from "../../../src/modules/insights/insights.repository";
import { MysqlInsightWorkerRepository } from "../../../src/modules/insights/insights-worker.repository";

describe("InsightsRepository", () => {
  it("loads quality overview through an aggregate query", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder([
          {
            analyzed_sessions: 3,
            no_customer_problem: 1,
            partial: 1,
            problem_sessions: 2,
            resolved: 0,
            total_sessions: 4,
            unresolved: 1,
          },
        ], table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await expect(repository.getQualityAggregate({ uid: 9001 })).resolves.toMatchObject({
      analyzedSessions: 3,
      problemSessions: 2,
      totalSessions: 4,
      unresolved: 1,
    });

    expect(builders[0]?.table).toBe("xy_wap_embed_session_insight_current as current");
    expect(builders[0]?.whereCalls).toContainEqual(["session.uid", "=", 9001]);
  });

  it("omits disabled feature dimensions from the worker prompt context", async () => {
    const selectedTables: string[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        selectedTables.push(table);

        if (table === "xy_wap_embed_insight_feature_config") {
          return createSelectBuilder([
            {
              entity_enabled: 0,
              insight_enabled: 1,
              intent_enabled: 0,
              label_enabled: 1,
              last_enable_time: 1_780_300_000_000,
              qa_enabled: 0,
              todo_enabled: 1,
              uid: 9001,
            },
          ], table);
        }

        if (table === "xy_wap_embed_insight_label_config") {
          return createSelectBuilder([
            {
              description: null,
              include_in_statistics: 1,
              label_code: "vip",
              label_name: "高价值客户",
              negative_examples_json: null,
              positive_examples_json: null,
            },
          ], table);
        }

        return createSelectBuilder([], table);
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(repository.getPromptContext(9001)).resolves.toMatchObject({
      entityDictionary: [],
      intentConfigs: [],
      labelConfigs: [
        expect.objectContaining({
          labelCode: "vip",
        }),
      ],
      qaRuleConfigs: [],
    });

    expect(selectedTables).not.toContain("xy_wap_embed_insight_intent_config");
    expect(selectedTables).not.toContain("xy_wap_embed_insight_qa_rule_config");
    expect(selectedTables).not.toContain("xy_wap_embed_insight_entity_dictionary");
  });

  it("loads quality agent stats through grouped SQL", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder([
          {
            agent_avatar_url: "https://example.com/agent.png",
            agent_name: "客服一号",
            agent_seat_id: "seat-1",
            partial: 1,
            problem_sessions: 2,
            resolved: 1,
            total_sessions: 3,
            unresolved: 1,
          },
        ], table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await expect(repository.listQualityAgentStats({ uid: 9001 })).resolves.toEqual([
      expect.objectContaining({
        agentSeatId: "seat-1",
        problemSessions: 2,
        totalSessions: 3,
        unresolvedRate: 0.5,
      }),
    ]);

    expect(builders[0]?.groupByCalls.length).toBeGreaterThan(0);
    expect(builders[0]?.selectRawCalls.join("\n")).toContain("seat.third_avatar");
    expect(builders[0]?.selectRawCalls.join("\n")).toContain("seat.third_user_name");
    expect(builders[0]?.selectRawCalls.join("\n")).not.toContain("seat.avatar");
    expect(builders[0]?.whereCalls).toContainEqual(["session.uid", "=", 9001]);
  });

  it("loads business session aggregates without hydrating current sessions", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder([
          {
            action_items_open: 1,
            analyzed_sessions: 1,
            date: "2026-06-01",
            session_id: 501,
            started_at: 1_780_243_200_000,
            unresolved_sessions: 1,
          },
        ], table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await expect(repository.listBusinessSessionAggregates({ uid: 9001 })).resolves.toEqual([
      expect.objectContaining({
        actionItemsOpen: 1,
        date: "2026-06-01",
        sessionId: "501",
        unresolvedSessions: 1,
      }),
    ]);

    expect(builders[0]?.joins).toContain("xy_wap_embed_session_action_item as aggregate_action");
    expect(builders[0]?.whereCalls).toContainEqual(["session.uid", "=", 9001]);
  });

  it("loads current sessions without joining one-to-many insight tables in the core query", async () => {
    const builders: SelectBuilderStub[] = [];
    const rowsByTable = new Map<string, unknown[]>([
      [
        "xy_wap_embed_session_insight_current as current",
        [{ count: 1 }],
      ],
      [
        "xy_wap_embed_session_insight_current as current#2",
        [
          {
            agent_message_count: 1,
            conversation_id: 301,
            current_snapshot_id: 501,
            customer_message_count: 2,
            ended_at: null,
            generated_at: 1_780_245_000_000,
            last_message_at: 1_780_244_900_000,
            message_count: 3,
            phase: "live",
            problem_detected: 1,
            problem_summary: "物流未更新",
            resolution_status: "unresolved",
            session_id: 201,
            started_at: 1_780_244_000_000,
            status: "ready",
            summary_customer_intent: "查物流",
            summary_follow_up: "需要跟进",
            summary_process: "已登记",
            summary_result: "未解决",
            unresolved_reason: "待仓库反馈",
          },
        ],
      ],
      [
        "xy_wap_embed_session_action_item",
        [{ action_open_count: 1, snapshot_id: 501 }],
      ],
      [
        "xy_wap_embed_insight_evidence as evidence",
        [
          { evidence_message_id: 9002, last_customer_message_at: 1_780_244_100_000, snapshot_id: 501 },
          { evidence_message_id: 9001, last_customer_message_at: 1_780_244_000_000, snapshot_id: 501 },
        ],
      ],
      ["xy_wap_embed_conversation", []],
      ["xy_wap_embed_session_tag", []],
      ["xy_wap_embed_session_entity", []],
      ["xy_wap_embed_session_intent", []],
      ["xy_wap_embed_logical_session_message as session_message", []],
    ]);
    const db = {
      currentQueryCount: 0,
      selectFrom: vi.fn((table: string) => {
        const key = table === "xy_wap_embed_session_insight_current as current" && db.currentQueryCount++ > 0
          ? `${table}#2`
          : table;
        const builder = createSelectBuilder(rowsByTable.get(key) ?? [], table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await expect(repository.listCurrentSessions({ uid: 9001 })).resolves.toMatchObject({
      items: [
        {
          actionOpenCount: 1,
          lastCustomerMessageAt: 1_780_244_100_000,
          problemEvidenceMessageIds: ["9001", "9002"],
          sessionId: "201",
        },
      ],
      total: 1,
    });

    const coreQuery = builders[1];
    expect(coreQuery.joins).not.toContain("xy_wap_embed_session_action_item as action");
    expect(coreQuery.joins).not.toContain("xy_wap_embed_insight_evidence as evidence");
    expect(coreQuery.joins).not.toContain("xy_wap_embed_msg_audit_info as message");
  });

  it("paginates and filters current sessions in SQL before hydration", async () => {
    const builders: SelectBuilderStub[] = [];
    const rowsByTable = new Map<string, unknown[]>([
      ["xy_wap_embed_session_insight_current as current", [{ count: 12 }]],
      ["xy_wap_embed_session_insight_current as current#2", []],
    ]);
    let currentQueryCount = 0;
    const db = {
      selectFrom: vi.fn((table: string) => {
        const key = table === "xy_wap_embed_session_insight_current as current" && currentQueryCount++ > 0
          ? `${table}#2`
          : table;
        const builder = createSelectBuilder(rowsByTable.get(key) ?? [], table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await expect(repository.listCurrentSessions(
      { uid: 9001 },
      {
        analysisStatus: "ready",
        entityName: "白色羽绒服",
        from: "2026-06-01",
        intentCode: "refund",
        keyword: "物流",
        page: 3,
        pageSize: 5,
        problemScope: "unresolved",
        resolutionStatus: "unresolved",
        tagCode: "logistics_issue",
        to: "2026-06-30",
      },
    )).resolves.toMatchObject({ items: [], total: 12 });

    const countQuery = builders[0];
    const pageQuery = builders[1];
    expect(pageQuery.limitCalls).toEqual([5]);
    expect(pageQuery.offsetCalls).toEqual([10]);
    expect(pageQuery.orderByCalls).toContainEqual(["session.started_at", "desc"]);
    expect(countQuery.joins).toContain("xy_wap_embed_session_tag as tag_filter");
    expect(countQuery.joins).toContain("xy_wap_embed_session_entity as entity_filter");
    expect(countQuery.joins).toContain("xy_wap_embed_session_intent as intent_filter");
    expect(countQuery.whereCalls).toContainEqual(["session.uid", "=", 9001]);
    expect(countQuery.whereCalls).toContainEqual(["snapshot.status", "=", "ready"]);
    expect(countQuery.whereCalls).toContainEqual(["problem.resolution_status", "=", "unresolved"]);
    expect(countQuery.whereCalls).toContainEqual(["tag_filter.uid", "=", 9001]);
    expect(countQuery.whereCalls).toContainEqual(["tag_filter.tag_code", "=", "logistics_issue"]);
    expect(countQuery.whereCalls).toContainEqual(["entity_filter.uid", "=", 9001]);
    expect(countQuery.whereCalls).toContainEqual(["entity_filter.entity_name", "=", "白色羽绒服"]);
    expect(countQuery.whereCalls).toContainEqual(["intent_filter.uid", "=", 9001]);
    expect(countQuery.whereCalls).toContainEqual(["intent_filter.intent_code", "=", "refund"]);
  });

  it("skips summary and problem joins for unfiltered current-session counts", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      currentQueryCount: 0,
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder(
          table === "xy_wap_embed_session_insight_current as current" && db.currentQueryCount++ === 0
            ? [{ count: 0 }]
            : [],
          table,
        );
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await repository.listCurrentSessions({ uid: 9001 });

    const countQuery = builders[0];
    expect(countQuery?.joins).not.toContain("xy_wap_embed_session_summary as summary");
    expect(countQuery?.joins).not.toContain("xy_wap_embed_session_problem_resolution as problem");
    expect(countQuery?.whereCalls).toContainEqual(["session.uid", "=", 9001]);
  });

  it("bounds all-current-session hydration for aggregate pages", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder([], table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await repository.listAllCurrentSessions({ uid: 9001 });

    const currentQuery = builders.find((builder) => builder.table === "xy_wap_embed_session_insight_current as current");
    expect(currentQuery?.limitCalls).toEqual([5000]);
    expect(currentQuery?.offsetCalls).toEqual([0]);
  });

  it("loads action-item evidence with a bounded follow-up query", async () => {
    const builders: SelectBuilderStub[] = [];
    const rowsByTable = new Map<string, unknown[]>([
      [
        "xy_wap_embed_session_action_item as action",
        [
          {
            action_id: 801,
            action_status: "open",
            action_type: "follow_up",
            conversation_id: 301,
            created_at: 1_780_244_000_000,
            priority: "high",
            resolution_status: "unresolved",
            session_id: 201,
            snapshot_id: 501,
            title: "催物流",
          },
        ],
      ],
      ["xy_wap_embed_conversation", []],
    ]);
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder(rowsByTable.get(table) ?? [], table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await expect(repository.listActionItems({ uid: 9001 })).resolves.toMatchObject([
      {
        actionItemId: "801",
        createdAt: 1_780_244_000_000,
      },
    ]);

    const mainQuery = builders[0];
    expect(mainQuery.whereCalls).toContainEqual(["action.uid", "=", 9001]);
    expect(mainQuery.whereCalls).not.toContainEqual(["session.uid", "=", 9001]);
    expect(mainQuery.joins).not.toContain("xy_wap_embed_insight_evidence as evidence");
    expect(mainQuery.joins).not.toContain("xy_wap_embed_msg_audit_info as message");
    expect(builders.map((builder) => builder.table)).not.toContain("xy_wap_embed_insight_evidence as evidence");
  });

  it("caps action item rows before evidence hydration", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder([], table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await repository.listActionItems({ uid: 9001 });

    expect(builders[0]?.limitCalls).toContain(1000);
  });

  it("paginates action items before evidence hydration", async () => {
    const builders: SelectBuilderStub[] = [];
    const rowsByTable = new Map<string, unknown[]>([
      [
        "xy_wap_embed_session_action_item as action",
        [
          {
            action_id: 802,
            action_status: "open",
            action_type: "follow_up",
            conversation_id: 302,
            created_at: 1_780_243_900_000,
            priority: "medium",
            resolution_status: "partially_resolved",
            session_id: 202,
            snapshot_id: 502,
            title: "沉淀退款 FAQ",
            total_count: 2,
          },
        ],
      ],
      ["xy_wap_embed_conversation", []],
    ]);
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder(rowsByTable.get(table) ?? [], table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await expect(repository.listActionItemsPage({ uid: 9001 }, {
      page: 2,
      pageSize: 1,
      status: "open",
    })).resolves.toMatchObject({
      items: [
        {
          actionItemId: "802",
          createdAt: 1_780_243_900_000,
        },
      ],
      total: 2,
    });

    expect(builders[0]?.limitCalls).toEqual([1]);
    expect(builders[0]?.offsetCalls).toEqual([1]);
    expect(builders[0]?.orderByCalls).toEqual([["action.id", "desc"]]);
    expect(builders[0]?.whereCalls).toContainEqual(["action.uid", "=", 9001]);
    expect(builders[0]?.whereCalls).not.toContainEqual(["session.uid", "=", 9001]);
    expect(builders[0]?.whereCalls).toContainEqual(["action.status", "=", "open"]);
    expect(builders.map((builder) => builder.table)).not.toContain("xy_wap_embed_insight_evidence as evidence");
  });

  it("scopes business asset facts to sessions matched by the overview filters", async () => {
    const builders: SelectBuilderStub[] = [];
    const rowsByTable = new Map<string, unknown[]>([
      [
        "xy_wap_embed_session_insight_current as current",
        [
          { session_id: 201, snapshot_id: 501, started_at: 1_780_244_000_000 },
          { session_id: 202, snapshot_id: 502, started_at: 1_780_245_000_000 },
        ],
      ],
      [
        "xy_wap_embed_logical_session_message as session_message",
        [
          {
            content: JSON.stringify({ title: "产品链接", url: "https://example.test/item" }),
            message_type: "link",
            session_id: 201,
            snapshot_id: 501,
            source_message_id: 9001,
            started_at: 1_780_244_000_000,
          },
        ],
      ],
      ["xy_wap_embed_session_tag as tag", []],
      ["xy_wap_embed_session_entity as entity", []],
      ["xy_wap_embed_session_intent as intent", []],
    ]);
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder(rowsByTable.get(table) ?? [], table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    const facts = await repository.listBusinessTopicFacts({ uid: 9001 }, { from: "2026-06-01", to: "2026-06-02" });

    expect(facts).toMatchObject([
      {
        dimension: "asset",
        sessionId: "201",
        snapshotId: "501",
      },
    ]);
    const assetQuery = builders.find((builder) => builder.table === "xy_wap_embed_logical_session_message as session_message");
    const tagQuery = builders.find((builder) => builder.table === "xy_wap_embed_session_tag as tag");
    const entityQuery = builders.find((builder) => builder.table === "xy_wap_embed_session_entity as entity");
    const intentQuery = builders.find((builder) => builder.table === "xy_wap_embed_session_intent as intent");
    expect(tagQuery?.whereCalls).toContainEqual(["tag.uid", "=", 9001]);
    expect(tagQuery?.whereCalls).not.toContainEqual(["session.uid", "=", 9001]);
    expect(entityQuery?.whereCalls).toContainEqual(["entity.uid", "=", 9001]);
    expect(entityQuery?.whereCalls).not.toContainEqual(["session.uid", "=", 9001]);
    expect(intentQuery?.whereCalls).toContainEqual(["intent.uid", "=", 9001]);
    expect(intentQuery?.whereCalls).not.toContainEqual(["session.uid", "=", 9001]);
    expect(assetQuery?.whereCalls).toContainEqual(["session_message.session_id", "in", [201, 202]]);
    expect(assetQuery?.whereCalls).toContainEqual(["current.current_snapshot_id", "in", [501, 502]]);
  });

  it("filters entity hotspot risk counts without concatenating indexed columns", async () => {
    const builders: SelectBuilderStub[] = [];
    const rowsByTable = new Map<string, unknown[]>([
      [
        "xy_wap_embed_session_entity as entity",
        [
          {
            entity_id: "sku-1",
            entity_name: "羽绒服",
            entity_type: "product",
            mention_count: 3,
            negative_count: 1,
            session_count: 2,
          },
        ],
      ],
      [
        "xy_wap_embed_session_entity as entity#2",
        [
          {
            entity_id: "sku-1",
            entity_type: "product",
            risk_session_count: 1,
          },
        ],
      ],
    ]);
    let entityQueryCount = 0;
    const db = {
      selectFrom: vi.fn((table: string) => {
        const key = table === "xy_wap_embed_session_entity as entity" && entityQueryCount++ > 0
          ? `${table}#2`
          : table;
        const builder = createSelectBuilder(rowsByTable.get(key) ?? [], table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await expect(repository.listEntityHotspots({ uid: 9001 })).resolves.toMatchObject([
      {
        entityId: "sku-1",
        entityType: "product",
      },
    ]);

    expect(builders[0]?.whereCalls).toContainEqual(["entity.uid", "=", 9001]);
    expect(builders[0]?.whereCalls).not.toContainEqual(["session.uid", "=", 9001]);
    expect(builders).toHaveLength(1);
  });

  it("loads detail qa findings and actions through focused snapshot queries", async () => {
    const builders: SelectBuilderStub[] = [];
    const rowsByTable = new Map<string, unknown[]>([
      [
        "xy_wap_embed_session_insight_current as current",
        [
          {
            agent_message_count: 1,
            conversation_id: 301,
            current_snapshot_id: 501,
            customer_message_count: 2,
            ended_at: null,
            generated_at: 1_780_245_000_000,
            last_message_at: 1_780_244_900_000,
            message_count: 3,
            phase: "final",
            problem_detected: 1,
            problem_summary: "物流未更新",
            resolution_status: "unresolved",
            session_id: 201,
            started_at: 1_780_244_000_000,
            status: "ready",
            summary_customer_intent: "查物流",
            summary_follow_up: "需要跟进",
            summary_process: "已登记",
            summary_result: "未解决",
            unresolved_reason: "待仓库反馈",
          },
        ],
      ],
      [
        "xy_wap_embed_insight_evidence",
        [
          {
            dimension_record_id: 701,
            dimension_type: "qa_finding",
            evidence_role: "primary",
            reason: "未说明时效",
            source_message_id: 9001,
          },
        ],
      ],
      ["xy_wap_embed_session_qa_finding", [{ qa_finding_id: 701, qa_passed: 0, qa_reason: "未说明时效", qa_rule_code: "reply_quality" }]],
      [
        "xy_wap_embed_session_action_item as action",
        [
          {
            action_id: 801,
            action_status: "open",
            action_type: "follow_up",
            conversation_id: 301,
            priority: "high",
            resolution_status: "unresolved",
            session_id: 201,
            snapshot_id: 501,
            title: "催物流",
          },
        ],
      ],
      ["xy_wap_embed_insight_evidence as evidence", [{ action_id: 801, evidence_message_id: 9001, last_customer_message_at: 1_780_244_000_000, reason: "承诺催办" }]],
      ["xy_wap_embed_conversation", []],
      ["xy_wap_embed_session_sentiment", []],
      ["xy_wap_embed_session_tag", []],
      ["xy_wap_embed_session_entity", []],
      ["xy_wap_embed_session_intent", []],
      ["xy_wap_embed_session_faq_candidate", []],
    ]);
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder(rowsByTable.get(table) ?? [], table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await expect(repository.findDetail({ uid: 9001 }, "201")).resolves.toMatchObject({
      actionItems: [{ actionItemId: "801", evidenceMessageIds: ["9001"] }],
      qaFindings: [{ evidenceMessageIds: ["9001"], passed: false, reason: "未说明时效", ruleCode: "reply_quality" }],
    });

    const coreQuery = builders[0];
    expect(coreQuery.joins).not.toContain("xy_wap_embed_session_qa_finding as qa");
    expect(coreQuery.joins).not.toContain("xy_wap_embed_session_action_item as action");
    expect(coreQuery.joins).not.toContain("xy_wap_embed_contact as contact");
    expect(coreQuery.joins).not.toContain("xy_wap_embed_user_seat as seat");
  });

  it("does not update an action item outside the current uid scope", async () => {
    const updateExecute = vi.fn(async () => ({ numAffectedRows: 1n }));
    const db = {
      selectFrom: vi.fn(() => createSelectBuilder([])),
      updateTable: vi.fn(() => createUpdateBuilder(updateExecute)),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.updateActionStatus({ uid: 9001 }, "801", "done"),
    ).resolves.toBe(false);

    expect(updateExecute).not.toHaveBeenCalled();
  });

  it("returns an existing rescan job and task when the idempotency key already exists", async () => {
    const duplicateKeyError = Object.assign(new Error("Duplicate entry"), {
      code: "ER_DUP_ENTRY",
      errno: 1062,
    });
    const db = {
      insertInto: vi.fn(() =>
        createInsertBuilder(async () => {
          throw duplicateKeyError;
        }),
      ),
      selectFrom: vi.fn(() => createSelectBuilder([{ id: 8801, rescan_task_id: 9901 }])),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.createRescanJob(
        { uid: 9001 },
        {
          analysisScope: "classification",
          from: new Date("2026-06-01T00:00:00.000Z"),
          to: new Date("2026-06-02T00:00:00.000Z"),
        },
        "rescan:9001:2026-06-01T00:00:00.000Z",
      ),
    ).resolves.toEqual({ jobId: "8801", taskId: "9901" });
  });
});

describe("MysqlInsightWorkerRepository", () => {
  it("finds an existing logical session by source message during rescan", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder([
          {
            session_id: 501,
            uid: 9001,
          },
        ], table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(repository.findSessionBySourceMessage({
      sourceMessageId: "8001",
      uid: 9001,
    })).resolves.toEqual({
      sessionId: "501",
      uid: 9001,
    });

    expect(builders[0]?.table).toBe("xy_wap_embed_logical_session_message");
    expect(builders[0]?.whereCalls).toContainEqual(["uid", "=", 9001]);
    expect(builders[0]?.whereCalls).toContainEqual(["source_message_id", "=", 8001]);
  });

  it("loads compact previous session summaries without tags, entities or evidence", async () => {
    const builders: SelectBuilderStub[] = [];
    const rowsByTable = new Map<string, unknown[]>([
      [
        "xy_wap_embed_logical_session as current_session",
        [
          {
            conversation_id: 301,
            started_at: 1_780_244_000_000,
          },
        ],
      ],
      [
        "xy_wap_embed_logical_session as previous_session",
        [
          {
            ended_at: 1_780_100_000_000,
            follow_up: "建议关注补发物流",
            problem_summary: "客户反馈上次订单少发",
            process_summary: "客服登记并承诺补寄",
            resolution_status: "partially_resolved",
            result_summary: "已登记补寄，物流未确认",
            session_id: 200,
            started_at: 1_780_090_000_000,
            unresolved_reason: "尚未给出补寄单号",
          },
        ],
      ],
    ]);
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder(rowsByTable.get(table) ?? [], table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(repository.listPreviousSessionContexts({
      currentSessionId: "501",
      limit: 3,
      lookbackHours: 48,
      uid: 9001,
    })).resolves.toEqual([
      {
        endedAt: 1_780_100_000_000,
        followUp: "建议关注补发物流",
        problemSummary: "客户反馈上次订单少发",
        processSummary: "客服登记并承诺补寄",
        resolutionStatus: "partially_resolved",
        resultSummary: "已登记补寄，物流未确认",
        sessionId: "200",
        startedAt: 1_780_090_000_000,
        unresolvedReason: "尚未给出补寄单号",
      },
    ]);

    const previousQuery = builders.find((builder) => builder.table === "xy_wap_embed_logical_session as previous_session");
    expect(previousQuery?.joins).toContain("xy_wap_embed_session_insight_current as current");
    expect(previousQuery?.joins).toContain("xy_wap_embed_session_summary as summary");
    expect(previousQuery?.joins).toContain("xy_wap_embed_session_problem_resolution as problem");
    expect(previousQuery?.joins).not.toContain("xy_wap_embed_session_tag");
    expect(previousQuery?.joins).not.toContain("xy_wap_embed_session_entity");
    expect(previousQuery?.joins).not.toContain("xy_wap_embed_insight_evidence");
    expect(previousQuery?.whereCalls).toContainEqual(["previous_session.uid", "=", 9001]);
    expect(previousQuery?.whereCalls).toContainEqual(["previous_session.conversation_id", "=", 301]);
    expect(previousQuery?.whereCalls).toContainEqual(["previous_session.id", "!=", 501]);
    expect(previousQuery?.whereCalls).toContainEqual(["previous_session.ended_at", "<=", 1_780_244_000_000]);
    expect(previousQuery?.whereCalls).toContainEqual(["previous_session.ended_at", ">=", 1_780_071_200_000]);
    expect(previousQuery?.orderByCalls).toContainEqual(["previous_session.ended_at", "desc"]);
    expect(previousQuery?.limitCalls).toEqual([3]);
  });

  it("does not claim an analysis job when another worker wins the status update", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      transaction: vi.fn(),
      selectFrom: vi.fn(() => {
        const builder = createSelectBuilder([
          {
            analysis_scope: "all",
            attempt_count: 0,
            id: 701,
            idempotency_key: "analyze_session:9001:501:live:2026-06-01T00:00:00.000Z",
            job_type: "analyze_session",
            max_attempts: 3,
            target_id: "501",
            uid: 9001,
          },
        ]);
        builders.push(builder);
        return builder;
      }),
      updateTable: vi.fn(() => createUpdateBuilder(async () => ({ numAffectedRows: 0n }))),
    };
    db.transaction.mockReturnValue(createTransactionBuilder(db));
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(repository.claimNextAnalyzeJob()).resolves.toBeUndefined();
    expect(db.transaction).toHaveBeenCalled();
    expect(builders[0]?.forUpdateCalls).toBe(1);
    expect(builders[0]?.skipLockedCalls).toBe(1);
  });

  it("claims an expired running analysis job for retry", async () => {
    const updateExecute = vi.fn(async () => ({ numAffectedRows: 1n }));
    const builders: SelectBuilderStub[] = [];
    const updateTables: string[] = [];
    const db = {
      transaction: vi.fn(),
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder([
          {
            analysis_scope: "all",
            attempt_count: 1,
            id: 40,
            idempotency_key: "reanalyze_session:272:29:final:2026-06-03T12:25:25.258Z",
            job_type: "reanalyze_session",
            max_attempts: 3,
            target_id: "29",
            uid: 272,
          },
        ], table);
        builders.push(builder);
        return builder;
      }),
      updateTable: vi.fn((table: string) => {
        updateTables.push(table);
        return createUpdateBuilder(updateExecute);
      }),
    };
    db.transaction.mockReturnValue(createTransactionBuilder(db));
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(repository.claimNextAnalyzeJob()).resolves.toEqual({
      analysisScope: "all",
      attemptCount: 2,
      jobId: "40",
      maxAttempts: 3,
      mode: "manual_reanalyze",
      sessionId: "29",
      uid: 272,
    });

    expect(builders[0]?.whereCalls).toContainEqual(["status", "=", "pending"]);
    expect(builders[0]?.whereCalls).toContainEqual(["status", "=", "running"]);
    expect(builders[0]?.whereCalls).toContainEqual(["lease_until", "<=", expect.any(Date)]);
    expect(builders[0]?.forUpdateCalls).toBe(1);
    expect(builders[0]?.skipLockedCalls).toBe(1);
    expect(updateTables).toContain("xy_wap_embed_analysis_run");
    expect(updateExecute).toHaveBeenCalled();
  });

  it("does not claim a sync job when another worker wins the status update", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      transaction: vi.fn(),
      selectFrom: vi.fn(() => {
        const builder = createSelectBuilder([
          {
            analysis_scope: "all",
            id: 702,
            rescan_task_id: null,
            target_id: "2026-06-01T00:00:00.000Z",
            uid: 9001,
          },
        ]);
        builders.push(builder);
        return builder;
      }),
      updateTable: vi.fn(() => createUpdateBuilder(async () => ({ numAffectedRows: 0n }))),
    };
    db.transaction.mockReturnValue(createTransactionBuilder(db));
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(repository.claimNextSyncMessagesJob()).resolves.toBeUndefined();
    expect(db.transaction).toHaveBeenCalled();
    expect(builders[0]?.forUpdateCalls).toBe(1);
    expect(builders[0]?.skipLockedCalls).toBe(1);
  });

  it("claims cleanup-disabled-insights jobs for disabled tenant session cleanup", async () => {
    const updateExecute = vi.fn(async () => ({ numAffectedRows: 1n }));
    const builders: SelectBuilderStub[] = [];
    const db = {
      transaction: vi.fn(),
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder([
          {
            id: 703,
            target_id: "1780243000000",
            uid: 9001,
          },
        ], table);
        builders.push(builder);
        return builder;
      }),
      updateTable: vi.fn(() => createUpdateBuilder(updateExecute)),
    };
    db.transaction.mockReturnValue(createTransactionBuilder(db));
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(repository.claimNextCleanupDisabledInsightsJob()).resolves.toEqual({
      enableEpoch: 1_780_243_000_000,
      jobId: "703",
      uid: 9001,
    });

    expect(builders[0]?.whereCalls).toContainEqual(["target_type", "=", "uid"]);
    expect(builders[0]?.whereCalls).toContainEqual(["job_type", "=", "cleanup_disabled_insights"]);
    expect(builders[0]?.forUpdateCalls).toBe(1);
    expect(builders[0]?.skipLockedCalls).toBe(1);
    expect(updateExecute).toHaveBeenCalled();
  });

  it("rejects malformed historical rescan cursors before claiming the job", async () => {
    const updateExecute = vi.fn(async () => ({ numAffectedRows: 1n }));
    const db = {
      transaction: vi.fn(),
      selectFrom: vi.fn(() =>
        createSelectBuilder([
          {
            analysis_scope: "all",
            id: 702,
            rescan_task_id: null,
            target_id: "not-a-date",
            uid: 9001,
          },
        ]),
      ),
      updateTable: vi.fn(() => createUpdateBuilder(updateExecute)),
    };
    db.transaction.mockReturnValue(createTransactionBuilder(db));
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(repository.claimNextSyncMessagesJob()).rejects.toThrow(
      "Invalid sync_messages target_id",
    );
    expect(updateExecute).not.toHaveBeenCalled();
  });

  it("checks pending live analysis jobs with exact indexed columns", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const rows = table === "xy_wap_embed_logical_session_message"
          ? [{ count: 20 }]
          : [];
        const builder = createSelectBuilder(rows, table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(repository.shouldCreateLiveAnalyzeJob({
      occurredAt: 1_780_244_000_000,
      sessionId: "501",
      uid: 9001,
    })).resolves.toBe(true);

    const jobQuery = builders.find((builder) => builder.table === "xy_wap_embed_insight_job");
    expect(jobQuery?.whereCalls).toContainEqual(["uid", "=", 9001]);
    expect(jobQuery?.whereCalls).toContainEqual(["target_type", "=", "logical_session"]);
    expect(jobQuery?.whereCalls).toContainEqual(["target_id", "=", "501"]);
    expect(jobQuery?.whereCalls).toContainEqual(["job_type", "=", "analyze_session"]);
    expect(jobQuery?.whereCalls).toContainEqual(["status", "in", ["pending", "running"]]);
    expect(jobQuery?.whereCalls.some((call) => call[0] === "idempotency_key" && call[1] === "like")).toBe(false);
  });

  it("updates rescan task progress and completion state without a follow-up select", async () => {
    const updates: UpdateBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn(() => createSelectBuilder([])),
      updateTable: vi.fn((table: string) => {
        const builder = createUpdateBuilder(
          async () => ({ numAffectedRows: 1n }),
          { table },
        );
        updates.push(builder);
        return builder;
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await repository.updateRescanTaskAfterAnalysis({
      failedSessions: 0,
      rescanTaskId: "9901",
      succeededSessions: 1,
    });

    expect(db.selectFrom).not.toHaveBeenCalledWith("xy_wap_embed_insight_rescan_task");
    expect(updates.map((builder) => builder.table)).toEqual([
      "xy_wap_embed_insight_rescan_task",
      "xy_wap_embed_insight_rescan_task",
    ]);
    expect(updates[0]?.whereCalls).toContainEqual(["id", "=", 9901]);
    expect(updates[1]?.whereCalls).toContainEqual(["id", "=", 9901]);
    expect(updates[1]?.whereRawCalls).toHaveLength(3);
  });

  it("archives terminal insight jobs before pruning them from the hot queue", async () => {
    const insertBuilders: InsertBuilderStub[] = [];
    const deleteBuilders: DeleteBuilderStub[] = [];
    const db = {
      deleteFrom: vi.fn((table: string) => {
        const builder = createDeleteBuilder(async () => ({ numDeletedRows: 3n }), table);
        deleteBuilders.push(builder);
        return builder;
      }),
      insertInto: vi.fn((table: string) => {
        const builder = createInsertBuilder(async () => ({ numInsertedOrUpdatedRows: 3n }), { table });
        insertBuilders.push(builder);
        return builder;
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(repository.archiveTerminalJobs({
      before: new Date("2026-06-01T00:00:00.000Z"),
      limit: 5000,
    })).resolves.toEqual({ archivedJobs: 3, deletedJobs: 3 });

    expect(db.insertInto).toHaveBeenCalledWith("xy_wap_embed_insight_job_archive");
    expect(insertBuilders[0]?.columnsCalls[0]).toContain("archived_at");
    expect(insertBuilders[0]?.expressionCalls).toBe(1);
    expect(db.deleteFrom).toHaveBeenCalledWith("xy_wap_embed_insight_job");
    expect(deleteBuilders[0]?.whereCalls).toContainEqual(["status", "in", ["succeeded", "failed"]]);
    expect(deleteBuilders[0]?.whereCalls).toContainEqual(["update_time", "<", new Date("2026-06-01T00:00:00.000Z")]);
    expect(deleteBuilders[0]?.limitCalls).toEqual([5000]);
  });

  it("loads closable open sessions through the indexed next close timestamp", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder([
          {
            analysis_delay_minutes: 10,
            hard_max_duration_hours: 8,
            id: 501,
            idle_timeout_minutes: 120,
            last_meaningful_message_at: 1_780_244_000_000,
            started_at: 1_780_230_000_000,
            uid: 9001,
          },
        ], table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(repository.listClosableOpenSessions({
      limit: 100,
      now: 1_780_252_000_000,
    })).resolves.toEqual([
      expect.objectContaining({
        closeReason: "idle_timeout",
        sessionId: "501",
      }),
    ]);

    expect(builders[0]?.whereCalls).toContainEqual(["status", "=", "open"]);
    expect(builders[0]?.whereCalls).toContainEqual(["next_close_at", "<=", 1_780_252_000_000]);
    expect(builders[0]?.orderByCalls).toContainEqual(["next_close_at", "asc"]);
    expect(builders[0]?.whereRawCalls.join("\n")).not.toContain("hard_max_duration_hours * 3600000");
  });

  it("finds reusable open or canceled sessions for stable sessionization", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder([
          {
            id: 501,
            last_meaningful_message_at: 1_780_244_000_000,
            started_at: 1_780_243_000_000,
            status: "canceled",
          },
        ], table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(repository.findReusableSession({
      conversationId: "301",
      uid: 9001,
    })).resolves.toEqual({
      lastMeaningfulMessageAt: 1_780_244_000_000,
      sessionId: "501",
      startedAt: 1_780_243_000_000,
      status: "canceled",
    });

    expect(builders[0]?.whereCalls).toContainEqual(["uid", "=", 9001]);
    expect(builders[0]?.whereCalls).toContainEqual(["conversation_id", "=", 301]);
    expect(builders[0]?.whereCalls).toContainEqual(["status", "in", ["open", "canceled"]]);
  });

  it("filters closable open sessions by active uid before applying the batch limit", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder([], table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await repository.listClosableOpenSessions({
      activeUids: new Set([9001, 9002]),
      limit: 100,
      now: 1_780_252_000_000,
    });

    expect(builders[0]?.whereCalls).toContainEqual(["uid", "in", [9001, 9002]]);
    expect(builders[0]?.limitCalls).toEqual([100]);
  });

  it("filters live-analysis open sessions by active uid before applying the batch limit", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder([], table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await repository.listOpenSessionsForLiveAnalysis({
      activeUids: new Set([9001, 9002]),
      limit: 100,
    });

    expect(builders[0]?.whereCalls).toContainEqual(["uid", "in", [9001, 9002]]);
    expect(builders[0]?.limitCalls).toEqual([100]);
  });

  it("loads enabled feature configs in scan batches ordered by oldest cursor update", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder([
          {
            entity_enabled: 1,
            insight_enabled: 1,
            intent_enabled: 1,
            label_enabled: 1,
            last_enable_time: 1_780_243_000_000,
            qa_enabled: 1,
            todo_enabled: 1,
            uid: 9001,
          },
        ], table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(repository.getActiveFeatureConfigs({
      limit: 100,
    })).resolves.toEqual([
      expect.objectContaining({
        insightEnabled: true,
        uid: 9001,
      }),
    ]);

    expect(builders[0]?.table).toBe("xy_wap_embed_insight_feature_config as config");
    expect(builders[0]?.joins).toContain("xy_wap_embed_insight_sync_cursor as cursor");
    expect(builders[0]?.whereCalls).toContainEqual(["config.insight_enabled", "=", 1]);
    expect(builders[0]?.orderByCalls.length).toBeGreaterThan(0);
    expect(builders[0]?.limitCalls).toEqual([100]);
  });

  it("closes disabled open sessions in cleanup batches", async () => {
    let logicalSessionUpdate: UpdateBuilderStub | undefined;
    const db = {
      updateTable: vi.fn((table: string) => createUpdateBuilder(
        async () => ({ numAffectedRows: 25n }),
        {
          onCreate: (builder) => {
            if (table === "xy_wap_embed_logical_session") {
              logicalSessionUpdate = builder;
            }
          },
          table,
        },
      )),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(repository.closeDisabledOpenSessions({
      endedAt: 1_780_252_000_000,
      limit: 500,
      uid: 9001,
    })).resolves.toBe(25);

    expect(logicalSessionUpdate?.setCalls[0]).toMatchObject({
      close_reason: "insight_disabled",
      ended_at: 1_780_252_000_000,
      next_close_at: null,
      status: "canceled",
    });
    expect(logicalSessionUpdate?.whereCalls).toContainEqual(["uid", "=", 9001]);
    expect(logicalSessionUpdate?.whereCalls).toContainEqual(["status", "=", "open"]);
    expect(logicalSessionUpdate?.limitCalls).toEqual([500]);
  });

  it("stores next close time when creating and appending logical-session messages", async () => {
    const insertValues: Array<{ table: string; values: Record<string, unknown> | Record<string, unknown>[] }> = [];
    const updateValues: Array<{ table: string; values: Record<string, unknown> }> = [];
    const db = {
      insertInto: vi.fn((table: string) => createInsertBuilder(
        async () => ({ insertId: 501, numInsertedOrUpdatedRows: 1n }),
        {
          onValues: (values) => insertValues.push({ table, values }),
          table,
        },
      )),
      updateTable: vi.fn((table: string) => createUpdateBuilder(
        async () => ({ numAffectedRows: 1n }),
        {
          onSet: (values) => updateValues.push({ table, values }),
          table,
        },
      )),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await repository.createLogicalSession({
      config: {
        analysisDelayMinutes: 10,
        hardMaxDurationHours: 8,
        idleTimeoutMinutes: 120,
        lateArrivalWindowMinutes: 30,
        ruleVersion: "insights-v1",
      },
      conversationId: "301",
      startedAt: 1_780_244_000_000,
      uid: 9001,
    });
    await repository.appendSessionMessage({
      conversationId: "301",
      includedForAi: true,
      meaningfulForBoundary: true,
      messageType: "text",
      occurredAt: 1_780_244_060_000,
      senderRole: "customer",
      sessionId: "501",
      sourceMessageId: "9001",
      sourceMessageTime: 1_780_244_060_000,
      uid: 9001,
    });

    expect(insertValues.find((entry) => entry.table === "xy_wap_embed_logical_session")?.values)
      .toMatchObject({
        next_close_at: 1_780_244_000_000 + 120 * 60_000,
      });
    expect(updateValues.find((entry) => entry.table === "xy_wap_embed_logical_session")?.values)
      .toHaveProperty("next_close_at");
  });

  it("writes analysis snapshots as building before publishing them", async () => {
    const operations: Array<{ table: string; type: "insert" | "update"; values?: Record<string, unknown> }> = [];
    const updateBuilders: UpdateBuilderStub[] = [];
    let nextInsertId = 7001;
    let logicalSessionSelectCount = 0;
    const db = {
      insertInto: vi.fn((table: string) => createInsertBuilder(async () => ({ insertId: nextInsertId++ }), {
        onValues: (values) => operations.push({ table, type: "insert", values }),
        table,
      })),
      selectFrom: vi.fn((table: string) => {
        if (table === "xy_wap_embed_logical_session") {
          logicalSessionSelectCount += 1;
        }

        return createSelectBuilder(
          table === "xy_wap_embed_logical_session"
            ? [{ conversation_id: 301 }]
            : [],
          table,
        );
      }),
      updateTable: vi.fn((table: string) => createUpdateBuilder(async () => ({ numAffectedRows: 1n }), {
        onSet: (values) => operations.push({ table, type: "update", values }),
        onCreate: (builder) => updateBuilders.push(builder),
        table,
      })),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await repository.saveAnalysisResult({
      job: {
        analysisScope: "all",
        attemptCount: 1,
        jobId: "job-1",
        maxAttempts: 3,
        mode: "final",
        sessionId: "501",
        uid: 9001,
      },
      output: {
        actionItems: [],
        entities: [],
        faqCandidates: [
          {
            answerHint: "先同步物流节点",
            evidenceMessageIds: ["9202"],
            question: "物流延迟如何处理",
            status: "candidate",
          },
        ],
        intents: [
          {
            confidence: 0.72,
            evidenceMessageIds: ["9202"],
            intentCode: "logistics_delay",
            intentLabel: "物流异常",
          },
        ],
        problemResolution: {
          confidence: 0.8,
          evidence: [],
          evidenceMessageIds: ["9001"],
          problemDetected: true,
          problemSummary: "物流异常",
          resolutionStatus: "unresolved",
        },
        qaFindings: [],
        sentiment: [
          {
            confidence: 0.7,
            evidenceMessageIds: ["9001"],
            polarity: "negative",
            reason: "客户表达不满",
          },
        ],
        summary: {
          confidence: 0.9,
          customerIntent: "查物流",
          processSummary: "已登记",
          resultSummary: "未解决",
        },
        tags: [
          {
            confidence: 0.8,
            evidenceMessageIds: ["9001"],
            tagCode: "logistics",
            tagName: "物流咨询",
          },
        ],
      },
      runId: "6001",
      sourceMessageHighWatermark: "9001",
      validationWarnings: [],
    });

    expect(operations[0]).toMatchObject({
      table: "xy_wap_embed_session_insight_snapshot",
      type: "insert",
      values: expect.objectContaining({ status: "building" }),
    });
    const currentIndex = operations.findIndex((operation) =>
      operation.table === "xy_wap_embed_session_insight_current",
    );
    const publishIndex = operations.findIndex((operation) =>
      operation.table === "xy_wap_embed_session_insight_snapshot"
      && operation.type === "update"
      && operation.values?.status === "ready",
    );
    expect(publishIndex).toBeGreaterThan(0);
    expect(currentIndex).toBeGreaterThan(publishIndex);
    expect(logicalSessionSelectCount).toBe(1);
    const logicalSessionUpdate = updateBuilders.find((builder) =>
      builder.table === "xy_wap_embed_logical_session"
      && builder.whereCalls.some((call) => call[0] === "id" && call[2] === 501),
    );
    expect(logicalSessionUpdate?.whereCalls).toContainEqual(["uid", "=", 9001]);
  });

  it("batches insight evidence rows into one insert after dimension rows are written", async () => {
    const insertValues: Array<{ table: string; values: Record<string, unknown> | Record<string, unknown>[] }> = [];
    let nextInsertId = 7001;
    const db = {
      insertInto: vi.fn((table: string) => createInsertBuilder(
        async () => ({ insertId: nextInsertId++ }),
        {
          onValues: (values) => insertValues.push({ table, values }),
          table,
        },
      )),
      selectFrom: vi.fn((table: string) =>
        createSelectBuilder(
          table === "xy_wap_embed_insight_feature_config"
            ? [{
                entity_enabled: 0,
                insight_enabled: 1,
                intent_enabled: 0,
                label_enabled: 0,
                last_enable_time: 1_780_300_000_000,
                qa_enabled: 0,
                todo_enabled: 0,
                uid: 9001,
              }]
            : [{ conversation_id: 301 }],
          table,
        )
      ),
      updateTable: vi.fn((table: string) => createUpdateBuilder(
        async () => ({ numAffectedRows: 1n }),
        { table },
      )),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await repository.saveAnalysisResult({
      job: {
        analysisScope: "all",
        attemptCount: 1,
        jobId: "9001",
        maxAttempts: 3,
        mode: "final",
        sessionId: "501",
        uid: 9001,
      },
      output: {
        actionItems: [
          {
            evidenceMessageIds: ["9201"],
            priority: "high",
            title: "跟进退款",
          },
        ],
        entities: [
          {
            confidence: 0.8,
            entityId: "sku-1",
            entityName: "商品",
            entityType: "product",
            evidenceMessageIds: ["9202"],
          },
        ],
        faqCandidates: [
          {
            answerHint: "先同步物流节点",
            evidenceMessageIds: ["9202"],
            question: "物流延迟如何处理",
            status: "candidate",
          },
        ],
        intents: [
          {
            confidence: 0.72,
            evidenceMessageIds: ["9202"],
            intentCode: "logistics_delay",
            intentLabel: "物流异常",
          },
        ],
        problemResolution: {
          confidence: 0.9,
          evidence: [],
          evidenceMessageIds: ["9200"],
          problemDetected: true,
          problemSummary: "物流延迟",
          resolutionStatus: "unresolved",
        },
        qaFindings: [],
        sentiment: [],
        summary: {
          confidence: 0.9,
          customerIntent: "查物流",
          processSummary: "客户咨询物流",
          resultSummary: "待跟进",
        },
        tags: [
          {
            confidence: 0.77,
            evidenceMessageIds: ["9202"],
            tagCode: "logistics",
            tagName: "物流咨询",
          },
        ],
      },
      runId: "8001",
      sourceMessageHighWatermark: "9202",
      validationWarnings: [],
    });

    const evidenceInserts = insertValues.filter((entry) => entry.table === "xy_wap_embed_insight_evidence");
    for (const table of [
      "xy_wap_embed_session_action_item",
      "xy_wap_embed_session_entity",
      "xy_wap_embed_session_faq_candidate",
      "xy_wap_embed_session_intent",
      "xy_wap_embed_session_tag",
    ]) {
      const insert = insertValues.find((entry) => entry.table === table);
      expect(insert?.values).toEqual(expect.objectContaining({ uid: 9001 }));
    }
    expect(evidenceInserts).toHaveLength(1);
    expect(evidenceInserts[0]?.values).toEqual(expect.arrayContaining([
      expect.objectContaining({ dimension_type: "problem_resolution", source_message_id: 9200 }),
      expect.objectContaining({ dimension_type: "action_item", source_message_id: 9201 }),
      expect.objectContaining({ dimension_type: "entity", source_message_id: 9202 }),
    ]));
  });

  it("deduplicates repeated evidence rows before inserting analysis results", async () => {
    let evidenceInsert: InsertBuilderStub | undefined;
    const evidenceValues: unknown[] = [];
    let insertId = 7000;
    const db = {
      insertInto: vi.fn((table: string) => createInsertBuilder(
        async () => ({ insertId: ++insertId }),
        {
          onCreate: (builder) => {
            if (table === "xy_wap_embed_insight_evidence") {
              evidenceInsert = builder;
            }
          },
          onValues: (values) => {
            if (table === "xy_wap_embed_insight_evidence") {
              evidenceValues.push(...(Array.isArray(values) ? values : [values]));
            }
          },
          table,
        },
      )),
      selectFrom: vi.fn((table: string) => {
        if (table === "xy_wap_embed_logical_session") {
          return createSelectBuilder([{ conversation_id: 301 }], table);
        }

        return createSelectBuilder([], table);
      }),
      updateTable: vi.fn(() => createUpdateBuilder(async () => ({ numAffectedRows: 1n }))),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await repository.saveAnalysisResult({
      job: {
        analysisScope: "all",
        idempotencyKey: "analysis:501",
        jobId: "9001",
        jobType: "analyze_session",
        mode: "final",
        sessionId: "501",
        uid: 9001,
      },
      output: {
        actionItems: [],
        entities: [],
        faqCandidates: [],
        intents: [],
        problemResolution: {
          confidence: 0.9,
          evidence: [],
          evidenceMessageIds: [
            { evidenceRole: "customer_problem", messageId: "9200", reason: "客户反馈物流异常" },
            { evidenceRole: "customer_problem", messageId: "9200", reason: "客户反馈物流异常" },
          ],
          problemDetected: true,
          problemSummary: "物流延迟",
          resolutionStatus: "unresolved",
        },
        qaFindings: [],
        sentiment: [],
        summary: {
          confidence: 0.9,
          customerIntent: "查物流",
          processSummary: "客户咨询物流",
          resultSummary: "待跟进",
        },
        tags: [],
      },
      runId: "8001",
      sourceMessageHighWatermark: "9200",
      validationWarnings: [],
    });

    expect(evidenceValues).toHaveLength(1);
    expect(evidenceValues[0]).toEqual(expect.objectContaining({
      dimension_type: "problem_resolution",
      evidence_role: "customer_problem",
      source_message_id: 9200,
    }));
    expect(evidenceInsert?.ignoreCalls).toBe(1);
  });

  it("scopes logical session count updates to the current uid", async () => {
    let logicalSessionUpdate: UpdateBuilderStub | undefined;
    const db = {
      insertInto: vi.fn(() => createInsertBuilder(async () => ({ insertId: 1 }))),
      updateTable: vi.fn((table: string) => createUpdateBuilder(
        async () => ({ numAffectedRows: 1n }),
        {
          onCreate: (builder) => {
            if (table === "xy_wap_embed_logical_session") {
              logicalSessionUpdate = builder;
            }
          },
          table,
        },
      )),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await repository.appendSessionMessage({
      conversationId: "301",
      includedForAi: true,
      meaningfulForBoundary: true,
      messageType: "text",
      occurredAt: 1_780_244_000_000,
      senderRole: "customer",
      sessionId: "501",
      sourceMessageId: "9001",
      sourceMessageTime: 1_780_244_000_000,
      uid: 9001,
    });

    expect(logicalSessionUpdate?.whereCalls).toContainEqual(["id", "=", 501]);
    expect(logicalSessionUpdate?.whereCalls).toContainEqual(["uid", "=", 9001]);
  });
});

type SelectBuilderStub = ReturnType<typeof createSelectBuilder>;
type DeleteBuilderStub = ReturnType<typeof createDeleteBuilder>;
type InsertBuilderStub = ReturnType<typeof createInsertBuilder>;
type UpdateBuilderStub = ReturnType<typeof createUpdateBuilder>;

function createSelectBuilder(rows: unknown[], table = "") {
  const builder = {
    joins: [] as string[],
    forUpdateCalls: 0,
    groupByCalls: [] as unknown[][],
    limitCalls: [] as number[],
    offsetCalls: [] as number[],
    orderByCalls: [] as unknown[][],
    skipLockedCalls: 0,
    table,
    whereRawCalls: [] as string[],
    selectRawCalls: [] as string[],
    whereCalls: [] as unknown[][],
    execute: async () => rows,
    executeTakeFirst: async () => rows[0],
    forUpdate: () => {
      builder.forUpdateCalls += 1;
      return builder;
    },
    groupBy: (...args: unknown[]) => {
      builder.groupByCalls.push(args);
      return builder;
    },
    innerJoin: (joinTable: string) => {
      builder.joins.push(joinTable);
      return builder;
    },
    leftJoin: (joinTable: string) => {
      builder.joins.push(joinTable);
      return builder;
    },
    limit: (value: number) => {
      builder.limitCalls.push(value);
      return builder;
    },
    offset: (value: number) => {
      builder.offsetCalls.push(value);
      return builder;
    },
    orderBy: (...args: unknown[]) => {
      builder.orderByCalls.push(args);
      return builder;
    },
    select: (...args: unknown[]) => {
      builder.selectRawCalls.push(args.map(String).join("\n"));
      return builder;
    },
    skipLocked: () => {
      builder.skipLockedCalls += 1;
      return builder;
    },
    where: (...args: unknown[]) => {
      if (typeof args[0] === "function") {
        args[0](createExpressionBuilderStub(builder));
        return builder;
      }

      if (args.length === 1) {
        builder.whereRawCalls.push(String(args[0]));
      }

      builder.whereCalls.push(args);
      return builder;
    },
    whereRef: () => builder,
  };

  return builder;
}

function createExpressionBuilderStub(builder: { whereCalls: unknown[][] }) {
  const expressionBuilder = ((...args: unknown[]) => {
    builder.whereCalls.push(args);
    return args;
  }) as unknown as {
    (...args: unknown[]): unknown[];
    and: (conditions: unknown[]) => unknown[];
    or: (conditions: unknown[]) => unknown[];
  };

  expressionBuilder.and = (conditions: unknown[]) => conditions;
  expressionBuilder.or = (conditions: unknown[]) => conditions;

  return expressionBuilder;
}

function createTransactionBuilder(db: {
  selectFrom: (table: string) => SelectBuilderStub;
  updateTable: (table: string) => UpdateBuilderStub;
}) {
  return {
    execute: async <T>(callback: (trx: typeof db) => Promise<T>) => callback(db),
  };
}

function createInsertBuilder(
  executeTakeFirstOrThrow: () => Promise<unknown>,
  options: {
    onCreate?: (builder: InsertBuilderStub) => void;
    onValues?: (values: Record<string, unknown> | Record<string, unknown>[]) => void;
    table?: string;
  } = {},
) {
  const builder = {
    columnsCalls: [] as string[][],
    executeTakeFirst: executeTakeFirstOrThrow,
    executeTakeFirstOrThrow,
    expressionCalls: 0,
    ignoreCalls: 0,
    columns: (columns: string[]) => {
      builder.columnsCalls.push(columns);
      return builder;
    },
    expression: () => {
      builder.expressionCalls += 1;
      return builder;
    },
    ignore: () => {
      builder.ignoreCalls += 1;
      return builder;
    },
    onDuplicateKeyUpdate: () => builder,
    values: (values: Record<string, unknown>) => {
      options.onValues?.(values);
      return builder;
    },
  };

  options.onCreate?.(builder);

  return builder;
}

function createDeleteBuilder(
  executeTakeFirst: () => Promise<unknown>,
  table = "",
) {
  const builder = {
    execute: async () => [await executeTakeFirst()],
    executeTakeFirst,
    limitCalls: [] as number[],
    table,
    whereCalls: [] as unknown[][],
    limit: (value: number) => {
      builder.limitCalls.push(value);
      return builder;
    },
    where: (...args: unknown[]) => {
      builder.whereCalls.push(args);
      return builder;
    },
  };

  return builder;
}

function createUpdateBuilder(
  executeTakeFirst: () => Promise<unknown>,
  options: {
    onCreate?: (builder: UpdateBuilderStub) => void;
    onSet?: (values: Record<string, unknown>) => void;
    table?: string;
  } = {},
) {
  const builder = {
    execute: async () => [await executeTakeFirst()],
    executeTakeFirst,
    limitCalls: [] as number[],
    setCalls: [] as Record<string, unknown>[],
    table: options.table ?? "",
    whereRawCalls: [] as string[],
    whereCalls: [] as unknown[][],
    limit: (value: number) => {
      builder.limitCalls.push(value);
      return builder;
    },
    set: (values: Record<string, unknown>) => {
      builder.setCalls.push(values);
      options.onSet?.(values);
      return builder;
    },
    where: (...args: unknown[]) => {
      if (args.length === 1) {
        builder.whereRawCalls.push(String(args[0]));
      }
      builder.whereCalls.push(args);
      return builder;
    },
  };

  options.onCreate?.(builder);

  return builder;
}
