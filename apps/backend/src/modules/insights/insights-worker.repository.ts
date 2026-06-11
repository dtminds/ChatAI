import type { InsightRescanAnalysisScope } from "@chatai/contracts";
import { sql, type Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import type {
  InsightPreviousSessionContext,
  InsightPromptContext,
} from "./insight-prompt-builder.js";
import type {
  CleanupDisabledInsightsJob,
  AppendSessionMessageInput,
  CloseSessionInput,
  ClosableOpenSession,
  CreateAnalyzeJobInput,
  CreateLogicalSessionInput,
  InsightAnalysisOutput,
  InsightWorkerAnalysisPolicy,
  InsightWorkerExistingSession,
  InsightWorkerFeatureConfig,
  SaveAnalysisResultInput,
  ShouldCreateLiveAnalyzeJobInput,
  ClaimedSyncMessagesJob,
  ClaimedUidMaintenanceJob,
  InsightWorkerCursor,
  InsightWorkerMessage,
  InsightWorkerRepositoryPort,
  InsightWorkerSessionizationConfig,
} from "./insights-worker.js";
import { parseWorkerFeatureConfigRow } from "./insights-feature-config-mapper.js";
import { InsightsRepository } from "./insights.repository.js";
import { getInitialInsightWorkerCursor } from "./insights-worker-runtime.js";

type InsertResult = {
  id?: bigint | number | string | null;
  insertId?: bigint | number | string | null;
  numInsertedOrUpdatedRows?: bigint | number | string | null;
};

type DeleteResult = {
  numAffectedRows?: bigint | number | string | null;
  numDeletedRows?: bigint | number | string | null;
};

type CursorRow = {
  cursor_audit_id: number | string;
  cursor_msgtime: number | string;
};

type WorkerFeatureConfigRow = {
  entity_enabled: number | string;
  insight_enabled: number | string;
  intent_enabled: number | string;
  label_enabled: number | string;
  last_enable_time: number | string | null;
  qa_enabled: number | string;
  todo_enabled: number | string;
  uid: number | string;
};

type UidJobRow = {
  analysis_scope: string;
  id: number | string;
  rescan_task_id: number | string | null;
  target_id: string;
  uid: number | string;
};

type MessageRow = {
  chat_type: number | string;
  content: string | null;
  from_type: number | string | null;
  id: number | string;
  msgtime: number | string | Date;
  msgtype: string;
  platform: number | string;
  third_external_id: string;
  third_group_id: string;
  third_user_id: string;
  uid: number | string;
};

type ConversationRow = {
  conversation_id: number | string;
  uid: number | string;
};

type ConfigRow = {
  analysis_delay_minutes: number | string;
  hard_max_duration_hours: number | string;
  idle_timeout_minutes: number | string;
  late_arrival_window_minutes: number | string;
  rule_version: string;
};

type OpenSessionRow = {
  id: number | string;
  last_meaningful_message_at: number | string | null;
  started_at: number | string;
};

type AnalyzeJobRow = {
  analysis_scope: string;
  attempt_count: number | string;
  id: number | string;
  idempotency_key: string;
  job_type: string;
  max_attempts: number | string;
  rescan_task_id: number | string | null;
  target_id: string;
  uid: number | string;
};

type AnalysisMessageRow = MessageRow & {
  conversation_id: number | string;
};

type CurrentSessionLookupRow = {
  conversation_id: number | string;
  started_at: number | string;
};

type ExistingSessionLookupRow = {
  session_id: number | string;
  source_message_id?: number | string;
  status: string;
  uid: number | string;
};

type PreviousSessionContextRow = {
  ended_at: number | string | null;
  problem_summary: string | null;
  resolution_status: string | null;
  session_id: number | string;
  session_title: string | null;
  started_at: number | string;
  summary_text: string | null;
  unresolved_reason: string | null;
};

type EvidenceInsertRow = {
  conversation_id: number;
  dimension_record_id: number | null;
  dimension_type: string;
  evidence_role: string;
  reason: string | null;
  session_id: number;
  snapshot_id: number;
  source_message_id: number;
  uid: number;
};

const defaultConfig: InsightWorkerSessionizationConfig = {
  analysisDelayMinutes: 10,
  hardMaxDurationHours: 8,
  idleTimeoutMinutes: 120,
  lateArrivalWindowMinutes: 30,
  ruleVersion: "insights-v1",
};

const DEFAULT_LIVE_MIN_INTERVAL_MINUTES = 15;
const DEFAULT_LIVE_MIN_NEW_MEANINGFUL_MESSAGES = 20;
const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.6;
const DEFAULT_MIN_ANALYSIS_MESSAGES = 5;
const LIVE_RUN_WATERMARK_LOOKBACK_LIMIT = 20;
const PRE_CONTEXT_CANDIDATE_MULTIPLIER = 5;
const cursorSource = "xy_wap_embed_msg_audit_info";
const globalCursorUid = 0;
const uidMaintenanceJobType = "maintain_insight_uid";
const terminalJobStatuses = ["succeeded", "failed"] as const;

export class MysqlInsightWorkerRepository implements InsightWorkerRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly options: { startLookbackDays?: number } = {},
  ) {}

  async getCursor(uid = globalCursorUid): Promise<InsightWorkerCursor> {
    let query = this.db
      .selectFrom("xy_wap_embed_insight_sync_cursor")
      .select(["cursor_audit_id", "cursor_msgtime"])
      .where("source", "=", cursorSource);

    if (uid === globalCursorUid) {
      query = query
        .where((eb) =>
          eb.or([
            eb("uid", "=", globalCursorUid),
            eb("uid", "is", null),
          ]),
        )
        .orderBy("uid", "desc");
    } else {
      query = query.where("uid", "=", uid);
    }

    const row = await query.executeTakeFirst() as CursorRow | undefined;

    if (row) {
      return {
        cursorAuditId: parseNumber(row.cursor_audit_id),
        cursorMsgtime: parseNumber(row.cursor_msgtime),
        uid,
      };
    }

    return {
      ...getInitialInsightWorkerCursor({
        startLookbackDays: this.options.startLookbackDays ?? 3,
      }),
      uid,
    };
  }

  async getActiveFeatureConfigs(input: { limit?: number }): Promise<InsightWorkerFeatureConfig[]> {
    let query = this.db
      .selectFrom("xy_wap_embed_insight_feature_config as config")
      .leftJoin("xy_wap_embed_insight_sync_cursor as cursor", (join) =>
        join
          .onRef("cursor.uid", "=", "config.uid")
          .on("cursor.source", "=", cursorSource)
      )
      .select([
        "config.entity_enabled as entity_enabled",
        "config.insight_enabled as insight_enabled",
        "config.intent_enabled as intent_enabled",
        "config.label_enabled as label_enabled",
        "config.last_enable_time as last_enable_time",
        "config.qa_enabled as qa_enabled",
        "config.todo_enabled as todo_enabled",
        "config.uid as uid",
      ])
      .where("config.insight_enabled", "=", 1)
      .orderBy(sql`coalesce(cursor.update_time, config.last_enable_time, config.create_time)`, "asc")
      .orderBy("config.uid", "asc");

    if (input.limit != null) {
      query = query.limit(input.limit);
    }

    const rows = await query.execute() as WorkerFeatureConfigRow[];

    return rows.map(parseWorkerFeatureConfigRow);
  }

  async getFeatureConfig(uid: number): Promise<InsightWorkerFeatureConfig> {
    const row = await this.db
      .selectFrom("xy_wap_embed_insight_feature_config")
      .select([
        "entity_enabled",
        "insight_enabled",
        "intent_enabled",
        "label_enabled",
        "last_enable_time",
        "qa_enabled",
        "todo_enabled",
        "uid",
      ])
      .where("uid", "=", uid)
      .executeTakeFirst() as WorkerFeatureConfigRow | undefined;

    if (!row) {
      return {
        entityEnabled: true,
        insightEnabled: false,
        intentEnabled: true,
        labelEnabled: true,
        qaEnabled: true,
        todoEnabled: true,
        uid,
      };
    }

    return parseWorkerFeatureConfigRow(row);
  }

  async getPromptContext(uid: number): Promise<InsightPromptContext> {
    const featureConfig = await this.getFeatureConfig(uid);
    const [labelRows, intentRows, qaRuleRows, entityRows] = await Promise.all([
      featureConfig.labelEnabled ? this.db
        .selectFrom("xy_wap_embed_insight_label_config")
        .select([
          "description",
          "id",
          "label_code",
          "label_name",
          "negative_examples_json",
          "positive_examples_json",
        ])
        .where("uid", "=", uid)
        .where("status", "=", 1)
        .orderBy("id", "asc")
        .execute() as Promise<Array<{
          description: string | null;
          id: number | string;
          label_code: string;
          label_name: string;
          negative_examples_json: string | null;
          positive_examples_json: string | null;
        }>>
        : Promise.resolve([]),
      featureConfig.intentEnabled ? this.db
        .selectFrom("xy_wap_embed_insight_intent_config")
        .select([
          "description",
          "id",
          "intent_code",
          "intent_name",
          "negative_examples_json",
          "positive_examples_json",
          "sort_order",
        ])
        .where("uid", "=", uid)
        .where("status", "=", 1)
        .orderBy("sort_order", "asc")
        .orderBy("id", "asc")
        .execute() as Promise<Array<{
          description: string | null;
          id: number | string;
          intent_code: string;
          intent_name: string;
          negative_examples_json: string | null;
          positive_examples_json: string | null;
          sort_order: number | string;
        }>>
        : Promise.resolve([]),
      featureConfig.qaEnabled ? this.db
        .selectFrom("xy_wap_embed_insight_qa_rule_config")
        .select([
          "applicable_scene",
          "description",
          "judgment_criteria",
          "negative_examples_json",
          "positive_examples_json",
          "rule_code",
          "rule_name",
          "severity",
        ])
        .where("uid", "=", uid)
        .where("status", "=", 1)
        .orderBy("id", "asc")
        .execute() as Promise<Array<{
          applicable_scene: string | null;
          description: string | null;
          judgment_criteria: string | null;
          negative_examples_json: string | null;
          positive_examples_json: string | null;
          rule_code: string;
          rule_name: string;
          severity: string;
        }>>
        : Promise.resolve([]),
      featureConfig.entityEnabled ? this.db
        .selectFrom("xy_wap_embed_insight_entity_dictionary")
        .select([
          "aliases_json",
          "attributes_json",
          "entity_code",
          "entity_name",
          "id",
        ])
        .where("uid", "=", uid)
        .where("status", "=", 1)
        .orderBy("id", "asc")
        .execute() as Promise<Array<{
          aliases_json: string | null;
          attributes_json: string | null;
          entity_code: string;
          entity_name: string;
          id: number | string;
        }>>
        : Promise.resolve([]),
    ]);

    return {
      entityDictionary: entityRows.map((row) => ({
        aliases: parseJsonArray(row.aliases_json),
        attributes: parseJsonObject(row.attributes_json),
        entityCode: row.entity_code,
        entityName: row.entity_name,
        id: String(row.id),
      })),
      labelConfigs: labelRows.map((row) => ({
        description: optionalString(row.description),
        id: String(row.id),
        labelCode: row.label_code,
        labelName: row.label_name,
        negativeExamples: parseJsonArray(row.negative_examples_json),
        positiveExamples: parseJsonArray(row.positive_examples_json),
      })),
      intentConfigs: intentRows.map((row) => ({
        description: optionalString(row.description),
        id: String(row.id),
        intentCode: row.intent_code,
        intentName: row.intent_name,
        negativeExamples: parseJsonArray(row.negative_examples_json),
        positiveExamples: parseJsonArray(row.positive_examples_json),
        weight: parseNumber(row.sort_order),
      })),
      qaRuleConfigs: qaRuleRows.map((row) => ({
        applicableScene: optionalString(row.applicable_scene),
        description: optionalString(row.description),
        judgmentCriteria: optionalString(row.judgment_criteria),
        negativeExamples: parseJsonArray(row.negative_examples_json),
        positiveExamples: parseJsonArray(row.positive_examples_json),
        ruleCode: row.rule_code,
        ruleName: row.rule_name,
        severity: normalizeSeverity(row.severity),
      })),
    };
  }

  async getAnalysisPolicy(uid: number): Promise<InsightWorkerAnalysisPolicy> {
    const row = await this.db
      .selectFrom("xy_wap_embed_insight_analysis_policy")
      .select(["low_confidence_threshold", "min_analysis_messages"])
      .where("uid", "=", uid)
      .where("enabled", "=", 1)
      .executeTakeFirst() as {
        low_confidence_threshold: number | string;
        min_analysis_messages: number | string;
      } | undefined;
    const threshold = Number(row?.low_confidence_threshold);
    const minAnalysisMessages = Number(row?.min_analysis_messages);

    return {
      lowConfidenceThreshold: Number.isFinite(threshold)
        ? threshold
        : DEFAULT_LOW_CONFIDENCE_THRESHOLD,
      minAnalysisMessages: Number.isFinite(minAnalysisMessages) && minAnalysisMessages > 0
        ? minAnalysisMessages
        : DEFAULT_MIN_ANALYSIS_MESSAGES,
    };
  }

  async listIncrementalMessages(input: {
    cursorAuditId: number;
    cursorMsgtime: number;
    limit: number;
    uid?: number;
  }): Promise<InsightWorkerMessage[]> {
    let query = this.db
      .selectFrom("xy_wap_embed_msg_audit_info")
      .select([
        "chat_type",
        "content",
        "from_type",
        "id",
        "msgtime",
        "msgtype",
        "platform",
        "third_external_id",
        "third_group_id",
        "third_user_id",
        "uid",
      ])
      .where((eb) =>
        eb.or([
          eb("msgtime", ">", input.cursorMsgtime),
          eb.and([
            eb("msgtime", "=", input.cursorMsgtime),
            eb("id", ">", input.cursorAuditId),
          ]),
        ]),
      );

    if (input.uid != null) {
      query = query.where("uid", "=", input.uid);
    }

    const rows = await query
      .orderBy("msgtime", "asc")
      .orderBy("id", "asc")
      .limit(input.limit)
      .execute() as MessageRow[];

    return rows.map((row) => ({
      chatType: parseNumber(row.chat_type),
      content: row.content,
      fromType: row.from_type == null ? null : parseNumber(row.from_type),
      id: String(row.id),
      msgtime: parseNumber(row.msgtime),
      msgtype: row.msgtype,
      platform: parseNumber(row.platform),
      uid: parseNumber(row.uid),
      thirdExternalId: row.third_external_id,
      thirdGroupId: row.third_group_id,
      thirdUserId: row.third_user_id,
    }));
  }

  async findPlatformConversation(message: InsightWorkerMessage) {
    const base = this.db
      .selectFrom("xy_wap_embed_conversation")
      .select(["id as conversation_id", "uid as uid"])
      .where("uid", "=", message.uid)
      .where("platform", "=", message.platform)
      .where("chat_type", "=", message.chatType)
      .where("third_userid", "=", message.thirdUserId)
      .where("biz_status", "=", 1);

    const row = await (
      message.chatType === 2
        ? base.where("third_group_id", "=", message.thirdGroupId)
        : base.where("third_external_userid", "=", message.thirdExternalId)
    ).executeTakeFirst() as ConversationRow | undefined;

    return row
      ? {
          conversationId: String(row.conversation_id),
          uid: parseNumber(row.uid),
        }
      : undefined;
  }

  async getSessionizationConfig(uid: number): Promise<InsightWorkerSessionizationConfig> {
    const row = await this.db
      .selectFrom("xy_wap_embed_sessionization_config")
      .select([
        "analysis_delay_minutes",
        "hard_max_duration_hours",
        "idle_timeout_minutes",
        "late_arrival_window_minutes",
        "rule_version",
      ])
      .where("uid", "=", uid)
      .where("enabled", "=", 1)
      .executeTakeFirst() as ConfigRow | undefined;

    if (!row) {
      return defaultConfig;
    }

    return {
      analysisDelayMinutes: parseNumber(row.analysis_delay_minutes),
      hardMaxDurationHours: parseNumber(row.hard_max_duration_hours),
      idleTimeoutMinutes: parseNumber(row.idle_timeout_minutes),
      lateArrivalWindowMinutes: parseNumber(row.late_arrival_window_minutes),
      ruleVersion: row.rule_version,
    };
  }

  async findOpenSession(input: { conversationId: string; uid: number }) {
    return this.findSessionByStatus(input, ["open"]);
  }

  async findReusableSession(input: { conversationId: string; uid: number }) {
    return this.findSessionByStatus(input, ["open", "canceled"]);
  }

  private async findSessionByStatus(
    input: { conversationId: string; uid: number },
    statuses: string[],
  ) {
    const row = await this.db
      .selectFrom("xy_wap_embed_logical_session")
      .select(["id", "last_meaningful_message_at", "started_at", "status"])
      .where("uid", "=", input.uid)
      .where("conversation_id", "=", parsePositiveInteger(input.conversationId) ?? -1)
      .where("status", "in", statuses)
      .orderBy("started_at", "desc")
      .executeTakeFirst() as OpenSessionRow & { status: string } | undefined;

    return row
      ? {
          lastMeaningfulMessageAt:
            row.last_meaningful_message_at == null
              ? null
              : parseNumber(row.last_meaningful_message_at),
          sessionId: String(row.id),
          startedAt: parseNumber(row.started_at),
          status: row.status === "canceled" ? "canceled" as const : "open" as const,
        }
      : undefined;
  }

  async listClosableOpenSessions(input: {
    activeUids?: Set<number>;
    limit: number;
    now: number;
  }): Promise<ClosableOpenSession[]> {
    let query = this.db
      .selectFrom("xy_wap_embed_logical_session")
      .select([
        "analysis_delay_minutes",
        "hard_max_duration_hours",
        "id",
        "idle_timeout_minutes",
        "last_meaningful_message_at",
        "started_at",
        "uid",
      ])
      .where("status", "=", "open")
      .where("next_close_at", "<=", input.now)
      .orderBy("next_close_at", "asc")
      .limit(input.limit);

    if (input.activeUids && input.activeUids.size > 0) {
      query = query.where("uid", "in", Array.from(input.activeUids));
    }

    const rows = await query.execute() as Array<{
      analysis_delay_minutes: number | string;
      hard_max_duration_hours: number | string;
      id: number | string;
      idle_timeout_minutes: number | string;
      last_meaningful_message_at: number | string | null;
      started_at: number | string;
      uid: number | string;
    }>;

    return rows.map((row) => {
      const startedAt = parseNumber(row.started_at);
      const idleBase = row.last_meaningful_message_at == null
        ? startedAt
        : parseNumber(row.last_meaningful_message_at);
      const hardMaxEndedAt = startedAt + parseNumber(row.hard_max_duration_hours) * 60 * 60_000;
      const idleEndedAt = idleBase + parseNumber(row.idle_timeout_minutes) * 60_000;
      const closeReason: ClosableOpenSession["closeReason"] =
        hardMaxEndedAt <= idleEndedAt ? "hard_max_duration" : "idle_timeout";

      return {
        analysisDelayMinutes: parseNumber(row.analysis_delay_minutes),
        closeReason,
        endedAt: Math.min(hardMaxEndedAt, idleEndedAt),
        sessionId: String(row.id),
        uid: parseNumber(row.uid),
      };
    });
  }

  async listOpenSessionsForLiveAnalysis(input: {
    activeUids?: Set<number>;
    limit: number;
  }) {
    let query = this.db
      .selectFrom("xy_wap_embed_logical_session")
      .select(["id", "uid"])
      .where("status", "=", "open")
      .orderBy("last_message_at", "asc")
      .limit(input.limit);

    if (input.activeUids && input.activeUids.size > 0) {
      query = query.where("uid", "in", Array.from(input.activeUids));
    }

    const rows = await query.execute() as Array<{
      id: number | string;
      uid: number | string;
    }>;

    return rows.map((row) => ({
      sessionId: String(row.id),
      uid: parseNumber(row.uid),
    }));
  }

  async listUnassignedPreContextMessages(input: {
    conversationId: string;
    limit: number;
    occurredBefore: number;
    uid: number;
    windowStart: number;
  }) {
    const conversationId = parsePositiveInteger(input.conversationId) ?? -1;
    const boundedLimit = Math.max(1, Math.min(Math.floor(input.limit), 10));
    const candidateLimit = boundedLimit * PRE_CONTEXT_CANDIDATE_MULTIPLIER;
    const conversation = await this.db
      .selectFrom("xy_wap_embed_conversation")
      .select([
        "chat_type",
        "platform",
        "third_external_userid",
        "third_group_id",
        "third_userid",
      ])
      .where("id", "=", conversationId)
      .where("uid", "=", input.uid)
      .where("biz_status", "=", 1)
      .executeTakeFirst() as {
        chat_type: number | string;
        platform: number | string;
        third_external_userid: string;
        third_group_id: string;
        third_userid: string;
      } | undefined;

    if (!conversation) {
      return [];
    }

    let query = this.db
      .selectFrom("xy_wap_embed_msg_audit_info as message")
      .select([
        "message.chat_type as chat_type",
        "message.content as content",
        "message.from_type as from_type",
        "message.id as id",
        "message.msgtime as msgtime",
        "message.msgtype as msgtype",
        "message.platform as platform",
        "message.third_external_id as third_external_id",
        "message.third_group_id as third_group_id",
        "message.third_user_id as third_user_id",
        "message.uid as uid",
        sql<number>`${conversationId}`.as("conversation_id"),
      ])
      .where("message.uid", "=", input.uid)
      .where("message.platform", "=", parseNumber(conversation.platform))
      .where("message.chat_type", "=", parseNumber(conversation.chat_type))
      .where("message.third_user_id", "=", conversation.third_userid)
      .where("message.from_type", "in", [1, 3])
      .where("message.msgtype", "in", [
        "file",
        "link",
        "markdown",
        "mixed",
        "text",
        "voice",
        "weapp",
      ])
      .where("message.msgtime", ">=", input.windowStart)
      .where("message.msgtime", "<", input.occurredBefore);

    query = parseNumber(conversation.chat_type) === 2
      ? query.where("message.third_group_id", "=", conversation.third_group_id)
      : query.where("message.third_external_id", "=", conversation.third_external_userid);

    const rows = await query
      .orderBy("message.msgtime", "desc")
      .orderBy("message.id", "desc")
      .limit(candidateLimit)
      .execute() as AnalysisMessageRow[];

    if (rows.length === 0) {
      return [];
    }

    const candidateMessageIds = rows
      .map((row) => parsePositiveInteger(String(row.id)))
      .filter((id): id is number => id != null);

    const assignedRows = candidateMessageIds.length === 0
      ? []
      : await this.db
        .selectFrom("xy_wap_embed_logical_session_message")
        .select(["source_message_id"])
        .where("uid", "=", input.uid)
        .where("source_message_id", "in", candidateMessageIds)
        .execute() as Array<{ source_message_id: number | string }>;
    const assignedSourceMessageIds = new Set(
      assignedRows.map((row) => String(row.source_message_id)),
    );

    return rows
      .filter((row) => !assignedSourceMessageIds.has(String(row.id)))
      .slice(0, boundedLimit)
      .reverse()
      .map((row) => ({
        chatType: parseNumber(row.chat_type),
        content: row.content,
        conversationId: String(row.conversation_id),
        fromType: row.from_type == null ? null : parseNumber(row.from_type),
        id: String(row.id),
        msgtime: parseNumber(row.msgtime),
        msgtype: row.msgtype,
        thirdUserId: row.third_user_id,
      }));
  }

  async createLogicalSession(input: CreateLogicalSessionInput): Promise<string> {
    const nextCloseAt = calculateNextCloseAt({
      hardMaxDurationHours: input.config.hardMaxDurationHours,
      idleTimeoutMinutes: input.config.idleTimeoutMinutes,
      idleBaseAt: input.startedAt,
      startedAt: input.startedAt,
    });
    const inserted = await this.db
      .insertInto("xy_wap_embed_logical_session")
      .values({
        analysis_delay_minutes: input.config.analysisDelayMinutes,
        conversation_id: parsePositiveInteger(input.conversationId) ?? -1,
        hard_max_duration_hours: input.config.hardMaxDurationHours,
        idle_timeout_minutes: input.config.idleTimeoutMinutes,
        last_meaningful_message_at: input.startedAt,
        last_message_at: input.startedAt,
        next_close_at: nextCloseAt,
        rule_version: input.config.ruleVersion,
        started_at: input.startedAt,
        status: "open",
        third_external_userid: input.thirdExternalUserId,
        third_userid: input.thirdUserId,
        uid: input.uid,
      })
      .executeTakeFirstOrThrow() as InsertResult;

    return String(parseInsertedMySqlId(inserted));
  }

  async appendSessionMessage(input: AppendSessionMessageInput): Promise<void> {
    const asset = input.asset;
    const assetId = asset
      ? await this.upsertInsightAsset({ ...input, asset })
      : undefined;
    const result = await this.db
      .insertInto("xy_wap_embed_logical_session_message")
      .values({
        asset_id: assetId,
        asset_type: input.asset?.type,
        conversation_id: parsePositiveInteger(input.conversationId) ?? -1,
        included_for_ai: input.includedForAi ? 1 : 0,
        meaningful_for_boundary: input.meaningfulForBoundary ? 1 : 0,
        message_type: input.messageType,
        occurred_at: input.occurredAt,
        sender_role: input.senderRole,
        session_id: parsePositiveInteger(input.sessionId) ?? -1,
        source_message_id: parsePositiveInteger(input.sourceMessageId) ?? -1,
        source_message_time: input.sourceMessageTime,
        uid: input.uid,
      })
      .ignore()
      .executeTakeFirst() as InsertResult;

    if (getInsertedRows(result) === 0) {
      return;
    }

    await this.db
      .updateTable("xy_wap_embed_logical_session")
      .set({
        agent_message_count:
          input.senderRole === "agent"
            ? sql<number>`agent_message_count + 1`
            : sql<number>`agent_message_count`,
        customer_message_count:
          input.senderRole === "customer"
            ? sql<number>`customer_message_count + 1`
            : sql<number>`customer_message_count`,
        last_meaningful_message_at: input.meaningfulForBoundary
          ? input.occurredAt
          : sql<number>`last_meaningful_message_at`,
        last_message_at: input.occurredAt,
        message_count: sql<number>`message_count + 1`,
        next_close_at: input.meaningfulForBoundary
          ? sql<number>`
              least(
                started_at + hard_max_duration_hours * 3600000,
                ${input.occurredAt} + idle_timeout_minutes * 60000
              )
            `
          : sql<number>`next_close_at`,
        update_time: new Date(),
      })
      .where("id", "=", parsePositiveInteger(input.sessionId) ?? -1)
      .where("uid", "=", input.uid)
      .executeTakeFirst();
  }

  private async upsertInsightAsset(input: AppendSessionMessageInput & {
    asset: NonNullable<AppendSessionMessageInput["asset"]>;
  }) {
    const inserted = await this.db
      .insertInto("xy_wap_embed_insight_asset")
      .values({
        asset_key: input.asset.key,
        asset_name: input.asset.name,
        asset_type: input.asset.type,
        first_seen_at: input.sourceMessageTime,
        last_seen_at: input.sourceMessageTime,
        uid: input.uid,
      })
      .onDuplicateKeyUpdate({
        last_seen_at: input.sourceMessageTime,
      })
      .executeTakeFirstOrThrow() as InsertResult;

    const insertedId = parseInsertedMySqlId(inserted);

    if (insertedId != null) {
      return insertedId;
    }

    const existingAsset = await this.db
      .selectFrom("xy_wap_embed_insight_asset")
      .select("id")
      .where("uid", "=", input.uid)
      .where("asset_type", "=", input.asset.type)
      .where("asset_key", "=", input.asset.key)
      .executeTakeFirst();

    return existingAsset?.id == null
      ? undefined
      : parsePositiveInteger(String(existingAsset.id));
  }

  async reopenSession(input: { sessionId: string; uid: number }): Promise<boolean> {
    const result = await this.db
      .updateTable("xy_wap_embed_logical_session")
      .set({
        close_reason: null,
        ended_at: null,
        status: "open",
        update_time: new Date(),
      })
      .where("id", "=", parsePositiveInteger(input.sessionId) ?? -1)
      .where("uid", "=", input.uid)
      .where("status", "=", "canceled")
      .executeTakeFirst();

    return getAffectedRows(result) > 0;
  }

  async findSessionBySourceMessage(input: {
    sourceMessageId: string;
    uid: number;
  }) {
    const row = await this.db
      .selectFrom("xy_wap_embed_logical_session_message as session_message")
      .innerJoin("xy_wap_embed_logical_session as session", (join) =>
        join
          .onRef("session.id", "=", "session_message.session_id")
          .onRef("session.uid", "=", "session_message.uid")
      )
      .select([
        "session_message.session_id as session_id",
        "session_message.uid as uid",
        "session.status as status",
      ])
      .where("session_message.uid", "=", input.uid)
      .where("session_message.source_message_id", "=", parsePositiveInteger(input.sourceMessageId) ?? -1)
      .executeTakeFirst() as ExistingSessionLookupRow | undefined;

    return row
      ? {
          sessionId: String(row.session_id),
          status: normalizeLogicalSessionStatus(row.status),
          uid: parseNumber(row.uid),
        }
      : undefined;
  }

  async listSessionsBySourceMessages(input: {
    sourceMessageIds: string[];
    uid: number;
  }) {
    const sourceMessageIds = input.sourceMessageIds
      .map((id) => parsePositiveInteger(id))
      .filter((id): id is number => id != null);

    if (sourceMessageIds.length === 0) {
      return [];
    }

    const rows = await this.db
      .selectFrom("xy_wap_embed_logical_session_message as session_message")
      .innerJoin("xy_wap_embed_logical_session as session", (join) =>
        join
          .onRef("session.id", "=", "session_message.session_id")
          .onRef("session.uid", "=", "session_message.uid")
      )
      .select([
        "session_message.session_id as session_id",
        "session_message.source_message_id as source_message_id",
        "session_message.uid as uid",
        "session.status as status",
      ])
      .where("session_message.uid", "=", input.uid)
      .where("session_message.source_message_id", "in", sourceMessageIds)
      .execute() as ExistingSessionLookupRow[];

    return rows.map((row) => ({
      sessionId: String(row.session_id),
      sourceMessageId: row.source_message_id == null ? undefined : String(row.source_message_id),
      status: normalizeLogicalSessionStatus(row.status),
      uid: parseNumber(row.uid),
    }));
  }

  async closeSession(input: CloseSessionInput): Promise<void> {
    await this.db
      .updateTable("xy_wap_embed_logical_session")
      .set({
        close_reason: input.closeReason,
        ended_at: input.endedAt,
        status: "closed_pending_analysis",
        update_time: new Date(),
      })
      .where("id", "=", parsePositiveInteger(input.sessionId) ?? -1)
      .where("status", "=", "open")
      .executeTakeFirst();
  }

  async closeDisabledOpenSessions(input: {
    endedAt: number;
    limit: number;
    uid: number;
  }): Promise<number> {
    const result = await this.db
      .updateTable("xy_wap_embed_logical_session")
      .set({
        close_reason: "insight_disabled",
        ended_at: input.endedAt,
        next_close_at: null,
        status: "canceled",
        update_time: new Date(),
      })
      .where("uid", "=", input.uid)
      .where("status", "=", "open")
      .limit(input.limit)
      .execute();

    return getAffectedRows(result);
  }

  async createAnalyzeJob(input: CreateAnalyzeJobInput): Promise<string> {
    const idempotencyKey = [
      input.jobType,
      input.uid,
      input.sessionId,
      input.mode,
      input.runAfter.toISOString(),
    ].join(":");
    const inserted = await this.db
      .insertInto("xy_wap_embed_insight_job")
      .values({
        analysis_scope: input.analysisScope,
        idempotency_key: idempotencyKey,
        job_type: input.jobType,
        priority: input.mode === "final" ? 20 : 10,
        rescan_task_id: input.rescanTaskId == null
          ? null
          : parsePositiveInteger(input.rescanTaskId) ?? null,
        run_after: input.runAfter,
        status: "pending",
        target_id: input.sessionId,
        target_type: "logical_session",
        uid: input.uid,
      })
      .ignore()
      .executeTakeFirst() as InsertResult;

    return String(parseInsertedMySqlId(inserted) ?? idempotencyKey);
  }

  async seedUidMaintenanceJobs(input: {
    limit: number;
    runAfter: Date;
  }): Promise<{ insertedJobs: number; scannedUids: number }> {
    const featureConfigs = await this.listMissingUidMaintenanceConfigs(input.limit);
    let insertedJobs = 0;

    for (const config of featureConfigs) {
      const inserted = await this.db
        .insertInto("xy_wap_embed_insight_job")
        .values({
          analysis_scope: "all",
          idempotency_key: `${uidMaintenanceJobType}:${config.uid}`,
          job_type: uidMaintenanceJobType,
          priority: 5,
          rescan_task_id: null,
          run_after: input.runAfter,
          status: "pending",
          target_id: String(config.uid),
          target_type: "uid",
          uid: config.uid,
        })
        .ignore()
        .executeTakeFirst() as InsertResult;

      insertedJobs += getInsertedRows(inserted);
    }

    return {
      insertedJobs,
      scannedUids: featureConfigs.length,
    };
  }

  private async listMissingUidMaintenanceConfigs(limit: number) {
    const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 10_000));
    const rows = await this.db
      .selectFrom("xy_wap_embed_insight_feature_config as config")
      .leftJoin("xy_wap_embed_insight_job as job", (join) =>
        join
          .onRef("job.uid", "=", "config.uid")
          .on("job.target_type", "=", "uid")
          .on("job.job_type", "=", uidMaintenanceJobType)
      )
      .select([
        "config.entity_enabled as entity_enabled",
        "config.insight_enabled as insight_enabled",
        "config.intent_enabled as intent_enabled",
        "config.label_enabled as label_enabled",
        "config.last_enable_time as last_enable_time",
        "config.qa_enabled as qa_enabled",
        "config.todo_enabled as todo_enabled",
        "config.uid as uid",
      ])
      .where("config.insight_enabled", "=", 1)
      .where("job.id", "is", null)
      .orderBy("config.uid", "asc")
      .limit(boundedLimit)
      .execute() as WorkerFeatureConfigRow[];

    return rows.map(parseWorkerFeatureConfigRow);
  }

  async updateCursor(cursor: InsightWorkerCursor): Promise<void> {
    await this.db
      .insertInto("xy_wap_embed_insight_sync_cursor")
      .values({
        cursor_audit_id: cursor.cursorAuditId,
        cursor_msgtime: cursor.cursorMsgtime,
        source: cursorSource,
        uid: cursor.uid ?? globalCursorUid,
      })
      .onDuplicateKeyUpdate({
        cursor_audit_id: cursor.cursorAuditId,
        cursor_msgtime: cursor.cursorMsgtime,
        update_time: new Date(),
      })
      .executeTakeFirst();
  }

  async claimNextSyncMessagesJob(): Promise<ClaimedSyncMessagesJob | undefined> {
    return this.db.transaction().execute(async (trx) => {
      let query = this.buildUidJobClaimQuery(trx, "sync_messages");

      const row = await query.executeTakeFirst() as UidJobRow | undefined;

      if (!row) {
        return undefined;
      }

      const cursorMsgtime = new Date(row.target_id).getTime();

      if (!Number.isFinite(cursorMsgtime)) {
        throw new Error(`Invalid sync_messages target_id: ${row.target_id}`);
      }

      const claimed = await this.markUidJobRunning(trx, row.id, "sync_messages");

      if (!claimed) {
        return undefined;
      }

      return {
        analysisScope: normalizeAnalysisScope(row.analysis_scope),
        cursorMsgtime,
        jobId: String(row.id),
        rescanTaskId: row.rescan_task_id == null ? undefined : String(row.rescan_task_id),
        uid: parseNumber(row.uid),
      };
    });
  }

  async claimNextCleanupDisabledInsightsJob(): Promise<CleanupDisabledInsightsJob | undefined> {
    const row = await this.claimNextUidJob({
      jobType: "cleanup_disabled_insights",
    });

    const enableEpoch = row ? parseNumber(row.targetId) : 0;

    return row
      ? {
          enableEpoch,
          jobId: row.jobId,
          uid: row.uid,
        }
      : undefined;
  }

  async claimNextUidMaintenanceJob(): Promise<ClaimedUidMaintenanceJob | undefined> {
    const row = await this.claimNextUidJob({
      jobType: uidMaintenanceJobType,
    });

    return row
      ? {
          jobId: row.jobId,
          uid: row.uid,
        }
      : undefined;
  }

  async rescheduleUidMaintenanceJob(
    jobId: string,
    input: { runAfter: Date },
  ): Promise<void> {
    await this.db
      .updateTable("xy_wap_embed_insight_job")
      .set({
        attempt_count: 0,
        error_code: null,
        error_message: null,
        lease_until: null,
        locked_by: null,
        run_after: input.runAfter,
        status: "pending",
        update_time: new Date(),
      })
      .where("id", "=", parsePositiveInteger(jobId) ?? -1)
      .where("job_type", "=", uidMaintenanceJobType)
      .where("status", "=", "running")
      .executeTakeFirst();
  }

  async deleteUidMaintenanceJob(jobId: string): Promise<void> {
    await this.db
      .deleteFrom("xy_wap_embed_insight_job")
      .where("id", "=", parsePositiveInteger(jobId) ?? -1)
      .where("job_type", "=", uidMaintenanceJobType)
      .where("status", "=", "running")
      .executeTakeFirst();
  }

  private async claimNextUidJob(input: {
    jobType: "cleanup_disabled_insights" | "sync_messages" | typeof uidMaintenanceJobType;
  }) {
    return this.db.transaction().execute(async (trx) => {
      const row = await this.buildUidJobClaimQuery(trx, input.jobType)
        .executeTakeFirst() as UidJobRow | undefined;

      if (!row) {
        return undefined;
      }

      if (!await this.markUidJobRunning(trx, row.id, input.jobType)) {
        return undefined;
      }

      return {
        analysisScope: normalizeAnalysisScope(row.analysis_scope),
        jobId: String(row.id),
        rescanTaskId: row.rescan_task_id == null ? undefined : String(row.rescan_task_id),
        targetId: row.target_id,
        uid: parseNumber(row.uid),
      };
    });
  }

  private buildUidJobClaimQuery(
    trx: Pick<Kysely<Database>, "selectFrom">,
    jobType: "cleanup_disabled_insights" | "sync_messages" | typeof uidMaintenanceJobType,
  ) {
    let query = trx
      .selectFrom("xy_wap_embed_insight_job")
      .select(["analysis_scope", "id", "rescan_task_id", "target_id", "uid"])
      .where("target_type", "=", "uid")
      .where("job_type", "=", jobType)
      .where("run_after", "<=", new Date());

    if (jobType === uidMaintenanceJobType) {
      const now = new Date();
      query = query.where((eb) =>
        eb.or([
          eb("status", "=", "pending"),
          eb.and([
            eb("status", "=", "running"),
            eb("lease_until", "<=", now),
          ]),
        ])
      );
    } else {
      query = query.where("status", "=", "pending");
    }

    return query
      .orderBy("priority", "desc")
      .orderBy("id", "asc")
      .forUpdate()
      .skipLocked();
  }

  private async markUidJobRunning(
    trx: Pick<Kysely<Database>, "updateTable">,
    jobId: number | string,
    jobType: "cleanup_disabled_insights" | "sync_messages" | typeof uidMaintenanceJobType,
  ) {
    let query = trx
      .updateTable("xy_wap_embed_insight_job")
      .set({
        attempt_count: sql<number>`attempt_count + 1`,
        lease_until: new Date(Date.now() + 60_000),
        locked_by: "node-worker",
        status: "running",
        update_time: new Date(),
      })
      .where("id", "=", parseNumber(jobId));

    if (jobType === uidMaintenanceJobType) {
      const now = new Date();
      query = query.where((eb) =>
        eb.or([
          eb("status", "=", "pending"),
          eb.and([
            eb("status", "=", "running"),
            eb("lease_until", "<=", now),
          ]),
        ])
      );
    } else {
      query = query.where("status", "=", "pending");
    }

    const result = await query.executeTakeFirst();

    return getAffectedRows(result) > 0;
  }

  async claimNextAnalyzeJob() {
    const now = new Date();
    const row = await this.db.transaction().execute(async (trx) => {
      let query = trx
        .selectFrom("xy_wap_embed_insight_job")
        .select([
          "analysis_scope",
          "attempt_count",
          "id",
          "idempotency_key",
          "job_type",
          "max_attempts",
          "rescan_task_id",
          "target_id",
          "uid",
        ])
        .where((eb) =>
          eb.or([
            eb("status", "=", "pending"),
            eb.and([
              eb("status", "=", "running"),
              eb("lease_until", "<=", now),
            ]),
          ]),
        )
        .where("target_type", "=", "logical_session")
        .where("job_type", "in", ["analyze_session", "reanalyze_session"])
        .where("run_after", "<=", now);

      const selectedRow = await query
        .orderBy("priority", "desc")
        .orderBy("id", "asc")
        .forUpdate()
        .skipLocked()
        .executeTakeFirst() as AnalyzeJobRow | undefined;

      if (!selectedRow) {
        return undefined;
      }

      const result = await trx
        .updateTable("xy_wap_embed_insight_job")
        .set({
          attempt_count: sql<number>`attempt_count + 1`,
          lease_until: new Date(Date.now() + 60_000),
          locked_by: "node-worker",
          status: "running",
          update_time: new Date(),
        })
        .where("id", "=", parseNumber(selectedRow.id))
        .where((eb) =>
          eb.or([
            eb("status", "=", "pending"),
            eb.and([
              eb("status", "=", "running"),
              eb("lease_until", "<=", now),
            ]),
          ]),
        )
        .executeTakeFirst();

      if (getAffectedRows(result) === 0) {
        return undefined;
      }

      return selectedRow;
    });

    if (!row) {
      return undefined;
    }

    if (parseNumber(row.attempt_count) > 0) {
      await this.markExpiredAnalysisRunsFailed(String(row.id));
    }

    return {
      analysisScope: normalizeAnalysisScope(row.analysis_scope),
      attemptCount: parseNumber(row.attempt_count) + 1,
      jobId: String(row.id),
      maxAttempts: parseNumber(row.max_attempts),
      mode: parseJobMode(row),
      rescanTaskId: row.rescan_task_id == null ? undefined : String(row.rescan_task_id),
      sessionId: row.target_id,
      uid: parseNumber(row.uid),
    };
  }

  async archiveTerminalJobs(input: {
    before: Date;
    limit: number;
  }): Promise<{ archivedJobs: number; deletedJobs: number }> {
    const boundedLimit = Math.max(1, Math.min(Math.floor(input.limit), 10_000));
    const archiveResult = await this.db
      .insertInto("xy_wap_embed_insight_job_archive")
      .columns([
        "id",
        "uid",
        "rescan_task_id",
        "job_type",
        "analysis_scope",
        "target_type",
        "target_id",
        "status",
        "priority",
        "run_after",
        "attempt_count",
        "max_attempts",
        "locked_by",
        "lease_until",
        "idempotency_key",
        "error_code",
        "error_message",
        "create_time",
        "update_time",
        "archived_at",
      ])
      .expression((eb) =>
        eb
          .selectFrom("xy_wap_embed_insight_job")
          .select([
            "id",
            "uid",
            "rescan_task_id",
            "job_type",
            "analysis_scope",
            "target_type",
            "target_id",
            "status",
            "priority",
            "run_after",
            "attempt_count",
            "max_attempts",
            "locked_by",
            "lease_until",
            "idempotency_key",
            "error_code",
            "error_message",
            "create_time",
            "update_time",
            sql<Date>`CURRENT_TIMESTAMP`.as("archived_at"),
          ])
          .where("status", "in", terminalJobStatuses)
          .where("update_time", "<", input.before)
          .orderBy("id", "asc")
          .limit(boundedLimit)
      )
      .ignore()
      .executeTakeFirst() as InsertResult;

    const deleteResult = await this.db
      .deleteFrom("xy_wap_embed_insight_job")
      .where("status", "in", terminalJobStatuses)
      .where("update_time", "<", input.before)
      .limit(boundedLimit)
      .executeTakeFirst() as DeleteResult;

    return {
      archivedJobs: parseAffectedCount(archiveResult.numInsertedOrUpdatedRows),
      deletedJobs: parseAffectedCount(deleteResult.numDeletedRows ?? deleteResult.numAffectedRows),
    };
  }

  async getCurrentAnalysisOutput(input: {
    sessionId: string;
    uid: number;
  }): Promise<InsightAnalysisOutput | undefined> {
    const detail = await new InsightsRepository(this.db).findDetail(
      { uid: input.uid },
      input.sessionId,
    );

    if (!detail) {
      return undefined;
    }

    return {
      actionItems: detail.actionItems.map((item) => ({
        evidenceMessageIds: item.evidenceMessageIds,
        priority: item.priority,
        title: item.title,
      })),
      entities: detail.entities.map((item) => ({
        confidence: 1,
        entityId: item.entityId,
        entityName: item.entityName,
        evidenceMessageIds: item.evidenceMessageIds,
        sentiment: item.sentiment,
      })),
      faqCandidates: detail.faqCandidates,
      intents: detail.intents,
      problemResolution: {
        confidence: detail.current.problemResolutionConfidence ?? 1,
        evidence: detail.evidenceItems
          .filter((item) => item.dimensionType === "problem_resolution")
          .map((item) => ({
            evidenceRole: item.evidenceRole,
            messageId: item.messageId,
            reason: item.reason,
          })),
        evidenceMessageIds: detail.problemEvidenceMessageIds,
        problemDetected: detail.current.problemDetected,
        problemSummary: detail.current.problemSummary,
        resolutionStatus: detail.current.resolutionStatus,
        unresolvedReason: detail.current.unresolvedReason ?? undefined,
      },
      qaFindings: (detail.qaFindingDetails ?? []).map((item) => ({
        confidence: 1,
        evidenceMessageIds: item.evidenceMessageIds,
        passed: item.passed,
        reason: item.reason,
        ruleCode: item.ruleCode,
        ruleName: item.ruleName,
        severity: item.severity,
      })),
      sentiment: detail.sentiment,
      summary: {
        sessionTitle: detail.current.summarySessionTitle,
        text: detail.current.summaryText,
      },
      tags: detail.tags,
    };
  }

  async updateRescanTaskRunning(rescanTaskId: string): Promise<void> {
    await this.db
      .updateTable("xy_wap_embed_insight_rescan_task")
      .set({
        started_at: new Date(),
        status: "running",
        update_time: new Date(),
      })
      .where("id", "=", parsePositiveInteger(rescanTaskId) ?? -1)
      .where("status", "=", "pending")
      .executeTakeFirst();
  }

  async updateRescanTaskAfterScan(input: {
    queuedSessions: number;
    rescanTaskId: string;
    totalSessions: number;
  }): Promise<void> {
    const status = input.totalSessions === 0 ? "succeeded" : "running";
    await this.db
      .updateTable("xy_wap_embed_insight_rescan_task")
      .set({
        finished_at: input.totalSessions === 0 ? new Date() : null,
        queued_sessions: input.queuedSessions,
        status,
        total_sessions: input.totalSessions,
        update_time: new Date(),
      })
      .where("id", "=", parsePositiveInteger(input.rescanTaskId) ?? -1)
      .executeTakeFirst();
  }

  async updateRescanTaskAfterAnalysis(input: {
    failedSessions: number;
    rescanTaskId: string;
    succeededSessions: number;
  }): Promise<void> {
    const taskId = parsePositiveInteger(input.rescanTaskId) ?? -1;
    await this.db
      .updateTable("xy_wap_embed_insight_rescan_task")
      .set({
        failed_sessions: sql<number>`failed_sessions + ${input.failedSessions}`,
        succeeded_sessions: sql<number>`succeeded_sessions + ${input.succeededSessions}`,
        update_time: new Date(),
      })
      .where("id", "=", taskId)
      .executeTakeFirst();

    await this.db
      .updateTable("xy_wap_embed_insight_rescan_task")
      .set({
        finished_at: new Date(),
        status: sql<string>`
          case
            when failed_sessions = 0 then 'succeeded'
            when succeeded_sessions = 0 then 'failed'
            else 'partial'
          end
        `,
        update_time: new Date(),
      })
      .where("id", "=", taskId)
      .where(sql<boolean>`status = 'running'`)
      .where(sql<boolean>`total_sessions > 0`)
      .where(sql<boolean>`succeeded_sessions + failed_sessions >= total_sessions`)
      .executeTakeFirst();
  }

  private async markExpiredAnalysisRunsFailed(jobId: string) {
    await this.db.updateTable("xy_wap_embed_analysis_run").set({
      error_code: "LEASE_EXPIRED",
      error_message: "Analysis job lease expired before completion",
      finished_at: new Date(),
      status: "failed",
      update_time: new Date(),
    })
      .where("job_id", "=", parsePositiveInteger(jobId) ?? -1)
      .where("status", "=", "running")
      .executeTakeFirst();
  }

  async listSessionMessagesForAnalysis(sessionId: string) {
    const rows = await this.db
      .selectFrom("xy_wap_embed_logical_session_message as session_message")
      .innerJoin("xy_wap_embed_msg_audit_info as message", (join) =>
        join.onRef("message.id", "=", "session_message.source_message_id"),
      )
      .select([
        "message.chat_type as chat_type",
        "message.content as content",
        "message.from_type as from_type",
        "message.id as id",
        "message.msgtime as msgtime",
        "message.msgtype as msgtype",
        "message.platform as platform",
        "message.third_external_id as third_external_id",
        "message.third_group_id as third_group_id",
        "message.third_user_id as third_user_id",
        "message.uid as uid",
        "session_message.conversation_id as conversation_id",
      ])
      .where("session_message.session_id", "=", parsePositiveInteger(sessionId) ?? -1)
      .where("session_message.included_for_ai", "=", 1)
      .orderBy("session_message.source_message_time", "asc")
      .orderBy("session_message.source_message_id", "asc")
      .execute() as AnalysisMessageRow[];

    return rows.map((row) => ({
      chatType: parseNumber(row.chat_type),
      content: row.content,
      conversationId: String(row.conversation_id),
      fromType: row.from_type == null ? null : parseNumber(row.from_type),
      id: String(row.id),
      msgtime: parseNumber(row.msgtime),
      msgtype: row.msgtype,
      thirdUserId: row.third_user_id,
    }));
  }

  async listPreviousSessionContexts(input: {
    currentSessionId: string;
    limit: number;
    lookbackHours: number;
    uid: number;
  }): Promise<InsightPreviousSessionContext[]> {
    const currentSessionId = parsePositiveInteger(input.currentSessionId) ?? -1;
    const current = await this.db
      .selectFrom("xy_wap_embed_logical_session as current_session")
      .select(["conversation_id", "started_at"])
      .where("current_session.id", "=", currentSessionId)
      .where("current_session.uid", "=", input.uid)
      .executeTakeFirst() as CurrentSessionLookupRow | undefined;

    if (!current) {
      return [];
    }

    const currentStartedAt = parseNumber(current.started_at);
    const lookbackFrom = currentStartedAt - input.lookbackHours * 60 * 60_000;
    const rows = await this.db
      .selectFrom("xy_wap_embed_logical_session as previous_session")
      .innerJoin("xy_wap_embed_session_insight_current as current", (join) =>
        join.onRef("current.session_id", "=", "previous_session.id"),
      )
      .innerJoin("xy_wap_embed_session_summary as summary", (join) =>
        join.onRef("summary.snapshot_id", "=", "current.current_snapshot_id"),
      )
      .innerJoin("xy_wap_embed_session_problem_resolution as problem", (join) =>
        join.onRef("problem.snapshot_id", "=", "current.current_snapshot_id"),
      )
      .select([
        "previous_session.id as session_id",
        "previous_session.started_at as started_at",
        "previous_session.ended_at as ended_at",
        "summary.session_title as session_title",
        "summary.summary_text as summary_text",
        "problem.problem_summary as problem_summary",
        "problem.resolution_status as resolution_status",
        "problem.unresolved_reason as unresolved_reason",
      ])
      .where("previous_session.uid", "=", input.uid)
      .where("previous_session.conversation_id", "=", parseNumber(current.conversation_id))
      .where("previous_session.id", "!=", currentSessionId)
      .where("previous_session.ended_at", "<=", currentStartedAt)
      .where("previous_session.ended_at", ">=", lookbackFrom)
      .orderBy("previous_session.ended_at", "desc")
      .limit(Math.max(0, Math.min(input.limit, 3)))
      .execute() as PreviousSessionContextRow[];

    return rows.map((row) => ({
      endedAt: row.ended_at == null ? undefined : parseNumber(row.ended_at),
      problemSummary: row.problem_summary ?? "",
      resolutionStatus: normalizeResolutionStatus(row.resolution_status),
      sessionId: String(row.session_id),
      sessionTitle: row.session_title ?? "",
      startedAt: parseNumber(row.started_at),
      summaryText: row.summary_text ?? "",
      unresolvedReason: optionalString(row.unresolved_reason),
    }));
  }

  async listRecentActionItemsForPrompt(input: {
    conversationId: string;
    limit: number;
    uid: number;
  }) {
    const rows = await this.db
      .selectFrom("xy_wap_embed_session_action_item")
      .select([
        "create_time",
        "priority",
        "status",
        "title",
      ])
      .where("uid", "=", input.uid)
      .where("conversation_id", "=", parsePositiveInteger(input.conversationId) ?? -1)
      .orderBy("id", "desc")
      .limit(Math.max(0, Math.min(input.limit, 10)))
      .execute() as Array<{
        create_time: Date | string;
        priority: string;
        status: string;
        title: string;
      }>;

    return rows.map((row) => ({
      createdAt: new Date(row.create_time).getTime(),
      priority: normalizePriority(row.priority),
      status: normalizeActionStatus(row.status),
      title: row.title,
    }));
  }

  async startAnalysisRun(input: {
    analysisScope: "all";
    jobId: string;
    mode: "final" | "live" | "manual_reanalyze";
    sessionId: string;
    sourceMessageFrom: string | null;
    sourceMessageTo: string | null;
  }): Promise<string> {
    const inserted = await this.db
      .insertInto("xy_wap_embed_analysis_run")
      .values({
        analysis_scope: input.analysisScope,
        job_id: parsePositiveInteger(input.jobId) ?? null,
        mode: input.mode,
        session_id: parsePositiveInteger(input.sessionId) ?? -1,
        source_message_from: input.sourceMessageFrom == null ? null : parsePositiveInteger(input.sourceMessageFrom) ?? null,
        source_message_to: input.sourceMessageTo == null ? null : parsePositiveInteger(input.sourceMessageTo) ?? null,
        status: "running",
      })
      .executeTakeFirstOrThrow() as InsertResult;

    return String(parseInsertedMySqlId(inserted));
  }

  async shouldCreateLiveAnalyzeJob(input: ShouldCreateLiveAnalyzeJobInput): Promise<boolean> {
    const policy = await this.db
      .selectFrom("xy_wap_embed_insight_analysis_policy")
      .select([
        "live_analysis_enabled",
        "live_min_interval_minutes",
        "live_min_new_meaningful_messages",
        "min_analysis_messages",
      ])
      .where("uid", "=", input.uid)
      .where("enabled", "=", 1)
      .executeTakeFirst() as {
        live_analysis_enabled: number | string;
        live_min_interval_minutes: number | string;
        live_min_new_meaningful_messages: number | string;
        min_analysis_messages: number | string;
      } | undefined;
    const liveEnabled = policy ? Number(policy.live_analysis_enabled) === 1 : true;

    if (!liveEnabled) {
      return false;
    }

    const pendingLiveJob = await this.db
      .selectFrom("xy_wap_embed_insight_job")
      .select(["id"])
      .where("uid", "=", input.uid)
      .where("target_type", "=", "logical_session")
      .where("target_id", "=", input.sessionId)
      .where("job_type", "=", "analyze_session")
      .where("status", "in", ["pending", "running"])
      .executeTakeFirst();

    if (pendingLiveJob) {
      return false;
    }

    const liveMinMessages = policy
      ? parseNumber(policy.live_min_new_meaningful_messages)
      : DEFAULT_LIVE_MIN_NEW_MEANINGFUL_MESSAGES;
    const minAnalysisMessages = policy
      ? parseNumber(policy.min_analysis_messages)
      : DEFAULT_MIN_ANALYSIS_MESSAGES;
    const minMessages = Math.max(liveMinMessages, minAnalysisMessages);
    const minIntervalMs = (policy
      ? parseNumber(policy.live_min_interval_minutes)
      : DEFAULT_LIVE_MIN_INTERVAL_MINUTES) * 60_000;
    const liveRuns = await this.db
      .selectFrom("xy_wap_embed_analysis_run")
      .select(["source_message_to", "create_time", "error_code"])
      .where("session_id", "=", parsePositiveInteger(input.sessionId) ?? -1)
      .where("mode", "=", "live")
      .where("status", "in", ["running", "succeeded"])
      .orderBy("id", "desc")
      .limit(LIVE_RUN_WATERMARK_LOOKBACK_LIMIT)
      .execute() as Array<{
        create_time: Date | string;
        error_code: string | null;
        source_message_to: number | string | null;
      }>;
    const latestLiveRun = liveRuns.at(0);

    if (latestLiveRun && Date.now() - new Date(latestLiveRun.create_time).getTime() < minIntervalMs) {
      return false;
    }

    let latestAnalyzedLiveRun: { source_message_to: number | string | null } | undefined = liveRuns.find((run) =>
      run.error_code !== "INSUFFICIENT_MESSAGES"
    );

    if (!latestAnalyzedLiveRun && liveRuns.length >= LIVE_RUN_WATERMARK_LOOKBACK_LIMIT) {
      latestAnalyzedLiveRun = await this.db
        .selectFrom("xy_wap_embed_analysis_run")
        .select(["source_message_to"])
        .where("session_id", "=", parsePositiveInteger(input.sessionId) ?? -1)
        .where("mode", "=", "live")
        .where("status", "in", ["running", "succeeded"])
        .where((eb) =>
          eb.or([
            eb("error_code", "is", null),
            eb("error_code", "!=", "INSUFFICIENT_MESSAGES"),
          ])
        )
        .orderBy("id", "desc")
        .limit(1)
        .executeTakeFirst() as {
          source_message_to: number | string | null;
        } | undefined;
    }

    const sinceMessageId = latestAnalyzedLiveRun?.source_message_to == null
      ? 0
      : parseNumber(latestAnalyzedLiveRun.source_message_to);
    const row = await this.db
      .selectFrom("xy_wap_embed_logical_session_message")
      .select((eb) => eb.fn.count<number>("id").as("count"))
      .where("session_id", "=", parsePositiveInteger(input.sessionId) ?? -1)
      .where("included_for_ai", "=", 1)
      .where("meaningful_for_boundary", "=", 1)
      .where("source_message_id", ">", sinceMessageId)
      .executeTakeFirst() as { count: number | string } | undefined;

    if (parseNumber(row?.count) < minMessages) {
      return false;
    }

    return true;
  }

  async saveAnalysisResult(input: SaveAnalysisResultInput): Promise<string> {
    const sessionId = parsePositiveInteger(input.job.sessionId) ?? -1;
    const conversationIdBySessionId = new Map<string, number>();
    const conversationId = await this.getSessionConversationId(input.job.sessionId, conversationIdBySessionId);
    const insertedSnapshot = await this.db
      .insertInto("xy_wap_embed_session_insight_snapshot")
      .values({
        analysis_version: "insights-v1",
        phase: input.job.mode === "final" || input.resultKind === "insufficient_messages" ? "final" : "live",
        prompt_version: "insights-v1",
        rule_version: "insights-v1",
        session_id: sessionId,
        source_message_high_watermark:
          input.sourceMessageHighWatermark == null
            ? null
            : parsePositiveInteger(input.sourceMessageHighWatermark) ?? null,
        status: "building",
      })
      .executeTakeFirstOrThrow() as InsertResult;
    const snapshotId = parseInsertedMySqlId(insertedSnapshot) ?? -1;
    const output = input.output;
    const validationWarnings = [...input.validationWarnings];
    const evidenceRows: EvidenceInsertRow[] = [];

    await this.db.insertInto("xy_wap_embed_session_summary").values({
      session_title: output.summary.sessionTitle,
      snapshot_id: snapshotId,
      summary_text: output.summary.text,
    }).executeTakeFirst();

    await this.db.insertInto("xy_wap_embed_session_problem_resolution").values({
      agent_action_summary: null,
      confidence: output.problemResolution.confidence,
      customer_final_state: null,
      problem_detected: output.problemResolution.problemDetected ? 1 : 0,
      problem_summary: output.problemResolution.problemSummary,
      resolution_status: output.problemResolution.resolutionStatus,
      snapshot_id: snapshotId,
      unresolved_reason: output.problemResolution.unresolvedReason ?? null,
    }).executeTakeFirst();
    await this.collectEvidenceRows(
      input,
      snapshotId,
      "problem_resolution",
      null,
      output.problemResolution.evidence.length > 0
        ? output.problemResolution.evidence
        : output.problemResolution.evidenceMessageIds,
      conversationIdBySessionId,
      evidenceRows,
    );

    for (const item of output.sentiment) {
      const id = await this.insertAndGetId("xy_wap_embed_session_sentiment", {
        confidence: item.confidence,
        polarity: item.polarity,
        reason: item.reason,
        snapshot_id: snapshotId,
      });
      await this.collectEvidenceRows(input, snapshotId, "sentiment", id, item.evidenceMessageIds, conversationIdBySessionId, evidenceRows);
    }

    for (const item of output.tags) {
      const tagId = parsePositiveInteger(item.tagId ?? "");
      if (tagId == null) {
        validationWarnings.push(`tag ${item.tagCode ?? item.tagName} has no configured id`);
        continue;
      }

      const id = await this.insertAndGetId("xy_wap_embed_session_tag", {
        confidence: item.confidence,
        snapshot_id: snapshotId,
        tag_id: tagId,
        tag_name: item.tagName,
        uid: input.job.uid,
      });
      await this.collectEvidenceRows(input, snapshotId, "tag", id, item.evidenceMessageIds, conversationIdBySessionId, evidenceRows);
    }

    for (const item of output.qaFindings) {
      const id = await this.insertAndGetId("xy_wap_embed_session_qa_finding", {
        confidence: item.confidence,
        passed: item.passed ? 1 : 0,
        reason: item.reason,
        rule_code: item.ruleCode,
        rule_name: item.ruleName,
        severity: item.severity,
        snapshot_id: snapshotId,
      });
      await this.collectEvidenceRows(input, snapshotId, "qa_finding", id, item.evidenceMessageIds, conversationIdBySessionId, evidenceRows);
    }

    for (const item of output.entities) {
      const entityId = parsePositiveInteger(item.entityId ?? "");
      if (entityId == null) {
        validationWarnings.push(`entity ${item.entityName} has no configured id`);
        continue;
      }

      const id = await this.insertAndGetId("xy_wap_embed_session_entity", {
        confidence: item.confidence,
        entity_id: entityId,
        entity_name: item.entityName,
        sentiment: item.sentiment ?? null,
        snapshot_id: snapshotId,
        uid: input.job.uid,
      });
      await this.collectEvidenceRows(input, snapshotId, "entity", id, item.evidenceMessageIds, conversationIdBySessionId, evidenceRows);
    }

    for (const item of output.intents) {
      const intentId = parsePositiveInteger(item.intentId ?? "");
      if (intentId == null) {
        validationWarnings.push(`intent ${item.intentCode ?? item.intentLabel} has no configured id`);
        continue;
      }

      const id = await this.insertAndGetId("xy_wap_embed_session_intent", {
        confidence: item.confidence,
        intent_id: intentId,
        intent_label: item.intentLabel,
        snapshot_id: snapshotId,
        uid: input.job.uid,
      });
      await this.collectEvidenceRows(input, snapshotId, "intent", id, item.evidenceMessageIds, conversationIdBySessionId, evidenceRows);
    }

    const recentActionItemTitles = await this.listRecentActionItemTitleSet({
      conversationId,
      limit: 10,
      uid: input.job.uid,
    });

    for (const item of output.actionItems) {
      const normalizedTitle = normalizeActionTitle(item.title);

      if (!normalizedTitle || recentActionItemTitles.has(normalizedTitle)) {
        continue;
      }

      const id = await this.insertAndGetId("xy_wap_embed_session_action_item", {
        action_type: "follow_up",
        conversation_id: conversationId,
        created_by_sub_user_id: null,
        due_hint: item.dueHint ?? null,
        priority: item.priority,
        session_id: sessionId,
        snapshot_id: snapshotId,
        source_type: "ai",
        status: "open",
        title: item.title,
        updated_by_sub_user_id: null,
        uid: input.job.uid,
      });
      recentActionItemTitles.add(normalizedTitle);
      await this.collectEvidenceRows(input, snapshotId, "action_item", id, item.evidenceMessageIds, conversationIdBySessionId, evidenceRows);
    }

    for (const item of output.faqCandidates) {
      const id = await this.insertAndGetId("xy_wap_embed_session_faq_candidate", {
        answer_hint: item.answerHint,
        question: item.question,
        snapshot_id: snapshotId,
        status: item.status,
        uid: input.job.uid,
      });
      await this.collectEvidenceRows(input, snapshotId, "faq_candidate", id, item.evidenceMessageIds, conversationIdBySessionId, evidenceRows);
    }

    await this.insertEvidenceRows(evidenceRows);

    await this.db
      .updateTable("xy_wap_embed_session_insight_snapshot")
      .set({
        status: validationWarnings.length > 0 ? "partial" : "ready",
        update_time: new Date(),
      })
      .where("id", "=", snapshotId)
      .where("status", "=", "building")
      .executeTakeFirst();

    await this.db
      .insertInto("xy_wap_embed_session_insight_current")
      .values({
        current_snapshot_id: snapshotId,
        session_id: sessionId,
      })
      .onDuplicateKeyUpdate({ current_snapshot_id: snapshotId })
      .executeTakeFirst();
    await this.db
      .updateTable("xy_wap_embed_logical_session")
      .set({
        current_snapshot_id: snapshotId,
        ...buildQaStatusUpdate(input.job.analysisScope, output.qaFindings),
        status: input.job.mode === "live" ? "open" : "analyzed",
        update_time: new Date(),
      })
      .where("id", "=", sessionId)
      .where("uid", "=", input.job.uid)
      .executeTakeFirst();
    await this.db
      .updateTable("xy_wap_embed_analysis_run")
      .set({
        error_message: validationWarnings.length > 0 ? validationWarnings.join("; ") : null,
        finished_at: new Date(),
        status: validationWarnings.length > 0 ? "partial" : "succeeded",
        update_time: new Date(),
      })
      .where("id", "=", parsePositiveInteger(input.runId) ?? -1)
      .executeTakeFirst();

    return String(snapshotId);
  }

  async markAnalysisJobSucceeded(jobId: string): Promise<void> {
    await this.db.updateTable("xy_wap_embed_insight_job").set({
      lease_until: null,
      locked_by: null,
      status: "succeeded",
      update_time: new Date(),
    }).where("id", "=", parsePositiveInteger(jobId) ?? -1).executeTakeFirst();
  }

  async markAnalysisRunSucceededWithoutSnapshot(input: {
    reason: string;
    runId: string;
  }): Promise<void> {
    // Succeeded means the worker handled the run; INSUFFICIENT_MESSAGES classifies the skip reason.
    await this.db.updateTable("xy_wap_embed_analysis_run").set({
      error_code: "INSUFFICIENT_MESSAGES",
      error_message: input.reason,
      finished_at: new Date(),
      status: "succeeded",
      update_time: new Date(),
    }).where("id", "=", parsePositiveInteger(input.runId) ?? -1).executeTakeFirst();
  }

  async postponeAnalysisJobForInputReadiness(
    jobId: string,
    input: { delayMs: number; reason: string },
  ): Promise<void> {
    await this.db.updateTable("xy_wap_embed_insight_job").set({
      error_code: input.reason.toUpperCase(),
      error_message: "Input is not ready for analysis",
      lease_until: null,
      locked_by: null,
      run_after: new Date(Date.now() + input.delayMs),
      status: "pending",
      update_time: new Date(),
    }).where("id", "=", parsePositiveInteger(jobId) ?? -1).executeTakeFirst();
  }

  async markSyncMessagesJobSucceeded(jobId: string): Promise<void> {
    await this.db.updateTable("xy_wap_embed_insight_job").set({
      lease_until: null,
      locked_by: null,
      status: "succeeded",
      update_time: new Date(),
    }).where("id", "=", parsePositiveInteger(jobId) ?? -1).executeTakeFirst();
  }

  async markCleanupDisabledInsightsJobSucceeded(jobId: string): Promise<void> {
    await this.db.updateTable("xy_wap_embed_insight_job").set({
      lease_until: null,
      locked_by: null,
      status: "succeeded",
      update_time: new Date(),
    }).where("id", "=", parsePositiveInteger(jobId) ?? -1).executeTakeFirst();
  }

  async markAnalysisJobFailed(jobId: string, error: unknown): Promise<void> {
    await this.db.updateTable("xy_wap_embed_insight_job").set({
      error_code: "ANALYSIS_FAILED",
      error_message: formatError(error),
      lease_until: null,
      locked_by: null,
      status: "failed",
      update_time: new Date(),
    }).where("id", "=", parsePositiveInteger(jobId) ?? -1).executeTakeFirst();
  }

  async markUidMaintenanceJobFailed(jobId: string, error: unknown): Promise<void> {
    await this.db.updateTable("xy_wap_embed_insight_job").set({
      error_code: "UID_MAINTENANCE_FAILED",
      error_message: formatError(error),
      lease_until: null,
      locked_by: null,
      run_after: new Date(Date.now() + 60_000),
      status: "pending",
      update_time: new Date(),
    })
      .where("id", "=", parsePositiveInteger(jobId) ?? -1)
      .where("job_type", "=", uidMaintenanceJobType)
      .executeTakeFirst();
  }

  async markSyncMessagesJobFailed(jobId: string, error: unknown): Promise<void> {
    await this.db.updateTable("xy_wap_embed_insight_job").set({
      error_code: "SYNC_MESSAGES_FAILED",
      error_message: formatError(error),
      lease_until: null,
      locked_by: null,
      status: "failed",
      update_time: new Date(),
    }).where("id", "=", parsePositiveInteger(jobId) ?? -1).executeTakeFirst();
  }

  async markCleanupDisabledInsightsJobFailed(jobId: string, error: unknown): Promise<void> {
    await this.db.updateTable("xy_wap_embed_insight_job").set({
      error_code: "CLEANUP_DISABLED_INSIGHTS_FAILED",
      error_message: formatError(error),
      lease_until: null,
      locked_by: null,
      status: "failed",
      update_time: new Date(),
    }).where("id", "=", parsePositiveInteger(jobId) ?? -1).executeTakeFirst();
  }

  async markAnalysisRunFailed(runId: string, error: unknown): Promise<void> {
    await this.db.updateTable("xy_wap_embed_analysis_run").set({
      error_code: "ANALYSIS_FAILED",
      error_message: formatError(error),
      finished_at: new Date(),
      status: "failed",
      update_time: new Date(),
    }).where("id", "=", parsePositiveInteger(runId) ?? -1).executeTakeFirst();
  }

  private async insertAndGetId(table: string, values: Record<string, unknown>) {
    const inserted = await this.db
      .insertInto(table as never)
      .values(values as never)
      .executeTakeFirstOrThrow() as InsertResult;

    return parseInsertedMySqlId(inserted) ?? -1;
  }

  private async getSessionConversationId(
    sessionId: string,
    conversationIdBySessionId: Map<string, number>,
  ) {
    const sessionKey = sessionId;
    let conversationId = conversationIdBySessionId.get(sessionKey);

    if (conversationId == null) {
      const session = await this.db
        .selectFrom("xy_wap_embed_logical_session")
        .select(["conversation_id"])
        .where("id", "=", parsePositiveInteger(sessionId) ?? -1)
        .executeTakeFirst() as { conversation_id: number | string } | undefined;
      conversationId = parseNumber(session?.conversation_id);
      conversationIdBySessionId.set(sessionKey, conversationId);
    }

    return conversationId;
  }

  private async listRecentActionItemTitleSet(input: {
    conversationId: number;
    limit: number;
    uid: number;
  }) {
    const rows = await this.db
      .selectFrom("xy_wap_embed_session_action_item")
      .select(["title"])
      .where("uid", "=", input.uid)
      .where("conversation_id", "=", input.conversationId)
      .orderBy("id", "desc")
      .limit(Math.max(0, Math.min(input.limit, 10)))
      .execute() as Array<{ title: string }>;

    return new Set(rows.map((row) => normalizeActionTitle(row.title)).filter(Boolean));
  }

  private async collectEvidenceRows(
    input: SaveAnalysisResultInput,
    snapshotId: number,
    dimensionType: string,
    dimensionRecordId: number | null,
    evidenceMessageIds: Array<string | { evidenceRole: string; messageId: string; reason?: string }>,
    conversationIdBySessionId: Map<string, number>,
    evidenceRows: EvidenceInsertRow[],
  ) {
    if (evidenceMessageIds.length === 0) {
      return;
    }

    const conversationId = await this.getSessionConversationId(input.job.sessionId, conversationIdBySessionId);

    evidenceRows.push(...evidenceMessageIds.map((evidence) => {
      const messageId = typeof evidence === "string" ? evidence : evidence.messageId;

      return {
        conversation_id: conversationId,
        dimension_record_id: dimensionRecordId,
        dimension_type: dimensionType,
        evidence_role: typeof evidence === "string" ? "primary" : evidence.evidenceRole,
        reason: typeof evidence === "string" ? null : evidence.reason ?? null,
        session_id: parsePositiveInteger(input.job.sessionId) ?? -1,
        snapshot_id: snapshotId,
        source_message_id: parsePositiveInteger(messageId) ?? -1,
        uid: input.job.uid,
      };
    }));
  }

  private async insertEvidenceRows(rows: EvidenceInsertRow[]) {
    if (rows.length === 0) {
      return;
    }

    const uniqueRows = dedupeEvidenceRows(rows);

    await this.db
      .insertInto("xy_wap_embed_insight_evidence")
      .ignore()
      .values(uniqueRows)
      .executeTakeFirst();
  }
}

