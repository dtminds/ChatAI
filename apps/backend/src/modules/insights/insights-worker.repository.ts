import { sql, type Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import type { InsightPromptContext } from "./insight-prompt-builder.js";
import type {
  AppendSessionMessageInput,
  CloseSessionInput,
  ClosableOpenSession,
  CreateAnalyzeJobInput,
  CreateLogicalSessionInput,
  SaveAnalysisResultInput,
  ShouldCreateLiveAnalyzeJobInput,
  ClaimedSyncMessagesJob,
  InsightWorkerCursor,
  InsightWorkerMessage,
  InsightWorkerRepositoryPort,
  InsightWorkerSessionizationConfig,
} from "./insights-worker.js";
import { getInitialInsightWorkerCursor } from "./insights-worker-runtime.js";

type InsertResult = {
  id?: bigint | number | string | null;
  insertId?: bigint | number | string | null;
  numInsertedOrUpdatedRows?: bigint | number | string | null;
};

type CursorRow = {
  cursor_audit_id: number | string;
  cursor_msgtime: number | string;
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
  id: number | string;
  idempotency_key: string;
  job_type: string;
  target_id: string;
  uid: number | string;
};

type AnalysisMessageRow = MessageRow & {
  conversation_id: number | string;
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
const cursorSource = "xy_wap_embed_msg_audit_info";

export class MysqlInsightWorkerRepository implements InsightWorkerRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly options: { startLookbackDays?: number } = {},
  ) {}

  async getCursor(): Promise<InsightWorkerCursor> {
    const row = await this.db
      .selectFrom("xy_wap_embed_insight_sync_cursor")
      .select(["cursor_audit_id", "cursor_msgtime"])
      .where("source", "=", cursorSource)
      .where("uid", "is", null)
      .executeTakeFirst() as CursorRow | undefined;

    if (row) {
      return {
        cursorAuditId: parseNumber(row.cursor_audit_id),
        cursorMsgtime: parseNumber(row.cursor_msgtime),
      };
    }

    return getInitialInsightWorkerCursor({
      startLookbackDays: this.options.startLookbackDays ?? 3,
    });
  }

  async getPromptContext(uid: number): Promise<InsightPromptContext> {
    const [labelRows, qaRuleRows, entityRows] = await Promise.all([
      this.db
        .selectFrom("xy_wap_embed_insight_label_config")
        .select([
          "description",
          "include_in_statistics",
          "label_code",
          "label_name",
          "negative_examples_json",
          "positive_examples_json",
        ])
        .where("uid", "=", uid)
        .where("enabled", "=", 1)
        .orderBy("id", "asc")
        .execute() as Promise<Array<{
          description: string | null;
          include_in_statistics: number | string;
          label_code: string;
          label_name: string;
          negative_examples_json: string | null;
          positive_examples_json: string | null;
        }>>,
      this.db
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
        .where("enabled", "=", 1)
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
        }>>,
      this.db
        .selectFrom("xy_wap_embed_insight_entity_dictionary")
        .select([
          "aliases_json",
          "attributes_json",
          "canonical_name",
          "entity_type",
          "include_in_aggregation",
        ])
        .where("uid", "=", uid)
        .where("enabled", "=", 1)
        .orderBy("id", "asc")
        .execute() as Promise<Array<{
          aliases_json: string | null;
          attributes_json: string | null;
          canonical_name: string;
          entity_type: string;
          include_in_aggregation: number | string;
        }>>,
    ]);

    return {
      entityDictionary: entityRows.map((row) => ({
        aliases: parseJsonArray(row.aliases_json),
        attributes: parseJsonObject(row.attributes_json),
        canonicalName: row.canonical_name,
        entityType: row.entity_type,
        includeInAggregation: parseNumber(row.include_in_aggregation) === 1,
      })),
      labelConfigs: labelRows.map((row) => ({
        description: optionalString(row.description),
        includeInStatistics: parseNumber(row.include_in_statistics) === 1,
        labelCode: row.label_code,
        labelName: row.label_name,
        negativeExamples: parseJsonArray(row.negative_examples_json),
        positiveExamples: parseJsonArray(row.positive_examples_json),
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
    const row = await this.db
      .selectFrom("xy_wap_embed_logical_session")
      .select(["id", "last_meaningful_message_at", "started_at"])
      .where("uid", "=", input.uid)
      .where("conversation_id", "=", parsePositiveInteger(input.conversationId) ?? -1)
      .where("status", "=", "open")
      .orderBy("started_at", "desc")
      .executeTakeFirst() as OpenSessionRow | undefined;

    return row
      ? {
          lastMeaningfulMessageAt:
            row.last_meaningful_message_at == null
              ? null
              : parseNumber(row.last_meaningful_message_at),
          sessionId: String(row.id),
          startedAt: parseNumber(row.started_at),
        }
      : undefined;
  }

  async listClosableOpenSessions(input: {
    limit: number;
    now: number;
    uidAllowlist?: Set<number>;
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
      .where((eb) =>
        eb.or([
          eb(
            sql<number>`(${input.now} - started_at)`,
            ">",
            sql<number>`hard_max_duration_hours * 3600000`,
          ),
          eb(
            sql<number>`(${input.now} - COALESCE(last_meaningful_message_at, started_at))`,
            ">",
            sql<number>`idle_timeout_minutes * 60000`,
          ),
        ]),
      )
      .orderBy("started_at", "asc")
      .limit(input.limit);

    if (input.uidAllowlist && input.uidAllowlist.size > 0) {
      query = query.where("uid", "in", Array.from(input.uidAllowlist));
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
    limit: number;
    uidAllowlist?: Set<number>;
  }) {
    let query = this.db
      .selectFrom("xy_wap_embed_logical_session")
      .select(["id", "uid"])
      .where("status", "=", "open")
      .orderBy("last_message_at", "asc")
      .limit(input.limit);

    if (input.uidAllowlist && input.uidAllowlist.size > 0) {
      query = query.where("uid", "in", Array.from(input.uidAllowlist));
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

  async createLogicalSession(input: CreateLogicalSessionInput): Promise<string> {
    const inserted = await this.db
      .insertInto("xy_wap_embed_logical_session")
      .values({
        analysis_delay_minutes: input.config.analysisDelayMinutes,
        conversation_id: parsePositiveInteger(input.conversationId) ?? -1,
        hard_max_duration_hours: input.config.hardMaxDurationHours,
        idle_timeout_minutes: input.config.idleTimeoutMinutes,
        last_meaningful_message_at: input.startedAt,
        last_message_at: input.startedAt,
        rule_version: input.config.ruleVersion,
        started_at: input.startedAt,
        status: "open",
        uid: input.uid,
      })
      .executeTakeFirstOrThrow() as InsertResult;

    return String(parseInsertedMySqlId(inserted));
  }

  async appendSessionMessage(input: AppendSessionMessageInput): Promise<void> {
    const result = await this.db
      .insertInto("xy_wap_embed_logical_session_message")
      .values({
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
        update_time: new Date(),
      })
      .where("id", "=", parsePositiveInteger(input.sessionId) ?? -1)
      .executeTakeFirst();
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

  async updateCursor(cursor: InsightWorkerCursor): Promise<void> {
    const existing = await this.db
      .selectFrom("xy_wap_embed_insight_sync_cursor")
      .select(["id"])
      .where("source", "=", cursorSource)
      .where("uid", "is", null)
      .executeTakeFirst() as { id: number | string } | undefined;

    if (existing) {
      await this.db
        .updateTable("xy_wap_embed_insight_sync_cursor")
        .set({
          cursor_audit_id: cursor.cursorAuditId,
          cursor_msgtime: cursor.cursorMsgtime,
          update_time: new Date(),
        })
        .where("id", "=", parseNumber(existing.id))
        .executeTakeFirst();
      return;
    }

    await this.db
      .insertInto("xy_wap_embed_insight_sync_cursor")
      .values({
        cursor_audit_id: cursor.cursorAuditId,
        cursor_msgtime: cursor.cursorMsgtime,
        source: cursorSource,
        uid: null,
      })
      .executeTakeFirst();
  }

  async claimNextSyncMessagesJob(input: {
    uidAllowlist?: Set<number>;
  }): Promise<ClaimedSyncMessagesJob | undefined> {
    let query = this.db
      .selectFrom("xy_wap_embed_insight_job")
      .select(["id", "target_id", "uid"])
      .where("status", "=", "pending")
      .where("target_type", "=", "uid")
      .where("job_type", "=", "sync_messages")
      .where("run_after", "<=", new Date())
      .orderBy("priority", "desc")
      .orderBy("id", "asc");

    if (input.uidAllowlist && input.uidAllowlist.size > 0) {
      query = query.where("uid", "in", Array.from(input.uidAllowlist));
    }

    const row = await query.executeTakeFirst() as {
      id: number | string;
      target_id: string;
      uid: number | string;
    } | undefined;

    if (!row) {
      return undefined;
    }

    await this.db
      .updateTable("xy_wap_embed_insight_job")
      .set({
        attempt_count: sql<number>`attempt_count + 1`,
        lease_until: new Date(Date.now() + 60_000),
        locked_by: "node-worker",
        status: "running",
        update_time: new Date(),
      })
      .where("id", "=", parseNumber(row.id))
      .where("status", "=", "pending")
      .executeTakeFirst();

    return {
      cursorMsgtime: new Date(row.target_id).getTime(),
      jobId: String(row.id),
      uid: parseNumber(row.uid),
    };
  }

  async claimNextAnalyzeJob() {
    const row = await this.db
      .selectFrom("xy_wap_embed_insight_job")
      .select(["analysis_scope", "id", "idempotency_key", "job_type", "target_id", "uid"])
      .where("status", "=", "pending")
      .where("target_type", "=", "logical_session")
      .where("job_type", "in", ["analyze_session", "reanalyze_session"])
      .where("run_after", "<=", new Date())
      .orderBy("priority", "desc")
      .orderBy("id", "asc")
      .executeTakeFirst() as AnalyzeJobRow | undefined;

    if (!row) {
      return undefined;
    }

    await this.db
      .updateTable("xy_wap_embed_insight_job")
      .set({
        attempt_count: sql<number>`attempt_count + 1`,
        lease_until: new Date(Date.now() + 60_000),
        locked_by: "node-worker",
        status: "running",
        update_time: new Date(),
      })
      .where("id", "=", parseNumber(row.id))
      .where("status", "=", "pending")
      .executeTakeFirst();

    return {
      analysisScope: "all" as const,
      jobId: String(row.id),
      mode: parseJobMode(row),
      sessionId: row.target_id,
      uid: parseNumber(row.uid),
    };
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
      ])
      .where("uid", "=", input.uid)
      .where("enabled", "=", 1)
      .executeTakeFirst() as {
        live_analysis_enabled: number | string;
        live_min_interval_minutes: number | string;
        live_min_new_meaningful_messages: number | string;
      } | undefined;
    const liveEnabled = policy ? Number(policy.live_analysis_enabled) === 1 : true;

    if (!liveEnabled) {
      return false;
    }

    const pendingLiveJob = await this.db
      .selectFrom("xy_wap_embed_insight_job")
      .select(["id"])
      .where("target_type", "=", "logical_session")
      .where("target_id", "=", input.sessionId)
      .where("job_type", "=", "analyze_session")
      .where("status", "in", ["pending", "running"])
      .where("idempotency_key", "like", `analyze_session:${input.uid}:${input.sessionId}:live:%`)
      .executeTakeFirst();

    if (pendingLiveJob) {
      return false;
    }

    const minMessages = policy
      ? parseNumber(policy.live_min_new_meaningful_messages)
      : DEFAULT_LIVE_MIN_NEW_MEANINGFUL_MESSAGES;
    const minIntervalMs = (policy
      ? parseNumber(policy.live_min_interval_minutes)
      : DEFAULT_LIVE_MIN_INTERVAL_MINUTES) * 60_000;
    const latestLiveRun = await this.db
      .selectFrom("xy_wap_embed_analysis_run")
      .select(["source_message_to", "create_time"])
      .where("session_id", "=", parsePositiveInteger(input.sessionId) ?? -1)
      .where("mode", "=", "live")
      .where("status", "in", ["running", "succeeded"])
      .orderBy("id", "desc")
      .executeTakeFirst() as {
        create_time: Date | string;
        source_message_to: number | string | null;
      } | undefined;

    if (latestLiveRun && Date.now() - new Date(latestLiveRun.create_time).getTime() < minIntervalMs) {
      return false;
    }

    const sinceMessageId = latestLiveRun?.source_message_to == null
      ? 0
      : parseNumber(latestLiveRun.source_message_to);
    const row = await this.db
      .selectFrom("xy_wap_embed_logical_session_message")
      .select((eb) => eb.fn.count<number>("id").as("count"))
      .where("session_id", "=", parsePositiveInteger(input.sessionId) ?? -1)
      .where("included_for_ai", "=", 1)
      .where("meaningful_for_boundary", "=", 1)
      .where("source_message_id", ">", sinceMessageId)
      .executeTakeFirst() as { count: number | string } | undefined;

    return parseNumber(row?.count) >= minMessages;
  }

  async saveAnalysisResult(input: SaveAnalysisResultInput): Promise<string> {
    const sessionId = parsePositiveInteger(input.job.sessionId) ?? -1;
    const insertedSnapshot = await this.db
      .insertInto("xy_wap_embed_session_insight_snapshot")
      .values({
        analysis_version: "insights-v1",
        phase: input.job.mode === "final" ? "final" : "live",
        prompt_version: "insights-v1",
        rule_version: "insights-v1",
        session_id: sessionId,
        source_message_high_watermark:
          input.sourceMessageHighWatermark == null
            ? null
            : parsePositiveInteger(input.sourceMessageHighWatermark) ?? null,
        status: input.validationWarnings.length > 0 ? "partial" : "ready",
      })
      .executeTakeFirstOrThrow() as InsertResult;
    const snapshotId = parseInsertedMySqlId(insertedSnapshot) ?? -1;
    const output = input.output;

    await this.db.insertInto("xy_wap_embed_session_summary").values({
      confidence: output.summary.confidence,
      customer_intent: output.summary.customerIntent,
      follow_up: output.summary.followUp ?? null,
      process_summary: output.summary.processSummary,
      result_summary: output.summary.resultSummary,
      snapshot_id: snapshotId,
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
    await this.insertEvidenceRows(input, snapshotId, "problem_resolution", null, output.problemResolution.evidenceMessageIds);

    for (const item of output.sentiment) {
      const id = await this.insertAndGetId("xy_wap_embed_session_sentiment", {
        confidence: item.confidence,
        polarity: item.polarity,
        reason: item.reason,
        snapshot_id: snapshotId,
      });
      await this.insertEvidenceRows(input, snapshotId, "sentiment", id, item.evidenceMessageIds);
    }

    for (const item of output.tags) {
      const id = await this.insertAndGetId("xy_wap_embed_session_tag", {
        confidence: item.confidence,
        snapshot_id: snapshotId,
        tag_code: item.tagCode,
        tag_name: item.tagName,
      });
      await this.insertEvidenceRows(input, snapshotId, "tag", id, item.evidenceMessageIds);
    }

    for (const item of output.qaFindings) {
      const id = await this.insertAndGetId("xy_wap_embed_session_qa_finding", {
        confidence: item.confidence,
        passed: item.passed ? 1 : 0,
        reason: item.reason,
        rule_code: item.ruleCode,
        severity: item.severity,
        snapshot_id: snapshotId,
      });
      await this.insertEvidenceRows(input, snapshotId, "qa_finding", id, item.evidenceMessageIds);
    }

    for (const item of output.risks) {
      const id = await this.insertAndGetId("xy_wap_embed_session_risk", {
        confidence: item.confidence,
        reason: item.reason,
        risk_level: item.riskLevel,
        risk_type: item.riskType,
        snapshot_id: snapshotId,
      });
      await this.insertEvidenceRows(input, snapshotId, "risk", id, item.evidenceMessageIds);
    }

    for (const item of output.entities) {
      const id = await this.insertAndGetId("xy_wap_embed_session_entity", {
        confidence: item.confidence,
        entity_id: item.entityId,
        entity_name: item.entityName,
        entity_type: item.entityType,
        sentiment: item.sentiment ?? null,
        snapshot_id: snapshotId,
      });
      await this.insertEvidenceRows(input, snapshotId, "entity", id, item.evidenceMessageIds);
    }

    for (const item of output.intents) {
      const id = await this.insertAndGetId("xy_wap_embed_session_intent", {
        confidence: item.confidence,
        intent_code: item.intentCode,
        intent_label: item.intentLabel,
        snapshot_id: snapshotId,
      });
      await this.insertEvidenceRows(input, snapshotId, "intent", id, item.evidenceMessageIds);
    }

    for (const item of output.actionItems) {
      const id = await this.insertAndGetId("xy_wap_embed_session_action_item", {
        action_type: item.actionType,
        due_hint: item.dueHint ?? null,
        priority: item.priority,
        snapshot_id: snapshotId,
        status: "open",
        title: item.title,
      });
      await this.insertEvidenceRows(input, snapshotId, "action_item", id, item.evidenceMessageIds);
    }

    for (const item of output.faqCandidates) {
      const id = await this.insertAndGetId("xy_wap_embed_session_faq_candidate", {
        answer_hint: item.answerHint,
        question: item.question,
        snapshot_id: snapshotId,
        status: item.status,
      });
      await this.insertEvidenceRows(input, snapshotId, "faq_candidate", id, item.evidenceMessageIds);
    }

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
        status: input.job.mode === "final" ? "analyzed" : "open",
        update_time: new Date(),
      })
      .where("id", "=", sessionId)
      .executeTakeFirst();
    await this.db
      .updateTable("xy_wap_embed_analysis_run")
      .set({
        error_message: input.validationWarnings.length > 0 ? input.validationWarnings.join("; ") : null,
        finished_at: new Date(),
        status: input.validationWarnings.length > 0 ? "partial" : "succeeded",
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

  async markSyncMessagesJobSucceeded(jobId: string): Promise<void> {
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

  private async insertEvidenceRows(
    input: SaveAnalysisResultInput,
    snapshotId: number,
    dimensionType: string,
    dimensionRecordId: number | null,
    evidenceMessageIds: string[],
  ) {
    const rows = evidenceMessageIds.map((messageId) => ({
      conversation_id: -1,
      dimension_record_id: dimensionRecordId,
      dimension_type: dimensionType,
      evidence_role: "primary",
      reason: null,
      session_id: parsePositiveInteger(input.job.sessionId) ?? -1,
      snapshot_id: snapshotId,
      source_message_id: parsePositiveInteger(messageId) ?? -1,
      uid: input.job.uid,
    }));

    if (rows.length === 0) {
      return;
    }

    const session = await this.db
      .selectFrom("xy_wap_embed_logical_session")
      .select(["conversation_id"])
      .where("id", "=", parsePositiveInteger(input.job.sessionId) ?? -1)
      .executeTakeFirst() as { conversation_id: number | string } | undefined;
    const conversationId = parseNumber(session?.conversation_id);

    await this.db
      .insertInto("xy_wap_embed_insight_evidence")
      .values(rows.map((row) => ({ ...row, conversation_id: conversationId })))
      .executeTakeFirst();
  }
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
