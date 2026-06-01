import type {
  InsightActionStatus,
  InsightAnalysisStatus,
  InsightDetailResponse,
} from "@chatai/contracts";
import { sql, type Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import type {
  InsightActionItemRow,
  InsightCurrentSessionRow,
  InsightDetailRow,
  InsightEvidenceMessageRow,
  InsightsFollowUpFilters,
  InsightsRepositoryPort,
  InsightsTenantScope,
} from "./insights.service.js";
import { buildInsightMessageInput } from "./insight-message-input-builder.js";

type CurrentSessionQueryRow = {
  action_id: number | string | null;
  action_status: string | null;
  action_type: string | null;
  action_priority: string | null;
  action_title: string | null;
  agent_name: string | null;
  agent_seat_id: string | number | null;
  conversation_id: number | string;
  current_snapshot_id: number | string;
  customer_name: string | null;
  ended_at: number | string | null;
  evidence_message_id: number | string | null;
  evidence_role: string | null;
  high_risk_id: number | string | null;
  last_customer_message_at: number | string | null;
  negative_risk_id: number | string | null;
  phase: string;
  problem_detected: number | string | null;
  problem_summary: string | null;
  resolution_status: string | null;
  risk_severity: string | null;
  session_id: number | string;
  started_at: number | string;
  status: string;
  summary_customer_intent: string | null;
  summary_follow_up: string | null;
  summary_process: string | null;
  summary_result: string | null;
  unresolved_reason: string | null;
};

type ActionItemQueryRow = {
  action_id: number | string;
  action_status: string;
  action_type: string;
  conversation_id: number | string;
  customer_name: string | null;
  evidence_message_id: number | string | null;
  last_customer_message_at: number | string | null;
  priority: string;
  reason: string | null;
  session_id: number | string;
  title: string;
};

type DetailQueryRow = CurrentSessionQueryRow & {
  qa_finding_id: number | string | null;
  qa_passed: number | string | null;
  qa_reason: string | null;
  qa_rule_code: string | null;
  risk_id: number | string | null;
  risk_level: string | null;
  risk_type: string | null;
};

type DimensionEvidenceRow = {
  dimension_record_id: number | string | null;
  dimension_type: string;
  source_message_id: number | string;
};

type SentimentQueryRow = {
  confidence: number | string | null;
  id: number | string;
  polarity: string;
  reason: string;
};

type TagQueryRow = {
  confidence: number | string | null;
  id: number | string;
  tag_code: string;
  tag_name: string;
};

type EntityQueryRow = {
  entity_id: string;
  entity_name: string;
  entity_type: string;
  id: number | string;
  sentiment: string | null;
};

type IntentQueryRow = {
  confidence: number | string | null;
  id: number | string;
  intent_code: string;
  intent_label: string;
};

type FaqCandidateQueryRow = {
  answer_hint: string;
  id: number | string;
  question: string;
  status: string;
};

type EntityHotspotQueryRow = {
  entity_id: string;
  entity_name: string;
  entity_type: string;
  mention_count: number | string;
  negative_count: number | string;
  risk_session_count: number | string;
  session_count: number | string;
};

type IntentDistributionQueryRow = {
  count: number | string;
  intent_code: string;
  intent_label: string;
};

type EvidenceMessageQueryRow = {
  chat_type: number;
  content: string | null;
  conversation_id: number | string;
  from_type: number | null;
  id: number | string;
  msgtime: number | string | Date;
  msgtype: string;
  sender_name?: string | null;
  third_from_id?: string | null;
  third_user_id?: string | null;
};

type InsertResult = {
  id?: bigint | number | string | null;
  insertId?: bigint | number | string | null;
};

const manualActionStatuses = new Set<InsightActionStatus>(["done", "dismissed"]);

export class InsightsRepository implements InsightsRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async listCurrentSessions(scope: InsightsTenantScope): Promise<InsightCurrentSessionRow[]> {
    const rows = await this.db
      .selectFrom("xy_wap_embed_session_insight_current as current")
      .innerJoin("xy_wap_embed_session_insight_snapshot as snapshot", (join) =>
        join.onRef("snapshot.id", "=", "current.current_snapshot_id"),
      )
      .innerJoin("xy_wap_embed_logical_session as session", (join) =>
        join.onRef("session.id", "=", "current.session_id"),
      )
      .leftJoin("xy_wap_embed_session_summary as summary", (join) =>
        join.onRef("summary.snapshot_id", "=", "snapshot.id"),
      )
      .leftJoin("xy_wap_embed_session_problem_resolution as problem", (join) =>
        join.onRef("problem.snapshot_id", "=", "snapshot.id"),
      )
      .leftJoin("xy_wap_embed_session_risk as risk", (join) =>
        join.onRef("risk.snapshot_id", "=", "snapshot.id"),
      )
      .leftJoin("xy_wap_embed_session_action_item as action", (join) =>
        join.onRef("action.snapshot_id", "=", "snapshot.id"),
      )
      .leftJoin("xy_wap_embed_insight_evidence as evidence", (join) =>
        join
          .onRef("evidence.snapshot_id", "=", "snapshot.id")
          .on("evidence.dimension_type", "=", "problem_resolution"),
      )
      .leftJoin("xy_wap_embed_msg_audit_info as message", (join) =>
        join.onRef("message.id", "=", "evidence.source_message_id"),
      )
      .leftJoin("xy_wap_embed_contact as contact", (join) =>
        join
          .onRef("contact.uid", "=", "session.tenant_id")
          .onRef("contact.third_external_userid", "=", "message.third_external_id"),
      )
      .leftJoin("xy_wap_embed_user_seat as seat", (join) =>
        join
          .onRef("seat.uid", "=", "session.tenant_id")
          .onRef("seat.third_userid", "=", "message.third_user_id"),
      )
      .select([
        "action.id as action_id",
        "action.priority as action_priority",
        "action.status as action_status",
        "action.title as action_title",
        "action.action_type as action_type",
        "contact.name as customer_name",
        "current.current_snapshot_id as current_snapshot_id",
        "evidence.evidence_role as evidence_role",
        "evidence.source_message_id as evidence_message_id",
        "message.msgtime as last_customer_message_at",
        "problem.problem_detected as problem_detected",
        "problem.problem_summary as problem_summary",
        "problem.resolution_status as resolution_status",
        "problem.unresolved_reason as unresolved_reason",
        "risk.id as high_risk_id",
        "risk.id as negative_risk_id",
        "risk.risk_level as risk_severity",
        "seat.id as agent_seat_id",
        "seat.third_user_name as agent_name",
        "session.conversation_id as conversation_id",
        "session.ended_at as ended_at",
        "session.id as session_id",
        "session.started_at as started_at",
        "snapshot.phase as phase",
        "snapshot.status as status",
        "summary.customer_intent as summary_customer_intent",
        "summary.follow_up as summary_follow_up",
        "summary.process_summary as summary_process",
        "summary.result_summary as summary_result",
      ])
      .where("session.tenant_id", "=", scope.tenantId)
      .execute() as CurrentSessionQueryRow[];

    return mapCurrentSessionRows(rows);
  }

  async listActionItems(
    scope: InsightsTenantScope,
    filters: InsightsFollowUpFilters = {},
  ): Promise<InsightActionItemRow[]> {
    let query = this.db
      .selectFrom("xy_wap_embed_session_action_item as action")
      .innerJoin("xy_wap_embed_session_insight_snapshot as snapshot", (join) =>
        join.onRef("snapshot.id", "=", "action.snapshot_id"),
      )
      .innerJoin("xy_wap_embed_logical_session as session", (join) =>
        join.onRef("session.id", "=", "snapshot.session_id"),
      )
      .leftJoin("xy_wap_embed_insight_evidence as evidence", (join) =>
        join
          .onRef("evidence.snapshot_id", "=", "snapshot.id")
          .onRef("evidence.dimension_record_id", "=", "action.id")
          .on("evidence.dimension_type", "=", "action_item"),
      )
      .leftJoin("xy_wap_embed_msg_audit_info as message", (join) =>
        join.onRef("message.id", "=", "evidence.source_message_id"),
      )
      .leftJoin("xy_wap_embed_contact as contact", (join) =>
        join
          .onRef("contact.uid", "=", "session.tenant_id")
          .onRef("contact.third_external_userid", "=", "message.third_external_id"),
      )
      .select([
        "action.id as action_id",
        "action.action_type as action_type",
        "action.priority as priority",
        "action.status as action_status",
        "action.title as title",
        "contact.name as customer_name",
        "evidence.reason as reason",
        "evidence.source_message_id as evidence_message_id",
        "message.msgtime as last_customer_message_at",
        "session.conversation_id as conversation_id",
        "session.id as session_id",
      ])
      .where("session.tenant_id", "=", scope.tenantId);

    if (filters.status) {
      query = query.where("action.status", "=", filters.status);
    }

    if (filters.priority) {
      query = query.where("action.priority", "=", filters.priority);
    }

    if (filters.type) {
      query = query.where("action.action_type", "=", filters.type);
    }

    const rows = await query.execute() as ActionItemQueryRow[];

    return mapActionItemRows(rows);
  }

  async listEntityHotspots(scope: InsightsTenantScope) {
    const rows = await this.db
      .selectFrom("xy_wap_embed_session_entity as entity")
      .innerJoin("xy_wap_embed_session_insight_snapshot as snapshot", (join) =>
        join.onRef("snapshot.id", "=", "entity.snapshot_id"),
      )
      .innerJoin("xy_wap_embed_logical_session as session", (join) =>
        join.onRef("session.id", "=", "snapshot.session_id"),
      )
      .leftJoin("xy_wap_embed_session_risk as risk", (join) =>
        join.onRef("risk.snapshot_id", "=", "snapshot.id"),
      )
      .select([
        "entity.entity_id as entity_id",
        "entity.entity_name as entity_name",
        "entity.entity_type as entity_type",
        sql<number>`count(entity.id)`.as("mention_count"),
        sql<number>`count(case when entity.sentiment = 'negative' then 1 end)`.as("negative_count"),
        sql<number>`count(distinct case when risk.risk_level = 'high' then session.id end)`.as("risk_session_count"),
        sql<number>`count(distinct session.id)`.as("session_count"),
      ])
      .where("session.tenant_id", "=", scope.tenantId)
      .groupBy(["entity.entity_id", "entity.entity_name", "entity.entity_type"])
      .orderBy(sql<number>`count(entity.id)`, "desc")
      .limit(10)
      .execute() as EntityHotspotQueryRow[];

    return rows.map((row) => ({
      entityId: row.entity_id,
      entityName: row.entity_name,
      entityType: row.entity_type,
      mentionCount: parseNumber(row.mention_count),
      negativeCount: parseNumber(row.negative_count),
      riskSessionCount: parseNumber(row.risk_session_count),
      sessionCount: parseNumber(row.session_count),
    }));
  }

  async listIntentDistribution(scope: InsightsTenantScope) {
    const rows = await this.db
      .selectFrom("xy_wap_embed_session_intent as intent")
      .innerJoin("xy_wap_embed_session_insight_snapshot as snapshot", (join) =>
        join.onRef("snapshot.id", "=", "intent.snapshot_id"),
      )
      .innerJoin("xy_wap_embed_logical_session as session", (join) =>
        join.onRef("session.id", "=", "snapshot.session_id"),
      )
      .select([
        sql<number>`count(*)`.as("count"),
        "intent.intent_code as intent_code",
        "intent.intent_label as intent_label",
      ])
      .where("session.tenant_id", "=", scope.tenantId)
      .groupBy(["intent.intent_code", "intent.intent_label"])
      .orderBy(sql<number>`count(*)`, "desc")
      .limit(10)
      .execute() as IntentDistributionQueryRow[];

    return rows.map((row) => ({
      count: parseNumber(row.count),
      intentCode: row.intent_code,
      intentLabel: row.intent_label,
    }));
  }

  async findDetail(
    scope: InsightsTenantScope,
    sessionId: string,
  ): Promise<InsightDetailRow | undefined> {
    const rows = await this.db
      .selectFrom("xy_wap_embed_session_insight_current as current")
      .innerJoin("xy_wap_embed_session_insight_snapshot as snapshot", (join) =>
        join.onRef("snapshot.id", "=", "current.current_snapshot_id"),
      )
      .innerJoin("xy_wap_embed_logical_session as session", (join) =>
        join.onRef("session.id", "=", "current.session_id"),
      )
      .leftJoin("xy_wap_embed_session_summary as summary", (join) =>
        join.onRef("summary.snapshot_id", "=", "snapshot.id"),
      )
      .leftJoin("xy_wap_embed_session_problem_resolution as problem", (join) =>
        join.onRef("problem.snapshot_id", "=", "snapshot.id"),
      )
      .leftJoin("xy_wap_embed_session_qa_finding as qa", (join) =>
        join.onRef("qa.snapshot_id", "=", "snapshot.id"),
      )
      .leftJoin("xy_wap_embed_session_risk as risk", (join) =>
        join.onRef("risk.snapshot_id", "=", "snapshot.id"),
      )
      .leftJoin("xy_wap_embed_session_action_item as action", (join) =>
        join.onRef("action.snapshot_id", "=", "snapshot.id"),
      )
      .leftJoin("xy_wap_embed_insight_evidence as evidence", (join) =>
        join
          .onRef("evidence.snapshot_id", "=", "snapshot.id")
          .on("evidence.dimension_type", "=", "problem_resolution"),
      )
      .leftJoin("xy_wap_embed_msg_audit_info as message", (join) =>
        join.onRef("message.id", "=", "evidence.source_message_id"),
      )
      .leftJoin("xy_wap_embed_contact as contact", (join) =>
        join
          .onRef("contact.uid", "=", "session.tenant_id")
          .onRef("contact.third_external_userid", "=", "message.third_external_id"),
      )
      .leftJoin("xy_wap_embed_user_seat as seat", (join) =>
        join
          .onRef("seat.uid", "=", "session.tenant_id")
          .onRef("seat.third_userid", "=", "message.third_user_id"),
      )
      .select([
        "action.id as action_id",
        "action.action_type as action_type",
        "action.priority as action_priority",
        "action.status as action_status",
        "action.title as action_title",
        "contact.name as customer_name",
        "current.current_snapshot_id as current_snapshot_id",
        "evidence.evidence_role as evidence_role",
        "evidence.source_message_id as evidence_message_id",
        "message.msgtime as last_customer_message_at",
        "problem.problem_detected as problem_detected",
        "problem.problem_summary as problem_summary",
        "problem.resolution_status as resolution_status",
        "problem.unresolved_reason as unresolved_reason",
        "qa.id as qa_finding_id",
        "qa.passed as qa_passed",
        "qa.reason as qa_reason",
        "qa.rule_code as qa_rule_code",
        "risk.id as high_risk_id",
        "risk.id as negative_risk_id",
        "risk.id as risk_id",
        "risk.risk_level as risk_level",
        "risk.risk_level as risk_severity",
        "risk.risk_type as risk_type",
        "seat.id as agent_seat_id",
        "seat.third_user_name as agent_name",
        "session.conversation_id as conversation_id",
        "session.ended_at as ended_at",
        "session.id as session_id",
        "session.started_at as started_at",
        "snapshot.phase as phase",
        "snapshot.status as status",
        "summary.customer_intent as summary_customer_intent",
        "summary.follow_up as summary_follow_up",
        "summary.process_summary as summary_process",
        "summary.result_summary as summary_result",
      ])
      .where("session.tenant_id", "=", scope.tenantId)
      .where("session.id", "=", parsePositiveInteger(sessionId) ?? -1)
      .execute() as DetailQueryRow[];

    if (rows.length === 0) {
      return undefined;
    }

    const [current] = mapCurrentSessionRows(rows);

    if (!current) {
      return undefined;
    }

    const snapshotId = current.currentSnapshotId;
    const dimensionEvidence = await this.listDimensionEvidence(scope, current.sessionId, snapshotId);

    const [
      sentiment,
      tags,
      entities,
      intents,
      faqCandidates,
    ] = await Promise.all([
      this.listSentiment(snapshotId, dimensionEvidence),
      this.listTags(snapshotId, dimensionEvidence),
      this.listEntities(snapshotId, dimensionEvidence),
      this.listIntents(snapshotId, dimensionEvidence),
      this.listFaqCandidates(snapshotId, dimensionEvidence),
    ]);

    return {
      actionItems: mapActionItemRows(
        rows.filter((row) => row.action_id != null).map((row) => ({
          action_id: row.action_id ?? "",
          action_status: row.action_status ?? "open",
          action_type: row.action_type ?? "follow_up",
          conversation_id: row.conversation_id,
          customer_name: row.customer_name,
          evidence_message_id: row.evidence_message_id,
          last_customer_message_at: row.last_customer_message_at,
          priority: row.action_priority ?? "medium",
          reason: row.unresolved_reason,
          session_id: row.session_id,
          title: row.action_title ?? "待跟进事项",
        })),
      ),
      current,
      entities,
      faqCandidates,
      intents,
      problemEvidenceMessageIds: current.problemEvidenceMessageIds,
      qaFindings: uniqueBy(
        rows
          .filter((row) => row.qa_finding_id != null)
          .map((row) => ({
            evidenceMessageIds: evidenceForDimension(
              dimensionEvidence,
              "qa_finding",
              row.qa_finding_id,
            ),
            passed: row.qa_passed === 1,
            reason: row.qa_reason ?? "",
            ruleCode: row.qa_rule_code ?? "",
          })),
        (row) => row.ruleCode,
      ),
      risks: uniqueBy(
        rows
          .filter((row) => row.risk_id != null)
          .map((row) => ({
            evidenceMessageIds: evidenceForDimension(
              dimensionEvidence,
              "risk",
              row.risk_id,
            ),
            reason: "",
            riskLevel: normalizeRiskSeverity(row.risk_level) ?? "low",
            riskType: row.risk_type ?? "custom",
          })),
        (row) => `${row.riskType}:${row.riskLevel}`,
      ),
      sentiment,
      tags,
    };
  }

  private async listDimensionEvidence(
    scope: InsightsTenantScope,
    sessionId: string,
    snapshotId: string,
  ): Promise<DimensionEvidenceRow[]> {
    return await this.db
      .selectFrom("xy_wap_embed_insight_evidence")
      .select([
        "dimension_record_id",
        "dimension_type",
        "source_message_id",
      ])
      .where("tenant_id", "=", scope.tenantId)
      .where("session_id", "=", parsePositiveInteger(sessionId) ?? -1)
      .where("snapshot_id", "=", parsePositiveInteger(snapshotId) ?? -1)
      .execute() as DimensionEvidenceRow[];
  }

  private async listSentiment(
    snapshotId: string,
    evidence: DimensionEvidenceRow[],
  ) {
    const rows = await this.db
      .selectFrom("xy_wap_embed_session_sentiment")
      .select(["confidence", "id", "polarity", "reason"])
      .where("snapshot_id", "=", parsePositiveInteger(snapshotId) ?? -1)
      .execute() as SentimentQueryRow[];

    return rows.map((row) => ({
      confidence: parseConfidence(row.confidence),
      evidenceMessageIds: evidenceForDimension(evidence, "sentiment", row.id),
      polarity: normalizePolarity(row.polarity),
      reason: row.reason,
    }));
  }

  private async listTags(snapshotId: string, evidence: DimensionEvidenceRow[]) {
    const rows = await this.db
      .selectFrom("xy_wap_embed_session_tag")
      .select(["confidence", "id", "tag_code", "tag_name"])
      .where("snapshot_id", "=", parsePositiveInteger(snapshotId) ?? -1)
      .execute() as TagQueryRow[];

    return rows.map((row) => ({
      confidence: parseConfidence(row.confidence),
      evidenceMessageIds: evidenceForDimension(evidence, "tag", row.id),
      tagCode: row.tag_code,
      tagName: row.tag_name,
    }));
  }

  private async listEntities(snapshotId: string, evidence: DimensionEvidenceRow[]) {
    const rows = await this.db
      .selectFrom("xy_wap_embed_session_entity")
      .select(["entity_id", "entity_name", "entity_type", "id", "sentiment"])
      .where("snapshot_id", "=", parsePositiveInteger(snapshotId) ?? -1)
      .execute() as EntityQueryRow[];

    return rows.map((row) => ({
      entityId: row.entity_id,
      entityName: row.entity_name,
      entityType: row.entity_type,
      evidenceMessageIds: evidenceForDimension(evidence, "entity", row.id),
      sentiment: row.sentiment ?? undefined,
    }));
  }

  private async listIntents(snapshotId: string, evidence: DimensionEvidenceRow[]) {
    const rows = await this.db
      .selectFrom("xy_wap_embed_session_intent")
      .select(["confidence", "id", "intent_code", "intent_label"])
      .where("snapshot_id", "=", parsePositiveInteger(snapshotId) ?? -1)
      .execute() as IntentQueryRow[];

    return rows.map((row) => ({
      confidence: parseConfidence(row.confidence),
      evidenceMessageIds: evidenceForDimension(evidence, "intent", row.id),
      intentCode: row.intent_code,
      intentLabel: row.intent_label,
    }));
  }

  private async listFaqCandidates(snapshotId: string, evidence: DimensionEvidenceRow[]) {
    const rows = await this.db
      .selectFrom("xy_wap_embed_session_faq_candidate")
      .select(["answer_hint", "id", "question", "status"])
      .where("snapshot_id", "=", parsePositiveInteger(snapshotId) ?? -1)
      .execute() as FaqCandidateQueryRow[];

    return rows.map((row) => ({
      answerHint: row.answer_hint,
      evidenceMessageIds: evidenceForDimension(evidence, "faq_candidate", row.id),
      question: row.question,
      status: row.status,
    }));
  }

  async listEvidenceMessages(
    scope: InsightsTenantScope,
    sessionId: string,
    messageIds: string[],
  ): Promise<InsightEvidenceMessageRow[]> {
    const normalizedMessageIds = normalizePositiveIntegers(messageIds);

    if (normalizedMessageIds.length === 0) {
      return [];
    }

    const rows = await this.db
      .selectFrom("xy_wap_embed_msg_audit_info as message")
      .innerJoin("xy_wap_embed_logical_session_message as session_message", (join) =>
        join
          .onRef("session_message.source_message_id", "=", "message.id")
          .on("session_message.session_id", "=", parsePositiveInteger(sessionId) ?? -1),
      )
      .leftJoin("xy_wap_embed_contact as contact", (join) =>
        join
          .onRef("contact.uid", "=", "message.uid")
          .onRef("contact.third_external_userid", "=", "message.third_external_id"),
      )
      .select([
        "contact.name as sender_name",
        "message.chat_type as chat_type",
        "message.content as content",
        "message.from_type as from_type",
        "message.id as id",
        "message.msgtime as msgtime",
        "message.msgtype as msgtype",
        "message.third_from_id as third_from_id",
        "message.third_user_id as third_user_id",
        "session_message.conversation_id as conversation_id",
      ])
      .where("message.uid", "=", scope.tenantId)
      .where("message.id", "in", normalizedMessageIds)
      .orderBy("message.msgtime", "asc")
      .orderBy("message.id", "asc")
      .execute() as EvidenceMessageQueryRow[];

    return rows.map((row) => {
      const input = buildInsightMessageInput(row);

      return {
        contentText: input.aiText,
        contentType: input.messageType,
        messageId: input.sourceMessageId,
        msgtime: input.occurredAt,
        senderName: row.sender_name ?? undefined,
        senderRole: input.senderRole,
      };
    });
  }

  async updateActionStatus(
    scope: InsightsTenantScope,
    actionItemId: string,
    status: Extract<InsightActionStatus, "done" | "dismissed">,
  ): Promise<boolean> {
    if (!manualActionStatuses.has(status)) {
      return false;
    }

    const id = parsePositiveInteger(actionItemId);

    if (id == null) {
      return false;
    }

    const result = await this.db
      .updateTable("xy_wap_embed_session_action_item")
      .set({
        status,
        update_time: new Date(),
      })
      .where("id", "=", id)
      .where("status", "=", "open")
      .executeTakeFirst();

    return getAffectedRows(result) !== 0;
  }

  async createRescanJob(
    scope: InsightsTenantScope,
    from: Date,
    idempotencyKey: string,
  ): Promise<string> {
    const inserted = await this.db
      .insertInto("xy_wap_embed_insight_job")
      .values({
        analysis_scope: "all",
        idempotency_key: idempotencyKey,
        job_type: "sync_messages",
        priority: 10,
        run_after: new Date(),
        status: "pending",
        target_id: from.toISOString(),
        target_type: "tenant",
        tenant_id: scope.tenantId,
      })
      .executeTakeFirstOrThrow() as InsertResult;

    return String(parseInsertedMySqlId(inserted) ?? idempotencyKey);
  }
}

