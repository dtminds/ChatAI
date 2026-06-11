import { describe, expect, it, vi } from "vitest";
import { InsightsRepository } from "../../../src/modules/insights/insights.repository";
import { MysqlInsightWorkerRepository } from "../../../src/modules/insights/insights-worker.repository";

describe("InsightsRepository", () => {
  it("loads quality overview through an aggregate query", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder(
          [
            {
              inspected_sessions: 2,
              passed_sessions: 1,
              total_sessions: 4,
            },
          ],
          table,
        );
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.getQualityAggregate({ uid: 9001 }),
    ).resolves.toMatchObject({
      inspectionRate: 0.5,
      totalSessions: 4,
    });

    expect(builders[0]?.table).toBe(
      "xy_wap_embed_logical_session as session",
    );
    expect(builders[0]?.joins).not.toContain("xy_wap_embed_session_insight_current as current");
    expect(builders[0]?.joins).toContain("xy_wap_embed_session_insight_snapshot as snapshot");
    expect(builders[0]?.joins).not.toContain(
      "xy_wap_embed_session_problem_resolution as problem",
    );
    expect(builders[0]?.selectRawCalls.join("\n")).not.toContain("problem.");
    expect(builders[0]?.whereCalls).toContainEqual(["session.uid", "=", 9001]);
  });

  it("caps quality inspection rate when inspected sessions exceed total sessions", async () => {
    const db = {
      selectFrom: vi.fn((table: string) =>
        createSelectBuilder(
          [
            {
              inspected_sessions: 3,
              passed_sessions: 1,
              total_sessions: 2,
            },
          ],
          table,
        ),
      ),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.getQualityAggregate({ uid: 9001 }),
    ).resolves.toMatchObject({
      inspectionRate: 1,
    });
  });

  it("omits disabled feature dimensions from the worker prompt context", async () => {
    const selectedTables: string[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        selectedTables.push(table);

        if (table === "xy_wap_embed_insight_feature_config") {
          return createSelectBuilder(
            [
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
            ],
            table,
          );
        }

        if (table === "xy_wap_embed_insight_label_config") {
          return createSelectBuilder(
            [
              {
                description: null,
                label_code: "vip",
                label_name: "高价值客户",
                negative_examples_json: null,
                positive_examples_json: null,
              },
            ],
            table,
          );
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
    expect(selectedTables).not.toContain(
      "xy_wap_embed_insight_entity_dictionary",
    );
  });

  it("loads recent action items for prompt by conversation", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder(
          [
            {
              create_time: new Date("2026-06-01T10:00:00Z"),
              priority: "high",
              status: "open",
              title: "跟进物流异常",
            },
          ],
          table,
        );
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(
      repository.listRecentActionItemsForPrompt({
        conversationId: "301",
        limit: 10,
        uid: 9001,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        priority: "high",
        status: "open",
        title: "跟进物流异常",
      }),
    ]);

    expect(builders[0]?.table).toBe("xy_wap_embed_session_action_item");
    expect(builders[0]?.whereCalls).toContainEqual(["uid", "=", 9001]);
    expect(builders[0]?.whereCalls).toContainEqual([
      "conversation_id",
      "=",
      301,
    ]);
    expect(builders[0]?.limitCalls).toEqual([10]);
  });

  it("reads the global sync cursor through the non-null uid sentinel", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder(
          [
            {
              cursor_audit_id: 9200,
              cursor_msgtime: 1_780_300_000_000,
            },
          ],
          table,
        );
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(repository.getCursor()).resolves.toEqual({
      cursorAuditId: 9200,
      cursorMsgtime: 1_780_300_000_000,
      uid: 0,
    });

    expect(builders[0]?.table).toBe("xy_wap_embed_insight_sync_cursor");
    expect(builders[0]?.whereCalls).toContainEqual(["source", "=", "xy_wap_embed_msg_audit_info"]);
    expect(builders[0]?.whereCalls).toContainEqual(["uid", "=", 0]);
    expect(builders[0]?.whereCalls).not.toContainEqual(["uid", "is", null]);
  });

  it("maps parsed json config columns from generated schema types", async () => {
    const db = {
      selectFrom: vi.fn((table: string) => {
        if (table === "xy_wap_embed_insight_label_config") {
          return createSelectBuilder(
            [
              {
                description: null,
                id: 11,
                label_code: "logistics",
                label_name: "物流咨询",
                negative_examples_json: ["退款到账"],
                positive_examples_json: ["快递不更新"],
                status: 1,
              },
            ],
            table,
          );
        }

        if (table === "xy_wap_embed_insight_entity_dictionary") {
          return createSelectBuilder(
            [
              {
                aliases_json: ["白鸭绒外套"],
                attributes_json: { sku: "coat-1" },
                entity_code: "white-coat",
                entity_name: "白鸭绒外套",
                id: 21,
                status: 1,
              },
            ],
            table,
          );
        }

        return createSelectBuilder([], table);
      }),
    };
    const repository = new InsightsRepository(db as never);

    await expect(repository.listLabelConfigs({ uid: 9001 })).resolves.toEqual([
      expect.objectContaining({
        labelCode: "logistics",
        positiveExamples: ["快递不更新"],
      }),
    ]);
    await expect(
      repository.listEntityDictionary({ uid: 9001 }),
    ).resolves.toEqual([
      expect.objectContaining({
        aliases: ["白鸭绒外套"],
        attributes: { sku: "coat-1" },
      }),
    ]);
  });

  it("returns an existing active preset without rewriting it", async () => {
    const updateTable = vi.fn();
    const db = {
      selectFrom: vi.fn((table: string) =>
        createSelectBuilder(
          table === "xy_wap_embed_insight_intent_config"
            ? [
                {
                  description: "用户已调整过的说明",
                  id: 190,
                  intent_code: "sys_price_consult",
                  intent_name: "价格咨询",
                  negative_examples_json: JSON.stringify([]),
                  positive_examples_json: JSON.stringify(["多少钱"]),
                  sort_order: 9,
                  status: 1,
                },
              ]
            : [],
          table,
        ),
      ),
      updateTable,
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.activatePresetIntentConfig({ uid: 9001 }, "sys_price_consult", {
        description: "种子模板说明",
        intentCode: "sys_price_consult",
        intentName: "价格咨询",
        negativeExamples: [],
        positiveExamples: ["价格多少"],
        status: 0,
        weight: 1,
      }),
    ).resolves.toMatchObject({
      description: "用户已调整过的说明",
      id: "190",
      status: 1,
      weight: 9,
    });
    expect(updateTable).not.toHaveBeenCalled();
  });

  it("does not fabricate an id when preset insert races with a missing duplicate row", async () => {
    const duplicateKeyError = Object.assign(new Error("Duplicate entry"), {
      code: "ER_DUP_ENTRY",
      errno: 1062,
    });
    const db = {
      insertInto: vi.fn((table: string) =>
        createInsertBuilder(async () => {
          if (table === "xy_wap_embed_insight_entity_dictionary") {
            throw duplicateKeyError;
          }

          return { insertId: 1 };
        }, { table }),
      ),
      selectFrom: vi.fn((table: string) => createSelectBuilder([], table)),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.activatePresetEntityDictionaryItem({ uid: 9001 }, "sys_live_room_promotion", {
        aliases: [],
        attributes: {},
        entityCode: "sys_live_room_promotion",
        entityName: "直播间活动",
        status: 0,
      }),
    ).rejects.toMatchObject({
      code: "INSIGHT_PRESET_ACTIVATE_CONFLICT",
    });
  });

  it("does not fabricate an id when a created config cannot be reloaded", async () => {
    const db = {
      insertInto: vi.fn((table: string) =>
        createInsertBuilder(async () => {
          expect(table).toBe("xy_wap_embed_insight_label_config");
          return { insertId: undefined };
        }, { table }),
      ),
      selectFrom: vi.fn((table: string) => createSelectBuilder([], table)),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.createLabelConfig({ uid: 9001 }, {
        labelCode: "price_sensitive",
        labelName: "价格敏感",
        negativeExamples: [],
        positiveExamples: [],
        status: 0,
      }),
    ).rejects.toMatchObject({
      code: "INSIGHT_CONFIG_WRITE_CONFLICT",
    });
  });

  it("deduplicates AI action item titles against the latest ten conversation todos without repeated queries", async () => {
    const insertedTables: string[] = [];
    const selectedActionItemBuilders: SelectBuilderStub[] = [];
    let nextInsertId = 7001;
    const db = {
      insertInto: vi.fn((table: string) => {
        insertedTables.push(table);
        return createInsertBuilder(async () => ({ insertId: nextInsertId++ }), {
          table,
        });
      }),
      selectFrom: vi.fn((table: string) => {
        if (table === "xy_wap_embed_logical_session") {
          return createSelectBuilder([{ conversation_id: 301 }], table);
        }

        if (table === "xy_wap_embed_session_action_item") {
          const builder = createSelectBuilder(
            [{ title: "跟进物流异常" }],
            table,
          );
          selectedActionItemBuilders.push(builder);
          return builder;
        }

        return createSelectBuilder([], table);
      }),
      updateTable: vi.fn((table: string) =>
        createUpdateBuilder(async () => ({ numAffectedRows: 1n }), { table }),
      ),
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
            title: " 跟进 物流 异常 ",
          },
          {
            evidenceMessageIds: ["9202"],
            priority: "medium",
            title: "提醒客户补充地址",
          },
          {
            evidenceMessageIds: ["9203"],
            priority: "medium",
            title: "提醒 客户 补充 地址",
          },
        ],
        entities: [],
        faqCandidates: [],
        intents: [],
        problemResolution: {
          confidence: 0.9,
          evidence: [],
          evidenceMessageIds: [],
          problemDetected: true,
          problemSummary: "物流延迟",
          resolutionStatus: "unresolved",
        },
        qaFindings: [
          {
            confidence: 0.8,
            evidenceMessageIds: ["9001"],
            passed: false,
            reason: "未明确下一步",
            ruleCode: "clear_next_step",
            ruleName: "明确下一步",
            severity: "medium",
          },
        ],
        sentiment: [],
        summary: {
          sessionTitle: "查物流",
          text: "客户咨询物流",
        },
        tags: [],
      },
      runId: "8001",
      sourceMessageHighWatermark: "9202",
      validationWarnings: [],
    });

    expect(selectedActionItemBuilders).toHaveLength(1);
    expect(selectedActionItemBuilders[0]?.whereCalls).toContainEqual([
      "uid",
      "=",
      9001,
    ]);
    expect(selectedActionItemBuilders[0]?.whereCalls).toContainEqual([
      "conversation_id",
      "=",
      301,
    ]);
    expect(selectedActionItemBuilders[0]?.limitCalls).toEqual([10]);
    expect(
      insertedTables.filter(
        (table) => table === "xy_wap_embed_session_action_item",
      ),
    ).toHaveLength(1);
  });

  it("loads quality agent stats through grouped SQL", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder(
          [
            {
              agent_avatar_url: "https://example.com/agent.png",
              agent_name: "客服一号",
              agent_seat_id: "seat-1",
              failed_sessions: 1,
              inspected_sessions: 2,
              passed_sessions: 1,
              total_sessions: 3,
            },
          ],
          table,
        );
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.listQualityAgentStats({ uid: 9001 }),
    ).resolves.toEqual([
      expect.objectContaining({
        agentSeatId: "seat-1",
        failedSessions: 1,
        inspectionRate: 2 / 3,
        inspectedSessions: 2,
        passedSessions: 1,
        passRate: 0.5,
        totalSessions: 3,
      }),
    ]);

    expect(builders[0]?.groupByCalls.length).toBeGreaterThan(0);
    expect(builders[0]?.table).toBe("xy_wap_embed_logical_session as session");
    expect(builders[0]?.joins).not.toContain("xy_wap_embed_session_insight_current as current");
    expect(builders[0]?.joins).toContain("xy_wap_embed_session_insight_snapshot as snapshot");
    expect(builders[0]?.selectRawCalls.join("\n")).toContain(
      "seat.third_avatar",
    );
    expect(builders[0]?.selectRawCalls.join("\n")).toContain(
      "seat.third_user_name",
    );
    expect(builders[0]?.joins).not.toContain(
      "xy_wap_embed_conversation as conversation",
    );
    expect(builders[0]?.joins).toContain("xy_wap_embed_user_seat as seat");
    expect(builders[0]?.joins).not.toContain(
      "xy_wap_embed_session_qa_finding as qa",
    );
    expect(builders[0]?.selectRawCalls.join("\n")).toContain("session.qa_status in (0, 1)");
    expect(builders[0]?.selectRawCalls.join("\n")).toContain("session.qa_status = 0");
    expect(builders[0]?.selectRawCalls.join("\n")).toContain("session.qa_status = 1");
    expect(builders[0]?.selectRawCalls.join("\n")).not.toContain("seat.avatar");
    expect(builders[0]?.whereCalls).toContainEqual(["session.uid", "=", 9001]);
  });

  it("loads paginated quality results by session", async () => {
    const builders: SelectBuilderStub[] = [];
    let currentSelectCount = 0;
    const qualitySessionRows = [
      {
        current_snapshot_id: 701,
        conversation_id: 301,
        qa_status: 0,
        session_id: 501,
        started_at: 1_780_243_200_000,
        third_external_userid: "external-1",
        third_userid: "agent-1",
      },
    ];
    const rowsByTable = new Map<string, unknown[]>([
      [
        "xy_wap_embed_session_problem_resolution",
        [{ problem_summary: "客户反馈物流异常", snapshot_id: 701 }],
      ],
      [
        "xy_wap_embed_session_qa_finding",
        [
          {
            passed: 0,
            qa_finding_id: 701,
            rule_code: "reply_quality",
            rule_name: "回复质量",
            snapshot_id: 701,
          },
          {
            passed: 1,
            qa_finding_id: 702,
            rule_code: "clear_next_step",
            rule_name: "明确下一步",
            snapshot_id: 701,
          },
        ],
      ],
      [
        "xy_wap_embed_user_seat",
        [
          {
            id: "seat-1",
            third_avatar: "https://example.com/agent.png",
            third_user_name: "客服一号",
            third_userid: "agent-1",
          },
        ],
      ],
      [
        "xy_wap_embed_contact",
        [
          {
            avatar: "https://example.com/customer.png",
            name: "张三",
            real_name: "",
            third_external_userid: "external-1",
          },
        ],
      ],
    ]);
    const db = {
      selectFrom: vi.fn((table: unknown) => {
        const tableName = typeof table === "string" ? table : "derived";
        let rows = rowsByTable.get(tableName) ?? [];

        if (tableName === "xy_wap_embed_logical_session as session") {
          currentSelectCount += 1;
          rows = currentSelectCount === 1
            ? [{ total_count: 1 }]
            : qualitySessionRows;
        }
        const builder = createSelectBuilder(rows, tableName);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.listQualityResults(
        { uid: 9001 },
        {
          from: "2026-06-01",
          page: 1,
          pageSize: 10,
          passed: false,
          to: "2026-06-30",
        },
      ),
    ).resolves.toMatchObject({
      items: [
        {
          customerName: "张三",
          passed: false,
          passedRules: 1,
          rules: [
            { passed: false, ruleCode: "reply_quality", ruleName: "回复质量" },
            {
              passed: true,
              ruleCode: "clear_next_step",
              ruleName: "明确下一步",
            },
          ],
          sessionId: "501",
          summary: "客户反馈物流异常",
          totalRules: 2,
        },
      ],
      total: 1,
    });

    expect(builders[0]?.table).toBe("xy_wap_embed_logical_session as session");
    expect(builders[0]?.joins).not.toContain("xy_wap_embed_session_insight_current as current");
    expect(builders[0]?.joins).toContain("xy_wap_embed_session_insight_snapshot as snapshot");
    expect(builders[0]?.joins).not.toContain(
      "xy_wap_embed_session_qa_finding as qa",
    );
    expect(builders[0]?.whereCalls).toContainEqual(["session.qa_status", "=", 0]);
    expect(builders[0]?.groupByCalls).toEqual([]);
    expect(builders[1]?.table).toBe("xy_wap_embed_logical_session as session");
    expect(builders[1]?.joins).not.toContain("xy_wap_embed_session_insight_current as current");
    expect(builders[1]?.joins).toContain("xy_wap_embed_session_insight_snapshot as snapshot");
    expect(builders[1]?.joins).not.toContain(
      "xy_wap_embed_session_qa_finding as qa",
    );
    expect(builders[1]?.joins).not.toContain(
      "xy_wap_embed_session_problem_resolution as problem",
    );
    expect(builders[1]?.joins).not.toContain(
      "xy_wap_embed_conversation as conversation",
    );
    expect(builders[1]?.joins).not.toContain("xy_wap_embed_user_seat as seat");
    expect(builders[1]?.selectRawCalls.join("\n")).toContain("session.current_snapshot_id as current_snapshot_id");
    expect(builders[1]?.selectRawCalls.join("\n")).not.toContain("current.current_snapshot_id as current_snapshot_id");
    expect(builders[1]?.whereCalls).toContainEqual(["session.qa_status", "=", 0]);
    expect(builders[1]?.whereRawCalls).toEqual([]);
    expect(builders[1]?.havingRawCalls).toEqual([]);
    expect(builders[1]?.groupByCalls).toEqual([]);
    expect(builders[1]?.selectRawCalls.join("\n")).not.toContain("over()");
    expect(builders[1]?.selectRawCalls.join("\n")).not.toContain("count(");
    expect(builders[1]?.limitCalls).toContain(10);
    expect(builders[1]?.joins).not.toContain(
      "xy_wap_embed_insight_evidence as evidence",
    );
    expect(builders[1]?.joins).not.toContain(
      "xy_wap_embed_msg_audit_info as message",
    );
    expect(
      builders.every(
        (builder) => builder.table !== "xy_wap_embed_conversation",
      ),
    ).toBe(true);
    expect(builders[2]?.table).toBe("xy_wap_embed_session_qa_finding");
    expect(builders[2]?.joins).not.toContain(
      "xy_wap_embed_session_insight_current as current",
    );
    expect(builders[2]?.joins).not.toContain(
      "xy_wap_embed_logical_session as session",
    );
    expect(builders[2]?.joins).not.toContain(
      "xy_wap_embed_session_insight_snapshot as snapshot",
    );
    expect(builders[2]?.joins).not.toContain(
      "xy_wap_embed_insight_evidence as evidence",
    );
    expect(builders[2]?.joins).not.toContain(
      "xy_wap_embed_msg_audit_info as message",
    );
    expect(builders[2]?.whereCalls).toContainEqual([
      "snapshot_id",
      "in",
      [701],
    ]);
    expect(builders[2]?.selectRawCalls.join("\n")).not.toContain("qa.reason");
    expect(builders[2]?.selectRawCalls.join("\n")).not.toContain("qa.severity");
    expect(
      builders.some(
        (builder) =>
          builder.table === "xy_wap_embed_session_problem_resolution" &&
          builder.whereCalls.some(
            (call) => call[0] === "snapshot_id" && call[1] === "in",
          ),
      ),
    ).toBe(true);
    expect(
      builders.some(
        (builder) =>
          builder.table === "xy_wap_embed_user_seat" &&
          builder.whereCalls.some(
            (call) => call[0] === "third_userid" && call[1] === "in",
          ),
      ),
    ).toBe(true);
  });

  it("filters passed quality results to sessions without failed QA findings", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: unknown) => {
        const tableName = typeof table === "string" ? table : "derived";
        const builder = createSelectBuilder([], tableName);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await repository.listQualityResults(
      { uid: 9001 },
      {
        page: 1,
        pageSize: 10,
        passed: true,
      },
    );

    expect(builders[0]?.whereCalls).toContainEqual(["session.qa_status", "=", 1]);
    expect(builders[1]?.whereCalls).toContainEqual(["session.qa_status", "=", 1]);
    expect(builders[1]?.whereRawCalls).toEqual([]);
    expect(builders[1]?.havingRawCalls).toEqual([]);
  });

  it("uses session qa_status for quality result pass state", async () => {
    const builders: SelectBuilderStub[] = [];
    let currentSelectCount = 0;
    const db = {
      selectFrom: vi.fn((table: unknown) => {
        const tableName = typeof table === "string" ? table : "derived";
        let rows: unknown[] = [];

        if (tableName === "xy_wap_embed_logical_session as session") {
          currentSelectCount += 1;
          rows = currentSelectCount === 1
            ? [{ total_count: 1 }]
            : [
                {
                  current_snapshot_id: 701,
                  conversation_id: 301,
                  qa_status: 0,
                  session_id: 501,
                  started_at: 1_780_243_200_000,
                  third_external_userid: "external-1",
                  third_userid: "agent-1",
                },
              ];
        }

        if (tableName === "xy_wap_embed_session_qa_finding") {
          rows = [
            {
              passed: 1,
              qa_finding_id: 9001,
              rule_code: "clear_next_step",
              rule_name: "明确下一步",
              snapshot_id: 701,
            },
          ];
        }

        const builder = createSelectBuilder(rows, tableName);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.listQualityResults({ uid: 9001 }, { passed: false }),
    ).resolves.toMatchObject({
      items: [
        {
          passed: false,
          passedRules: 1,
          totalRules: 1,
        },
      ],
    });
  });

  it("lists only inspected quality sessions when pass filter is omitted", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: unknown) => {
        const tableName = typeof table === "string" ? table : "derived";
        const builder = createSelectBuilder([], tableName);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await repository.listQualityResults(
      { uid: 9001 },
      {
        page: 1,
        pageSize: 10,
      },
    );

    expect(builders[0]?.whereCalls).toContainEqual(["session.qa_status", "in", [0, 1]]);
    expect(builders[1]?.whereCalls).toContainEqual(["session.qa_status", "in", [0, 1]]);
    expect(builders[1]?.whereRawCalls).toEqual([]);
    expect(builders[1]?.havingRawCalls).toEqual([]);
  });

  it("loads current sessions without joining one-to-many insight tables in the core query", async () => {
    const builders: SelectBuilderStub[] = [];
    const rowsByTable = new Map<string, unknown[]>([
      ["xy_wap_embed_logical_session as session", [{ count: 2 }]],
      [
        "xy_wap_embed_logical_session as session#2",
        [
          {
            agent_message_count: 1,
            agent_name: null,
            agent_seat_id: null,
            conversation_id: 301,
            current_snapshot_id: 501,
            customer_message_count: 2,
            customer_name: null,
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
            summary_session_title: "查物流",
            summary_text: "已登记",
            third_external_userid: "external-1",
            third_userid: "agent-1",
            unresolved_reason: "待仓库反馈",
          },
          {
            agent_name: null,
            agent_seat_id: null,
            conversation_id: 302,
            current_snapshot_id: null,
            customer_name: null,
            ended_at: null,
            generated_at: null,
            last_message_at: 1_780_245_100_000,
            phase: null,
            problem_detected: null,
            problem_summary: null,
            resolution_status: null,
            session_id: 202,
            started_at: 1_780_245_000_000,
            status: null,
            summary_session_title: null,
            summary_text: null,
            third_external_userid: "external-2",
            third_userid: "agent-2",
            unresolved_reason: null,
          },
        ],
      ],
      ["xy_wap_embed_insight_evidence as evidence", []],
      [
        "xy_wap_embed_contact",
        [
          {
            avatar: "https://example.com/customer.png",
            name: "张三",
            real_name: "",
            third_external_userid: "external-1",
          },
        ],
      ],
      [
        "xy_wap_embed_user_seat",
        [
          {
            id: "seat-1",
            third_avatar: "https://example.com/agent.png",
            third_user_name: "客服一号",
            third_userid: "agent-1",
          },
        ],
      ],
      ["xy_wap_embed_session_tag", []],
      ["xy_wap_embed_session_entity", []],
      ["xy_wap_embed_session_intent", []],
    ]);
    const db = {
      currentQueryCount: 0,
      selectFrom: vi.fn((table: string) => {
        const key =
          table === "xy_wap_embed_logical_session as session" &&
          db.currentQueryCount++ > 0
            ? `${table}#2`
            : table;
        const builder = createSelectBuilder(rowsByTable.get(key) ?? [], table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.listCurrentSessions({ uid: 9001 }),
    ).resolves.toMatchObject({
      items: [
        {
          actionOpenCount: 0,
          lastCustomerMessageAt: null,
          problemEvidenceMessageIds: [],
          sessionId: "201",
        },
        {
          analysisStatus: "analyzing",
          currentSnapshotId: undefined,
          generatedAt: undefined,
          problemSummary: "",
          resolutionStatus: "unknown",
          sessionId: "202",
          summarySessionTitle: "",
        },
      ],
      total: 2,
    });

    const coreQuery = builders[1];
    expect(builders[0]?.table).toBe("xy_wap_embed_logical_session as session");
    expect(coreQuery.table).toBe("xy_wap_embed_logical_session as session");
    expect(coreQuery.joins).not.toContain(
      "xy_wap_embed_session_insight_current as current",
    );
    expect(coreQuery.joins).not.toContain(
      "xy_wap_embed_session_action_item as action",
    );
    expect(coreQuery.joins).not.toContain(
      "xy_wap_embed_insight_evidence as evidence",
    );
    expect(coreQuery.joins).not.toContain(
      "xy_wap_embed_msg_audit_info as message",
    );
    expect(
      builders.every(
        (builder) => builder.table !== "xy_wap_embed_session_action_item",
      ),
    ).toBe(true);
    expect(
      builders.every(
        (builder) =>
          builder.table !==
          "xy_wap_embed_logical_session_message as session_message",
      ),
    ).toBe(true);
    expect(
      builders.every(
        (builder) => builder.table !== "xy_wap_embed_conversation",
      ),
    ).toBe(true);
    expect(
      builders.every(
        (builder) => builder.table !== "xy_wap_embed_insight_evidence as evidence",
      ),
    ).toBe(true);
    expect(
      builders.every(
        (builder) => builder.table !== "xy_wap_embed_session_tag",
      ),
    ).toBe(true);
    expect(
      builders.every(
        (builder) => builder.table !== "xy_wap_embed_session_entity",
      ),
    ).toBe(true);
    expect(
      builders.every(
        (builder) => builder.table !== "xy_wap_embed_session_intent",
      ),
    ).toBe(true);
  });

  it("paginates and filters current sessions in SQL before hydration", async () => {
    const builders: SelectBuilderStub[] = [];
    const rowsByTable = new Map<string, unknown[]>([
      ["xy_wap_embed_logical_session as session", [{ count: 12 }]],
      ["xy_wap_embed_logical_session as session#2", []],
    ]);
    let currentQueryCount = 0;
    const db = {
      selectFrom: vi.fn((table: string) => {
        const key =
          table === "xy_wap_embed_logical_session as session" &&
          currentQueryCount++ > 0
            ? `${table}#2`
            : table;
        const builder = createSelectBuilder(rowsByTable.get(key) ?? [], table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.listCurrentSessions(
        { uid: 9001 },
        {
          analysisStatus: "ready",
          entityId: "41",
          from: "2026-06-01",
          intentId: "31",
          keyword: "物流",
          page: 3,
          pageSize: 5,
          problemScope: "unresolved",
          resolutionStatus: "unresolved",
          tagId: "21",
          to: "2026-06-30",
        },
      ),
    ).resolves.toMatchObject({ items: [], total: 12 });

    const countQuery = builders[0];
    const pageQuery = builders[1];
    expect(pageQuery.limitCalls).toEqual([5]);
    expect(pageQuery.offsetCalls).toEqual([10]);
    expect(pageQuery.orderByCalls).toContainEqual([
      "session.started_at",
      "desc",
    ]);
    expect(countQuery.joins).toContain(
      "xy_wap_embed_session_tag as tag_filter",
    );
    expect(countQuery.joins).toContain(
      "xy_wap_embed_session_entity as entity_filter",
    );
    expect(countQuery.joins).toContain(
      "xy_wap_embed_session_intent as intent_filter",
    );
    expect(countQuery.whereCalls).toContainEqual(["session.uid", "=", 9001]);
    expect(countQuery.whereCalls).toContainEqual([
      "snapshot.status",
      "=",
      "ready",
    ]);
    expect(countQuery.whereCalls).toContainEqual([
      "problem.resolution_status",
      "=",
      "unresolved",
    ]);
    expect(countQuery.whereCalls).toContainEqual(["tag_filter.uid", "=", 9001]);
    expect(countQuery.whereCalls).toContainEqual([
      "tag_filter.tag_id",
      "=",
      21,
    ]);
    expect(countQuery.whereCalls).toContainEqual([
      "entity_filter.uid",
      "=",
      9001,
    ]);
    expect(countQuery.whereCalls).toContainEqual([
      "entity_filter.entity_id",
      "=",
      41,
    ]);
    expect(countQuery.whereCalls).not.toContainEqual([
      "entity_filter.entity_type",
      "=",
      "product",
    ]);
    expect(countQuery.whereCalls).not.toContainEqual([
      "entity_filter.entity_name",
      "=",
      "白色羽绒服",
    ]);
    expect(countQuery.whereCalls).toContainEqual([
      "intent_filter.uid",
      "=",
      9001,
    ]);
    expect(countQuery.whereCalls).toContainEqual([
      "intent_filter.intent_id",
      "=",
      31,
    ]);
  });

  it("groups analyzing current-session filter so it cannot bypass scoped predicates", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      currentQueryCount: 0,
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder(
          table === "xy_wap_embed_logical_session as session" &&
            db.currentQueryCount++ === 0
            ? [{ count: 0 }]
            : [],
          table,
        );
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await repository.listCurrentSessions(
      { uid: 9001 },
      { analysisStatus: "analyzing" },
    );

    expect(builders[0]?.whereRawCalls).toContain(
      "(session.current_snapshot_id is null or snapshot.id is null)",
    );
  });

  it("skips summary and problem joins for unfiltered current-session counts", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      currentQueryCount: 0,
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder(
          table === "xy_wap_embed_logical_session as session" &&
            db.currentQueryCount++ === 0
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
    expect(countQuery?.joins).not.toContain(
      "xy_wap_embed_session_summary as summary",
    );
    expect(countQuery?.joins).not.toContain(
      "xy_wap_embed_session_problem_resolution as problem",
    );
    expect(countQuery?.whereCalls).toContainEqual(["session.uid", "=", 9001]);
  });

  it("bounds all-current-session hydration for aggregate pages", async () => {
    const builders: SelectBuilderStub[] = [];
    const rowsByTable = new Map<string, unknown[]>([
      [
        "xy_wap_embed_logical_session as session",
        [
          {
            conversation_id: 301,
            current_snapshot_id: 7001,
            ended_at: 1_780_246_800_000,
            generated_at: new Date("2026-06-01T12:00:00.000Z"),
            last_message_at: 1_780_246_700_000,
            phase: "final",
            problem_confidence: "0.9000",
            problem_detected: 1,
            problem_summary: "客户反馈物流异常",
            resolution_status: "unresolved",
            session_id: 501,
            started_at: 1_780_243_200_000,
            status: "ready",
            summary_session_title: "物流异常处理",
            summary_text: "客户咨询物流异常",
            third_external_userid: "external-1",
            third_userid: "agent-1",
            unresolved_reason: "仍需跟进",
          },
        ],
      ],
      [
        "xy_wap_embed_insight_evidence as evidence",
        [
          {
            evidence_message_id: 9001,
            last_customer_message_at: 1_780_246_600_000,
            snapshot_id: 7001,
          },
        ],
      ],
      [
        "xy_wap_embed_session_tag",
        [
          {
            snapshot_id: 7001,
            tag_id: 21,
            tag_name: "物流异常",
          },
        ],
      ],
      [
        "xy_wap_embed_session_entity",
        [
          {
            entity_id: 41,
            entity_name: "白色羽绒服",
            snapshot_id: 7001,
          },
        ],
      ],
      [
        "xy_wap_embed_session_intent",
        [
          {
            intent_id: 31,
            intent_label: "催物流",
            snapshot_id: 7001,
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
    const repository = new InsightsRepository(db as never);

    await expect(repository.listAllCurrentSessions({ uid: 9001 })).resolves.toEqual([
      expect.objectContaining({
        entities: [
          {
            entityId: "41",
            entityName: "白色羽绒服",
          },
        ],
        intents: [
          {
            intentId: "31",
            intentLabel: "催物流",
          },
        ],
        problemEvidenceMessageIds: ["9001"],
        tags: [
          {
            tagId: "21",
            tagName: "物流异常",
          },
        ],
      }),
    ]);

    const currentQuery = builders.find(
      (builder) => builder.table === "xy_wap_embed_logical_session as session",
    );
    expect(currentQuery?.limitCalls).toEqual([5000]);
    expect(currentQuery?.offsetCalls).toEqual([0]);
    expect(builders.map((builder) => builder.table)).toEqual(
      expect.arrayContaining([
        "xy_wap_embed_insight_evidence as evidence",
        "xy_wap_embed_session_tag",
        "xy_wap_embed_session_entity",
        "xy_wap_embed_session_intent",
      ]),
    );
  });

  it("counts overview totals from physical logical sessions before snapshots are ready", async () => {
    const builders: SelectBuilderStub[] = [];
    let logicalSessionQueryCount = 0;
    const db = {
      selectFrom: vi.fn((table: string) => {
        const rows =
          table === "xy_wap_embed_logical_session as session"
            ? logicalSessionQueryCount++ === 0
              ? [
                  {
                    action_items_open: 1,
                    agent_messages: 5,
                    consulting_customers: 2,
                    customer_messages: 4,
                    failed: 0,
                    logical_sessions: 2,
                    messages: 9,
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
                  },
                ]
              : [
                  {
                    agent_messages: 5,
                    consulting_customers: 2,
                    customer_messages: 4,
                    date: "2026-06-09",
                    logical_sessions: 2,
                    messages: 9,
                  },
                ]
            : [];
        const builder = createSelectBuilder(rows, table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.getOverviewAggregate({ uid: 9001 }),
    ).resolves.toMatchObject({
      analysis: {
        ready: 1,
      },
      totalSessions: 2,
      totals: {
        logicalSessions: 2,
        messages: 9,
      },
      trend: [
        expect.objectContaining({
          logicalSessions: 2,
        }),
      ],
    });

    expect(builders[0]?.table).toBe("xy_wap_embed_logical_session as session");
    expect(builders[0]?.joins).not.toContain(
      "xy_wap_embed_session_insight_current as current",
    );
    expect(builders[0]?.joins).not.toContain("action_aggregate");
    expect(builders[1]?.table).toBe("xy_wap_embed_logical_session as session");
  });

  it("paginates action items before evidence hydration", async () => {
    const builders: SelectBuilderStub[] = [];
    const rowsByTable = new Map<string, unknown[]>([
      [
        "xy_wap_embed_session_action_item as action:0",
        [
          {
            total_count: 2,
          },
        ],
      ],
      [
        "xy_wap_embed_session_action_item as action:1",
        [
          {
            action_id: 802,
            action_status: "open",
            action_type: "follow_up",
            conversation_id: 302,
            created_at: 1_780_243_900_000,
            priority: "medium",
            session_id: 202,
            snapshot_id: 502,
            title: "沉淀退款 FAQ",
          },
        ],
      ],
      ["xy_wap_embed_conversation", []],
    ]);
    const db = {
      selectFrom: vi.fn((table: string) => {
        const key = `${table}:${builders.filter((builder) => builder.table === table).length}`;
        const builder = createSelectBuilder(
          rowsByTable.get(key) ?? rowsByTable.get(table) ?? [],
          table,
        );
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.listActionItemsPage(
        { uid: 9001 },
        {
          from: "2026-06-01T00:00:00.000+08:00",
          page: 2,
          pageSize: 1,
          status: "open",
          to: "2026-06-30T23:59:59.999+08:00",
        },
      ),
    ).resolves.toMatchObject({
      items: [
        {
          actionItemId: "802",
          createdAt: 1_780_243_900_000,
        },
      ],
      total: 2,
    });

    const countQuery = builders[0];
    const pageQuery = builders[1];
    expect(countQuery?.joins).not.toContain("xy_wap_embed_logical_session as session");
    expect(countQuery?.joins).not.toContain(
      "xy_wap_embed_session_problem_resolution as problem",
    );
    expect(countQuery?.selectRawCalls.join("\n")).toContain("count(*)");
    expect(pageQuery?.joins).toContain("xy_wap_embed_logical_session as session");
    expect(pageQuery?.joins).not.toContain(
      "xy_wap_embed_session_problem_resolution as problem",
    );
    expect(pageQuery?.selectRawCalls.join("\n")).not.toContain("count(*) over()");
    expect(pageQuery?.limitCalls).toEqual([1]);
    expect(pageQuery?.offsetCalls).toEqual([1]);
    expect(pageQuery?.orderByCalls).toEqual([["action.id", "desc"]]);
    expect(pageQuery?.whereCalls).toContainEqual(["action.uid", "=", 9001]);
    expect(pageQuery?.whereCalls).not.toContainEqual([
      "session.uid",
      "=",
      9001,
    ]);
    expect(pageQuery?.whereCalls).toContainEqual([
      "action.status",
      "=",
      "open",
    ]);
    expect(pageQuery?.whereCalls).toContainEqual([
      "action.create_time",
      ">=",
      Date.parse("2026-06-01T00:00:00.000+08:00"),
    ]);
    expect(pageQuery?.whereCalls).toContainEqual([
      "action.create_time",
      "<=",
      Date.parse("2026-06-30T23:59:59.999+08:00"),
    ]);
    expect(pageQuery?.whereCalls).not.toContainEqual([
      "session.started_at",
      ">=",
      Date.parse("2026-06-01T00:00:00.000+08:00"),
    ]);
    expect(builders).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "xy_wap_embed_insight_evidence as evidence",
        }),
      ]),
    );
  });

  it("filters processed action items by completed and dismissed statuses", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder([], table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await repository.listActionItemsPage(
      { uid: 9001 },
      {
        page: 1,
        pageSize: 10,
        status: "processed",
      },
    );

    expect(builders[0]?.whereCalls).toContainEqual([
      "action.status",
      "in",
      ["done", "dismissed"],
    ]);
    expect(builders[0]?.whereCalls).not.toContainEqual([
      "action.status",
      "=",
      "processed",
    ]);
  });

  it("does not join problem resolution when listing action items", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder([], table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await repository.listActionItemsPage(
      { uid: 9001 },
      {
        page: 1,
        pageSize: 10,
        status: "open",
      },
    );

    const pageQuery = builders[1];
    expect(pageQuery?.joins).not.toContain(
      "xy_wap_embed_session_problem_resolution as problem",
    );
    expect(pageQuery?.whereCalls).not.toContainEqual([
      "problem.resolution_status",
      "in",
      ["unresolved", "partially_resolved"],
    ]);
    expect(pageQuery?.limitCalls).toEqual([10]);
    expect(pageQuery?.offsetCalls).toEqual([0]);
  });

  it("validates manual action item targets against current uid and conversation linkage", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const rows =
          table === "xy_wap_embed_conversation" ? [{ id: 301 }] : [{ id: 501 }];
        const builder = createSelectBuilder(rows, table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.validateActionItemTarget(
        { uid: 9001 },
        {
          conversationId: "301",
          sessionId: "501",
        },
      ),
    ).resolves.toBe(true);

    expect(builders[0]?.table).toBe("xy_wap_embed_conversation");
    expect(builders[0]?.whereCalls).toContainEqual(["id", "=", 301]);
    expect(builders[0]?.whereCalls).toContainEqual(["uid", "=", 9001]);
    expect(builders[1]?.table).toBe("xy_wap_embed_logical_session");
    expect(builders[1]?.whereCalls).toContainEqual(["id", "=", 501]);
    expect(builders[1]?.whereCalls).toContainEqual(["uid", "=", 9001]);
    expect(builders[1]?.whereCalls).toContainEqual([
      "conversation_id",
      "=",
      301,
    ]);
  });

  it("aggregates business asset topics directly from stored asset message references", async () => {
    const builders: SelectBuilderStub[] = [];
    let messageQueryCount = 0;
    const db = {
      selectFrom: vi.fn((table: string) => {
        let rows: unknown[] = [];

        if (table === "xy_wap_embed_logical_session_message as session_message") {
          messageQueryCount += 1;
          rows = messageQueryCount === 1
            ? [
                {
                  asset_id: 701,
                  asset_name: "产品链接",
                  asset_type: "link",
                  mention_count: 3,
                  session_count: 2,
                },
              ]
            : messageQueryCount === 2
              ? [
                  {
                    date: "2026-06-01",
                    mention_count: 3,
                    session_count: 2,
                  },
                ]
              : [
                  {
                    mention_count: 5,
                    session_count: 3,
                  },
                ];
        }

        const builder = createSelectBuilder(
          rows,
          table,
        );
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    const analytics = await repository.getBusinessTopicAnalytics(
      { uid: 9001 },
      { dimension: "asset", from: "2026-06-01", to: "2026-06-02" },
    );

    expect(analytics.topics).toEqual([
      {
        code: "701",
        dimension: "asset",
        mentionCount: 3,
        name: "产品链接",
        sessionCount: 2,
        share: 2 / 3,
        type: "link",
      },
    ]);
    expect(analytics.totals).toEqual({
      mentionCount: 5,
      topicSessions: 3,
    });
    expect(analytics.trend).toEqual([
      {
        assetMentions: 3,
        date: "2026-06-01",
        entityMentions: 0,
        intentMentions: 0,
        tagMentions: 0,
        topicSessions: 2,
      },
    ]);
    const assetQuery = builders[0];
    expect(assetQuery?.whereCalls).toContainEqual(["session_message.uid", "=", 9001]);
    expect(assetQuery?.whereCalls).toContainEqual([
      "session_message.asset_id",
      "is not",
      null,
    ]);
    expect(assetQuery?.whereCalls).toContainEqual([
      "session_message.source_message_time",
      ">=",
      1_780_272_000_000,
    ]);
    expect(assetQuery?.whereCalls).toContainEqual([
      "session_message.source_message_time",
      "<=",
      1_780_358_400_000,
    ]);
    expect(assetQuery?.joins).toContain("xy_wap_embed_insight_asset as asset");
    expect(assetQuery?.joins).not.toContain("xy_wap_embed_logical_session as session");
    expect(assetQuery?.joins).not.toContain("xy_wap_embed_session_insight_current as current");
    expect(assetQuery?.joins).not.toContain("xy_wap_embed_msg_audit_info as message");
    expect(assetQuery?.groupByCalls.length).toBeGreaterThan(0);
    expect(assetQuery?.selectRawCalls.join("\n")).toContain("count(session_message.id)");
    expect(assetQuery?.selectRawCalls.join("\n")).toContain("count(distinct session_message.session_id)");
    expect(assetQuery?.limitCalls).toEqual([10]);
    expect(builders[1]?.groupByCalls.length).toBeGreaterThan(0);
    expect(builders[1]?.selectRawCalls.join("\n")).toContain("+ 28800000");
    expect(builders[1]?.groupByCalls.map(readRawSql).join("\n")).toContain("+ 28800000");
    expect(builders[1]?.selectRawCalls.join("\n")).not.toContain("from_unixtime");
    expect(builders[1]?.groupByCalls.map(readRawSql).join("\n")).not.toContain("from_unixtime");
    expect(builders[2]?.groupByCalls).toEqual([]);
  });

  it("uses stored asset names as the business asset display name", async () => {
    let messageQueryCount = 0;
    const db = {
      selectFrom: vi.fn((table: string) => {
        messageQueryCount += 1;
        const rows = messageQueryCount === 1
          ? [
              {
                asset_id: 702,
                asset_name: "生椰拿铁（首创）",
                asset_type: "miniapp",
                mention_count: 1,
                session_count: 1,
              },
            ]
          : messageQueryCount === 2
            ? []
            : [{ mention_count: 1, session_count: 1 }];

        return createSelectBuilder(rows, table);
      }),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.getBusinessTopicAnalytics({ uid: 9001 }, { dimension: "asset" }),
    ).resolves.toEqual(
      expect.objectContaining({
        topics: [
          expect.objectContaining({
            code: "702",
            dimension: "asset",
            name: "生椰拿铁（首创）",
            type: "miniapp",
          }),
        ],
      }),
    );
  });

  it("keeps asset related session details scoped by matched asset messages instead of session dates", async () => {
    const builders: SelectBuilderStub[] = [];
    let assetMessageSelectCount = 0;
    const db = {
      selectFrom: vi.fn((table: unknown) => {
        const tableName = typeof table === "string" ? table : "derived";
        let rows: unknown[] = [];

        if (tableName === "xy_wap_embed_logical_session_message as session_message") {
          assetMessageSelectCount += 1;
          rows = assetMessageSelectCount === 1
            ? [{ count: 1 }]
            : [{ session_id: 501 }];
        }

        if (tableName === "xy_wap_embed_logical_session as session") {
          rows = [
            {
              conversation_id: 301,
              ended_at: null,
              last_message_at: 1_780_330_000_000,
              session_id: 501,
              started_at: 1_780_000_000_000,
              summary_session_title: "客户查看报价单",
              summary_text: "客户查看报价单详情",
              third_external_userid: "external-1",
              third_userid: "agent-1",
            },
          ];
        }

        const builder = createSelectBuilder(rows, tableName);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.listBusinessRelatedSessions(
        { uid: 9001 },
        {
          dimension: "asset",
          from: "2026-06-01T00:00:00.000+08:00",
          page: 1,
          pageSize: 20,
          to: "2026-06-02T23:59:59.999+08:00",
          topicCode: "701",
        },
      ),
    ).resolves.toMatchObject({
      items: [{ sessionId: "501" }],
      total: 1,
    });

    const assetMessageQueries = builders.filter(
      (builder) =>
        builder.table === "xy_wap_embed_logical_session_message as session_message",
    );
    const assetMessagePageQuery = assetMessageQueries[1];
    const currentSessionQueries = builders.filter(
      (builder) => builder.table === "xy_wap_embed_logical_session as session",
    );

    expect(assetMessageQueries).toHaveLength(2);
    expect(assetMessagePageQuery?.whereCalls).toContainEqual([
      "session_message.source_message_time",
      ">=",
      1_780_243_200_000,
    ]);
    expect(assetMessagePageQuery?.orderByCalls).toEqual([["session_message.session_id", "desc"]]);
    expect(assetMessagePageQuery?.limitCalls).toEqual([20]);
    expect(assetMessagePageQuery?.offsetCalls).toEqual([0]);
    expect(assetMessagePageQuery?.limitCalls).not.toContain(1_000);
    expect(currentSessionQueries).toHaveLength(1);
    expect(currentSessionQueries[0]?.whereCalls).toContainEqual([
      "session.id",
      "in",
      [501],
    ]);
    expect(currentSessionQueries[0]?.orderByCalls).toEqual([["session.id", "desc"]]);
    expect(currentSessionQueries[0]?.whereCalls).not.toContainEqual([
      "session.started_at",
      ">=",
      1_780_272_000_000,
    ]);
    expect(builders.map((builder) => builder.table)).not.toContain(
      "xy_wap_embed_session_problem_resolution as problem",
    );
    expect(builders.map((builder) => builder.table)).not.toContain(
      "xy_wap_embed_session_insight_current as current",
    );
  });

  it("loads business related sessions through a focused topic query", async () => {
    const builders: SelectBuilderStub[] = [];
    const topicRow = {
      count: 1,
      conversation_id: 301,
      current_snapshot_id: 7001,
      ended_at: 1_780_246_800_000,
      generated_at: new Date("2026-06-01T12:00:00.000Z"),
      last_message_at: 1_780_246_700_000,
      phase: "final",
      session_id: 501,
      started_at: 1_780_243_200_000,
      status: "ready",
      summary_session_title: "物流异常处理",
      summary_text: "客户咨询物流异常",
      third_external_userid: "external-1",
      third_userid: "agent-1",
    };
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder(
          table === "xy_wap_embed_session_intent as topic" ? [topicRow] : [],
          table,
        );
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.listBusinessRelatedSessions(
        { uid: 9001 },
        {
          dimension: "intent",
          from: "2026-06-01T00:00:00.000+08:00",
          page: 2,
          pageSize: 20,
          topicCode: "31",
          to: "2026-06-30T23:59:59.999+08:00",
        },
      ),
    ).resolves.toMatchObject({
      items: [
        {
          sessionId: "501",
          summarySessionTitle: "物流异常处理",
        },
      ],
      total: 1,
    });

    const topicQueries = builders.filter(
      (builder) => builder.table === "xy_wap_embed_session_intent as topic",
    );
    expect(topicQueries).toHaveLength(2);
    for (const query of topicQueries) {
      expect(query.joinConditions).toContainEqual({
        left: "session.current_snapshot_id",
        right: "topic.snapshot_id",
        table: "xy_wap_embed_logical_session as session",
      });
      expect(query.whereCalls).toContainEqual(["topic.uid", "=", 9001]);
      expect(query.whereCalls).toContainEqual(["topic.intent_id", "=", 31]);
      expect(query.whereCalls).toContainEqual(["session.uid", "=", 9001]);
      expect(query.whereCalls).toContainEqual([
        "session.started_at",
        ">=",
        Date.parse("2026-06-01T00:00:00.000+08:00"),
      ]);
      expect(query.whereCalls).toContainEqual([
        "session.started_at",
        "<=",
        Date.parse("2026-06-30T23:59:59.999+08:00"),
      ]);
    }
    expect(topicQueries[1]?.orderByCalls).toEqual([
      ["session.started_at", "desc"],
      ["session.id", "desc"],
    ]);
    expect(topicQueries[1]?.limitCalls).toEqual([20]);
    expect(topicQueries[1]?.offsetCalls).toEqual([20]);
    expect(builders.map((builder) => builder.table)).not.toContain(
      "xy_wap_embed_session_problem_resolution as problem",
    );
    expect(builders.map((builder) => builder.table)).not.toContain(
      "xy_wap_embed_session_tag as tag",
    );
    expect(builders.map((builder) => builder.table)).not.toContain(
      "xy_wap_embed_session_entity as entity",
    );
    expect(builders.map((builder) => builder.table)).not.toContain(
      "xy_wap_embed_insight_evidence as evidence",
    );
    expect(builders.map((builder) => builder.table)).not.toContain(
      "xy_wap_embed_session_tag",
    );
    expect(builders.map((builder) => builder.table)).not.toContain(
      "xy_wap_embed_session_entity",
    );
    expect(builders.map((builder) => builder.table)).not.toContain(
      "xy_wap_embed_session_intent",
    );
  });

  it("loads detail qa findings and actions through focused snapshot queries", async () => {
    const builders: SelectBuilderStub[] = [];
    const rowsByTable = new Map<string, unknown[]>([
      [
        "xy_wap_embed_logical_session as session",
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
            summary_session_title: "查物流",
            summary_text: "已登记",
            third_external_userid: "external-1",
            third_userid: "agent-1",
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
      [
        "xy_wap_embed_session_qa_finding",
        [
          {
            qa_finding_id: 701,
            qa_passed: 0,
            qa_reason: "未说明时效",
            qa_rule_code: "reply_quality",
            qa_rule_name: "回复质量",
          },
        ],
      ],
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
            third_external_userid: "external-1",
            title: "催物流",
          },
          {
            action_id: 802,
            action_status: "open",
            action_type: "follow_up",
            conversation_id: 301,
            priority: "medium",
            resolution_status: "unresolved",
            session_id: 202,
            snapshot_id: 502,
            third_external_userid: "external-2",
            title: "其它逻辑会话待办",
          },
        ],
      ],
      [
        "xy_wap_embed_insight_evidence as evidence",
        [
          {
            action_id: 801,
            evidence_message_id: 9001,
            last_customer_message_at: 1_780_244_000_000,
            reason: "承诺催办",
          },
        ],
      ],
      [
        "xy_wap_embed_contact",
        [
          {
            avatar: "https://example.com/customer.png",
            name: "张三",
            real_name: "",
            third_external_userid: "external-1",
          },
        ],
      ],
      ["xy_wap_embed_session_sentiment", []],
      ["xy_wap_embed_session_tag", []],
      ["xy_wap_embed_session_entity", []],
      ["xy_wap_embed_session_intent", []],
      ["xy_wap_embed_session_faq_candidate", []],
    ]);
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder(
          rowsByTable.get(table) ?? [],
          table,
        );
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    const detail = await repository.findDetail({ uid: 9001 }, "201");

    expect(detail).toMatchObject({
      qaFindings: [
        {
          evidenceMessageIds: ["9001"],
          passed: false,
          reason: "未说明时效",
          ruleCode: "reply_quality",
          ruleName: "回复质量",
        },
      ],
    });
    expect(detail?.actionItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionItemId: "801",
          customerName: "张三",
          evidenceMessageIds: [],
        }),
      ]),
    );
    const actionQuery = builders.find(
      (builder) =>
        builder.table === "xy_wap_embed_session_action_item as action",
    );
    expect(actionQuery?.whereCalls).toContainEqual([
      "action.session_id",
      "=",
      201,
    ]);
    expect(actionQuery?.whereCalls).not.toContainEqual([
      "action.conversation_id",
      "=",
      301,
    ]);

    const coreQuery = builders[0];
    expect(coreQuery.joins).not.toContain(
      "xy_wap_embed_session_qa_finding as qa",
    );
    expect(coreQuery.joins).not.toContain(
      "xy_wap_embed_session_action_item as action",
    );
    expect(coreQuery.joins).not.toContain("xy_wap_embed_contact as contact");
    expect(coreQuery.joins).not.toContain("xy_wap_embed_user_seat as seat");
    expect(
      builders.every(
        (builder) => builder.table !== "xy_wap_embed_conversation",
      ),
    ).toBe(true);
  });

  it("loads analyzing session detail without a current snapshot", async () => {
    const builders: SelectBuilderStub[] = [];
    const rowsByTable = new Map<string, unknown[]>([
      [
        "xy_wap_embed_logical_session as session",
        [
          {
            agent_message_count: 2,
            agent_name: null,
            agent_seat_id: null,
            conversation_id: 301,
            current_snapshot_id: null,
            customer_message_count: 1,
            customer_name: null,
            ended_at: null,
            generated_at: null,
            last_message_at: 1_780_245_500_000,
            message_count: 3,
            phase: null,
            problem_detected: null,
            problem_summary: null,
            resolution_status: null,
            session_id: 201,
            started_at: 1_780_245_000_000,
            status: null,
            summary_session_title: null,
            summary_text: null,
            third_external_userid: "external-1",
            third_userid: "agent-1",
            unresolved_reason: null,
          },
        ],
      ],
      [
        "xy_wap_embed_contact",
        [
          {
            avatar: "https://example.com/customer.png",
            name: "张三",
            real_name: "",
            third_external_userid: "external-1",
          },
        ],
      ],
      [
        "xy_wap_embed_user_seat",
        [
          {
            id: "seat-1",
            third_avatar: "https://example.com/agent.png",
            third_user_name: "客服一号",
            third_userid: "agent-1",
          },
        ],
      ],
    ]);
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder(
          rowsByTable.get(table) ?? [],
          table,
        );
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.findDetail({ uid: 9001 }, "201"),
    ).resolves.toMatchObject({
      actionItems: [],
      current: {
        agentName: "客服一号",
        analysisStatus: "analyzing",
        currentSnapshotId: undefined,
        customerName: "张三",
        generatedAt: undefined,
        problemSummary: "",
        resolutionStatus: "unknown",
        sessionId: "201",
        summarySessionTitle: "",
      },
      entities: [],
      evidenceItems: [],
      faqCandidates: [],
      intents: [],
      qaFindings: [],
      sentiment: [],
      tags: [],
    });

    expect(builders[0]?.table).toBe("xy_wap_embed_logical_session as session");
    expect(
      builders.every(
        (builder) => builder.table !== "xy_wap_embed_conversation",
      ),
    ).toBe(true);
    expect(
      builders.some(
        (builder) => builder.table === "xy_wap_embed_insight_evidence",
      ),
    ).toBe(false);
    expect(
      builders.some(
        (builder) => builder.table === "xy_wap_embed_session_qa_finding",
      ),
    ).toBe(false);
  });

  it("updates an action item back to open status", async () => {
    let updateBuilder: UpdateBuilderStub | undefined;
    const db = {
      selectFrom: vi.fn(),
      updateTable: vi.fn(() => {
        updateBuilder = createUpdateBuilder(async () => ({
          numAffectedRows: 1n,
        }));
        return updateBuilder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.updateActionStatus({ uid: 9001 }, "801", "open"),
    ).resolves.toBe(true);

    expect(db.selectFrom).not.toHaveBeenCalled();
    expect(updateBuilder?.setCalls[0]).toEqual(
      expect.objectContaining({
        completed_at: null,
        dismissed_at: null,
        status: "open",
      }),
    );
    expect(updateBuilder?.whereCalls).toContainEqual(["id", "=", 801]);
    expect(updateBuilder?.whereCalls).toContainEqual(["uid", "=", 9001]);
    expect(updateBuilder?.whereCalls).toContainEqual([
      "status",
      "in",
      ["open", "done", "dismissed"],
    ]);
    expect(updateBuilder?.whereCalls).not.toContainEqual([
      "status",
      "=",
      "open",
    ]);
  });

  it("writes terminal timestamps when completing or dismissing action items", async () => {
    const setCalls: Array<Record<string, unknown>> = [];
    const db = {
      updateTable: vi.fn(() =>
        createUpdateBuilder(async () => ({ numAffectedRows: 1n }), {
          onSet: (values) => setCalls.push(values),
        })
      ),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.updateActionStatus({ uid: 9001 }, "801", "done"),
    ).resolves.toBe(true);
    await expect(
      repository.updateActionStatus({ uid: 9001 }, "801", "dismissed"),
    ).resolves.toBe(true);

    expect(setCalls[0]).toMatchObject({
      dismissed_at: null,
      status: "done",
    });
    expect(setCalls[0]?.completed_at).toBeInstanceOf(Date);
    expect(setCalls[1]).toMatchObject({
      completed_at: null,
      status: "dismissed",
    });
    expect(setCalls[1]?.dismissed_at).toBeInstanceOf(Date);
  });

  it("does not update an action item outside the current uid scope", async () => {
    let updateBuilder: UpdateBuilderStub | undefined;
    const db = {
      selectFrom: vi.fn(),
      updateTable: vi.fn(() => {
        updateBuilder = createUpdateBuilder(async () => ({ numAffectedRows: 0n }));
        return updateBuilder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.updateActionStatus({ uid: 9001 }, "801", "done"),
    ).resolves.toBe(false);

    expect(db.selectFrom).not.toHaveBeenCalled();
    expect(updateBuilder?.whereCalls).toContainEqual(["id", "=", 801]);
    expect(updateBuilder?.whereCalls).toContainEqual(["uid", "=", 9001]);
  });

  it("inserts manual action items as session todos without snapshot ownership", async () => {
    let insertedActionItem: Record<string, unknown> | undefined;
    const db = {
      insertInto: vi.fn((table: string) =>
        createInsertBuilder(async () => ({ insertId: 8101 }), {
          onValues: (values) => {
            insertedActionItem = values as Record<string, unknown>;
          },
          table,
        }),
      ),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.createActionItem(
        { uid: 9001 },
        {
          conversationId: "301",
          createdBySubUserId: "77",
          dueHint: "今天内",
          priority: "high",
          sessionId: "501",
          title: "回访物流状态",
        },
      ),
    ).resolves.toEqual({ actionItemId: "8101" });

    expect(db.insertInto).toHaveBeenCalledWith(
      "xy_wap_embed_session_action_item",
    );
    expect(insertedActionItem).toEqual(
      expect.objectContaining({
        action_type: "follow_up",
        conversation_id: 301,
        created_by_sub_user_id: 77,
        due_hint: "今天内",
        priority: "high",
        session_id: 501,
        snapshot_id: null,
        source_type: "manual",
        status: "open",
        title: "回访物流状态",
        uid: 9001,
        updated_by_sub_user_id: 77,
      }),
    );
  });

  it("rejects manual action items with invalid conversation ids before insert", async () => {
    const db = {
      insertInto: vi.fn(),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.createActionItem(
        { uid: 9001 },
        {
          conversationId: "",
          priority: "high",
          title: "回访物流状态",
        },
      ),
    ).rejects.toMatchObject({
      code: "INVALID_ACTION_ITEM_TARGET",
    });

    expect(db.insertInto).not.toHaveBeenCalled();
  });

  it("rejects manual action items with invalid session ids before insert", async () => {
    const db = {
      insertInto: vi.fn(),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.createActionItem(
        { uid: 9001 },
        {
          conversationId: "301",
          priority: "high",
          sessionId: "",
          title: "回访物流状态",
        },
      ),
    ).rejects.toMatchObject({
      code: "INVALID_ACTION_ITEM_TARGET",
    });

    expect(db.insertInto).not.toHaveBeenCalled();
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
      selectFrom: vi.fn(() =>
        createSelectBuilder([{ id: 8801, rescan_task_id: 9901 }]),
      ),
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

  it("stores historical rescan ranges as message timestamp watermarks", async () => {
    const insertBuilders: InsertBuilderStub[] = [];
    const db = {
      insertInto: vi.fn((table: string) => {
        const builder = createInsertBuilder(async () => ({
          insertId: table === "xy_wap_embed_insight_rescan_task" ? 9901 : 8801,
        }));
        insertBuilders.push(builder);
        return builder;
      }),
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
        "rescan:9001:classification:2026-06-01T00:00:00.000Z",
      ),
    ).resolves.toEqual({ jobId: "8801", taskId: "9901" });

    expect(insertBuilders[0]?.valuesCalls[0]).toMatchObject({
      from_time: 1_780_272_000_000,
      to_time: 1_780_358_400_000,
    });
    expect(insertBuilders[1]?.valuesCalls[0]).toMatchObject({
      target_id: "9001",
      target_type: "uid",
    });
  });

  it("logically deletes label configs by marking status deleted", async () => {
    let updateBuilder: UpdateBuilderStub | undefined;
    const db = {
      selectFrom: vi.fn(() =>
        createSelectBuilder([
          {
            description: null,
            id: 11,
            label_code: "refund",
            label_name: "退款咨询",
            negative_examples_json: null,
            positive_examples_json: null,
            status: 1,
          },
        ]),
      ),
      updateTable: vi.fn((table: string) =>
        createUpdateBuilder(async () => ({ numAffectedRows: 1n }), {
          onCreate: (builder) => {
            updateBuilder = builder;
          },
          table,
        }),
      ),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.deleteLabelConfig({ uid: 9001 }, "11"),
    ).resolves.toBe(true);

    expect(updateBuilder?.table).toBe("xy_wap_embed_insight_label_config");
    expect(updateBuilder?.setCalls[0]).toEqual(
      expect.objectContaining({ status: -1 }),
    );
    expect(updateBuilder?.whereCalls).toContainEqual(["id", "=", 11]);
    expect(updateBuilder?.whereCalls).toContainEqual(["uid", "=", 9001]);
  });

  it("persists and reads analysis policy minimum analysis messages", async () => {
    let insertedPolicy: Record<string, unknown> | undefined;
    const db = {
      insertInto: vi.fn((table: string) =>
        createInsertBuilder(async () => ({ numAffectedRows: 1n }), {
          onValues: (values) => {
            if (table === "xy_wap_embed_insight_analysis_policy") {
              insertedPolicy = values as Record<string, unknown>;
            }
          },
          table,
        }),
      ),
      selectFrom: vi.fn((table: string) => {
        if (table === "xy_wap_embed_sessionization_config") {
          return createSelectBuilder([], table);
        }

        if (table === "xy_wap_embed_insight_analysis_policy") {
          return createSelectBuilder(
            [
              {
                final_analysis_enabled: 1,
                live_analysis_enabled: 1,
                live_min_interval_minutes: 15,
                live_min_new_meaningful_messages: 20,
                low_confidence_threshold: "0.6000",
                min_analysis_messages: 8,
                rule_fallback_enabled: 1,
              },
            ],
            table,
          );
        }

        if (table === "xy_wap_embed_insight_feature_config") {
          return createSelectBuilder([], table);
        }

        return createSelectBuilder([], table);
      }),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.upsertAnalysisPolicy(
        { uid: 9001 },
        {
          finalAnalysisEnabled: true,
          liveAnalysisEnabled: true,
          liveMinIntervalMinutes: 15,
          liveMinNewMeaningfulMessages: 20,
          lowConfidenceThreshold: 0.6,
          minAnalysisMessages: 8,
          ruleFallbackEnabled: true,
        },
      ),
    ).resolves.toMatchObject({
      minAnalysisMessages: 8,
    });

    expect(insertedPolicy).toEqual(
      expect.objectContaining({
        min_analysis_messages: 8,
      }),
    );
  });

  it("aggregates business tag analytics in SQL without fact-row truncation", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const rows = builders.length === 0
          ? [
              {
                mention_count: 5,
                name: "退款咨询",
                session_count: 3,
                topic_id: 21,
              },
            ]
          : builders.length === 1
            ? [
                {
                  date: "2026-06-01",
                  mention_count: 5,
                  session_count: 3,
                },
              ]
            : [
                {
                  mention_count: 8,
                  session_count: 4,
                },
              ];
        const builder = createSelectBuilder(rows, table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    const analytics = await repository.getBusinessTopicAnalytics(
      { uid: 9001 },
      { dimension: "tag", from: "2026-06-01", to: "2026-06-02" },
    );

    expect(analytics.topics).toEqual([
      {
        code: "21",
        dimension: "tag",
        mentionCount: 5,
        name: "退款咨询",
        sessionCount: 3,
        share: 3 / 4,
        type: undefined,
      },
    ]);
    expect(analytics.totals).toEqual({
      mentionCount: 8,
      topicSessions: 4,
    });
    expect(analytics.trend).toEqual([
      {
        assetMentions: 0,
        date: "2026-06-01",
        entityMentions: 0,
        intentMentions: 0,
        tagMentions: 5,
        topicSessions: 3,
      },
    ]);

    const topicQuery = builders[0];
    expect(topicQuery?.table).toBe("xy_wap_embed_logical_session as session");
    expect(topicQuery?.joins).not.toContain("xy_wap_embed_session_insight_current as current");
    expect(topicQuery?.joins).toContain("xy_wap_embed_session_tag as topic");
    expect(topicQuery?.joinConditions).toContainEqual({
      left: "topic.snapshot_id",
      right: "session.current_snapshot_id",
      table: "xy_wap_embed_session_tag as topic",
    });
    expect(topicQuery?.whereCalls).toContainEqual(["session.uid", "=", 9001]);
    expect(topicQuery?.whereCalls).toContainEqual(["topic.uid", "=", 9001]);
    expect(topicQuery?.whereCalls).toContainEqual([
      "session.started_at",
      ">=",
      1_780_272_000_000,
    ]);
    expect(topicQuery?.whereCalls).toContainEqual([
      "session.started_at",
      "<=",
      1_780_358_400_000,
    ]);
    expect(topicQuery?.selectRawCalls.join("\n")).toContain("count(topic.id)");
    expect(topicQuery?.selectRawCalls.join("\n")).toContain("count(distinct session.id)");
    expect(topicQuery?.orderByCalls.map(readRawSql).join("\n")).toContain("count(distinct session.id)");
    expect(topicQuery?.limitCalls).toEqual([10]);
    expect(topicQuery?.limitCalls).not.toContain(500);
  });

  it("joins business topics through the logical session current snapshot", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder(
          builders.length === 0
            ? [
                {
                  mention_count: 2,
                  name: "物流异常",
                  session_count: 1,
                  topic_id: 31,
                },
              ]
            : [],
          table,
        );
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await repository.getBusinessTopicAnalytics(
      { uid: 9001 },
      { dimension: "intent" },
    );

    expect(builders[0]?.joinConditions).toContainEqual({
      left: "topic.snapshot_id",
      right: "session.current_snapshot_id",
      table: "xy_wap_embed_session_intent as topic",
    });
    expect(builders[0]?.joins).not.toContain("xy_wap_embed_session_insight_current as current");
  });

  it("aggregates business intent trend in SQL without joining current configs", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const rows = builders.length === 0
          ? [
              {
                mention_count: 4,
                name: "物流异常",
                session_count: 2,
                topic_id: 31,
              },
            ]
          : builders.length === 3
            ? [
                {
                  date: "2026-06-01",
                  intent_id: 31,
                  intent_name: "物流异常",
                  session_count: 2,
                },
              ]
            : [];
        const builder = createSelectBuilder(rows, table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    const analytics = await repository.getBusinessTopicAnalytics(
      { uid: 9001 },
      { dimension: "intent" },
    );

    const intentQuery = builders.find(
      (builder) => builder.joins.includes("xy_wap_embed_session_intent as topic"),
    );
    expect(intentQuery?.joins).not.toContain(
      "xy_wap_embed_insight_intent_config as intent_config",
    );
    expect(intentQuery?.selectRawCalls.join("\n")).toContain(
      "topic.intent_label as name",
    );
    expect(intentQuery?.limitCalls).toEqual([15]);
    const intentTrendQuery = builders[3];
    expect(intentTrendQuery?.whereCalls).toContainEqual([
      "topic.intent_id",
      "in",
      [31],
    ]);
    expect(analytics.intentTrend).toEqual([
      {
        date: "2026-06-01",
        intentId: "31",
        intentName: "物流异常",
        sessionCount: 2,
      },
    ]);
  });

  it("aggregates QA finding names from stored snapshot values", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder([], table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await repository.getQaFindingAggregate({ uid: 9001 });

    expect(builders[0]?.table).toBe("xy_wap_embed_logical_session as session");
    expect(builders[0]?.joins).not.toContain("xy_wap_embed_session_insight_current as current");
    expect(builders[0]?.joins).toContain("xy_wap_embed_session_insight_snapshot as snapshot");

    expect(
      builders.some((builder) =>
        builder.joins.includes("xy_wap_embed_insight_qa_rule_config as rule"),
      ),
    ).toBe(false);
    expect(
      builders.some((builder) =>
        builder.selectRawCalls.join("\n").includes("qa.rule_name as rule_name"),
      ),
    ).toBe(true);
  });

  it("keeps QA finding aggregate scoped to failed rule distribution", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder(
          [
            {
              count: 2,
              rule_code: "reply_quality",
              rule_name: "回复质量",
            },
          ],
          table,
        );
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.getQaFindingAggregate({ uid: 9001 }),
    ).resolves.toMatchObject({
      ruleDistribution: [
        { count: 2, ruleCode: "reply_quality", ruleName: "回复质量" },
      ],
    });
    expect(
      builders.some((builder) =>
        builder.whereCalls.some((call) =>
          call[0] === "session.qa_status" && call[1] === "=" && call[2] === 0,
        ),
      ),
    ).toBe(true);
    expect(
      builders.some((builder) =>
        builder.whereCalls.some((call) =>
          call[0] === "qa.passed" && call[1] === "=" && call[2] === 0,
        ),
      ),
    ).toBe(true);
  });
});

describe("MysqlInsightWorkerRepository", () => {
  it("loads worker analysis policy including minimum analysis messages and falls back to defaults", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder([], table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(repository.getAnalysisPolicy(9001)).resolves.toEqual({
      lowConfidenceThreshold: 0.6,
      minAnalysisMessages: 5,
    });

    expect(builders[0]?.table).toBe("xy_wap_embed_insight_analysis_policy");
    expect(builders[0]?.selectRawCalls.join("\n")).toContain(
      "min_analysis_messages",
    );
  });

  it("loads configured worker analysis policy minimum analysis messages", async () => {
    const db = {
      selectFrom: vi.fn((table: string) =>
        createSelectBuilder(
          [
            {
              low_confidence_threshold: "0.7000",
              min_analysis_messages: 8,
            },
          ],
          table,
        ),
      ),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(repository.getAnalysisPolicy(9001)).resolves.toEqual({
      lowConfidenceThreshold: 0.7,
      minAnalysisMessages: 8,
    });
  });

  it("finds an existing logical session by source message during rescan", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder(
          [
            {
              session_id: 501,
              status: "open",
              uid: 9001,
            },
          ],
          table,
        );
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(
      repository.findSessionBySourceMessage({
        sourceMessageId: "8001",
        uid: 9001,
      }),
    ).resolves.toEqual({
      sessionId: "501",
      status: "open",
      uid: 9001,
    });

    expect(builders[0]?.table).toBe(
      "xy_wap_embed_logical_session_message as session_message",
    );
    expect(builders[0]?.joins).toContain(
      "xy_wap_embed_logical_session as session",
    );
    expect(builders[0]?.whereCalls).toContainEqual([
      "session_message.uid",
      "=",
      9001,
    ]);
    expect(builders[0]?.whereCalls).toContainEqual([
      "session_message.source_message_id",
      "=",
      8001,
    ]);
  });

  it("lists recent unassigned agent and bot messages for customer-opened pre-context", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        let rows: unknown[] = [];

        if (table === "xy_wap_embed_conversation") {
          rows = [
            {
              chat_type: 1,
              platform: 5,
              third_external_userid: "external-1",
              third_group_id: "",
              third_userid: "user-1",
            },
          ];
        } else if (table === "xy_wap_embed_msg_audit_info as message") {
          rows = [
            {
              chat_type: 1,
              content: JSON.stringify({ content: "自动助手提醒领券" }),
              conversation_id: 301,
              from_type: 3,
              id: 9202,
              msgtime: 1_780_243_860_000,
              msgtype: "text",
              platform: 5,
              third_external_id: "external-1",
              third_group_id: "",
              third_user_id: "user-1",
              uid: 9001,
            },
            {
              chat_type: 1,
              content: JSON.stringify({ content: "会员专场今晚开始" }),
              conversation_id: 301,
              from_type: 1,
              id: 9201,
              msgtime: 1_780_243_800_000,
              msgtype: "text",
              platform: 5,
              third_external_id: "external-1",
              third_group_id: "",
              third_user_id: "user-1",
              uid: 9001,
            },
          ];
        } else if (table === "xy_wap_embed_logical_session_message") {
          rows = [
            {
              source_message_id: 9202,
            },
          ];
        }

        const builder = createSelectBuilder(rows, table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(
      repository.listUnassignedPreContextMessages({
        conversationId: "301",
        limit: 12,
        occurredBefore: 1_780_244_000_000,
        uid: 9001,
        windowStart: 1_780_236_800_000,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        fromType: 1,
        id: "9201",
        thirdUserId: "user-1",
      }),
    ]);

    const messageQuery = builders.find(
      (builder) => builder.table === "xy_wap_embed_msg_audit_info as message",
    );
    const assignedQuery = builders.find(
      (builder) => builder.table === "xy_wap_embed_logical_session_message",
    );

    expect(messageQuery?.joins).not.toContain(
      "xy_wap_embed_logical_session_message as assigned",
    );
    expect(messageQuery?.whereCalls).toContainEqual(["message.uid", "=", 9001]);
    expect(messageQuery?.whereCalls).toContainEqual([
      "message.platform",
      "=",
      5,
    ]);
    expect(messageQuery?.whereCalls).toContainEqual([
      "message.chat_type",
      "=",
      1,
    ]);
    expect(messageQuery?.whereCalls).toContainEqual([
      "message.third_user_id",
      "=",
      "user-1",
    ]);
    expect(messageQuery?.whereCalls).toContainEqual([
      "message.from_type",
      "in",
      [1, 3],
    ]);
    expect(messageQuery?.whereCalls).toContainEqual([
      "message.msgtype",
      "in",
      ["file", "link", "markdown", "mixed", "text", "voice", "weapp"],
    ]);
    expect(messageQuery?.whereCalls).toContainEqual([
      "message.msgtime",
      ">=",
      1_780_236_800_000,
    ]);
    expect(messageQuery?.whereCalls).toContainEqual([
      "message.msgtime",
      "<",
      1_780_244_000_000,
    ]);
    expect(messageQuery?.whereCalls).toContainEqual([
      "message.third_external_id",
      "=",
      "external-1",
    ]);
    expect(messageQuery?.orderByCalls).toEqual([
      ["message.msgtime", "desc"],
      ["message.id", "desc"],
    ]);
    expect(messageQuery?.limitCalls).toEqual([50]);
    expect(assignedQuery?.whereCalls).toContainEqual(["uid", "=", 9001]);
    expect(assignedQuery?.whereCalls).toContainEqual([
      "source_message_id",
      "in",
      [9202, 9201],
    ]);
  });

  it("uses group identity when listing group-chat pre-context messages", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const rows =
          table === "xy_wap_embed_conversation"
            ? [
                {
                  chat_type: 2,
                  platform: 5,
                  third_external_userid: "",
                  third_group_id: "group-1",
                  third_userid: "user-1",
                },
              ]
            : table === "xy_wap_embed_msg_audit_info as message"
              ? [
                  {
                    chat_type: 2,
                    content: JSON.stringify({ content: "群活动提醒" }),
                    conversation_id: 302,
                    from_type: 1,
                    id: 9301,
                    msgtime: 1_780_243_800_000,
                    msgtype: "text",
                    platform: 5,
                    third_external_id: "",
                    third_group_id: "group-1",
                    third_user_id: "user-1",
                    uid: 9001,
                  },
                ]
              : [];
        const builder = createSelectBuilder(rows, table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(
      repository.listUnassignedPreContextMessages({
        conversationId: "302",
        limit: 10,
        occurredBefore: 1_780_244_000_000,
        uid: 9001,
        windowStart: 1_780_236_800_000,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "9301",
        thirdUserId: "user-1",
      }),
    ]);

    const messageQuery = builders.find(
      (builder) => builder.table === "xy_wap_embed_msg_audit_info as message",
    );

    expect(messageQuery?.whereCalls).toContainEqual([
      "message.chat_type",
      "=",
      2,
    ]);
    expect(messageQuery?.whereCalls).toContainEqual([
      "message.third_group_id",
      "=",
      "group-1",
    ]);
    expect(messageQuery?.whereCalls).not.toContainEqual([
      "message.third_external_id",
      "=",
      "",
    ]);
  });

  it("keeps pre-context candidates inside the idle-time window", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const rows =
          table === "xy_wap_embed_conversation"
            ? [
                {
                  chat_type: 1,
                  platform: 5,
                  third_external_userid: "external-1",
                  third_group_id: "",
                  third_userid: "user-1",
                },
              ]
            : table === "xy_wap_embed_msg_audit_info as message"
              ? [
                  {
                    chat_type: 1,
                    content: JSON.stringify({ content: "窗口内提醒" }),
                    conversation_id: 301,
                    from_type: 1,
                    id: 9401,
                    msgtime: 1_780_236_800_000,
                    msgtype: "text",
                    platform: 5,
                    third_external_id: "external-1",
                    third_group_id: "",
                    third_user_id: "user-1",
                    uid: 9001,
                  },
                ]
              : [];
        const builder = createSelectBuilder(rows, table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(
      repository.listUnassignedPreContextMessages({
        conversationId: "301",
        limit: 10,
        occurredBefore: 1_780_244_000_000,
        uid: 9001,
        windowStart: 1_780_236_800_000,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "9401",
        msgtime: 1_780_236_800_000,
      }),
    ]);

    const messageQuery = builders.find(
      (builder) => builder.table === "xy_wap_embed_msg_audit_info as message",
    );

    expect(messageQuery?.whereCalls).toContainEqual([
      "message.msgtime",
      ">=",
      1_780_236_800_000,
    ]);
    expect(messageQuery?.whereCalls).toContainEqual([
      "message.msgtime",
      "<",
      1_780_244_000_000,
    ]);
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
            problem_summary: "客户反馈上次订单少发",
            resolution_status: "partially_resolved",
            session_id: 200,
            session_title: "订单少发补寄",
            started_at: 1_780_090_000_000,
            summary_text: "客户反馈上次订单少发，客服登记并承诺补寄。",
            unresolved_reason: "尚未给出补寄单号",
          },
        ],
      ],
    ]);
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder(
          rowsByTable.get(table) ?? [],
          table,
        );
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(
      repository.listPreviousSessionContexts({
        currentSessionId: "501",
        limit: 3,
        lookbackHours: 48,
        uid: 9001,
      }),
    ).resolves.toEqual([
      {
        endedAt: 1_780_100_000_000,
        problemSummary: "客户反馈上次订单少发",
        resolutionStatus: "partially_resolved",
        sessionId: "200",
        sessionTitle: "订单少发补寄",
        startedAt: 1_780_090_000_000,
        summaryText: "客户反馈上次订单少发，客服登记并承诺补寄。",
        unresolvedReason: "尚未给出补寄单号",
      },
    ]);

    const previousQuery = builders.find(
      (builder) =>
        builder.table === "xy_wap_embed_logical_session as previous_session",
    );
    expect(previousQuery?.joins).not.toContain(
      "xy_wap_embed_session_insight_current as current",
    );
    expect(previousQuery?.joins).toContain(
      "xy_wap_embed_session_summary as summary",
    );
    expect(previousQuery?.joins).toContain(
      "xy_wap_embed_session_problem_resolution as problem",
    );
    expect(previousQuery?.joins).not.toContain("xy_wap_embed_session_tag");
    expect(previousQuery?.joins).not.toContain("xy_wap_embed_session_entity");
    expect(previousQuery?.joins).not.toContain("xy_wap_embed_insight_evidence");
    expect(previousQuery?.whereCalls).toContainEqual([
      "previous_session.uid",
      "=",
      9001,
    ]);
    expect(previousQuery?.whereCalls).toContainEqual([
      "previous_session.conversation_id",
      "=",
      301,
    ]);
    expect(previousQuery?.whereCalls).toContainEqual([
      "previous_session.id",
      "!=",
      501,
    ]);
    expect(previousQuery?.whereCalls).toContainEqual([
      "previous_session.ended_at",
      "<=",
      1_780_244_000_000,
    ]);
    expect(previousQuery?.whereCalls).toContainEqual([
      "previous_session.ended_at",
      ">=",
      1_780_071_200_000,
    ]);
    expect(previousQuery?.orderByCalls).toContainEqual([
      "previous_session.ended_at",
      "desc",
    ]);
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
            idempotency_key:
              "analyze_session:9001:501:live:2026-06-01T00:00:00.000Z",
            job_type: "analyze_session",
            max_attempts: 3,
            target_id: "501",
            uid: 9001,
          },
        ]);
        builders.push(builder);
        return builder;
      }),
      updateTable: vi.fn(() =>
        createUpdateBuilder(async () => ({ numAffectedRows: 0n })),
      ),
    };
    db.transaction.mockReturnValue(createTransactionBuilder(db));
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(repository.claimNextAnalyzeJob()).resolves.toBeUndefined();
    expect(db.transaction).toHaveBeenCalled();
    expect(builders[0]?.forUpdateCalls).toBe(1);
    expect(builders[0]?.skipLockedCalls).toBe(1);
  });

  it("claims only pending analysis jobs after expired leases are reclaimed", async () => {
    const updateExecute = vi.fn(async () => ({ numAffectedRows: 1n }));
    const builders: SelectBuilderStub[] = [];
    const updateTables: string[] = [];
    const updateBuilders: UpdateBuilderStub[] = [];
    const db = {
      transaction: vi.fn(),
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder(
          [
            {
              analysis_scope: "all",
              attempt_count: 1,
              id: 40,
              idempotency_key:
                "reanalyze_session:272:29:final:2026-06-03T12:25:25.258Z",
              job_type: "reanalyze_session",
              max_attempts: 3,
              target_id: "29",
              uid: 272,
            },
          ],
          table,
        );
        builders.push(builder);
        return builder;
      }),
      updateTable: vi.fn((table: string) => {
        updateTables.push(table);
        return createUpdateBuilder(updateExecute, {
          onCreate: (builder) => updateBuilders.push(builder),
          table,
        });
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
    expect(builders[0]?.whereCalls).not.toContainEqual(["status", "=", "running"]);
    expect(builders[0]?.whereCalls).not.toContainEqual([
      "lease_until",
      "<=",
      expect.any(Date),
    ]);
    expect(builders[0]?.forUpdateCalls).toBe(1);
    expect(builders[0]?.skipLockedCalls).toBe(1);
    expect(updateTables).not.toContain("xy_wap_embed_analysis_run");
    expect(updateBuilders).toHaveLength(1);
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
              target_id: "1780272000000",
              uid: 9001,
            },
        ]);
        builders.push(builder);
        return builder;
      }),
      updateTable: vi.fn(() =>
        createUpdateBuilder(async () => ({ numAffectedRows: 0n })),
      ),
    };
    db.transaction.mockReturnValue(createTransactionBuilder(db));
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(
      repository.claimNextSyncMessagesJob(),
    ).resolves.toBeUndefined();
    expect(db.transaction).toHaveBeenCalled();
    expect(builders[0]?.forUpdateCalls).toBe(1);
    expect(builders[0]?.skipLockedCalls).toBe(1);
  });

  it("claims historical rescan sync jobs from stored message timestamp watermarks", async () => {
    const updateExecute = vi.fn(async () => ({ numAffectedRows: 1n }));
    const builders: SelectBuilderStub[] = [];
    const db = {
      transaction: vi.fn(),
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder(
          [
            {
              analysis_scope: "classification",
              id: 702,
              rescan_from_time: 1_780_272_000_000,
              rescan_task_id: 9901,
              rescan_to_time: 1_780_275_600_000,
              target_id: "9001",
              uid: 9001,
            },
          ],
          table,
        );
        builders.push(builder);
        return builder;
      }),
      updateTable: vi.fn(() => createUpdateBuilder(updateExecute)),
    };
    db.transaction.mockReturnValue(createTransactionBuilder(db));
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(repository.claimNextSyncMessagesJob()).resolves.toEqual({
      analysisScope: "classification",
      cursorMsgtime: 1_780_272_000_000,
      jobId: "702",
      rescanTaskId: "9901",
      scanUntilMsgtime: 1_780_275_600_000,
      uid: 9001,
    });

    expect(builders[0]?.joins).toContain(
      "xy_wap_embed_insight_rescan_task as rescan_task",
    );
    expect(builders[0]?.selectRawCalls.join("\n")).toContain(
      "rescan_task.from_time as rescan_from_time",
    );
    expect(builders[0]?.selectRawCalls.join("\n")).toContain(
      "rescan_task.to_time as rescan_to_time",
    );
    expect(updateExecute).toHaveBeenCalled();
  });

  it("claims cleanup-disabled-insights jobs for disabled tenant session cleanup", async () => {
    const updateExecute = vi.fn(async () => ({ numAffectedRows: 1n }));
    const builders: SelectBuilderStub[] = [];
    const db = {
      transaction: vi.fn(),
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder(
          [
            {
              id: 703,
              target_id: "1780243000000",
              uid: 9001,
            },
          ],
          table,
        );
        builders.push(builder);
        return builder;
      }),
      updateTable: vi.fn(() => createUpdateBuilder(updateExecute)),
    };
    db.transaction.mockReturnValue(createTransactionBuilder(db));
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(
      repository.claimNextCleanupDisabledInsightsJob(),
    ).resolves.toEqual({
      enableEpoch: 1_780_243_000_000,
      jobId: "703",
      uid: 9001,
    });

    expect(builders[0]?.whereCalls).toContainEqual(["target_type", "=", "uid"]);
    expect(builders[0]?.whereCalls).toContainEqual([
      "job_type",
      "=",
      "cleanup_disabled_insights",
    ]);
    expect(builders[0]?.forUpdateCalls).toBe(1);
    expect(builders[0]?.skipLockedCalls).toBe(1);
    expect(updateExecute).toHaveBeenCalled();
  });

  it("seeds uid maintenance jobs for active insight tenants idempotently", async () => {
    const builders: SelectBuilderStub[] = [];
    const insertedValues: Record<string, unknown>[] = [];
    const db = {
      insertInto: vi.fn((table: string) =>
        createInsertBuilder(async () => ({ numInsertedOrUpdatedRows: 1n }), {
          onValues: (values) =>
            insertedValues.push(values as Record<string, unknown>),
          table,
        }),
      ),
      selectFrom: vi.fn((table: string) => {
        if (table === "xy_wap_embed_insight_feature_config as config") {
          const builder = createSelectBuilder(
            [
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
            ],
            table,
          );
          builders.push(builder);
          return builder;
        }

        const builder = createSelectBuilder([], table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(
      repository.seedUidMaintenanceJobs({
        limit: 20,
        runAfter: new Date("2026-06-01T00:00:00Z"),
      }),
    ).resolves.toEqual({
      insertedJobs: 1,
      scannedUids: 1,
    });

    expect(insertedValues).toContainEqual(
      expect.objectContaining({
        idempotency_key: "maintain_insight_uid:9001",
        job_type: "maintain_insight_uid",
        run_after: new Date("2026-06-01T00:00:00Z"),
        status: "pending",
        target_id: "9001",
        target_type: "uid",
        uid: 9001,
      }),
    );
    const seedQuery = builders.find(
      (builder) =>
        builder.table === "xy_wap_embed_insight_feature_config as config",
    );
    expect(seedQuery?.joins).toContain("xy_wap_embed_insight_job as job");
    expect(seedQuery?.whereCalls).toContainEqual(["job.id", "is", null]);
  });

  it("claims uid maintenance jobs through the uid job skip-locked path", async () => {
    const updateExecute = vi.fn(async () => ({ numAffectedRows: 1n }));
    const builders: SelectBuilderStub[] = [];
    const db = {
      transaction: vi.fn(),
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder(
          [
            {
              analysis_scope: "all",
              id: 704,
              rescan_task_id: null,
              target_id: "9001",
              uid: 9001,
            },
          ],
          table,
        );
        builders.push(builder);
        return builder;
      }),
      updateTable: vi.fn(() => createUpdateBuilder(updateExecute)),
    };
    db.transaction.mockReturnValue(createTransactionBuilder(db));
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(repository.claimNextUidMaintenanceJob()).resolves.toEqual({
      jobId: "704",
      uid: 9001,
    });

    expect(builders[0]?.whereCalls).toContainEqual(["target_type", "=", "uid"]);
    expect(builders[0]?.whereCalls).toContainEqual([
      "job_type",
      "=",
      "maintain_insight_uid",
    ]);
    expect(builders[0]?.forUpdateCalls).toBe(1);
    expect(builders[0]?.skipLockedCalls).toBe(1);
    expect(updateExecute).toHaveBeenCalled();
  });

  it("claims only pending uid maintenance jobs after expired leases are reclaimed", async () => {
    const updateExecute = vi.fn(async () => ({ numAffectedRows: 1n }));
    const builders: SelectBuilderStub[] = [];
    const db = {
      transaction: vi.fn(),
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder(
          [
            {
              analysis_scope: "all",
              id: 705,
              rescan_task_id: null,
              target_id: "9002",
              uid: 9002,
            },
          ],
          table,
        );
        builders.push(builder);
        return builder;
      }),
      updateTable: vi.fn(() => createUpdateBuilder(updateExecute)),
    };
    db.transaction.mockReturnValue(createTransactionBuilder(db));
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(repository.claimNextUidMaintenanceJob()).resolves.toEqual({
      jobId: "705",
      uid: 9002,
    });

    expect(builders[0]?.whereCalls).toContainEqual(["status", "=", "pending"]);
    expect(builders[0]?.whereCalls).not.toContainEqual(["status", "=", "running"]);
    expect(builders[0]?.whereCalls).not.toContainEqual([
      "lease_until",
      "<=",
      expect.any(Date),
    ]);
    expect(updateExecute).toHaveBeenCalled();
  });

  it("reclaims expired running jobs back to pending before claim queries", async () => {
    const updateBuilders: UpdateBuilderStub[] = [];
    const setCalls: Record<string, unknown>[] = [];
    const db = {
      updateTable: vi.fn((table: string) =>
        createUpdateBuilder(async () => ({ numAffectedRows: 4n }), {
          onCreate: (builder) => updateBuilders.push(builder),
          onSet: (values) => setCalls.push(values),
          table,
        }),
      ),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);
    const now = new Date("2026-06-11T08:00:00Z");

    await expect(repository.reclaimExpiredRunningJobs({ now })).resolves.toBe(4);

    expect(db.updateTable).toHaveBeenCalledWith("xy_wap_embed_insight_job");
    expect(db.updateTable).toHaveBeenCalledWith("xy_wap_embed_analysis_run");
    const jobUpdate = updateBuilders.find((builder) => builder.table === "xy_wap_embed_insight_job");
    const runUpdate = updateBuilders.find((builder) => builder.table === "xy_wap_embed_analysis_run");
    expect(jobUpdate?.whereCalls).toContainEqual(["status", "=", "running"]);
    expect(jobUpdate?.whereCalls).toContainEqual(["lease_until", "<=", now]);
    expect(setCalls[0]).toMatchObject({
      error_code: "LEASE_EXPIRED",
      error_message: "Analysis job lease expired before completion",
      finished_at: now,
      status: "failed",
      update_time: now,
    });
    expect(runUpdate?.whereCalls).toContainEqual(["status", "=", "running"]);
    expect(runUpdate?.whereRawCalls.join("\n")).toContain("exists");
    expect(setCalls[1]).toMatchObject({
      lease_until: null,
      locked_by: null,
      status: "pending",
      update_time: now,
    });
  });

  it("reschedules uid maintenance jobs back to pending after a successful pass", async () => {
    const setCalls: Record<string, unknown>[] = [];
    const updateBuilders: UpdateBuilderStub[] = [];
    const db = {
      updateTable: vi.fn((table: string) => {
        const builder = createUpdateBuilder(
          async () => ({ numAffectedRows: 1n }),
          {
            onCreate: (created) => updateBuilders.push(created),
            onSet: (values) => setCalls.push(values),
            table,
          },
        );
        return builder;
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await repository.rescheduleUidMaintenanceJob("704", {
      runAfter: new Date("2026-06-01T00:00:10Z"),
    });

    expect(db.updateTable).toHaveBeenCalledWith("xy_wap_embed_insight_job");
    expect(setCalls).toContainEqual(
      expect.objectContaining({
        attempt_count: 0,
        error_code: null,
        error_message: null,
        lease_until: null,
        locked_by: null,
        run_after: new Date("2026-06-01T00:00:10Z"),
        status: "pending",
      }),
    );
    expect(updateBuilders[0]?.whereCalls).toContainEqual(["id", "=", 704]);
    expect(updateBuilders[0]?.whereCalls).toContainEqual([
      "job_type",
      "=",
      "maintain_insight_uid",
    ]);
  });

  it("deletes running uid maintenance jobs when insights are disabled", async () => {
    const deleteBuilders: ReturnType<typeof createDeleteBuilder>[] = [];
    const db = {
      deleteFrom: vi.fn((table: string) => {
        const builder = createDeleteBuilder(
          async () => ({ numDeletedRows: 1n }),
          table,
        );
        deleteBuilders.push(builder);
        return builder;
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await repository.deleteUidMaintenanceJob("704");

    expect(db.deleteFrom).toHaveBeenCalledWith("xy_wap_embed_insight_job");
    expect(deleteBuilders[0]?.whereCalls).toContainEqual(["id", "=", 704]);
    expect(deleteBuilders[0]?.whereCalls).toContainEqual([
      "job_type",
      "=",
      "maintain_insight_uid",
    ]);
    expect(deleteBuilders[0]?.whereCalls).toContainEqual([
      "status",
      "=",
      "running",
    ]);
  });

  it("rejects malformed historical rescan watermarks before claiming the job", async () => {
    const updateExecute = vi.fn(async () => ({ numAffectedRows: 1n }));
    const db = {
      transaction: vi.fn(),
      selectFrom: vi.fn(() =>
        createSelectBuilder([
          {
            analysis_scope: "all",
            id: 702,
            rescan_from_time: "not-a-watermark",
            rescan_task_id: 9901,
            target_id: "9001",
            uid: 9001,
          },
        ]),
      ),
      updateTable: vi.fn(() => createUpdateBuilder(updateExecute)),
    };
    db.transaction.mockReturnValue(createTransactionBuilder(db));
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(repository.claimNextSyncMessagesJob()).rejects.toThrow(
      "Invalid sync_messages rescan from_time",
    );
    expect(updateExecute).not.toHaveBeenCalled();
  });

  it("filters incremental messages by historical rescan upper bound", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder([], table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await repository.listIncrementalMessages({
      cursorAuditId: 8001,
      cursorMsgtime: 1_780_000_000_000,
      limit: 50,
      scanUntilMsgtime: 1_780_000_030_000,
      uid: 9001,
    });

    expect(builders[0]?.whereCalls).toContainEqual([
      "msgtime",
      "<=",
      1_780_000_030_000,
    ]);
  });

  it("checks pending live analysis jobs with exact indexed columns", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const rows =
          table === "xy_wap_embed_logical_session_message"
            ? [{ count: 20 }]
            : [];
        const builder = createSelectBuilder(rows, table);
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(
      repository.shouldCreateLiveAnalyzeJob({
        occurredAt: 1_780_244_000_000,
        sessionId: "501",
        uid: 9001,
      }),
    ).resolves.toBe(true);

    const jobQuery = builders.find(
      (builder) => builder.table === "xy_wap_embed_insight_job",
    );
    expect(jobQuery?.whereCalls).toContainEqual(["uid", "=", 9001]);
    expect(jobQuery?.whereCalls).toContainEqual([
      "target_type",
      "=",
      "logical_session",
    ]);
    expect(jobQuery?.whereCalls).toContainEqual(["target_id", "=", "501"]);
    expect(jobQuery?.whereCalls).toContainEqual([
      "job_type",
      "=",
      "analyze_session",
    ]);
    expect(jobQuery?.whereCalls).toContainEqual([
      "status",
      "in",
      ["pending", "running"],
    ]);
    expect(
      jobQuery?.whereCalls.some(
        (call) => call[0] === "idempotency_key" && call[1] === "like",
      ),
    ).toBe(false);
  });

  it("waits for minimum analysis messages after an insufficient live run before triggering again", async () => {
    const skippedRun = {
      create_time: new Date(Date.now() - 20 * 60_000),
      error_code: "INSUFFICIENT_MESSAGES",
      id: 6001,
      source_message_to: 9004,
    };
    const db = {
      selectFrom: vi.fn((table: string) => {
        if (table === "xy_wap_embed_insight_analysis_policy") {
          return createSelectBuilder(
            [
              {
                live_analysis_enabled: 1,
                live_min_interval_minutes: 15,
                live_min_new_meaningful_messages: 4,
                min_analysis_messages: 20,
              },
            ],
            table,
          );
        }

        if (table === "xy_wap_embed_analysis_run") {
          return createSelectBuilder([skippedRun], table);
        }

        if (table === "xy_wap_embed_logical_session_message") {
          return createSelectBuilder([{ count: 19 }], table);
        }

        return createSelectBuilder([], table);
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(
      repository.shouldCreateLiveAnalyzeJob({
        occurredAt: 1_780_244_000_000,
        sessionId: "501",
        uid: 9001,
      }),
    ).resolves.toBe(false);

    const messageQueriesAfterSkippedRun = (
      db.selectFrom as ReturnType<typeof vi.fn>
    ).mock.results
      .map((result) => result.value as SelectBuilderStub)
      .filter(
        (builder) => builder.table === "xy_wap_embed_logical_session_message",
      );
    expect(messageQueriesAfterSkippedRun).toHaveLength(1);
    expect(messageQueriesAfterSkippedRun[0]?.whereCalls).toContainEqual([
      "source_message_id",
      ">",
      0,
    ]);
    expect(
      (db.selectFrom as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([table]) => table === "xy_wap_embed_analysis_run",
      ),
    ).toHaveLength(1);

    db.selectFrom = vi.fn((table: string) => {
      if (table === "xy_wap_embed_insight_analysis_policy") {
        return createSelectBuilder(
          [
            {
              live_analysis_enabled: 1,
              live_min_interval_minutes: 15,
              live_min_new_meaningful_messages: 4,
              min_analysis_messages: 20,
            },
          ],
          table,
        );
      }

      if (table === "xy_wap_embed_analysis_run") {
        return createSelectBuilder([skippedRun], table);
      }

      if (table === "xy_wap_embed_logical_session_message") {
        return createSelectBuilder([{ count: 20 }], table);
      }

      return createSelectBuilder([], table);
    });

    await expect(
      repository.shouldCreateLiveAnalyzeJob({
        occurredAt: 1_780_244_060_000,
        sessionId: "501",
        uid: 9001,
      }),
    ).resolves.toBe(true);
  });

  it("falls back to an older analyzed live run when the lookback window only contains insufficient runs", async () => {
    const insufficientRuns = Array.from({ length: 20 }, (_, index) => ({
      create_time: new Date(Date.now() - (20 + index) * 60_000),
      error_code: "INSUFFICIENT_MESSAGES",
      id: 7000 - index,
      source_message_to: 9200 - index,
    }));
    const olderAnalyzedRun = {
      source_message_to: 9000,
    };
    let analysisRunQueryCount = 0;
    const db = {
      selectFrom: vi.fn((table: string) => {
        if (table === "xy_wap_embed_insight_analysis_policy") {
          return createSelectBuilder(
            [
              {
                live_analysis_enabled: 1,
                live_min_interval_minutes: 15,
                live_min_new_meaningful_messages: 4,
                min_analysis_messages: 20,
              },
            ],
            table,
          );
        }

        if (table === "xy_wap_embed_analysis_run") {
          analysisRunQueryCount += 1;
          return createSelectBuilder(
            analysisRunQueryCount === 1 ? insufficientRuns : [olderAnalyzedRun],
            table,
          );
        }

        if (table === "xy_wap_embed_logical_session_message") {
          return createSelectBuilder([{ count: 20 }], table);
        }

        return createSelectBuilder([], table);
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(
      repository.shouldCreateLiveAnalyzeJob({
        occurredAt: 1_780_244_120_000,
        sessionId: "501",
        uid: 9001,
      }),
    ).resolves.toBe(true);

    const analysisRunQueries = (
      db.selectFrom as ReturnType<typeof vi.fn>
    ).mock.results
      .map((result) => result.value as SelectBuilderStub)
      .filter((builder) => builder.table === "xy_wap_embed_analysis_run");
    expect(analysisRunQueries).toHaveLength(2);
    expect(analysisRunQueries[1]?.whereCalls).toContainEqual([
      "error_code",
      "!=",
      "INSUFFICIENT_MESSAGES",
    ]);

    const messageQuery = (
      db.selectFrom as ReturnType<typeof vi.fn>
    ).mock.results
      .map((result) => result.value as SelectBuilderStub)
      .find(
        (builder) => builder.table === "xy_wap_embed_logical_session_message",
      );
    expect(messageQuery?.whereCalls).toContainEqual([
      "source_message_id",
      ">",
      9000,
    ]);
  });

  it("uses live gate skipped runs as the next live analysis watermark", async () => {
    const skippedRun = {
      create_time: new Date(Date.now() - 20 * 60_000),
      error_code: "LIVE_GATE_SKIPPED",
      id: 6101,
      source_message_to: 9004,
    };
    const db = {
      selectFrom: vi.fn((table: string) => {
        if (table === "xy_wap_embed_insight_analysis_policy") {
          return createSelectBuilder(
            [
              {
                live_analysis_enabled: 1,
                live_min_interval_minutes: 15,
                live_min_new_meaningful_messages: 4,
                min_analysis_messages: 2,
              },
            ],
            table,
          );
        }

        if (table === "xy_wap_embed_analysis_run") {
          return createSelectBuilder([skippedRun], table);
        }

        if (table === "xy_wap_embed_logical_session_message") {
          return createSelectBuilder([{ count: 3 }], table);
        }

        return createSelectBuilder([], table);
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(
      repository.shouldCreateLiveAnalyzeJob({
        occurredAt: 1_780_244_000_000,
        sessionId: "501",
        uid: 9001,
      }),
    ).resolves.toBe(false);

    const messageQuery = (
      db.selectFrom as ReturnType<typeof vi.fn>
    ).mock.results
      .map((result) => result.value as SelectBuilderStub)
      .find(
        (builder) => builder.table === "xy_wap_embed_logical_session_message",
      );
    expect(messageQuery?.whereCalls).toContainEqual([
      "source_message_id",
      ">",
      9004,
    ]);
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

    expect(db.selectFrom).not.toHaveBeenCalledWith(
      "xy_wap_embed_insight_rescan_task",
    );
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
        const builder = createDeleteBuilder(
          async () => ({ numDeletedRows: 3n }),
          table,
        );
        deleteBuilders.push(builder);
        return builder;
      }),
      insertInto: vi.fn((table: string) => {
        const builder = createInsertBuilder(
          async () => ({ numInsertedOrUpdatedRows: 3n }),
          { table },
        );
        insertBuilders.push(builder);
        return builder;
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(
      repository.archiveTerminalJobs({
        before: new Date("2026-06-01T00:00:00.000Z"),
        limit: 5000,
      }),
    ).resolves.toEqual({ archivedJobs: 3, deletedJobs: 3 });

    expect(db.insertInto).toHaveBeenCalledWith(
      "xy_wap_embed_insight_job_archive",
    );
    expect(insertBuilders[0]?.columnsCalls[0]).toContain("archived_at");
    expect(insertBuilders[0]?.expressionCalls).toBe(1);
    expect(db.deleteFrom).toHaveBeenCalledWith("xy_wap_embed_insight_job");
    expect(deleteBuilders[0]?.whereCalls).toContainEqual([
      "status",
      "in",
      ["succeeded", "failed"],
    ]);
    expect(deleteBuilders[0]?.whereCalls).toContainEqual([
      "update_time",
      "<",
      new Date("2026-06-01T00:00:00.000Z"),
    ]);
    expect(deleteBuilders[0]?.limitCalls).toEqual([5000]);
  });

  it("loads closable open sessions through the indexed next close timestamp", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder(
          [
            {
              analysis_delay_minutes: 10,
              hard_max_duration_hours: 8,
              id: 501,
              idle_timeout_minutes: 120,
              last_meaningful_message_at: 1_780_244_000_000,
              started_at: 1_780_230_000_000,
              uid: 9001,
            },
          ],
          table,
        );
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(
      repository.listClosableOpenSessions({
        limit: 100,
        now: 1_780_252_000_000,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        closeReason: "idle_timeout",
        sessionId: "501",
      }),
    ]);

    expect(builders[0]?.whereCalls).toContainEqual(["status", "=", "open"]);
    expect(builders[0]?.whereCalls).toContainEqual([
      "next_close_at",
      "<=",
      1_780_252_000_000,
    ]);
    expect(builders[0]?.orderByCalls).toContainEqual(["next_close_at", "asc"]);
    expect(builders[0]?.whereRawCalls.join("\n")).not.toContain(
      "hard_max_duration_hours * 3600000",
    );
  });

  it("finds reusable open or canceled sessions for stable sessionization", async () => {
    const builders: SelectBuilderStub[] = [];
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder(
          [
            {
              id: 501,
              last_meaningful_message_at: 1_780_244_000_000,
              started_at: 1_780_243_000_000,
              status: "canceled",
            },
          ],
          table,
        );
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(
      repository.findReusableSession({
        conversationId: "301",
        uid: 9001,
      }),
    ).resolves.toEqual({
      lastMeaningfulMessageAt: 1_780_244_000_000,
      sessionId: "501",
      startedAt: 1_780_243_000_000,
      status: "canceled",
    });

    expect(builders[0]?.whereCalls).toContainEqual(["uid", "=", 9001]);
    expect(builders[0]?.whereCalls).toContainEqual([
      "conversation_id",
      "=",
      301,
    ]);
    expect(builders[0]?.whereCalls).toContainEqual([
      "status",
      "in",
      ["open", "canceled"],
    ]);
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
        const builder = createSelectBuilder(
          [
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
          ],
          table,
        );
        builders.push(builder);
        return builder;
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(
      repository.getActiveFeatureConfigs({
        limit: 100,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        insightEnabled: true,
        uid: 9001,
      }),
    ]);

    expect(builders[0]?.table).toBe(
      "xy_wap_embed_insight_feature_config as config",
    );
    expect(builders[0]?.joins).toContain(
      "xy_wap_embed_insight_sync_cursor as cursor",
    );
    expect(builders[0]?.whereCalls).toContainEqual([
      "config.insight_enabled",
      "=",
      1,
    ]);
    expect(builders[0]?.orderByCalls.length).toBeGreaterThan(0);
    expect(builders[0]?.limitCalls).toEqual([100]);
  });

  it("closes disabled open sessions in cleanup batches", async () => {
    let logicalSessionUpdate: UpdateBuilderStub | undefined;
    const db = {
      updateTable: vi.fn((table: string) =>
        createUpdateBuilder(async () => ({ numAffectedRows: 25n }), {
          onCreate: (builder) => {
            if (table === "xy_wap_embed_logical_session") {
              logicalSessionUpdate = builder;
            }
          },
          table,
        }),
      ),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(
      repository.closeDisabledOpenSessions({
        endedAt: 1_780_252_000_000,
        limit: 500,
        uid: 9001,
      }),
    ).resolves.toBe(25);

    expect(logicalSessionUpdate?.setCalls[0]).toMatchObject({
      close_reason: "insight_disabled",
      ended_at: 1_780_252_000_000,
      next_close_at: null,
      status: "canceled",
    });
    expect(logicalSessionUpdate?.whereCalls).toContainEqual(["uid", "=", 9001]);
    expect(logicalSessionUpdate?.whereCalls).toContainEqual([
      "status",
      "=",
      "open",
    ]);
    expect(logicalSessionUpdate?.limitCalls).toEqual([500]);
  });

  it("stores next close time when creating and appending logical-session messages", async () => {
    const insertValues: Array<{
      table: string;
      values: Record<string, unknown> | Record<string, unknown>[];
    }> = [];
    const updateValues: Array<{
      table: string;
      values: Record<string, unknown>;
    }> = [];
    const db = {
      insertInto: vi.fn((table: string) =>
        createInsertBuilder(
          async () => ({ insertId: 501, numInsertedOrUpdatedRows: 1n }),
          {
            onValues: (values) => insertValues.push({ table, values }),
            table,
          },
        ),
      ),
      updateTable: vi.fn((table: string) =>
        createUpdateBuilder(async () => ({ numAffectedRows: 1n }), {
          onSet: (values) => updateValues.push({ table, values }),
          table,
        }),
      ),
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
      thirdExternalUserId: "external-1",
      thirdUserId: "agent-1",
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

    expect(
      insertValues.find(
        (entry) => entry.table === "xy_wap_embed_logical_session",
      )?.values,
    ).toMatchObject({
      next_close_at: 1_780_244_000_000 + 120 * 60_000,
      third_external_userid: "external-1",
      third_userid: "agent-1",
    });
    expect(
      updateValues.find(
        (entry) => entry.table === "xy_wap_embed_logical_session",
      )?.values,
    ).toHaveProperty("next_close_at");
  });

  it("writes analysis snapshots as building before publishing them", async () => {
    const operations: Array<{
      table: string;
      type: "insert" | "update";
      values?: Record<string, unknown>;
    }> = [];
    const updateBuilders: UpdateBuilderStub[] = [];
    let nextInsertId = 7001;
    let logicalSessionSelectCount = 0;
    const db = {
      insertInto: vi.fn((table: string) =>
        createInsertBuilder(async () => ({ insertId: nextInsertId++ }), {
          onValues: (values) =>
            operations.push({ table, type: "insert", values }),
          table,
        }),
      ),
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
      updateTable: vi.fn((table: string) =>
        createUpdateBuilder(async () => ({ numAffectedRows: 1n }), {
          onSet: (values) => operations.push({ table, type: "update", values }),
          onCreate: (builder) => updateBuilders.push(builder),
          table,
        }),
      ),
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
            intentId: "31",
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
        qaFindings: [
          {
            confidence: 0.9,
            evidenceMessageIds: ["9001"],
            passed: true,
            reason: "响应及时",
            ruleCode: "reply_quality",
            ruleName: "回复质量",
            severity: "medium",
          },
        ],
        sentiment: [
          {
            confidence: 0.7,
            evidenceMessageIds: ["9001"],
            polarity: "negative",
            reason: "客户表达不满",
          },
          {
            confidence: 0.6,
            evidenceMessageIds: ["9002"],
            polarity: "neutral",
            reason: "客服正常回复",
          },
        ],
        summary: {
          sessionTitle: "查物流",
          text: "已登记",
        },
        tags: [
          {
            confidence: 0.8,
            evidenceMessageIds: ["9001"],
            tagCode: "logistics",
            tagId: "21",
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
    expect(
      operations.filter(
        (operation) => operation.table === "xy_wap_embed_session_sentiment",
      ),
    ).toHaveLength(1);
    const currentIndex = operations.findIndex(
      (operation) => operation.table === "xy_wap_embed_session_insight_current",
    );
    const publishIndex = operations.findIndex(
      (operation) =>
        operation.table === "xy_wap_embed_session_insight_snapshot" &&
        operation.type === "update" &&
        operation.values?.status === "ready",
    );
    expect(publishIndex).toBeGreaterThan(0);
    expect(currentIndex).toBe(-1);
    expect(logicalSessionSelectCount).toBe(1);
    const logicalSessionUpdate = updateBuilders.find(
      (builder) =>
        builder.table === "xy_wap_embed_logical_session" &&
        builder.whereCalls.some((call) => call[0] === "id" && call[2] === 501),
    );
    const logicalSessionUpdateIndex = operations.findIndex(
      (operation) =>
        operation.table === "xy_wap_embed_logical_session" &&
        operation.type === "update",
    );
    expect(logicalSessionUpdateIndex).toBeGreaterThan(publishIndex);
    expect(logicalSessionUpdate?.whereCalls).toContainEqual(["uid", "=", 9001]);
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "xy_wap_embed_logical_session",
        type: "update",
        values: expect.objectContaining({
          current_snapshot_id: 7001,
          qa_status: 1,
        }),
      }),
    );
  });

  it("keeps logical sessions uninspected when published QA findings are empty", async () => {
    const operations: Array<{
      table: string;
      type: "insert" | "update";
      values?: Record<string, unknown>;
    }> = [];
    let nextInsertId = 7001;
    const db = {
      insertInto: vi.fn((table: string) =>
        createInsertBuilder(async () => ({ insertId: nextInsertId++ }), {
          onValues: (values) =>
            operations.push({ table, type: "insert", values }),
          table,
        }),
      ),
      selectFrom: vi.fn((table: string) =>
        createSelectBuilder(
          table === "xy_wap_embed_logical_session"
            ? [{ conversation_id: 301 }]
            : [],
          table,
        ),
      ),
      updateTable: vi.fn((table: string) =>
        createUpdateBuilder(async () => ({ numAffectedRows: 1n }), {
          onSet: (values) => operations.push({ table, type: "update", values }),
          table,
        }),
      ),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await repository.saveAnalysisResult({
      job: {
        analysisScope: "qaFindings",
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
          confidence: 0,
          evidence: [],
          evidenceMessageIds: [],
          problemDetected: false,
          problemSummary: "",
          resolutionStatus: "unknown",
        },
        qaFindings: [],
        sentiment: [],
        summary: {
          sessionTitle: "",
          text: "",
        },
        tags: [],
      },
      runId: "6001",
      sourceMessageHighWatermark: "9001",
      validationWarnings: [],
    });

    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "xy_wap_embed_logical_session",
        type: "update",
        values: expect.objectContaining({ qa_status: -1 }),
      }),
    );
  });

  it("deduplicates repeated dimension records within one analysis snapshot", async () => {
    const insertedValues: Array<{ table: string; values: Record<string, unknown> }> = [];
    const db = {
      insertInto: vi.fn((table: string) =>
        createInsertBuilder(async () => ({ insertId: 7001 }), {
          onValues: (values) => {
            insertedValues.push({
              table,
              values: values as Record<string, unknown>,
            });
          },
          table,
        })
      ),
      selectFrom: vi.fn((table: string) => {
        if (table === "xy_wap_embed_logical_session") {
          return createSelectBuilder([{ conversation_id: 301 }], table);
        }

        return createSelectBuilder([], table);
      }),
      updateTable: vi.fn(() =>
        createUpdateBuilder(async () => ({ numAffectedRows: 1n })),
      ),
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
        entities: [
          {
            confidence: 0.8,
            entityId: "41",
            entityName: "退款",
            evidenceMessageIds: ["9001"],
            sentiment: "negative",
          },
          {
            confidence: 0.6,
            entityId: "41",
            entityName: "退款",
            evidenceMessageIds: ["9002"],
            sentiment: "negative",
          },
        ],
        faqCandidates: [],
        intents: [
          {
            confidence: 0.7,
            evidenceMessageIds: ["9001"],
            intentCode: "refund",
            intentId: "31",
            intentLabel: "退款咨询",
          },
          {
            confidence: 0.5,
            evidenceMessageIds: ["9002"],
            intentCode: "refund",
            intentId: "31",
            intentLabel: "退款咨询",
          },
        ],
        problemResolution: {
          confidence: 0.8,
          evidence: [],
          evidenceMessageIds: ["9001"],
          problemDetected: true,
          problemSummary: "客户咨询退款",
          resolutionStatus: "unresolved",
        },
        qaFindings: [
          {
            confidence: 0.9,
            evidenceMessageIds: ["9001"],
            passed: false,
            reason: "未说明退款时效",
            ruleCode: "refund_sla",
            ruleName: "退款时效说明",
            severity: "high",
          },
          {
            confidence: 0.4,
            evidenceMessageIds: ["9002"],
            passed: false,
            reason: "重复输出",
            ruleCode: "refund_sla",
            ruleName: "退款时效说明",
            severity: "high",
          },
        ],
        sentiment: [],
        summary: {
          sessionTitle: "退款咨询",
          text: "客户咨询退款时效",
        },
        tags: [
          {
            confidence: 0.8,
            evidenceMessageIds: ["9001"],
            tagCode: "refund",
            tagId: "21",
            tagName: "退款",
          },
          {
            confidence: 0.5,
            evidenceMessageIds: ["9002"],
            tagCode: "refund",
            tagId: "21",
            tagName: "退款",
          },
        ],
      },
      runId: "6001",
      sourceMessageHighWatermark: "9002",
      validationWarnings: [],
    });

    expect(insertedValues.filter((entry) => entry.table === "xy_wap_embed_session_tag")).toHaveLength(1);
    expect(insertedValues.filter((entry) => entry.table === "xy_wap_embed_session_entity")).toHaveLength(1);
    expect(insertedValues.filter((entry) => entry.table === "xy_wap_embed_session_intent")).toHaveLength(1);
    expect(insertedValues.filter((entry) => entry.table === "xy_wap_embed_session_qa_finding")).toHaveLength(1);
  });

  it("marks logical sessions failed when published QA findings include failures", async () => {
    const operations: Array<{
      table: string;
      type: "insert" | "update";
      values?: Record<string, unknown>;
    }> = [];
    let nextInsertId = 7001;
    const db = {
      insertInto: vi.fn((table: string) =>
        createInsertBuilder(async () => ({ insertId: nextInsertId++ }), {
          onValues: (values) =>
            operations.push({ table, type: "insert", values }),
          table,
        }),
      ),
      selectFrom: vi.fn((table: string) =>
        createSelectBuilder(
          table === "xy_wap_embed_logical_session"
            ? [{ conversation_id: 301 }]
            : [],
          table,
        ),
      ),
      updateTable: vi.fn((table: string) =>
        createUpdateBuilder(async () => ({ numAffectedRows: 1n }), {
          onSet: (values) => operations.push({ table, type: "update", values }),
          table,
        }),
      ),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await repository.saveAnalysisResult({
      job: {
        analysisScope: "qaFindings",
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
          confidence: 0,
          evidence: [],
          evidenceMessageIds: [],
          problemDetected: false,
          problemSummary: "",
          resolutionStatus: "unknown",
        },
        qaFindings: [
          {
            confidence: 0.8,
            evidenceMessageIds: ["9001"],
            passed: false,
            reason: "未明确下一步",
            ruleCode: "clear_next_step",
            ruleName: "明确下一步",
            severity: "medium",
          },
        ],
        sentiment: [],
        summary: {
          sessionTitle: "",
          text: "",
        },
        tags: [],
      },
      runId: "6001",
      sourceMessageHighWatermark: "9001",
      validationWarnings: [],
    });

    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "xy_wap_embed_logical_session",
        type: "update",
        values: expect.objectContaining({ qa_status: 0 }),
      }),
    );
  });

  it("does not change qa_status when publishing classification-only results", async () => {
    const logicalSessionUpdates: Record<string, unknown>[] = [];
    let nextInsertId = 7001;
    const db = {
      insertInto: vi.fn((table: string) =>
        createInsertBuilder(async () => ({ insertId: nextInsertId++ }), { table }),
      ),
      selectFrom: vi.fn((table: string) =>
        createSelectBuilder(
          table === "xy_wap_embed_logical_session"
            ? [{ conversation_id: 301 }]
            : [],
          table,
        ),
      ),
      updateTable: vi.fn((table: string) =>
        createUpdateBuilder(async () => ({ numAffectedRows: 1n }), {
          onSet: (values) => {
            if (table === "xy_wap_embed_logical_session") {
              logicalSessionUpdates.push(values);
            }
          },
          table,
        }),
      ),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await repository.saveAnalysisResult({
      job: {
        analysisScope: "classification",
        attemptCount: 1,
        jobId: "job-1",
        maxAttempts: 3,
        mode: "manual_reanalyze",
        sessionId: "501",
        uid: 9001,
      },
      output: {
        actionItems: [],
        entities: [],
        faqCandidates: [],
        intents: [],
        problemResolution: {
          confidence: 0,
          evidence: [],
          evidenceMessageIds: [],
          problemDetected: false,
          problemSummary: "",
          resolutionStatus: "unknown",
        },
        qaFindings: [
          {
            confidence: 0.8,
            evidenceMessageIds: ["9001"],
            passed: false,
            reason: "未明确下一步",
            ruleCode: "clear_next_step",
            ruleName: "明确下一步",
            severity: "medium",
          },
        ],
        sentiment: [],
        summary: {
          sessionTitle: "",
          text: "",
        },
        tags: [],
      },
      runId: "6001",
      sourceMessageHighWatermark: "9001",
      validationWarnings: [],
    });

    expect(logicalSessionUpdates).toHaveLength(1);
    expect(logicalSessionUpdates[0]).not.toHaveProperty("qa_status");
  });

  it("does not write invalid classification ids to unsigned result columns", async () => {
    const insertValues: Array<{
      table: string;
      values: Record<string, unknown> | Record<string, unknown>[];
    }> = [];
    let nextInsertId = 7001;
    const db = {
      insertInto: vi.fn((table: string) =>
        createInsertBuilder(async () => ({ insertId: nextInsertId++ }), {
          onValues: (values) => insertValues.push({ table, values }),
          table,
        }),
      ),
      selectFrom: vi.fn((table: string) =>
        createSelectBuilder(
          table === "xy_wap_embed_logical_session"
            ? [{ conversation_id: 301 }]
            : [],
          table,
        ),
      ),
      updateTable: vi.fn((table: string) =>
        createUpdateBuilder(async () => ({ numAffectedRows: 1n }), { table }),
      ),
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
        entities: [
          {
            confidence: 0.8,
            entityName: "未配置实体",
            evidenceMessageIds: ["9202"],
          },
        ],
        faqCandidates: [],
        intents: [
          {
            confidence: 0.72,
            evidenceMessageIds: ["9202"],
            intentCode: "missing_intent",
            intentLabel: "未配置意图",
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
        sentiment: [],
        summary: {
          sessionTitle: "查物流",
          text: "已登记",
        },
        tags: [
          {
            confidence: 0.8,
            evidenceMessageIds: ["9001"],
            tagCode: "missing_tag",
            tagName: "未配置标签",
          },
        ],
      },
      runId: "6001",
      sourceMessageHighWatermark: "9001",
      validationWarnings: [],
    });

    expect(
      insertValues.some(
        (entry) => entry.table === "xy_wap_embed_session_entity",
      ),
    ).toBe(false);
    expect(
      insertValues.some(
        (entry) => entry.table === "xy_wap_embed_session_intent",
      ),
    ).toBe(false);
    expect(
      insertValues.some((entry) => entry.table === "xy_wap_embed_session_tag"),
    ).toBe(false);
  });

  it("writes insufficient-message manual reanalysis snapshots as final", async () => {
    const snapshotValues: Record<string, unknown>[] = [];
    let nextInsertId = 7001;
    const db = {
      insertInto: vi.fn((table: string) =>
        createInsertBuilder(async () => ({ insertId: nextInsertId++ }), {
          onValues: (values) => {
            if (table === "xy_wap_embed_session_insight_snapshot") {
              snapshotValues.push(values as Record<string, unknown>);
            }
          },
          table,
        }),
      ),
      selectFrom: vi.fn((table: string) =>
        createSelectBuilder(
          table === "xy_wap_embed_logical_session"
            ? [{ conversation_id: 301 }]
            : [],
          table,
        ),
      ),
      updateTable: vi.fn((table: string) =>
        createUpdateBuilder(async () => ({ numAffectedRows: 1n }), { table }),
      ),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await repository.saveAnalysisResult({
      job: {
        analysisScope: "all",
        attemptCount: 1,
        jobId: "job-1",
        maxAttempts: 3,
        mode: "manual_reanalyze",
        sessionId: "501",
        uid: 9001,
      },
      output: {
        actionItems: [],
        entities: [],
        faqCandidates: [],
        intents: [],
        problemResolution: {
          confidence: 0,
          evidence: [],
          evidenceMessageIds: [],
          problemDetected: false,
          problemSummary: "",
          resolutionStatus: "unknown",
          unresolvedReason: "",
        },
        qaFindings: [],
        sentiment: [],
        summary: {
          sessionTitle: "",
          text: "",
        },
        tags: [],
      },
      resultKind: "insufficient_messages",
      runId: "6001",
      sourceMessageHighWatermark: "9001",
      validationWarnings: [],
    });

    expect(snapshotValues[0]).toEqual(
      expect.objectContaining({
        phase: "final",
        status: "building",
      }),
    );
  });

  it("writes model-analysis manual reanalysis snapshots as final", async () => {
    const snapshotValues: Record<string, unknown>[] = [];
    let nextInsertId = 7001;
    const db = {
      insertInto: vi.fn((table: string) =>
        createInsertBuilder(async () => ({ insertId: nextInsertId++ }), {
          onValues: (values) => {
            if (table === "xy_wap_embed_session_insight_snapshot") {
              snapshotValues.push(values as Record<string, unknown>);
            }
          },
          table,
        }),
      ),
      selectFrom: vi.fn((table: string) =>
        createSelectBuilder(
          table === "xy_wap_embed_logical_session"
            ? [{ conversation_id: 301 }]
            : [],
          table,
        ),
      ),
      updateTable: vi.fn((table: string) =>
        createUpdateBuilder(async () => ({ numAffectedRows: 1n }), { table }),
      ),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await repository.saveAnalysisResult({
      job: {
        analysisScope: "all",
        attemptCount: 1,
        jobId: "job-1",
        maxAttempts: 3,
        mode: "manual_reanalyze",
        sessionId: "501",
        uid: 9001,
      },
      output: {
        actionItems: [],
        entities: [],
        faqCandidates: [],
        intents: [],
        problemResolution: {
          confidence: 0.7,
          evidence: [],
          evidenceMessageIds: ["9001"],
          problemDetected: true,
          problemSummary: "物流异常",
          resolutionStatus: "unresolved",
          unresolvedReason: "还未给出处理方案",
        },
        qaFindings: [],
        sentiment: [],
        summary: {
          sessionTitle: "查物流",
          text: "用户咨询物流异常",
        },
        tags: [],
      },
      resultKind: "model_analysis",
      runId: "6001",
      sourceMessageHighWatermark: "9001",
      validationWarnings: [],
    });

    expect(snapshotValues[0]).toEqual(
      expect.objectContaining({
        phase: "final",
        status: "building",
      }),
    );
  });

  it("marks live insufficient-message runs succeeded without publishing a snapshot", async () => {
    let analysisRunUpdate: UpdateBuilderStub | undefined;
    const db = {
      updateTable: vi.fn((table: string) =>
        createUpdateBuilder(async () => ({ numAffectedRows: 1n }), {
          onCreate: (builder) => {
            if (table === "xy_wap_embed_analysis_run") {
              analysisRunUpdate = builder;
            }
          },
          table,
        }),
      ),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await repository.markAnalysisRunSucceededWithoutSnapshot({
      reason: "AI有效消息数 2 低于最小分析消息数 5",
      runId: "6001",
    });

    expect(analysisRunUpdate?.setCalls[0]).toMatchObject({
      error_code: "INSUFFICIENT_MESSAGES",
      error_message: "AI有效消息数 2 低于最小分析消息数 5",
      status: "succeeded",
    });
    expect(analysisRunUpdate?.whereCalls).toContainEqual(["id", "=", 6001]);
  });

  it("marks live gate skipped runs succeeded without publishing a snapshot", async () => {
    let analysisRunUpdate: UpdateBuilderStub | undefined;
    const db = {
      updateTable: vi.fn((table: string) =>
        createUpdateBuilder(async () => ({ numAffectedRows: 1n }), {
          onCreate: (builder) => {
            if (table === "xy_wap_embed_analysis_run") {
              analysisRunUpdate = builder;
            }
          },
          table,
        }),
      ),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await repository.markAnalysisRunSucceededWithoutSnapshot({
      code: "LIVE_GATE_SKIPPED",
      reason: "新增内容没有实质变化",
      runId: "6002",
    });

    expect(analysisRunUpdate?.setCalls[0]).toMatchObject({
      error_code: "LIVE_GATE_SKIPPED",
      error_message: "新增内容没有实质变化",
      status: "succeeded",
    });
    expect(analysisRunUpdate?.whereCalls).toContainEqual(["id", "=", 6002]);
  });

  it("does not expose an empty current output when the session has no current snapshot", async () => {
    const db = {
      selectFrom: vi.fn((table: string) => {
        if (table === "xy_wap_embed_logical_session as session") {
          return createSelectBuilder(
            [
              {
                agent_message_count: 1,
                conversation_id: 301,
                current_snapshot_id: null,
                customer_message_count: 1,
                ended_at: null,
                generated_at: null,
                last_message_at: 1_780_245_500_000,
                message_count: 2,
                phase: null,
                problem_confidence: null,
                problem_detected: null,
                problem_summary: null,
                resolution_status: null,
                session_id: 501,
                started_at: 1_780_245_000_000,
                status: null,
                summary_session_title: null,
                summary_text: null,
                third_external_userid: "external-1",
                third_userid: "agent-1",
                unresolved_reason: null,
              },
            ],
            table,
          );
        }

        return createSelectBuilder([], table);
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(
      repository.getCurrentAnalysisOutput({
        sessionId: "501",
        uid: 9001,
      }),
    ).resolves.toBeUndefined();
  });

  it("loads the latest live gate skip record for the next gate prompt", async () => {
    let query: SelectBuilderStub | undefined;
    const db = {
      selectFrom: vi.fn((table: string) => {
        query = createSelectBuilder(
          [
            {
              error_message: "上一轮检查没有发现实质变化",
              source_message_to: 9004,
            },
          ],
          table,
        );
        return query;
      }),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(
      repository.getLatestLiveGateSkip({
        afterSourceMessageId: "9003",
        sessionId: "501",
        uid: 9001,
      }),
    ).resolves.toEqual({
      changeType: "no_material_change",
      reason: "上一轮检查没有发现实质变化",
      sourceMessageTo: "9004",
    });
    expect(query?.whereCalls).toContainEqual(["session_id", "=", 501]);
    expect(query?.whereCalls).toContainEqual(["mode", "=", "live"]);
    expect(query?.whereCalls).toContainEqual(["status", "=", "succeeded"]);
    expect(query?.whereCalls).toContainEqual([
      "error_code",
      "=",
      "LIVE_GATE_SKIPPED",
    ]);
    expect(query?.whereCalls).toContainEqual(["source_message_to", ">", 9003]);
    expect(query?.orderByCalls).toContainEqual(["id", "desc"]);
    expect(query?.limitCalls).toContain(1);
  });

  it("batches insight evidence rows into one insert after dimension rows are written", async () => {
    const insertValues: Array<{
      table: string;
      values: Record<string, unknown> | Record<string, unknown>[];
    }> = [];
    let nextInsertId = 7001;
    const db = {
      insertInto: vi.fn((table: string) =>
        createInsertBuilder(async () => ({ insertId: nextInsertId++ }), {
          onValues: (values) => insertValues.push({ table, values }),
          table,
        }),
      ),
      selectFrom: vi.fn((table: string) =>
        createSelectBuilder(
          table === "xy_wap_embed_insight_feature_config"
            ? [
                {
                  entity_enabled: 0,
                  insight_enabled: 1,
                  intent_enabled: 0,
                  label_enabled: 0,
                  last_enable_time: 1_780_300_000_000,
                  qa_enabled: 0,
                  todo_enabled: 0,
                  uid: 9001,
                },
              ]
            : [{ conversation_id: 301 }],
          table,
        ),
      ),
      updateTable: vi.fn((table: string) =>
        createUpdateBuilder(async () => ({ numAffectedRows: 1n }), { table }),
      ),
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
            entityId: "41",
            entityName: "商品",
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
            intentId: "31",
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
          sessionTitle: "查物流",
          text: "客户咨询物流",
        },
        tags: [
          {
            confidence: 0.77,
            evidenceMessageIds: ["9202"],
            tagCode: "logistics",
            tagId: "21",
            tagName: "物流咨询",
          },
        ],
      },
      runId: "8001",
      sourceMessageHighWatermark: "9202",
      validationWarnings: [],
    });

    const summaryInsert = insertValues.find(
      (entry) => entry.table === "xy_wap_embed_session_summary",
    );
    expect(summaryInsert?.values).not.toHaveProperty("confidence");
    const evidenceInserts = insertValues.filter(
      (entry) => entry.table === "xy_wap_embed_insight_evidence",
    );
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
    const actionInsert = insertValues.find(
      (entry) => entry.table === "xy_wap_embed_session_action_item",
    );
    expect(actionInsert?.values).toEqual(
      expect.objectContaining({
        conversation_id: 301,
        session_id: 501,
        snapshot_id: 7001,
        source_type: "ai",
      }),
    );
    expect(evidenceInserts).toHaveLength(1);
    expect(evidenceInserts[0]?.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dimension_type: "problem_resolution",
          source_message_id: 9200,
        }),
        expect.objectContaining({
          dimension_type: "action_item",
          source_message_id: 9201,
        }),
        expect.objectContaining({
          dimension_type: "entity",
          source_message_id: 9202,
        }),
      ]),
    );
  });

  it("deduplicates repeated evidence rows before inserting analysis results", async () => {
    let evidenceInsert: InsertBuilderStub | undefined;
    const evidenceValues: unknown[] = [];
    let insertId = 7000;
    const db = {
      insertInto: vi.fn((table: string) =>
        createInsertBuilder(async () => ({ insertId: ++insertId }), {
          onCreate: (builder) => {
            if (table === "xy_wap_embed_insight_evidence") {
              evidenceInsert = builder;
            }
          },
          onValues: (values) => {
            if (table === "xy_wap_embed_insight_evidence") {
              evidenceValues.push(
                ...(Array.isArray(values) ? values : [values]),
              );
            }
          },
          table,
        }),
      ),
      selectFrom: vi.fn((table: string) => {
        if (table === "xy_wap_embed_logical_session") {
          return createSelectBuilder([{ conversation_id: 301 }], table);
        }

        return createSelectBuilder([], table);
      }),
      updateTable: vi.fn(() =>
        createUpdateBuilder(async () => ({ numAffectedRows: 1n })),
      ),
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
            {
              evidenceRole: "customer_problem",
              messageId: "9200",
              reason: "客户反馈物流异常",
            },
            {
              evidenceRole: "customer_problem",
              messageId: "9200",
              reason: "客户反馈物流异常",
            },
          ],
          problemDetected: true,
          problemSummary: "物流延迟",
          resolutionStatus: "unresolved",
        },
        qaFindings: [],
        sentiment: [],
        summary: {
          sessionTitle: "查物流",
          text: "客户咨询物流",
        },
        tags: [],
      },
      runId: "8001",
      sourceMessageHighWatermark: "9200",
      validationWarnings: [],
    });

    expect(evidenceValues).toHaveLength(1);
    expect(evidenceValues[0]).toEqual(
      expect.objectContaining({
        dimension_type: "problem_resolution",
        evidence_role: "customer_problem",
        source_message_id: 9200,
      }),
    );
    expect(evidenceInsert?.ignoreCalls).toBe(1);
  });

  it("scopes logical session count updates to the current uid", async () => {
    let logicalSessionUpdate: UpdateBuilderStub | undefined;
    const db = {
      insertInto: vi.fn(() =>
        createInsertBuilder(async () => ({ insertId: 1 })),
      ),
      updateTable: vi.fn((table: string) =>
        createUpdateBuilder(async () => ({ numAffectedRows: 1n }), {
          onCreate: (builder) => {
            if (table === "xy_wap_embed_logical_session") {
              logicalSessionUpdate = builder;
            }
          },
          table,
        }),
      ),
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

  it("stores asset references when appending asset session messages", async () => {
    const insertValues: Array<{ table: string; values: Record<string, unknown> }> = [];
    const duplicateUpdates: Array<{ table: string; values: Record<string, unknown> }> = [];
    let logicalSessionUpdate: UpdateBuilderStub | undefined;
    const db = {
      insertInto: vi.fn((table: string) =>
        createInsertBuilder(
          async () => table === "xy_wap_embed_insight_asset"
            ? { insertId: 701n, numInsertedOrUpdatedRows: 1n }
            : { insertId: 801n, numInsertedOrUpdatedRows: 1n },
          {
            onValues: (values) => insertValues.push({
              table,
              values: values as Record<string, unknown>,
            }),
            onDuplicateKeyUpdate: (values) => duplicateUpdates.push({
              table,
              values,
            }),
            table,
          },
        ),
      ),
      updateTable: vi.fn((table: string) =>
        createUpdateBuilder(async () => ({ numAffectedRows: 1n }), {
          onCreate: (builder) => {
            if (table === "xy_wap_embed_logical_session") {
              logicalSessionUpdate = builder;
            }
          },
          table,
        }),
      ),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await repository.appendSessionMessage({
      asset: {
        key: "https://example.test/promo",
        name: "红包活动",
        type: "link",
      },
      conversationId: "301",
      includedForAi: true,
      meaningfulForBoundary: true,
      messageType: "link",
      occurredAt: 1_780_244_000_000,
      senderRole: "customer",
      sessionId: "501",
      sourceMessageId: "9001",
      sourceMessageTime: 1_780_244_000_000,
      uid: 9001,
    });

    expect(insertValues).toEqual([
      expect.objectContaining({
        table: "xy_wap_embed_insight_asset",
        values: expect.objectContaining({
          asset_key: "https://example.test/promo",
          asset_name: "红包活动",
          asset_type: "link",
          last_seen_at: 1_780_244_000_000,
          uid: 9001,
        }),
      }),
      expect.objectContaining({
        table: "xy_wap_embed_logical_session_message",
        values: expect.objectContaining({
          asset_id: 701,
          asset_type: "link",
          message_type: "link",
          source_message_id: 9001,
        }),
      }),
    ]);
    expect(duplicateUpdates).toEqual([
      {
        table: "xy_wap_embed_insight_asset",
        values: {
          last_seen_at: 1_780_244_000_000,
        },
      },
    ]);
    expect(logicalSessionUpdate?.whereCalls).toContainEqual(["id", "=", 501]);
  });

  it("loads the existing asset id when duplicate asset upsert does not return an insert id", async () => {
    const insertValues: Array<{ table: string; values: Record<string, unknown> }> = [];
    const selectBuilders: SelectBuilderStub[] = [];
    const db = {
      insertInto: vi.fn((table: string) =>
        createInsertBuilder(
          async () => table === "xy_wap_embed_insight_asset"
            ? { numInsertedOrUpdatedRows: 2n }
            : { insertId: 801n, numInsertedOrUpdatedRows: 1n },
          {
            onValues: (values) => insertValues.push({
              table,
              values: values as Record<string, unknown>,
            }),
            table,
          },
        ),
      ),
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder([{ id: 702n }], table);
        selectBuilders.push(builder);
        return builder;
      }),
      updateTable: vi.fn((table: string) =>
        createUpdateBuilder(async () => ({ numAffectedRows: 1n }), { table }),
      ),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await repository.appendSessionMessage({
      asset: {
        key: "file-serial-1",
        name: "报价单.pdf",
        type: "file",
      },
      conversationId: "301",
      includedForAi: true,
      meaningfulForBoundary: true,
      messageType: "file",
      occurredAt: 1_780_244_000_000,
      senderRole: "agent",
      sessionId: "501",
      sourceMessageId: "9002",
      sourceMessageTime: 1_780_244_000_000,
      uid: 9001,
    });

    expect(selectBuilders[0]?.table).toBe("xy_wap_embed_insight_asset");
    expect(selectBuilders[0]?.whereCalls).toContainEqual(["uid", "=", 9001]);
    expect(selectBuilders[0]?.whereCalls).toContainEqual(["asset_type", "=", "file"]);
    expect(selectBuilders[0]?.whereCalls).toContainEqual(["asset_key", "=", "file-serial-1"]);
    expect(insertValues).toContainEqual(
      expect.objectContaining({
        table: "xy_wap_embed_logical_session_message",
        values: expect.objectContaining({
          asset_id: 702,
          asset_type: "file",
          source_message_id: 9002,
        }),
      }),
    );
  });
});

type SelectBuilderStub = ReturnType<typeof createSelectBuilder>;
type DeleteBuilderStub = ReturnType<typeof createDeleteBuilder>;
type InsertBuilderStub = ReturnType<typeof createInsertBuilder>;
type UpdateBuilderStub = ReturnType<typeof createUpdateBuilder>;

function createSelectBuilder(rows: unknown[], table = "") {
  const builder = {
    alias: undefined as string | undefined,
    joins: [] as string[],
    joinConditions: [] as Array<{ left: string; right: string; table: string }>,
    forUpdateCalls: 0,
    groupByCalls: [] as unknown[][],
    havingRawCalls: [] as string[],
    limitCalls: [] as number[],
    offsetCalls: [] as number[],
    orderByCalls: [] as unknown[][],
    skipLockedCalls: 0,
    table,
    whereRawCalls: [] as string[],
    selectRawCalls: [] as string[],
    whereCalls: [] as unknown[][],
    whereRefCalls: [] as unknown[][],
    $call: (callback: (query: typeof builder) => typeof builder) =>
      callback(builder),
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
    having: (...args: unknown[]) => {
      builder.havingRawCalls.push(args.map(String).join("\n"));
      return builder;
    },
    innerJoin: (joinTable: string, left?: unknown, right?: unknown) => {
      builder.joins.push(joinTable);
      if (typeof left === "string" && typeof right === "string") {
        builder.joinConditions.push({
          left,
          right,
          table: joinTable,
        });
      }
      return builder;
    },
    as: (alias: string) => {
      builder.alias = alias;
      return builder;
    },
    leftJoin: (
      joinTable:
        | string
        | ((eb: { selectFrom: (table: string) => SelectBuilderStub }) => {
            alias?: string;
            table?: string;
          }),
    ) => {
      if (typeof joinTable === "function") {
        const joined = joinTable({
          selectFrom: (table: string) => createSelectBuilder([], table),
        });
        builder.joins.push(joined.alias ?? joined.table ?? "derived");
        return builder;
      }

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
      builder.selectRawCalls.push(args.map(readRawSql).join("\n"));
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
        builder.whereRawCalls.push(readRawSql(args[0]));
      }

      builder.whereCalls.push(args);
      return builder;
    },
    whereRef: (...args: unknown[]) => {
      builder.whereRefCalls.push(args);
      return builder;
    },
  };

  return builder;
}

function readRawSql(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(readRawSql).join(",");
  }

  if (
    value &&
    typeof value === "object" &&
    "toOperationNode" in value &&
    typeof value.toOperationNode === "function"
  ) {
    const node = value.toOperationNode() as {
      sqlFragments?: readonly string[];
    };
    return node.sqlFragments?.join("?") ?? JSON.stringify(node);
  }

  return String(value);
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
    execute: async <T>(callback: (trx: typeof db) => Promise<T>) =>
      callback(db),
  };
}

function createInsertBuilder(
  executeTakeFirstOrThrow: () => Promise<unknown>,
  options: {
    onDuplicateKeyUpdate?: (values: Record<string, unknown>) => void;
    onCreate?: (builder: InsertBuilderStub) => void;
    onValues?: (
      values: Record<string, unknown> | Record<string, unknown>[],
    ) => void;
    table?: string;
  } = {},
) {
  const builder = {
    columnsCalls: [] as string[][],
    executeTakeFirst: executeTakeFirstOrThrow,
    executeTakeFirstOrThrow,
    execute: async () => [await executeTakeFirstOrThrow()],
    expressionCalls: 0,
    ignoreCalls: 0,
    valuesCalls: [] as Array<Record<string, unknown> | Record<string, unknown>[]>,
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
    onDuplicateKeyUpdate: (values: Record<string, unknown>) => {
      options.onDuplicateKeyUpdate?.(values);
      return builder;
    },
    values: (values: Record<string, unknown>) => {
      builder.valuesCalls.push(values);
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
        builder.whereRawCalls.push(readRawSql(args[0]));
      }
      builder.whereCalls.push(args);
      return builder;
    },
  };

  options.onCreate?.(builder);

  return builder;
}
