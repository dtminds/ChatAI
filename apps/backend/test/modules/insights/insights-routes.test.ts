import { describe, expect, it } from "vitest";
import { buildMockedApp } from "../../helpers/build-mocked-app";

describe("insights routes", () => {
  it("serves authenticated P0 insight data and commands", async () => {
    const { app, authorization, db } = await createInsightsApp("operator");

    const overview = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/insights/overview",
    });
    const quality = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/insights/quality",
    });
    const followUps = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/insights/follow-ups?status=open",
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
    const rescan = await app.inject({
      headers: {
        authorization,
        "x-workbench-client": "chat-ai-ui",
      },
      method: "POST",
      payload: { from: "2026-06-01T00:00:00.000Z" },
      url: "/api/server/insights/jobs/rescan",
    });

    expect(overview.statusCode).toBe(200);
    expect(overview.json()).toMatchObject({
      data: {
        actionItemsOpen: 1,
        totalSessions: 1,
        unresolvedSessions: 1,
      },
      success: true,
    });
    expect(quality.statusCode).toBe(200);
    expect(quality.json().data.unresolvedSessions[0]).toMatchObject({
      conversationId: "301",
      evidenceMessageIds: ["9001", "9002"],
      sessionId: "501",
    });
    expect(followUps.statusCode).toBe(200);
    expect(followUps.json().data.items).toHaveLength(1);
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
    expect(rescan.statusCode).toBe(200);
    expect(rescan.json()).toMatchObject({
      data: {
        status: "accepted",
      },
      success: true,
    });
    expect(db.updatedActionStatus).toMatchObject({ id: 801, status: "done" });
    expect(db.insertedJob).toMatchObject({
      idempotency_key: "rescan:9001:2026-06-01T00:00:00.000Z",
      job_type: "sync_messages",
      uid: 9001,
    });

    await app.close();
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
        sessionization: {
          idleTimeoutMinutes: 120,
        },
      },
      success: true,
    });
  });
});

async function createInsightsApp(role: "admin" | "operator" | "owner" | "viewer") {
  const app = await buildMockedApp();
  const token = app.jwt.sign({
    roles: [role],
    sessionId: "501",
    sessionVersion: 1,
    subUserId: "1",
  });
  const db = createInsightsDbMock();

  app.db = db as never;

  return {
    app,
    authorization: `Bearer ${token}`,
    db,
  };
}

