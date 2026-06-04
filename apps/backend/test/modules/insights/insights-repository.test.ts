import { describe, expect, it, vi } from "vitest";
import { InsightsRepository } from "../../../src/modules/insights/insights.repository";
import { MysqlInsightWorkerRepository } from "../../../src/modules/insights/insights-worker.repository";

describe("InsightsRepository", () => {
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
          highRiskCount: 1,
          lastCustomerMessageAt: 1_780_244_100_000,
          negativeCount: 2,
          problemEvidenceMessageIds: ["9001", "9002"],
          riskSeverity: "high",
          sessionId: "201",
        },
      ],
      total: 1,
    });

    const coreQuery = builders[1];
    expect(coreQuery.joins).not.toContain("xy_wap_embed_session_risk as risk");
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
    expect(countQuery.whereCalls).toContainEqual(["tag_filter.tag_code", "=", "logistics_issue"]);
    expect(countQuery.whereCalls).toContainEqual(["entity_filter.entity_name", "=", "白色羽绒服"]);
    expect(countQuery.whereCalls).toContainEqual(["intent_filter.intent_code", "=", "refund"]);
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
      ["xy_wap_embed_session_risk", [{ risk_id: 601, risk_level: "high", risk_reason: "客户可能投诉", risk_type: "complaint" }]],
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
      risks: [{ evidenceMessageIds: ["9002"], reason: "客户可能投诉", riskLevel: "high", riskType: "complaint" }],
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

  it("claims an expired running analysis job for retry", async () => {
    const updateExecute = vi.fn(async () => ({ numAffectedRows: 1n }));
    const builders: SelectBuilderStub[] = [];
    const updateTables: string[] = [];
    const db = {
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

    expect(builders[0]?.whereCalls[0]?.[0]).toEqual(expect.any(Function));
    expect(updateTables).toContain("xy_wap_embed_analysis_run");
    expect(updateExecute).toHaveBeenCalled();
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

  it("rejects malformed historical rescan cursors before claiming the job", async () => {
    const updateExecute = vi.fn(async () => ({ numAffectedRows: 1n }));
    const db = {
      selectFrom: vi.fn(() =>
        createSelectBuilder([
          {
            id: 702,
            target_id: "not-a-date",
            uid: 9001,
          },
        ]),
      ),
      updateTable: vi.fn(() => createUpdateBuilder(updateExecute)),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(repository.claimNextSyncMessagesJob({})).rejects.toThrow(
      "Invalid sync_messages target_id",
    );
    expect(updateExecute).not.toHaveBeenCalled();
  });

  it("writes analysis snapshots as building before publishing them", async () => {
    const operations: Array<{ table: string; type: "insert" | "update"; values?: Record<string, unknown> }> = [];
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
        faqCandidates: [],
        intents: [],
        problemResolution: {
          confidence: 0.8,
          evidence: [],
          evidenceMessageIds: ["9001"],
          problemDetected: true,
          problemSummary: "物流异常",
          resolutionStatus: "unresolved",
        },
        qaFindings: [],
        risks: [],
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
  });
});

type SelectBuilderStub = ReturnType<typeof createSelectBuilder>;

function createSelectBuilder(rows: unknown[], table = "") {
  const builder = {
    joins: [] as string[],
    limitCalls: [] as number[],
    offsetCalls: [] as number[],
    orderByCalls: [] as unknown[][],
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
    offset: (value: number) => {
      builder.offsetCalls.push(value);
      return builder;
    },
    orderBy: (...args: unknown[]) => {
      builder.orderByCalls.push(args);
      return builder;
    },
    select: () => builder,
    where: (...args: unknown[]) => {
      builder.whereCalls.push(args);
      return builder;
    },
    whereRef: () => builder,
  };

  return builder;
}

function createInsertBuilder(
  executeTakeFirstOrThrow: () => Promise<unknown>,
  options: {
    onValues?: (values: Record<string, unknown>) => void;
    table?: string;
  } = {},
) {
  const builder = {
    executeTakeFirst: executeTakeFirstOrThrow,
    executeTakeFirstOrThrow,
    ignore: () => builder,
    onDuplicateKeyUpdate: () => builder,
    values: (values: Record<string, unknown>) => {
      options.onValues?.(values);
      return builder;
    },
  };

  return builder;
}

function createUpdateBuilder(
  executeTakeFirst: () => Promise<unknown>,
  options: {
    onSet?: (values: Record<string, unknown>) => void;
    table?: string;
  } = {},
) {
  const builder = {
    executeTakeFirst,
    set: (values: Record<string, unknown>) => {
      options.onSet?.(values);
      return builder;
    },
    where: () => builder,
  };

  return builder;
}
