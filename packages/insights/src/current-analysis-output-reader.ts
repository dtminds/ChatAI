import type { Database } from "@chatai/database";
import type { Kysely } from "kysely";
import type { InsightAnalysisOutput } from "./insights-worker.js";

type EvidenceRow = {
  dimension_record_id: number | string | null;
  dimension_type: string;
  evidence_role: string;
  reason: string | null;
  source_message_id: number | string;
};

export async function readCurrentAnalysisOutput(
  db: Kysely<Database>,
  input: { sessionId: string; uid: number },
): Promise<InsightAnalysisOutput | undefined> {
  const sessionId = parsePositiveInteger(input.sessionId);

  if (sessionId == null) {
    return undefined;
  }

  const current = await db
    .selectFrom("xy_wap_embed_logical_session as session")
    .leftJoin("xy_wap_embed_session_insight_snapshot as snapshot", (join) =>
      join.onRef("snapshot.id", "=", "session.current_snapshot_id"),
    )
    .leftJoin("xy_wap_embed_session_summary as summary", (join) =>
      join.onRef("summary.snapshot_id", "=", "snapshot.id"),
    )
    .leftJoin("xy_wap_embed_session_problem_resolution as problem", (join) =>
      join.onRef("problem.snapshot_id", "=", "snapshot.id"),
    )
    .select([
      "session.current_snapshot_id as current_snapshot_id",
      "problem.confidence as problem_confidence",
      "problem.problem_detected as problem_detected",
      "problem.problem_summary as problem_summary",
      "problem.resolution_status as resolution_status",
      "problem.unresolved_reason as unresolved_reason",
      "snapshot.source_message_high_watermark as source_message_high_watermark",
      "summary.session_title as summary_session_title",
      "summary.summary_text as summary_text",
    ])
    .where("session.uid", "=", input.uid)
    .where("session.id", "=", sessionId)
    .executeTakeFirst();

  const snapshotId = parsePositiveInteger(current?.current_snapshot_id ?? undefined);

  if (!current || snapshotId == null) {
    return undefined;
  }

  const [
    evidence,
    actionItems,
    entities,
    faqCandidates,
    intents,
    qaFindings,
    sentiment,
    tags,
  ] = await Promise.all([
    db
      .selectFrom("xy_wap_embed_insight_evidence")
      .select([
        "dimension_record_id",
        "dimension_type",
        "evidence_role",
        "reason",
        "source_message_id",
      ])
      .where("uid", "=", input.uid)
      .where("session_id", "=", sessionId)
      .where("snapshot_id", "=", snapshotId)
      .execute() as Promise<EvidenceRow[]>,
    db
      .selectFrom("xy_wap_embed_session_action_item")
      .select(["id", "priority", "title"])
      .where("uid", "=", input.uid)
      .where("snapshot_id", "=", snapshotId)
      .where("source_type", "=", "ai")
      .where("status", "!=", "deleted")
      .execute(),
    db
      .selectFrom("xy_wap_embed_session_entity")
      .select(["entity_id", "entity_name", "id", "sentiment"])
      .where("snapshot_id", "=", snapshotId)
      .execute(),
    db
      .selectFrom("xy_wap_embed_session_faq_candidate")
      .select(["answer_hint", "id", "question", "status"])
      .where("snapshot_id", "=", snapshotId)
      .execute(),
    db
      .selectFrom("xy_wap_embed_session_intent")
      .select(["confidence", "id", "intent_id", "intent_label"])
      .where("snapshot_id", "=", snapshotId)
      .execute(),
    db
      .selectFrom("xy_wap_embed_session_qa_finding")
      .select(["id", "passed", "reason", "rule_code", "rule_name", "severity"])
      .where("snapshot_id", "=", snapshotId)
      .execute(),
    db
      .selectFrom("xy_wap_embed_session_sentiment")
      .select(["confidence", "id", "polarity", "reason"])
      .where("snapshot_id", "=", snapshotId)
      .execute(),
    db
      .selectFrom("xy_wap_embed_session_tag")
      .select(["confidence", "id", "tag_id", "tag_name"])
      .where("snapshot_id", "=", snapshotId)
      .execute(),
  ]);

  const problemEvidence = evidenceForType(evidence, "problem_resolution");

  return {
    actionItems: actionItems.map((item) => ({
      evidenceMessageIds: evidenceForDimension(evidence, "action_item", item.id),
      priority: normalizePriority(item.priority),
      title: item.title,
    })),
    entities: entities.map((item) => ({
      confidence: 1,
      entityId: String(item.entity_id),
      entityName: item.entity_name,
      evidenceMessageIds: evidenceForDimension(evidence, "entity", item.id),
      sentiment: item.sentiment ?? undefined,
    })),
    faqCandidates: faqCandidates.map((item) => ({
      answerHint: item.answer_hint,
      evidenceMessageIds: evidenceForDimension(evidence, "faq_candidate", item.id),
      question: item.question,
      status: item.status,
    })),
    intents: intents.map((item) => ({
      confidence: parseConfidence(item.confidence),
      evidenceMessageIds: evidenceForDimension(evidence, "intent", item.id),
      intentId: String(item.intent_id),
      intentLabel: item.intent_label,
    })),
    problemResolution: {
      confidence: current.problem_confidence == null
        ? 1
        : parseConfidence(current.problem_confidence),
      evidence: evidence
        .filter((item) => item.dimension_type === "problem_resolution")
        .map((item) => ({
          evidenceRole: item.evidence_role,
          messageId: String(item.source_message_id),
          reason: item.reason ?? undefined,
        })),
      evidenceMessageIds: problemEvidence,
      problemDetected: Number(current.problem_detected) === 1,
      problemSummary: current.problem_summary ?? "",
      resolutionStatus: normalizeResolutionStatus(current.resolution_status),
      unresolvedReason: current.unresolved_reason ?? undefined,
    },
    qaFindings: qaFindings.map((item) => ({
      confidence: 1,
      evidenceMessageIds: evidenceForDimension(evidence, "qa_finding", item.id),
      passed: Number(item.passed) === 1,
      reason: item.reason,
      ruleCode: item.rule_code,
      ruleName: item.rule_name,
      severity: normalizeSeverity(item.severity),
    })),
    sentiment: sentiment.map((item) => ({
      confidence: parseConfidence(item.confidence),
      evidenceMessageIds: evidenceForDimension(evidence, "sentiment", item.id),
      polarity: normalizePolarity(item.polarity),
      reason: item.reason,
    })),
    summary: {
      sessionTitle: current.summary_session_title ?? "",
      text: current.summary_text ?? "",
    },
    sourceMessageHighWatermark: current.source_message_high_watermark == null
      ? null
      : String(current.source_message_high_watermark),
    tags: tags.map((item) => ({
      confidence: parseConfidence(item.confidence),
      evidenceMessageIds: evidenceForDimension(evidence, "tag", item.id),
      tagId: String(item.tag_id),
      tagName: item.tag_name,
    })),
  };
}

