import { describe, expect, it, vi } from "vitest";
import { readCurrentAnalysisOutput } from "../src/current-analysis-output-reader.js";

function createSelectBuilder(rows: unknown[]) {
  const whereCalls: unknown[][] = [];
  const builder = {
    execute: vi.fn(async () => rows),
    executeTakeFirst: vi.fn(async () => rows[0]),
    leftJoin: vi.fn(() => builder),
    select: vi.fn(() => builder),
    where: vi.fn((...args: unknown[]) => {
      whereCalls.push(args);
      return builder;
    }),
    whereCalls,
  };
  return builder;
}

describe("readCurrentAnalysisOutput", () => {
  it("reconstructs the current snapshot without Backend API hydration", async () => {
    const builders = new Map<string, ReturnType<typeof createSelectBuilder>>();
    const rowsByTable: Record<string, unknown[]> = {
      "xy_wap_embed_logical_session as session": [{
        current_snapshot_id: 7001,
        problem_confidence: "0.9000",
        problem_detected: 1,
        problem_summary: "物流延迟",
        resolution_status: "unresolved",
        source_message_high_watermark: 9203,
        summary_session_title: "查询物流",
        summary_text: "客户咨询物流进度",
        unresolved_reason: "等待物流更新",
      }],
      xy_wap_embed_insight_evidence: [
        { dimension_record_id: null, dimension_type: "problem_resolution", evidence_role: "customer_problem", reason: "客户反馈未收到", source_message_id: 9201 },
        { dimension_record_id: 88, dimension_type: "problem_resolution", evidence_role: "resolution", reason: "客服已催促物流", source_message_id: 9202 },
        { dimension_record_id: 7901, dimension_type: "action_item", evidence_role: "primary", reason: null, source_message_id: 9203 },
        { dimension_record_id: 31, dimension_type: "intent", evidence_role: "primary", reason: null, source_message_id: 9202 },
        { dimension_record_id: 41, dimension_type: "entity", evidence_role: "primary", reason: null, source_message_id: 9201 },
        { dimension_record_id: 51, dimension_type: "faq_candidate", evidence_role: "primary", reason: null, source_message_id: 9202 },
        { dimension_record_id: 61, dimension_type: "qa_finding", evidence_role: "primary", reason: null, source_message_id: 9203 },
        { dimension_record_id: 71, dimension_type: "sentiment", evidence_role: "primary", reason: null, source_message_id: 9201 },
        { dimension_record_id: 81, dimension_type: "tag", evidence_role: "primary", reason: null, source_message_id: 9202 },
      ],
      xy_wap_embed_session_action_item: [{ id: 7901, priority: "high", title: "跟进物流" }],
      xy_wap_embed_session_entity: [{ entity_id: 4101, entity_name: "物流", id: 41, sentiment: "negative" }],
      xy_wap_embed_session_faq_candidate: [{ answer_hint: "查询运单", id: 51, question: "如何查询物流", status: "candidate" }],
      xy_wap_embed_session_intent: [{ confidence: "0.7200", id: 31, intent_id: 3101, intent_label: "物流异常" }],
      xy_wap_embed_session_qa_finding: [{ id: 61, passed: 0, reason: "未告知时效", rule_code: "follow_up", rule_name: "跟进明确", severity: "high" }],
      xy_wap_embed_session_sentiment: [{ confidence: "0.8100", id: 71, polarity: "negative", reason: "客户催促" }],
      xy_wap_embed_session_tag: [{ confidence: "0.6600", id: 81, tag_id: 8101, tag_name: "物流关注" }],
    };
    const db = {
      selectFrom: vi.fn((table: string) => {
        const builder = createSelectBuilder(rowsByTable[table] ?? []);
        builders.set(table, builder);
        return builder;
      }),
    };

    await expect(readCurrentAnalysisOutput(db as never, {
      sessionId: "501",
      uid: 9001,
    })).resolves.toEqual({
      actionItems: [{
        evidenceMessageIds: ["9203"],
        priority: "high",
        title: "跟进物流",
      }],
      entities: [{
        confidence: 1,
        entityId: "4101",
        entityName: "物流",
        evidenceMessageIds: ["9201"],
        sentiment: "negative",
      }],
      faqCandidates: [{
        answerHint: "查询运单",
        evidenceMessageIds: ["9202"],
        question: "如何查询物流",
        status: "candidate",
      }],
      intents: [{
        confidence: 0.72,
        evidenceMessageIds: ["9202"],
        intentId: "3101",
        intentLabel: "物流异常",
      }],
      problemResolution: {
        confidence: 0.9,
        evidence: [{
          evidenceRole: "customer_problem",
          messageId: "9201",
          reason: "客户反馈未收到",
        }, {
          evidenceRole: "resolution",
          messageId: "9202",
          reason: "客服已催促物流",
        }],
        evidenceMessageIds: ["9201", "9202"],
        problemDetected: true,
        problemSummary: "物流延迟",
        resolutionStatus: "unresolved",
        unresolvedReason: "等待物流更新",
      },
      qaFindings: [{
        confidence: 1,
        evidenceMessageIds: ["9203"],
        passed: false,
        reason: "未告知时效",
        ruleCode: "follow_up",
        ruleName: "跟进明确",
        severity: "high",
      }],
      sentiment: [{
        confidence: 0.81,
        evidenceMessageIds: ["9201"],
        polarity: "negative",
        reason: "客户催促",
      }],
      sourceMessageHighWatermark: "9203",
      summary: {
        sessionTitle: "查询物流",
        text: "客户咨询物流进度",
      },
      tags: [{
        confidence: 0.66,
        evidenceMessageIds: ["9202"],
        tagId: "8101",
        tagName: "物流关注",
      }],
    });

    expect(builders.get("xy_wap_embed_logical_session as session")?.whereCalls)
      .toEqual(expect.arrayContaining([
        ["session.uid", "=", 9001],
        ["session.id", "=", 501],
      ]));
    expect(builders.get("xy_wap_embed_insight_evidence")?.whereCalls)
      .toEqual(expect.arrayContaining([
        ["uid", "=", 9001],
        ["session_id", "=", 501],
        ["snapshot_id", "=", 7001],
      ]));
    expect(builders.get("xy_wap_embed_session_action_item")?.whereCalls)
      .toEqual(expect.arrayContaining([
        ["uid", "=", 9001],
        ["snapshot_id", "=", 7001],
      ]));
  });

  it("returns no output when the session has no current snapshot", async () => {
    const db = {
      selectFrom: vi.fn(() => createSelectBuilder([{ current_snapshot_id: null }])),
    };

    await expect(readCurrentAnalysisOutput(db as never, {
      sessionId: "501",
      uid: 9001,
    })).resolves.toBeUndefined();
  });
});