function dedupeEvidenceRows(rows: EvidenceInsertRow[]) {
  const uniqueRows = new Map<string, EvidenceInsertRow>();

  for (const row of rows) {
    const key = [
      row.uid,
      row.snapshot_id,
      row.dimension_type,
      row.dimension_record_id ?? "",
      row.session_id,
      row.source_message_id,
      row.evidence_role,
    ].join(":");

    if (!uniqueRows.has(key)) {
      uniqueRows.set(key, row);
    }
  }

  return Array.from(uniqueRows.values());
}

function parseNumber(value: Date | number | string | undefined) {
  if (value == null) {
    return 0;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function parseAffectedCount(value: bigint | number | string | null | undefined) {
  return parseNumber(value == null ? undefined : value.toString());
}

function calculateNextCloseAt(input: {
  hardMaxDurationHours: number;
  idleBaseAt: number;
  idleTimeoutMinutes: number;
  startedAt: number;
}) {
  return Math.min(
    input.startedAt + input.hardMaxDurationHours * 60 * 60_000,
    input.idleBaseAt + input.idleTimeoutMinutes * 60_000,
  );
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: string | null | undefined) {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function optionalString(value: string | null | undefined) {
  return value || undefined;
}

function normalizeSeverity(value: string) {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "medium";
}

function normalizeResolutionStatus(
  value: string | null | undefined,
): InsightPreviousSessionContext["resolutionStatus"] {
  return value === "no_customer_problem"
    || value === "partially_resolved"
    || value === "resolved"
    || value === "unknown"
    || value === "unresolved"
    ? value
    : "unknown";
}

function normalizeActionStatus(value: string): "dismissed" | "done" | "expired" | "open" {
  return value === "done" || value === "dismissed" || value === "expired" || value === "open"
    ? value
    : "open";
}

function normalizePriority(value: string): "high" | "low" | "medium" {
  return value === "high" || value === "low" || value === "medium" ? value : "medium";
}

function normalizeActionTitle(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, "").toLowerCase();
}

function parsePositiveInteger(value: string) {
  if (!/^[1-9]\d*$/.test(value)) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function parseInsertedMySqlId(result: InsertResult) {
  const value = result.insertId ?? result.id;

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value) {
    return Number(value);
  }

  return undefined;
}

function getInsertedRows(result: InsertResult | undefined) {
  const value = result?.numInsertedOrUpdatedRows;

  if (value == null) {
    return 1;
  }

  return Number(value);
}

function getAffectedRows(result: unknown) {
  if (Array.isArray(result)) {
    return result.reduce((sum, item) => sum + getAffectedRows(item), 0);
  }

  if (!result || typeof result !== "object") {
    return 0;
  }

  const values = result as {
    affectedRows?: bigint | number;
    numAffectedRows?: bigint | number;
    numChangedRows?: bigint | number;
    numUpdatedRows?: bigint | number;
  };
  const affectedRows =
    values.numAffectedRows ??
    values.numUpdatedRows ??
    values.numChangedRows ??
    values.affectedRows;

  if (typeof affectedRows === "bigint") {
    return Number(affectedRows);
  }

  return affectedRows ?? 0;
}

function normalizeAnalysisScope(value: string): InsightRescanAnalysisScope {
  if (value === "all" || value === "qaFindings" || value === "classification") {
    return value;
  }

  return "all";
}

function buildQaStatusUpdate(
  analysisScope: InsightRescanAnalysisScope,
  qaFindings: SaveAnalysisResultInput["output"]["qaFindings"],
) {
  if (analysisScope !== "all" && analysisScope !== "qaFindings") {
    return {};
  }

  return {
    qa_status: qaFindings.length === 0
      ? -1
      : qaFindings.some((item) => !item.passed)
        ? 0
        : 1,
  };
}

function normalizeLogicalSessionStatus(value: string): InsightWorkerExistingSession["status"] {
  if (
    value === "open"
    || value === "canceled"
    || value === "closed_pending_analysis"
    || value === "analyzed"
  ) {
    return value;
  }

  return "analyzed";
}

function parseJobMode(row: AnalyzeJobRow) {
  if (row.job_type === "reanalyze_session") {
    return "manual_reanalyze" as const;
  }

  const mode = row.idempotency_key.split(":").at(3);

  return mode === "final" ? "final" as const : "live" as const;
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