function evidenceForDimension(
  rows: EvidenceRow[],
  dimensionType: string,
  dimensionRecordId: number | string | null,
) {
  const recordId = dimensionRecordId == null ? null : String(dimensionRecordId);

  return Array.from(new Set(
    rows
      .filter((row) => row.dimension_type === dimensionType)
      .filter((row) =>
        recordId == null
          ? row.dimension_record_id == null
          : String(row.dimension_record_id) === recordId,
      )
      .map((row) => String(row.source_message_id)),
  )).sort((left, right) => Number(left) - Number(right));
}

function evidenceForType(rows: EvidenceRow[], dimensionType: string) {
  return Array.from(new Set(
    rows
      .filter((row) => row.dimension_type === dimensionType)
      .map((row) => String(row.source_message_id)),
  )).sort((left, right) => Number(left) - Number(right));
}

function normalizePriority(value: string): "high" | "low" | "medium" {
  return value === "high" || value === "low" || value === "medium"
    ? value
    : "medium";
}

function normalizeResolutionStatus(value: string | null) {
  if (
    value === "resolved" ||
    value === "unresolved" ||
    value === "partially_resolved" ||
    value === "no_customer_problem" ||
    value === "unknown"
  ) {
    return value;
  }

  return "unknown";
}

function normalizeSeverity(value: string): "high" | "low" | "medium" {
  return value === "high" || value === "medium" ? value : "low";
}

function normalizePolarity(value: string) {
  if (
    value === "positive" ||
    value === "neutral" ||
    value === "negative" ||
    value === "mixed" ||
    value === "unknown"
  ) {
    return value;
  }

  return "unknown";
}

function parseConfidence(value: number | string | null) {
  if (value == null) {
    return 0;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parsePositiveInteger(value: number | string | undefined) {
  if (value == null) {
    return undefined;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
