import { describe, expect, it, vi } from "vitest";
import { InsightsRepository } from "../../../src/modules/insights/insights.repository";
import { MysqlInsightWorkerRepository } from "../../../src/modules/insights/insights-worker.repository";

describe("InsightsRepository", () => {
  it("loads current sessions without joining one-to-many insight tables in the core query", async () => {
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
        "xy_wap_embed_session_risk",
        [
          { high_risk_count: 1, negative_count: 2, risk_severity: "high", snapshot_id: 501 },
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
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder(rowsByTable.get(table) ?? [], table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await expect(repository.listCurrentSessions({ uid: 9001 })).resolves.toMatchObject([
      {
        actionOpenCount: 1,
        highRiskCount: 1,
        lastCustomerMessageAt: 1_780_244_100_000,
        negativeCount: 2,
        problemEvidenceMessageIds: ["9001", "9002"],
        riskSeverity: "high",
        sessionId: "201",
      },
    ]);

    const coreQuery = builders[0];
    expect(coreQuery.joins).not.toContain("xy_wap_embed_session_risk as risk");
    expect(coreQuery.joins).not.toContain("xy_wap_embed_session_action_item as action");
    expect(coreQuery.joins).not.toContain("xy_wap_embed_insight_evidence as evidence");
    expect(coreQuery.joins).not.toContain("xy_wap_embed_msg_audit_info as message");
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
            priority: "high",
            resolution_status: "unresolved",
            session_id: 201,
            snapshot_id: 501,
            title: "催物流",
          },
        ],
      ],
      [
        "xy_wap_embed_insight_evidence as evidence",
        [
          { action_id: 801, evidence_message_id: 9001, last_customer_message_at: 1_780_244_000_000, reason: "承诺催办" },
          { action_id: 801, evidence_message_id: 9002, last_customer_message_at: 1_780_244_100_000, reason: "客户追问" },
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
        evidenceMessageIds: ["9001", "9002"],
        lastCustomerMessageAt: 1_780_244_100_000,
        reason: "承诺催办",
      },
    ]);

    const mainQuery = builders[0];
    expect(mainQuery.joins).not.toContain("xy_wap_embed_insight_evidence as evidence");
    expect(mainQuery.joins).not.toContain("xy_wap_embed_msg_audit_info as message");
    const evidenceQuery = builders.find((builder) => builder.table === "xy_wap_embed_insight_evidence as evidence");
    expect(evidenceQuery?.whereCalls).toContainEqual(["evidence.snapshot_id", "in", [501]]);
    expect(evidenceQuery?.whereCalls).toContainEqual(["evidence.dimension_type", "=", "action_item"]);
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
    expect(assetQuery?.whereCalls).toContainEqual(["session_message.session_id", "in", [201, 202]]);
    expect(assetQuery?.whereCalls).toContainEqual(["current.current_snapshot_id", "in", [501, 502]]);
  });

  it("loads detail qa findings, risks, and actions through focused snapshot queries", async () => {
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
          {
            dimension_record_id: 601,
            dimension_type: "risk",
            evidence_role: "primary",
            reason: "客户可能投诉",
            source_message_id: 9002,
          },
        ],
      ],
      ["xy_wap_embed_session_qa_finding", [{ qa_finding_id: 701, qa_passed: 0, qa_reason: "未说明时效", qa_rule_code: "reply_quality" }]],
      ["xy_wap_embed_session_risk", [{ risk_id: 601, risk_level: "high", risk_type: "complaint" }]],
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
      risks: [{ evidenceMessageIds: ["9002"], riskLevel: "high", riskType: "complaint" }],
    });

    const coreQuery = builders[0];
    expect(coreQuery.joins).not.toContain("xy_wap_embed_session_qa_finding as qa");
    expect(coreQuery.joins).not.toContain("xy_wap_embed_session_risk as risk");
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

  it("returns an existing rescan job when the idempotency key already exists", async () => {
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
      selectFrom: vi.fn(() => createSelectBuilder([{ id: 8801 }])),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.createRescanJob(
        { uid: 9001 },
        new Date("2026-06-01T00:00:00.000Z"),
        "rescan:9001:2026-06-01T00:00:00.000Z",
      ),
    ).resolves.toBe("8801");
  });
});

describe("MysqlInsightWorkerRepository", () => {
  it("does not claim an analysis job when another worker wins the status update", async () => {
    const db = {
      selectFrom: vi.fn(() =>
        createSelectBuilder([
          {
            analysis_scope: "all",
            id: 701,
            idempotency_key: "analyze_session:9001:501:live:2026-06-01T00:00:00.000Z",
            job_type: "analyze_session",
            target_id: "501",
            uid: 9001,
          },
        ]),
      ),
      updateTable: vi.fn(() => createUpdateBuilder(async () => ({ numAffectedRows: 0n }))),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(repository.claimNextAnalyzeJob()).resolves.toBeUndefined();
  });

  it("does not claim a sync job when another worker wins the status update", async () => {
    const db = {
      selectFrom: vi.fn(() =>
        createSelectBuilder([
          {
            id: 702,
            target_id: "2026-06-01T00:00:00.000Z",
            uid: 9001,
          },
        ]),
      ),
      updateTable: vi.fn(() => createUpdateBuilder(async () => ({ numAffectedRows: 0n }))),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(repository.claimNextSyncMessagesJob({})).resolves.toBeUndefined();
  });
});

type SelectBuilderStub = ReturnType<typeof createSelectBuilder>;

function createSelectBuilder(rows: unknown[], table = "") {
  const builder = {
    joins: [] as string[],
    limitCalls: [] as number[],
    table,
    whereCalls: [] as unknown[][],
    execute: async () => rows,
    executeTakeFirst: async () => rows[0],
    groupBy: () => builder,
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
    orderBy: () => builder,
    select: () => builder,
    where: (...args: unknown[]) => {
      builder.whereCalls.push(args);
      return builder;
    },
    whereRef: () => builder,
  };

  return builder;
}

function createInsertBuilder(executeTakeFirstOrThrow: () => Promise<unknown>) {
  const builder = {
    executeTakeFirstOrThrow,
    values: () => builder,
  };

  return builder;
}

function createUpdateBuilder(executeTakeFirst: () => Promise<unknown>) {
  const builder = {
    executeTakeFirst,
    set: () => builder,
    where: () => builder,
  };

  return builder;
}