function mapCurrentSessionRows(rows: CurrentSessionQueryRow[]): InsightCurrentSessionRow[] {
  const bySession = new Map<string, InsightCurrentSessionRow>();
  const seenOpenActionsBySession = new Map<string, Set<string>>();
  const seenHighRisksBySession = new Map<string, Set<string>>();
  const seenNegativeRisksBySession = new Map<string, Set<string>>();

  for (const row of rows) {
    const sessionId = String(row.session_id);
    const existing = bySession.get(sessionId);
    const current =
      existing ??
      {
        actionOpenCount: 0,
        agentName: row.agent_name,
        agentSeatId: row.agent_seat_id == null ? null : String(row.agent_seat_id),
        analysisStatus: normalizeAnalysisStatus(row.status),
        conversationId: String(row.conversation_id),
        currentSnapshotId: String(row.current_snapshot_id),
        customerName: row.customer_name ?? "未知客户",
        endedAt: parseNullableNumber(row.ended_at),
        highRiskCount: 0,
        lastCustomerMessageAt: parseNullableNumber(row.last_customer_message_at),
        negativeCount: 0,
        phase: row.phase === "final" ? "final" : "live",
        problemDetected: row.problem_detected === 1,
        problemEvidenceMessageIds: [],
        problemSummary: row.problem_summary ?? "",
        resolutionStatus: normalizeResolutionStatus(row.resolution_status),
        riskSeverity: normalizeRiskSeverity(row.risk_severity),
        sessionId,
        startedAt: parseNumber(row.started_at),
        summaryCustomerIntent: row.summary_customer_intent ?? "",
        summaryFollowUp: row.summary_follow_up,
        summaryProcess: row.summary_process ?? "",
        summaryResult: row.summary_result ?? "",
        unresolvedReason: row.unresolved_reason,
      };

    if (
      row.action_id != null &&
      row.action_status === "open" &&
      markSeen(seenOpenActionsBySession, sessionId, String(row.action_id))
    ) {
      current.actionOpenCount += 1;
    }

    if (
      row.high_risk_id != null &&
      row.risk_severity === "high" &&
      markSeen(seenHighRisksBySession, sessionId, String(row.high_risk_id))
    ) {
      current.highRiskCount += 1;
    }

    if (
      row.negative_risk_id != null &&
      markSeen(seenNegativeRisksBySession, sessionId, String(row.negative_risk_id))
    ) {
      current.negativeCount += 1;
    }

    if (row.evidence_message_id != null) {
      current.problemEvidenceMessageIds.push(String(row.evidence_message_id));
    }

    bySession.set(sessionId, current);
  }

  for (const current of bySession.values()) {
    current.problemEvidenceMessageIds = sortNumericStrings(
      Array.from(new Set(current.problemEvidenceMessageIds)),
    );
  }

  return Array.from(bySession.values());
}