function createInsightsDbMock() {
  const state = {
    insertedJob: undefined as Record<string, unknown> | undefined,
    updatedActionStatus: undefined as { id: number | undefined; status: string | undefined } | undefined,
    insertInto(table: string) {
      if (table !== "xy_wap_embed_insight_job") {
        throw new Error(`Unexpected insert table: ${table}`);
      }

      const builder = {
        executeTakeFirstOrThrow: async () => ({ insertId: 8801 }),
        values: (values: Record<string, unknown>) => {
          state.insertedJob = values;
          return builder;
        },
      };

      return builder;
    },
    selectFrom(table: string) {
      const wheres: Array<[string, string, unknown]> = [];
      const joins: Array<{ conditions: Array<[string, string, unknown]>; table: string }> = [];

      function createBuilder(result: unknown[]) {
        const builder = {
          execute: async () => result,
          executeTakeFirst: async () => result[0],
          groupBy: () => builder,
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
          limit: () => builder,
          orderBy: () => builder,
          select: () => builder,
          where: (column: string, operator: string, value: unknown) => {
            wheres.push([column, operator, value]);
            return builder;
          },
        };

        return builder;
      }

      if (table === "xy_wap_embed_sub_user_session") {
        return createBuilder([
          {
            expires_at: new Date(Date.now() + 1000),
            id: "501",
            refresh_token_hash: "hash",
            revoked_at: null,
            session_version: 1,
            sub_user_id: "1",
          },
        ]);
      }

      if (table === "xy_wap_embed_sub_user") {
        return createBuilder([
          {
            id: 1,
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
            rule_fallback_enabled: 1,
          },
        ]);
      }

      if (table === "xy_wap_embed_insight_label_config") {
        return createBuilder([
          {
            description: null,
            enabled: 1,
            id: 1,
            include_in_statistics: 1,
            label_code: "price_sensitive",
            label_name: "价格敏感",
            negative_examples_json: null,
            positive_examples_json: null,
          },
        ]);
      }

      if (table === "xy_wap_embed_insight_qa_rule_config") {
        return createBuilder([
          {
            applicable_scene: null,
            description: null,
            enabled: 1,
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
        return createBuilder([
          {
            aliases_json: JSON.stringify(["白鸭绒外套"]),
            attributes_json: null,
            canonical_name: "白色羽绒服",
            enabled: 1,
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
        return createBuilder([
          {
            action_id: 801,
            action_priority: "high",
            action_status: "open",
            action_title: "确认快递状态",
            action_type: "logistics_check",
            agent_name: "客服一号",
            agent_seat_id: 11,
            conversation_id: 301,
            current_snapshot_id: 7001,
            customer_name: "张三",
            ended_at: 1_780_245_000_000,
            evidence_message_id: 9002,
            evidence_role: "primary",
            high_risk_id: 601,
            last_customer_message_at: 1_780_244_100_000,
            negative_risk_id: 601,
            phase: "final",
            problem_detected: 1,
            problem_summary: "客户反馈物流异常",
            qa_finding_id: 701,
            qa_passed: 0,
            qa_reason: "未确认物流进展",
            qa_rule_code: "problem_resolution",
            resolution_status: "unresolved",
            risk_id: 601,
            risk_level: "high",
            risk_severity: "high",
            risk_type: "bad_review",
            session_id: 501,
            started_at: 1_780_243_200_000,
            status: "ready",
            summary_customer_intent: "查物流",
            summary_follow_up: "确认快递状态",
            summary_process: "客服要求客户等待",
            summary_result: "未确认物流进展",
            unresolved_reason: "售后/物流/退款进度未确认",
          },
          {
            action_id: 801,
            action_priority: "high",
            action_status: "open",
            action_title: "确认快递状态",
            action_type: "logistics_check",
            agent_name: "客服一号",
            agent_seat_id: 11,
            conversation_id: 301,
            current_snapshot_id: 7001,
            customer_name: "张三",
            ended_at: 1_780_245_000_000,
            evidence_message_id: 9001,
            evidence_role: "supporting",
            high_risk_id: 601,
            last_customer_message_at: 1_780_244_000_000,
            negative_risk_id: 601,
            phase: "final",
            problem_detected: 1,
            problem_summary: "客户反馈物流异常",
            qa_finding_id: 701,
            qa_passed: 0,
            qa_reason: "未确认物流进展",
            qa_rule_code: "problem_resolution",
            resolution_status: "unresolved",
            risk_id: 601,
            risk_level: "high",
            risk_severity: "high",
            risk_type: "bad_review",
            session_id: 501,
            started_at: 1_780_243_200_000,
            status: "ready",
            summary_customer_intent: "查物流",
            summary_follow_up: "确认快递状态",
            summary_process: "客服要求客户等待",
            summary_result: "未确认物流进展",
            unresolved_reason: "售后/物流/退款进度未确认",
          },
        ]);
      }

      if (table === "xy_wap_embed_session_action_item as action") {
        return createBuilder([
          {
            action_id: 801,
            action_status: "open",
            action_type: "logistics_check",
            conversation_id: 301,
            customer_name: "张三",
            evidence_message_id: 9002,
            last_customer_message_at: 1_780_244_100_000,
            priority: "high",
            reason: "物流进度未确认",
            session_id: 501,
            title: "确认快递状态",
          },
        ]);
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
            tag_code: "logistics_issue",
            tag_name: "物流异常",
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
          },
        ]);
      }

      if (table === "xy_wap_embed_session_entity as entity") {
        return createBuilder([
          {
            entity_id: "sku-1",
            entity_name: "白色羽绒服",
            entity_type: "product",
            mention_count: 2,
            negative_count: 1,
            risk_session_count: 1,
            session_count: 1,
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
          },
        ]);
      }

      if (table === "xy_wap_embed_session_intent as intent") {
        return createBuilder([
          {
            count: 1,
            intent_code: "logistics_delay",
            intent_label: "物流异常",
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
          },
        ]);
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