function sortNumericStrings(values: string[]) {
  return [...values].sort((left, right) => Number(left) - Number(right));
}

function markSeen(map: Map<string, Set<string>>, scopeKey: string, value: string) {
  const values = map.get(scopeKey) ?? new Set<string>();

  if (values.has(value)) {
    return false;
  }

  values.add(value);
  map.set(scopeKey, values);

  return true;
}

function mapActionItemRows(rows: ActionItemQueryRow[]): InsightActionItemRow[] {
  const byAction = new Map<string, InsightActionItemRow>();

  for (const row of rows) {
    const actionItemId = String(row.action_id);
    const current =
      byAction.get(actionItemId) ??
      {
        actionItemId,
        actionType: row.action_type,
        conversationId: String(row.conversation_id),
        customerName: row.customer_name ?? "未知客户",
        evidenceMessageIds: [],
        lastCustomerMessageAt: parseNullableNumber(row.last_customer_message_at) ?? undefined,
        priority: normalizePriority(row.priority),
        reason: row.reason ?? "",
        sessionId: String(row.session_id),
        status: normalizeActionStatus(row.action_status),
        title: row.title,
      };

    if (row.evidence_message_id != null) {
      current.evidenceMessageIds.push(String(row.evidence_message_id));
    }

    byAction.set(actionItemId, current);
  }

  for (const current of byAction.values()) {
    current.evidenceMessageIds = Array.from(new Set(current.evidenceMessageIds));
  }

  return Array.from(byAction.values());
}

function normalizeAnalysisStatus(value: string): InsightAnalysisStatus {
  if (
    value === "ready" ||
    value === "analyzing" ||
    value === "failed" ||
    value === "stale" ||
    value === "partial"
  ) {
    return value;
  }

  return "ready";
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

function normalizeRiskSeverity(value: string | null): InsightDetailResponse["risks"][number]["riskLevel"] | null {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return null;
}

function normalizePriority(value: string) {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return "medium";
}

function normalizePolarity(value: string): InsightDetailResponse["sentiment"][number]["polarity"] {
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

function normalizeActionStatus(value: string): InsightActionStatus {
  if (
    value === "open" ||
    value === "done" ||
    value === "dismissed" ||
    value === "expired"
  ) {
    return value;
  }

  return "open";
}

function parseNumber(value: Date | number | string) {
  if (value instanceof Date) {
    return value.getTime();
  }

  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function parseNullableNumber(value: Date | number | string | null) {
  return value == null ? null : parseNumber(value);
}

function parseConfidence(value: number | string | null) {
  if (value == null) {
    return 0;
  }

  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function parsePositiveInteger(value: string) {
  if (!/^[1-9]\d*$/.test(value)) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function normalizePositiveIntegers(values: string[]) {
  return Array.from(new Set(values.map(parsePositiveInteger))).filter(
    (value): value is number => value != null,
  );
}

function uniqueBy<T>(items: T[], keyOf: (item: T) => string) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = keyOf(item);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}

function evidenceForDimension(
  rows: DimensionEvidenceRow[],
  dimensionType: string,
  dimensionRecordId: number | string | null,
) {
  const recordId = dimensionRecordId == null ? null : String(dimensionRecordId);

  return sortNumericStrings(
    Array.from(
      new Set(
        rows
          .filter((row) => row.dimension_type === dimensionType)
          .filter((row) =>
            recordId == null
              ? row.dimension_record_id == null
              : String(row.dimension_record_id) === recordId,
          )
          .map((row) => String(row.source_message_id)),
      ),
    ),
  );
}

function getAffectedRows(result: unknown) {
  if (!result || typeof result !== "object") {
    return 0;
  }

  const affectedRows = (result as { numAffectedRows?: bigint | number }).numAffectedRows;

  if (typeof affectedRows === "bigint") {
    return Number(affectedRows);
  }

  return affectedRows ?? 0;
}

function parseInsertedMySqlId(result: InsertResult) {
  const value = result.insertId ?? result.id;

  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  }

  if (typeof value === "bigint") {
    return value > 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(value)
      : undefined;
  }

  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isSafeInteger(parsed) && String(parsed) === value ? parsed : undefined;
}
