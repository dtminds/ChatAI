import type {
  InsightAnalysisPolicy,
  InsightAnalysisPolicyUpdateRequest,
  InsightActionStatus,
  InsightAnalysisStatus,
  InsightConfigStatus,
  InsightDetailResponse,
  InsightEntityDictionaryItem,
  InsightEntityDictionaryMutationRequest,
  InsightFeatureConfig,
  InsightFeatureConfigUpdateRequest,
  InsightIntentConfig,
  InsightIntentConfigMutationRequest,
  InsightLabelConfig,
  InsightLabelConfigMutationRequest,
  InsightMessageContextResponse,
  InsightQaRuleConfig,
  InsightQaRuleConfigMutationRequest,
  InsightRescanAnalysisScope,
  InsightRescanTaskStatus,
  WorkbenchMessageDto,
  InsightSettingsResponse,
  InsightSettingsSummaryResponse,
  InsightSessionizationSettings,
  InsightSessionizationSettingsUpdateRequest,
} from "@chatai/contracts";
import { sql, type Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import {
  buildMissingQuotedMessagePreview,
  buildQuotedMessagePreview,
  getQuoteMessageAuditId,
  hydrateMessageRows,
  mapMessageRow,
  type MessageHydrationSources,
  type MessageRow,
  type MessageRowQuotePreview,
} from "../chat/workbench-mappers.js";
import { uniquePositiveNumbers } from "../../shared/id-utils.js";
import type {
  InsightActionItemPage,
  InsightDetailActionItemRow,
  InsightActionItemRow,
  InsightBusinessSessionAggregateRow,
  InsightBusinessTopicFactRow,
  InsightCurrentSessionPage,
  InsightCurrentSessionRow,
  InsightDetailRow,
  InsightEvidenceMessageRow,
  InsightOverviewAggregateRow,
  InsightQualityAgentStatRow,
  InsightQualityAggregateRow,
  InsightsFollowUpFilters,
  InsightsOverviewFilters,
  InsightsRepositoryPort,
  InsightsUidScope,
} from "./insights.service.js";
import { buildInsightMessageInput } from "./insight-message-input-builder.js";
import {
  parseInsightMessageContent,
  readInsightContentString,
} from "./insight-message-input-builder.js";
import { parseFeatureConfigRow } from "./insights-feature-config-mapper.js";
import { DEFAULT_INSIGHT_SETTINGS } from "./insights-seeds.js";

type CurrentSessionQueryRow = {
  action_id?: number | string | null;
  action_status?: string | null;
  action_type?: string | null;
  action_priority?: string | null;
  action_title?: string | null;
  agent_message_count: number | string;
  conversation_id: number | string;
  current_snapshot_id: number | string;
  customer_message_count: number | string;
  ended_at: number | string | null;
  evidence_message_id?: number | string | null;
  evidence_role?: string | null;
  generated_at: number | string | Date;
  last_message_at: number | string | null;
  last_customer_message_at: number | string | null;
  message_count: number | string;
  phase: string;
  problem_detected: number | string | null;
  problem_confidence?: number | string | null;
  problem_summary: string | null;
  resolution_status: string | null;
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
  created_at?: Date | number | string;
  evidence_message_id: number | string | null;
  last_customer_message_at: number | string | null;
  priority: string;
  resolution_status: string | null;
  session_id: number | string;
  snapshot_id?: number | string;
  title: string;
  total_count?: number | string;
};

type CurrentSessionCoreQueryRow = Omit<CurrentSessionQueryRow,
  "last_customer_message_at"
> & {
  last_customer_message_at?: number | string | null;
};

type CountQueryRow = {
  count: number | string;
};

type OverviewAggregateTotalsQueryRow = {
  action_items_open: number | string;
  agent_messages: number | string;
  consulting_customers: number | string;
  customer_messages: number | string;
  failed: number | string;
  logical_sessions: number | string;
  messages: number | string;
  no_customer_problem_sessions: number | string;
  partial: number | string;
  partially_resolved_sessions: number | string;
  problem_sessions: number | string;
  ready: number | string;
  resolved_sessions: number | string;
  stale: number | string;
  unknown_sessions: number | string;
  unresolved_resolution_sessions: number | string;
  unresolved_sessions: number | string;
};

type OverviewTrendQueryRow = {
  agent_messages: number | string;
  consulting_customers: number | string;
  customer_messages: number | string;
  date: string;
  logical_sessions: number | string;
  messages: number | string;
};

type QualityAggregateQueryRow = {
  analyzed_sessions: number | string;
  no_customer_problem: number | string;
  partial: number | string;
  problem_sessions: number | string;
  resolved: number | string;
  total_sessions: number | string;
  unresolved: number | string;
};

type QualityAgentStatQueryRow = {
  agent_avatar_url: string | null;
  agent_name: string | null;
  agent_seat_id: string | null;
  partial: number | string;
  problem_sessions: number | string;
  resolved: number | string;
  total_sessions: number | string;
  unresolved: number | string;
};

type BusinessSessionAggregateQueryRow = {
  action_items_open: number | string;
  analyzed_sessions: number | string;
  date: string;
  session_id: number | string;
  started_at: number | string;
  unresolved_sessions: number | string;
};

type CurrentSessionActionAggregateRow = {
  action_open_count: number | string;
  snapshot_id: number | string;
};

type ProblemEvidenceMessageRow = {
  evidence_message_id: number | string;
  last_customer_message_at: number | string | null;
  snapshot_id: number | string;
};

type DetailQueryRow = CurrentSessionCoreQueryRow;

type QaFindingQueryRow = {
  qa_finding_id: number | string | null;
  qa_passed: number | string | null;
  qa_reason: string | null;
  qa_rule_code: string | null;
  qa_rule_name: string | null;
  qa_severity: string | null;
};

type DimensionEvidenceRow = {
  dimension_record_id: number | string | null;
  dimension_type: string;
  evidence_role: string;
  reason: string | null;
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
  session_count: number | string;
};

type IntentDistributionQueryRow = {
  count: number | string;
  intent_code: string;
  intent_label: string;
};

type FeatureConfigRow = {
  entity_enabled: number | string;
  insight_enabled: number | string;
  intent_enabled: number | string;
  label_enabled: number | string;
  last_enable_time: number | string | null;
  qa_enabled: number | string;
  todo_enabled: number | string;
};

type BusinessTopicFactQueryRow = {
  code: string;
  mention_count: number | string;
  name: string;
  sentiment: string | null;
  session_id: number | string;
  snapshot_id: number | string;
  started_at: number | string;
  type: string | null;
};

type BusinessSessionScopeRow = {
  session_id: number | string;
  snapshot_id: number | string;
  started_at: number | string;
};

type AssetTopicMessageQueryRow = {
  content: string | null;
  message_type: string;
  session_id: number | string;
  snapshot_id: number | string;
  source_message_id: number | string;
  started_at: number | string;
};

type SessionTagTopicRow = {
  snapshot_id: number | string;
  tag_code: string;
  tag_name: string;
};

type SessionEntityTopicRow = {
  entity_id: string;
  entity_name: string;
  entity_type: string;
  snapshot_id: number | string;
};

type SessionIntentTopicRow = {
  intent_code: string;
  intent_label: string;
  snapshot_id: number | string;
};

type SessionAssetTopicRow = AssetTopicMessageQueryRow;

type ContactProfile = {
  avatarUrl: string;
  name: string;
};

type SeatProfile = {
  avatarUrl: string;
  name: string;
  seatId: string;
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

type InsightConversationRow = {
  chat_type: number;
  conversation_external_id: string;
  conversation_group_id: string;
  conversation_id: number | string;
  group_seat_id: number | string | null;
  platform: number;
  seat_id: number | string;
  session_id: number | string;
  third_userid: string;
  uid: number;
};

type InsertResult = {
  id?: bigint | number | string | null;
  insertId?: bigint | number | string | null;
};

const manualActionStatuses = new Set<InsightActionStatus>(["done", "dismissed"]);
const allCurrentSessionsLimit = 5_000;

export class InsightsRepository implements InsightsRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async getSettings(scope: InsightsUidScope): Promise<InsightSettingsResponse> {
    const [
      sessionization,
      analysisPolicy,
      featureConfig,
      intentConfigs,
      labelConfigs,
      qaRuleConfigs,
      entityDictionary,
    ] = await Promise.all([
      this.getSessionizationSettings(scope),
      this.getAnalysisPolicy(scope),
      this.getFeatureConfig(scope),
      this.listIntentConfigs(scope),
      this.listLabelConfigs(scope),
      this.listQaRuleConfigs(scope),
      this.listEntityDictionary(scope),
    ]);

    return {
      analysisPolicy,
      entityDictionary,
      featureConfig,
      intentConfigs,
      labelConfigs,
      qaRuleConfigs,
      sessionization,
    };
  }

  async getSettingsSummary(scope: InsightsUidScope): Promise<InsightSettingsSummaryResponse> {
    const [
      enabledIntentResult,
      enabledLabelResult,
      enabledQaResult,
      entityResult,
      sessionization,
      analysisPolicy,
      featureConfig,
    ] = await Promise.all([
      this.db
        .selectFrom("xy_wap_embed_insight_intent_config")
        .select((eb) => eb.fn.countAll().as("count"))
        .where("uid", "=", scope.uid)
        .where("status", "=", 1)
        .executeTakeFirst(),
      this.db
        .selectFrom("xy_wap_embed_insight_label_config")
        .select((eb) => eb.fn.countAll().as("count"))
        .where("uid", "=", scope.uid)
        .where("status", "=", 1)
        .executeTakeFirst(),
      this.db
        .selectFrom("xy_wap_embed_insight_qa_rule_config")
        .select((eb) => eb.fn.countAll().as("count"))
        .where("uid", "=", scope.uid)
        .where("status", "=", 1)
        .executeTakeFirst(),
      this.db
        .selectFrom("xy_wap_embed_insight_entity_dictionary")
        .select((eb) => eb.fn.countAll().as("count"))
        .where("uid", "=", scope.uid)
        .where("status", "=", 1)
        .executeTakeFirst(),
      this.getSessionizationSettings(scope),
      this.getAnalysisPolicy(scope),
      this.getFeatureConfig(scope),
    ]);

    return {
      enabledIntentCount: Number(enabledIntentResult?.count ?? 0),
      enabledLabelCount: Number(enabledLabelResult?.count ?? 0),
      enabledQaCount: Number(enabledQaResult?.count ?? 0),
      entityCount: Number(entityResult?.count ?? 0),
      insightEnabled: featureConfig.insightEnabled,
      liveAnalysisEnabled: analysisPolicy.liveAnalysisEnabled,
      sessionizationIdleMinutes: sessionization.idleTimeoutMinutes,
    };
  }

  async getPolicySettings(scope: InsightsUidScope): Promise<{
    analysisPolicy: InsightAnalysisPolicy;
    sessionization: InsightSessionizationSettings;
  }> {
    const [analysisPolicy, sessionization] = await Promise.all([
      this.getAnalysisPolicy(scope),
      this.getSessionizationSettings(scope),
    ]);

    return { analysisPolicy, sessionization };
  }

  async upsertSessionizationSettings(
    scope: InsightsUidScope,
    payload: InsightSessionizationSettingsUpdateRequest,
  ): Promise<InsightSessionizationSettings> {
    await this.db
      .insertInto("xy_wap_embed_sessionization_config")
      .values({
        analysis_delay_minutes: payload.analysisDelayMinutes,
        enabled: 1,
        hard_max_duration_hours: payload.hardMaxDurationHours,
        idle_timeout_minutes: payload.idleTimeoutMinutes,
        late_arrival_window_minutes: payload.lateArrivalWindowMinutes,
        preset: payload.preset,
        rule_version: "v1",
        uid: scope.uid,
      })
      .onDuplicateKeyUpdate({
        analysis_delay_minutes: payload.analysisDelayMinutes,
        enabled: 1,
        hard_max_duration_hours: payload.hardMaxDurationHours,
        idle_timeout_minutes: payload.idleTimeoutMinutes,
        late_arrival_window_minutes: payload.lateArrivalWindowMinutes,
        preset: payload.preset,
        update_time: new Date(),
      })
      .execute();

    return this.getSessionizationSettings(scope);
  }

  async upsertAnalysisPolicy(
    scope: InsightsUidScope,
    payload: InsightAnalysisPolicyUpdateRequest,
  ): Promise<InsightAnalysisPolicy> {
    await this.db
      .insertInto("xy_wap_embed_insight_analysis_policy")
      .values({
        enabled: 1,
        final_analysis_enabled: payload.finalAnalysisEnabled ? 1 : 0,
        live_analysis_enabled: payload.liveAnalysisEnabled ? 1 : 0,
        live_min_interval_minutes: payload.liveMinIntervalMinutes,
        live_min_new_meaningful_messages: payload.liveMinNewMeaningfulMessages,
        low_confidence_threshold: String(payload.lowConfidenceThreshold),
        rule_fallback_enabled: payload.ruleFallbackEnabled ? 1 : 0,
        uid: scope.uid,
      })
      .onDuplicateKeyUpdate({
        enabled: 1,
        final_analysis_enabled: payload.finalAnalysisEnabled ? 1 : 0,
        live_analysis_enabled: payload.liveAnalysisEnabled ? 1 : 0,
        live_min_interval_minutes: payload.liveMinIntervalMinutes,
        live_min_new_meaningful_messages: payload.liveMinNewMeaningfulMessages,
        low_confidence_threshold: String(payload.lowConfidenceThreshold),
        rule_fallback_enabled: payload.ruleFallbackEnabled ? 1 : 0,
        update_time: new Date(),
      })
      .execute();

    return this.getAnalysisPolicy(scope);
  }

  async upsertFeatureConfig(
    scope: InsightsUidScope,
    payload: InsightFeatureConfigUpdateRequest,
  ): Promise<InsightFeatureConfig> {
    const current = await this.getFeatureConfig(scope);
    const shouldQueueCleanup = current.insightEnabled && !payload.insightEnabled;
    const lastEnableTime = payload.insightEnabled && !current.insightEnabled
      ? Date.now()
      : current.lastEnableTime ?? null;

    await this.db
      .insertInto("xy_wap_embed_insight_feature_config")
      .values({
        entity_enabled: payload.entityEnabled ? 1 : 0,
        insight_enabled: payload.insightEnabled ? 1 : 0,
        intent_enabled: payload.intentEnabled ? 1 : 0,
        label_enabled: payload.labelEnabled ? 1 : 0,
        last_enable_time: lastEnableTime,
        qa_enabled: payload.qaEnabled ? 1 : 0,
        todo_enabled: payload.todoEnabled ? 1 : 0,
        uid: scope.uid,
      })
      .onDuplicateKeyUpdate({
        entity_enabled: payload.entityEnabled ? 1 : 0,
        insight_enabled: payload.insightEnabled ? 1 : 0,
        intent_enabled: payload.intentEnabled ? 1 : 0,
        label_enabled: payload.labelEnabled ? 1 : 0,
        last_enable_time: lastEnableTime,
        qa_enabled: payload.qaEnabled ? 1 : 0,
        todo_enabled: payload.todoEnabled ? 1 : 0,
        update_time: new Date(),
      })
      .execute();

    if (shouldQueueCleanup) {
      const cleanupEnableEpoch = current.lastEnableTime ?? 0;

      await this.db
        .insertInto("xy_wap_embed_insight_job")
        .values({
          analysis_scope: "all",
          idempotency_key: `cleanup_disabled_insights:${scope.uid}:${cleanupEnableEpoch}`,
          job_type: "cleanup_disabled_insights",
          priority: 30,
          rescan_task_id: null,
          run_after: new Date(),
          status: "pending",
          target_id: String(cleanupEnableEpoch),
          target_type: "uid",
          uid: scope.uid,
        })
        .ignore()
        .executeTakeFirst();
    }

    return this.getFeatureConfig(scope);
  }

  async createIntentConfig(
    scope: InsightsUidScope,
    payload: InsightIntentConfigMutationRequest,
  ): Promise<InsightIntentConfig> {
    const inserted = await this.db
      .insertInto("xy_wap_embed_insight_intent_config")
      .values({
        aliases_json: encodeJson(payload.aliases),
        description: payload.description ?? null,
        status: payload.status,
        include_in_statistics: payload.includeInStatistics ? 1 : 0,
        intent_code: payload.intentCode,
        intent_name: payload.intentName,
        negative_examples_json: encodeJson(payload.negativeExamples),
        positive_examples_json: encodeJson(payload.positiveExamples),
        sort_order: payload.weight,
        uid: scope.uid,
      })
      .executeTakeFirstOrThrow() as InsertResult;

    return await this.getIntentConfigById(scope, String(parseInsertedMySqlId(inserted) ?? ""))
      ?? await this.getIntentConfigByCode(scope, payload.intentCode)
      ?? mapIntentPayload("0", payload);
  }

  async updateIntentConfig(
    scope: InsightsUidScope,
    id: string,
    payload: InsightIntentConfigMutationRequest,
  ): Promise<InsightIntentConfig | undefined> {
    const numericId = parsePositiveInteger(id);

    if (numericId == null || !await this.getIntentConfigById(scope, id)) {
      return undefined;
    }

    await this.db
      .updateTable("xy_wap_embed_insight_intent_config")
      .set({
        aliases_json: encodeJson(payload.aliases),
        description: payload.description ?? null,
        status: payload.status,
        include_in_statistics: payload.includeInStatistics ? 1 : 0,
        intent_code: payload.intentCode,
        intent_name: payload.intentName,
        negative_examples_json: encodeJson(payload.negativeExamples),
        positive_examples_json: encodeJson(payload.positiveExamples),
        sort_order: payload.weight,
        update_time: new Date(),
      })
      .where("id", "=", numericId)
      .where("uid", "=", scope.uid)
      .execute();

    return this.getIntentConfigById(scope, id);
  }

  async updateIntentConfigStatus(
    scope: InsightsUidScope,
    id: string,
    status: Exclude<InsightConfigStatus, -1>,
  ): Promise<InsightIntentConfig | undefined> {
    const numericId = parsePositiveInteger(id);

    if (numericId == null || !await this.getIntentConfigById(scope, id)) {
      return undefined;
    }

    await this.db
      .updateTable("xy_wap_embed_insight_intent_config")
      .set({ status, update_time: new Date() })
      .where("id", "=", numericId)
      .where("uid", "=", scope.uid)
      .execute();

    return this.getIntentConfigById(scope, id);
  }

  async deleteIntentConfig(scope: InsightsUidScope, id: string): Promise<boolean> {
    const numericId = parsePositiveInteger(id);

    if (numericId == null || !await this.getIntentConfigById(scope, id)) {
      return false;
    }

    await this.db
      .updateTable("xy_wap_embed_insight_intent_config")
      .set({ status: -1, update_time: new Date() })
      .where("id", "=", numericId)
      .where("uid", "=", scope.uid)
      .execute();

    return true;
  }

  async createLabelConfig(
    scope: InsightsUidScope,
    payload: InsightLabelConfigMutationRequest,
  ): Promise<InsightLabelConfig> {
    const inserted = await this.db
      .insertInto("xy_wap_embed_insight_label_config")
      .values({
        description: payload.description ?? null,
        status: payload.status,
        include_in_statistics: payload.includeInStatistics ? 1 : 0,
        label_code: payload.labelCode,
        label_name: payload.labelName,
        negative_examples_json: encodeJson(payload.negativeExamples),
        positive_examples_json: encodeJson(payload.positiveExamples),
        uid: scope.uid,
      })
      .executeTakeFirstOrThrow() as InsertResult;

    return await this.getLabelConfigById(scope, String(parseInsertedMySqlId(inserted) ?? ""))
      ?? await this.getLabelConfigByCode(scope, payload.labelCode)
      ?? mapLabelPayload("0", payload);
  }

  async updateLabelConfig(
    scope: InsightsUidScope,
    id: string,
    payload: InsightLabelConfigMutationRequest,
  ): Promise<InsightLabelConfig | undefined> {
    const numericId = parsePositiveInteger(id);

    if (numericId == null || !await this.getLabelConfigById(scope, id)) {
      return undefined;
    }

    await this.db
      .updateTable("xy_wap_embed_insight_label_config")
      .set({
        description: payload.description ?? null,
        status: payload.status,
        include_in_statistics: payload.includeInStatistics ? 1 : 0,
        label_code: payload.labelCode,
        label_name: payload.labelName,
        negative_examples_json: encodeJson(payload.negativeExamples),
        positive_examples_json: encodeJson(payload.positiveExamples),
        update_time: new Date(),
      })
      .where("id", "=", numericId)
      .where("uid", "=", scope.uid)
      .execute();

    return this.getLabelConfigById(scope, id);
  }

  async updateLabelConfigStatus(
    scope: InsightsUidScope,
    id: string,
    status: Exclude<InsightConfigStatus, -1>,
  ): Promise<InsightLabelConfig | undefined> {
    const numericId = parsePositiveInteger(id);

    if (numericId == null || !await this.getLabelConfigById(scope, id)) {
      return undefined;
    }

    await this.db
      .updateTable("xy_wap_embed_insight_label_config")
      .set({ status, update_time: new Date() })
      .where("id", "=", numericId)
      .where("uid", "=", scope.uid)
      .execute();

    return this.getLabelConfigById(scope, id);
  }

  async deleteLabelConfig(scope: InsightsUidScope, id: string): Promise<boolean> {
    const numericId = parsePositiveInteger(id);

    if (numericId == null || !await this.getLabelConfigById(scope, id)) {
      return false;
    }

    await this.db
      .updateTable("xy_wap_embed_insight_label_config")
      .set({ status: -1, update_time: new Date() })
      .where("id", "=", numericId)
      .where("uid", "=", scope.uid)
      .execute();

    return true;
  }

  async createQaRuleConfig(
    scope: InsightsUidScope,
    payload: InsightQaRuleConfigMutationRequest,
  ): Promise<InsightQaRuleConfig> {
    const inserted = await this.db
      .insertInto("xy_wap_embed_insight_qa_rule_config")
      .values({
        applicable_scene: payload.applicableScene ?? null,
        description: payload.description ?? null,
        status: payload.status,
        judgment_criteria: payload.judgmentCriteria ?? null,
        negative_examples_json: encodeJson(payload.negativeExamples),
        positive_examples_json: encodeJson(payload.positiveExamples),
        rule_code: payload.ruleCode,
        rule_name: payload.ruleName,
        severity: payload.severity,
        uid: scope.uid,
      })
      .executeTakeFirstOrThrow() as InsertResult;

    return await this.getQaRuleConfigById(scope, String(parseInsertedMySqlId(inserted) ?? ""))
      ?? await this.getQaRuleConfigByCode(scope, payload.ruleCode)
      ?? mapQaRulePayload("0", payload);
  }

  async updateQaRuleConfig(
    scope: InsightsUidScope,
    id: string,
    payload: InsightQaRuleConfigMutationRequest,
  ): Promise<InsightQaRuleConfig | undefined> {
    const numericId = parsePositiveInteger(id);

    if (numericId == null || !await this.getQaRuleConfigById(scope, id)) {
      return undefined;
    }

    await this.db
      .updateTable("xy_wap_embed_insight_qa_rule_config")
      .set({
        applicable_scene: payload.applicableScene ?? null,
        description: payload.description ?? null,
        status: payload.status,
        judgment_criteria: payload.judgmentCriteria ?? null,
        negative_examples_json: encodeJson(payload.negativeExamples),
        positive_examples_json: encodeJson(payload.positiveExamples),
        rule_code: payload.ruleCode,
        rule_name: payload.ruleName,
        severity: payload.severity,
        update_time: new Date(),
      })
      .where("id", "=", numericId)
      .where("uid", "=", scope.uid)
      .execute();

    return this.getQaRuleConfigById(scope, id);
  }

  async updateQaRuleConfigStatus(
    scope: InsightsUidScope,
    id: string,
    status: Exclude<InsightConfigStatus, -1>,
  ): Promise<InsightQaRuleConfig | undefined> {
    const numericId = parsePositiveInteger(id);

    if (numericId == null || !await this.getQaRuleConfigById(scope, id)) {
      return undefined;
    }

    await this.db
      .updateTable("xy_wap_embed_insight_qa_rule_config")
      .set({ status, update_time: new Date() })
      .where("id", "=", numericId)
      .where("uid", "=", scope.uid)
      .execute();

    return this.getQaRuleConfigById(scope, id);
  }

  async deleteQaRuleConfig(scope: InsightsUidScope, id: string): Promise<boolean> {
    const numericId = parsePositiveInteger(id);

    if (numericId == null || !await this.getQaRuleConfigById(scope, id)) {
      return false;
    }

    await this.db
      .updateTable("xy_wap_embed_insight_qa_rule_config")
      .set({ status: -1, update_time: new Date() })
      .where("id", "=", numericId)
      .where("uid", "=", scope.uid)
      .execute();

    return true;
  }

  async createEntityDictionaryItem(
    scope: InsightsUidScope,
    payload: InsightEntityDictionaryMutationRequest,
  ): Promise<InsightEntityDictionaryItem> {
    const inserted = await this.db
      .insertInto("xy_wap_embed_insight_entity_dictionary")
      .values({
        aliases_json: encodeJson(payload.aliases),
        attributes_json: encodeJson(payload.attributes),
        canonical_name: payload.canonicalName,
        status: payload.status,
        entity_type: payload.entityType,
        include_in_aggregation: payload.includeInAggregation ? 1 : 0,
        uid: scope.uid,
      })
      .executeTakeFirstOrThrow() as InsertResult;

    return await this.getEntityDictionaryItemById(scope, String(parseInsertedMySqlId(inserted) ?? ""))
      ?? mapEntityPayload("0", payload);
  }

  async updateEntityDictionaryItem(
    scope: InsightsUidScope,
    id: string,
    payload: InsightEntityDictionaryMutationRequest,
  ): Promise<InsightEntityDictionaryItem | undefined> {
    const numericId = parsePositiveInteger(id);

    if (numericId == null || !await this.getEntityDictionaryItemById(scope, id)) {
      return undefined;
    }

    await this.db
      .updateTable("xy_wap_embed_insight_entity_dictionary")
      .set({
        aliases_json: encodeJson(payload.aliases),
        attributes_json: encodeJson(payload.attributes),
        canonical_name: payload.canonicalName,
        status: payload.status,
        entity_type: payload.entityType,
        include_in_aggregation: payload.includeInAggregation ? 1 : 0,
        update_time: new Date(),
      })
      .where("id", "=", numericId)
      .where("uid", "=", scope.uid)
      .execute();

    return this.getEntityDictionaryItemById(scope, id);
  }

  async updateEntityDictionaryItemStatus(
    scope: InsightsUidScope,
    id: string,
    status: Exclude<InsightConfigStatus, -1>,
  ): Promise<InsightEntityDictionaryItem | undefined> {
    const numericId = parsePositiveInteger(id);

    if (numericId == null || !await this.getEntityDictionaryItemById(scope, id)) {
      return undefined;
    }

    await this.db
      .updateTable("xy_wap_embed_insight_entity_dictionary")
      .set({ status, update_time: new Date() })
      .where("id", "=", numericId)
      .where("uid", "=", scope.uid)
      .execute();

    return this.getEntityDictionaryItemById(scope, id);
  }

  async deleteEntityDictionaryItem(scope: InsightsUidScope, id: string): Promise<boolean> {
    const numericId = parsePositiveInteger(id);

    if (numericId == null || !await this.getEntityDictionaryItemById(scope, id)) {
      return false;
    }

    await this.db
      .updateTable("xy_wap_embed_insight_entity_dictionary")
      .set({ status: -1, update_time: new Date() })
      .where("id", "=", numericId)
      .where("uid", "=", scope.uid)
      .execute();

    return true;
  }

  private async getSessionizationSettings(
    scope: InsightsUidScope,
  ): Promise<InsightSessionizationSettings> {
    const row = await this.db
      .selectFrom("xy_wap_embed_sessionization_config")
      .select([
        "analysis_delay_minutes",
        "hard_max_duration_hours",
        "idle_timeout_minutes",
        "late_arrival_window_minutes",
        "preset",
      ])
      .where("uid", "=", scope.uid)
      .where("enabled", "=", 1)
      .executeTakeFirst();

    if (!row) {
      return DEFAULT_INSIGHT_SETTINGS.sessionization;
    }

    return {
      analysisDelayMinutes: Number(row.analysis_delay_minutes),
      hardMaxDurationHours: Number(row.hard_max_duration_hours),
      idleTimeoutMinutes: Number(row.idle_timeout_minutes),
      lateArrivalWindowMinutes: Number(row.late_arrival_window_minutes),
      preset: normalizePreset(row.preset),
    };
  }

  private async getAnalysisPolicy(scope: InsightsUidScope): Promise<InsightAnalysisPolicy> {
    const row = await this.db
      .selectFrom("xy_wap_embed_insight_analysis_policy")
      .select([
        "final_analysis_enabled",
        "live_analysis_enabled",
        "live_min_interval_minutes",
        "live_min_new_meaningful_messages",
        "low_confidence_threshold",
        "rule_fallback_enabled",
      ])
      .where("uid", "=", scope.uid)
      .where("enabled", "=", 1)
      .executeTakeFirst();

    if (!row) {
      return DEFAULT_INSIGHT_SETTINGS.analysisPolicy;
    }

    return {
      finalAnalysisEnabled: row.final_analysis_enabled === 1,
      liveAnalysisEnabled: row.live_analysis_enabled === 1,
      liveMinIntervalMinutes: Number(row.live_min_interval_minutes),
      liveMinNewMeaningfulMessages: Number(row.live_min_new_meaningful_messages),
      lowConfidenceThreshold: Number(row.low_confidence_threshold),
      ruleFallbackEnabled: row.rule_fallback_enabled === 1,
    };
  }

  async getFeatureConfig(scope: InsightsUidScope): Promise<InsightFeatureConfig> {
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
      ])
      .where("uid", "=", scope.uid)
      .executeTakeFirst() as FeatureConfigRow | undefined;

    if (!row) {
      return DEFAULT_INSIGHT_SETTINGS.featureConfig;
    }

    return parseFeatureConfigRow(row);
  }

  async listIntentConfigs(scope: InsightsUidScope): Promise<InsightIntentConfig[]> {
    const rows = await this.db
      .selectFrom("xy_wap_embed_insight_intent_config")
      .select([
        "aliases_json",
        "description",
        "status",
        "id",
        "include_in_statistics",
        "intent_code",
        "intent_name",
        "negative_examples_json",
        "positive_examples_json",
        "sort_order",
      ])
      .where("uid", "=", scope.uid)
      .where("status", "!=", -1)
      .orderBy("sort_order", "asc")
      .orderBy("id", "asc")
      .execute();

    return rows.map(mapIntentRow);
  }

  private async getIntentConfigById(
    scope: InsightsUidScope,
    id: string,
  ): Promise<InsightIntentConfig | undefined> {
    const numericId = parsePositiveInteger(id);

    if (numericId == null) {
      return undefined;
    }

    const row = await this.db
      .selectFrom("xy_wap_embed_insight_intent_config")
      .select([
        "aliases_json",
        "description",
        "status",
        "id",
        "include_in_statistics",
        "intent_code",
        "intent_name",
        "negative_examples_json",
        "positive_examples_json",
        "sort_order",
      ])
      .where("uid", "=", scope.uid)
      .where("id", "=", numericId)
      .where("status", "!=", -1)
      .executeTakeFirst();

    return row ? mapIntentRow(row) : undefined;
  }

  private async getIntentConfigByCode(
    scope: InsightsUidScope,
    intentCode: string,
  ): Promise<InsightIntentConfig | undefined> {
    const row = await this.db
      .selectFrom("xy_wap_embed_insight_intent_config")
      .select([
        "aliases_json",
        "description",
        "status",
        "id",
        "include_in_statistics",
        "intent_code",
        "intent_name",
        "negative_examples_json",
        "positive_examples_json",
        "sort_order",
      ])
      .where("uid", "=", scope.uid)
      .where("intent_code", "=", intentCode)
      .where("status", "!=", -1)
      .executeTakeFirst();

    return row ? mapIntentRow(row) : undefined;
  }

  async listLabelConfigs(scope: InsightsUidScope): Promise<InsightLabelConfig[]> {
    const rows = await this.db
      .selectFrom("xy_wap_embed_insight_label_config")
      .select([
        "description",
        "status",
        "id",
        "include_in_statistics",
        "label_code",
        "label_name",
        "negative_examples_json",
        "positive_examples_json",
      ])
      .where("uid", "=", scope.uid)
      .where("status", "!=", -1)
      .orderBy("id", "asc")
      .execute();

    return rows.map(mapLabelRow);
  }

  private async getLabelConfigById(
    scope: InsightsUidScope,
    id: string,
  ): Promise<InsightLabelConfig | undefined> {
    const numericId = parsePositiveInteger(id);

    if (numericId == null) {
      return undefined;
    }

    const row = await this.db
      .selectFrom("xy_wap_embed_insight_label_config")
      .select([
        "description",
        "status",
        "id",
        "include_in_statistics",
        "label_code",
        "label_name",
        "negative_examples_json",
        "positive_examples_json",
      ])
      .where("uid", "=", scope.uid)
      .where("id", "=", numericId)
      .where("status", "!=", -1)
      .executeTakeFirst();

    return row ? mapLabelRow(row) : undefined;
  }

  private async getLabelConfigByCode(
    scope: InsightsUidScope,
    labelCode: string,
  ): Promise<InsightLabelConfig | undefined> {
    const row = await this.db
      .selectFrom("xy_wap_embed_insight_label_config")
      .select([
        "description",
        "status",
        "id",
        "include_in_statistics",
        "label_code",
        "label_name",
        "negative_examples_json",
        "positive_examples_json",
      ])
      .where("uid", "=", scope.uid)
      .where("label_code", "=", labelCode)
      .where("status", "!=", -1)
      .executeTakeFirst();

    return row ? mapLabelRow(row) : undefined;
  }

  async listQaRuleConfigs(scope: InsightsUidScope): Promise<InsightQaRuleConfig[]> {
    const rows = await this.db
      .selectFrom("xy_wap_embed_insight_qa_rule_config")
      .select([
        "applicable_scene",
        "description",
        "status",
        "id",
        "judgment_criteria",
        "negative_examples_json",
        "positive_examples_json",
        "rule_code",
        "rule_name",
        "severity",
      ])
      .where("uid", "=", scope.uid)
      .where("status", "!=", -1)
      .orderBy("id", "asc")
      .execute();

    return rows.map(mapQaRuleRow);
  }

  private async getQaRuleConfigById(
    scope: InsightsUidScope,
    id: string,
  ): Promise<InsightQaRuleConfig | undefined> {
    const numericId = parsePositiveInteger(id);

    if (numericId == null) {
      return undefined;
    }

    const row = await this.db
      .selectFrom("xy_wap_embed_insight_qa_rule_config")
      .select([
        "applicable_scene",
        "description",
        "status",
        "id",
        "judgment_criteria",
        "negative_examples_json",
        "positive_examples_json",
        "rule_code",
        "rule_name",
        "severity",
      ])
      .where("uid", "=", scope.uid)
      .where("id", "=", numericId)
      .where("status", "!=", -1)
      .executeTakeFirst();

    return row ? mapQaRuleRow(row) : undefined;
  }

  private async getQaRuleConfigByCode(
    scope: InsightsUidScope,
    ruleCode: string,
  ): Promise<InsightQaRuleConfig | undefined> {
    const row = await this.db
      .selectFrom("xy_wap_embed_insight_qa_rule_config")
      .select([
        "applicable_scene",
        "description",
        "status",
        "id",
        "judgment_criteria",
        "negative_examples_json",
        "positive_examples_json",
        "rule_code",
        "rule_name",
        "severity",
      ])
      .where("uid", "=", scope.uid)
      .where("rule_code", "=", ruleCode)
      .where("status", "!=", -1)
      .executeTakeFirst();

    return row ? mapQaRuleRow(row) : undefined;
  }

  async listEntityDictionary(
    scope: InsightsUidScope,
  ): Promise<InsightEntityDictionaryItem[]> {
    const rows = await this.db
      .selectFrom("xy_wap_embed_insight_entity_dictionary")
      .select([
        "aliases_json",
        "attributes_json",
        "canonical_name",
        "status",
        "entity_type",
        "id",
        "include_in_aggregation",
      ])
      .where("uid", "=", scope.uid)
      .where("status", "!=", -1)
      .orderBy("id", "asc")
      .execute();

    return rows.map(mapEntityRow);
  }

  private async getEntityDictionaryItemById(
    scope: InsightsUidScope,
    id: string,
  ): Promise<InsightEntityDictionaryItem | undefined> {
    const numericId = parsePositiveInteger(id);

    if (numericId == null) {
      return undefined;
    }

    const row = await this.db
      .selectFrom("xy_wap_embed_insight_entity_dictionary")
      .select([
        "aliases_json",
        "attributes_json",
        "canonical_name",
        "status",
        "entity_type",
        "id",
        "include_in_aggregation",
      ])
      .where("uid", "=", scope.uid)
      .where("id", "=", numericId)
      .where("status", "!=", -1)
      .executeTakeFirst();

    return row ? mapEntityRow(row) : undefined;
  }

  async listCurrentSessions(
    scope: InsightsUidScope,
    filters: InsightsOverviewFilters = {},
  ): Promise<InsightCurrentSessionPage> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const offset = (page - 1) * pageSize;
    const countQuery = needsCurrentSessionHydrationJoins(filters)
      ? applyCurrentSessionFilters(
          buildCurrentSessionBaseQuery(this.db)
            .select(sql<number>`count(distinct session.id)`.as("count")),
          scope,
          filters,
        )
      : applyCurrentSessionFilters(
          buildCurrentSessionLeanBaseQuery(this.db)
            .select(sql<number>`count(distinct session.id)`.as("count")),
          scope,
          filters,
        );
    const totalRow = await countQuery.executeTakeFirst() as CountQueryRow | undefined;
    const total = totalRow ? parseNumber(totalRow.count) : 0;
    const sessionRows = await this.listCurrentSessionRows(scope, filters, {
      limit: pageSize,
      offset,
    });

    return {
      items: sessionRows,
      total,
    };
  }

  async listAllCurrentSessions(
    scope: InsightsUidScope,
    filters: InsightsOverviewFilters = {},
  ): Promise<InsightCurrentSessionRow[]> {
    return await this.listCurrentSessionRows(scope, filters, {
      limit: allCurrentSessionsLimit,
      offset: 0,
    });
  }

  async getQualityAggregate(
    scope: InsightsUidScope,
    filters: { from?: string; to?: string } = {},
  ): Promise<InsightQualityAggregateRow> {
    let query = buildCurrentSessionBaseQuery(this.db)
      .select([
        sql<number>`count(distinct session.id)`.as("total_sessions"),
        sql<number>`count(distinct case when snapshot.status in ('ready', 'partial') then session.id end)`.as("analyzed_sessions"),
        sql<number>`
          count(distinct case
            when problem.problem_detected = 1
              and problem.resolution_status not in ('no_customer_problem', 'unknown')
            then session.id
          end)
        `.as("problem_sessions"),
        sql<number>`count(distinct case when problem.resolution_status = 'resolved' then session.id end)`.as("resolved"),
        sql<number>`count(distinct case when problem.resolution_status = 'unresolved' then session.id end)`.as("unresolved"),
        sql<number>`count(distinct case when problem.resolution_status = 'partially_resolved' then session.id end)`.as("partial"),
        sql<number>`count(distinct case when problem.resolution_status = 'no_customer_problem' then session.id end)`.as("no_customer_problem"),
      ])
      .where("session.uid", "=", scope.uid);

    const fromTs = parseDateBoundary(filters.from);
    const toTs = parseDateBoundary(filters.to);

    if (fromTs != null) {
      query = query.where("session.started_at", ">=", fromTs) as typeof query;
    }
    if (toTs != null) {
      query = query.where("session.started_at", "<=", toTs) as typeof query;
    }

    const row = await query.executeTakeFirst() as QualityAggregateQueryRow | undefined;

    return {
      analyzedSessions: parseNumber(row?.analyzed_sessions ?? 0),
      inspectionRate: 0,
      noCustomerProblem: parseNumber(row?.no_customer_problem ?? 0),
      partial: parseNumber(row?.partial ?? 0),
      passRate: 0,
      problemSessions: parseNumber(row?.problem_sessions ?? 0),
      resolved: parseNumber(row?.resolved ?? 0),
      ruleDistribution: [],
      totalSessions: parseNumber(row?.total_sessions ?? 0),
      unresolved: parseNumber(row?.unresolved ?? 0),
    };
  }

  async listQualityAgentStats(
    scope: InsightsUidScope,
    filters: { from?: string; to?: string } = {},
  ): Promise<InsightQualityAgentStatRow[]> {
    let query = buildCurrentSessionBaseQuery(this.db)
      .leftJoin("xy_wap_embed_conversation as conversation", (join) =>
        join
          .onRef("conversation.id", "=", "session.conversation_id")
          .onRef("conversation.uid", "=", "session.uid"),
      )
      .leftJoin("xy_wap_embed_user_seat as seat", (join) =>
        join
          .onRef("seat.uid", "=", "conversation.uid")
          .onRef("seat.third_userid", "=", "conversation.third_userid"),
      )
      .select([
        "seat.third_avatar as agent_avatar_url",
        "seat.third_user_name as agent_name",
        "seat.id as agent_seat_id",
        sql<number>`count(distinct session.id)`.as("total_sessions"),
        sql<number>`
          count(distinct case
            when problem.problem_detected = 1
              and problem.resolution_status not in ('no_customer_problem', 'unknown')
            then session.id
          end)
        `.as("problem_sessions"),
        sql<number>`count(distinct case when problem.resolution_status = 'resolved' then session.id end)`.as("resolved"),
        sql<number>`count(distinct case when problem.resolution_status = 'unresolved' then session.id end)`.as("unresolved"),
        sql<number>`count(distinct case when problem.resolution_status = 'partially_resolved' then session.id end)`.as("partial"),
      ])
      .where("session.uid", "=", scope.uid);

    const fromTs = parseDateBoundary(filters.from);
    const toTs = parseDateBoundary(filters.to);

    if (fromTs != null) {
      query = query.where("session.started_at", ">=", fromTs) as typeof query;
    }
    if (toTs != null) {
      query = query.where("session.started_at", "<=", toTs) as typeof query;
    }

    const rows = await query
      .groupBy(["seat.id", "seat.third_user_name", "seat.third_avatar"])
      .execute() as unknown as QualityAgentStatQueryRow[];

    return rows.map((row) => {
      const problemSessions = parseNumber(row.problem_sessions);
      const unresolved = parseNumber(row.unresolved);

      return {
        agentAvatarUrl: row.agent_avatar_url ?? undefined,
        agentName: row.agent_name ?? "未分配客服",
        agentSeatId: row.agent_seat_id == null ? "unknown" : String(row.agent_seat_id),
        partial: parseNumber(row.partial),
        problemSessions,
        resolved: parseNumber(row.resolved),
        totalSessions: parseNumber(row.total_sessions),
        unresolved,
        unresolvedRate: problemSessions > 0 ? unresolved / problemSessions : 0,
      };
    });
  }

  async getQaFindingAggregate(
    scope: InsightsUidScope,
    filters: { from?: string; to?: string } = {},
  ): Promise<{
    inspectionRate: number;
    passRate: number;
    ruleDistribution: Array<{ count: number; ruleCode: string; ruleName: string }>;
  }> {
    const fromTs = parseDateBoundary(filters.from);
    const toTs = parseDateBoundary(filters.to);

    function applyDateFilters<T extends { where(col: string, op: string, val: unknown): T }>(query: T): T {
      let next = query;
      if (fromTs != null) {
        next = next.where("session.started_at", ">=", fromTs) as T;
      }
      if (toTs != null) {
        next = next.where("session.started_at", "<=", toTs) as T;
      }
      return next;
    }

    const base = applyDateFilters(
      buildCurrentSessionLeanBaseQuery(this.db)
        .where("session.uid", "=", scope.uid)
        .where("snapshot.status", "in", ["ready", "partial"]),
    );

    const [aggRow, ruleRows] = await Promise.all([
      base
        .leftJoin("xy_wap_embed_session_qa_finding as qa", (join) =>
          join.onRef("qa.snapshot_id", "=", "snapshot.id"),
        )
        .select([
          sql<number>`count(distinct session.id)`.as("total_analyzed"),
          sql<number>`count(distinct case when qa.id is not null then session.id end)`.as("total_qa"),
          sql<number>`count(distinct case when qa.id is not null then session.id end) - count(distinct case when qa.passed = 0 then session.id end)`.as("passed"),
        ])
        .executeTakeFirst() as Promise<{ total_analyzed: number; total_qa: number; passed: number } | undefined>,

      applyDateFilters(
        buildCurrentSessionLeanBaseQuery(this.db)
          .innerJoin("xy_wap_embed_session_qa_finding as qa", (join) =>
            join.onRef("qa.snapshot_id", "=", "snapshot.id"),
          )
          .where("session.uid", "=", scope.uid)
          .where("snapshot.status", "in", ["ready", "partial"])
          .where("qa.passed", "=", 0),
      )
        .select([
          "qa.rule_code as rule_code",
          "qa.rule_name as rule_name",
          sql<number>`count(*)`.as("count"),
        ])
        .groupBy(["qa.rule_code", "qa.rule_name"])
        .orderBy(sql`count(*)`, "desc")
        .execute() as Promise<Array<{ rule_code: string; rule_name: string; count: number }>>,
    ]);

    const totalAnalyzed = parseNumber(aggRow?.total_analyzed ?? 0);
    const totalQa = parseNumber(aggRow?.total_qa ?? 0);
    const passed = parseNumber(aggRow?.passed ?? 0);

    return {
      inspectionRate: totalAnalyzed > 0 ? totalQa / totalAnalyzed : 0,
      passRate: totalQa > 0 ? passed / totalQa : 0,
      ruleDistribution: ruleRows.map((row) => ({
        count: parseNumber(row.count),
        ruleCode: row.rule_code,
        ruleName: row.rule_name,
      })),
    };
  }

  async listBusinessSessionAggregates(
    scope: InsightsUidScope,
    filters: InsightsOverviewFilters = {},
  ): Promise<InsightBusinessSessionAggregateRow[]> {
    const rows = await applyCurrentSessionFilters(
      buildCurrentSessionBaseQuery(this.db)
        .leftJoin("xy_wap_embed_session_action_item as aggregate_action", (join) =>
          join
            .onRef("aggregate_action.snapshot_id", "=", "snapshot.id")
            .on("aggregate_action.status", "=", "open"),
        )
        .select([
          "session.id as session_id",
          "session.started_at as started_at",
          sql<string>`date_format(from_unixtime(session.started_at / 1000), '%Y-%m-%d')`.as("date"),
          sql<number>`case when snapshot.status in ('ready', 'partial') then 1 else 0 end`.as("analyzed_sessions"),
          sql<number>`
            case
              when problem.resolution_status in ('unresolved', 'partially_resolved')
              then 1
              else 0
            end
          `.as("unresolved_sessions"),
          sql<number>`
            case
              when problem.resolution_status in ('unresolved', 'partially_resolved')
              then count(distinct aggregate_action.id)
              else 0
            end
          `.as("action_items_open"),
        ]),
      scope,
      filters,
    )
      .groupBy([
        "session.id",
        "session.started_at",
        "snapshot.status",
        "problem.resolution_status",
      ])
      .execute() as BusinessSessionAggregateQueryRow[];

    return rows.map((row) => ({
      actionItemsOpen: parseNumber(row.action_items_open),
      analyzedSessions: parseNumber(row.analyzed_sessions),
      date: row.date,
      sessionId: String(row.session_id),
      startedAt: parseNumber(row.started_at),
      unresolvedSessions: parseNumber(row.unresolved_sessions),
    }));
  }

  private async listCurrentSessionRows(
    scope: InsightsUidScope,
    filters: InsightsOverviewFilters,
    pagination?: { limit: number; offset: number },
  ) {
    let query = buildCurrentSessionBaseQuery(this.db)
      .select([
        "current.current_snapshot_id as current_snapshot_id",
        "problem.confidence as problem_confidence",
        "problem.problem_detected as problem_detected",
        "problem.problem_summary as problem_summary",
        "problem.resolution_status as resolution_status",
        "problem.unresolved_reason as unresolved_reason",
        "session.conversation_id as conversation_id",
        "session.ended_at as ended_at",
        "session.agent_message_count as agent_message_count",
        "session.id as session_id",
        "session.customer_message_count as customer_message_count",
        "session.last_message_at as last_message_at",
        "session.message_count as message_count",
        "session.started_at as started_at",
        "snapshot.phase as phase",
        "snapshot.create_time as generated_at",
        "snapshot.status as status",
        "summary.customer_intent as summary_customer_intent",
        "summary.follow_up as summary_follow_up",
        "summary.process_summary as summary_process",
        "summary.result_summary as summary_result",
      ]);

    query = applyCurrentSessionFilters(query, scope, filters);

    let groupedQuery = query
      .groupBy([
        "current.current_snapshot_id",
        "problem.problem_detected",
        "problem.problem_summary",
        "problem.resolution_status",
        "problem.unresolved_reason",
        "session.conversation_id",
        "session.ended_at",
        "session.agent_message_count",
        "session.id",
        "session.customer_message_count",
        "session.last_message_at",
        "session.message_count",
        "session.started_at",
        "snapshot.phase",
        "snapshot.create_time",
        "snapshot.status",
        "summary.customer_intent",
        "summary.follow_up",
        "summary.process_summary",
        "summary.result_summary",
      ])
      .orderBy("session.started_at", "desc");

    if (pagination) {
      groupedQuery = groupedQuery
        .limit(pagination.limit)
        .offset(pagination.offset);
    }

    const rows = (await groupedQuery.execute() as CurrentSessionCoreQueryRow[]).map((row) => ({
      ...row,
      last_customer_message_at: row.last_customer_message_at ?? null,
    }));

    const sessionRows = mapCurrentSessionRows(rows);
    await this.hydrateCurrentSessionAggregates(sessionRows);
    await Promise.all([
      this.hydrateCurrentSessionActors(scope, sessionRows),
      this.hydrateCurrentSessionTopics(sessionRows),
    ]);

    return sessionRows;
  }

  async getOverviewAggregate(
    scope: InsightsUidScope,
    filters: InsightsOverviewFilters = {},
  ): Promise<InsightOverviewAggregateRow> {
    const totalsQuery = applyCurrentSessionFilters(
      buildCurrentSessionBaseQuery(this.db)
        .leftJoin("xy_wap_embed_session_action_item as aggregate_action", (join) =>
          join
            .onRef("aggregate_action.snapshot_id", "=", "snapshot.id")
            .on("aggregate_action.status", "=", "open"),
        )
        .select([
          sql<number>`count(distinct session.id)`.as("logical_sessions"),
          sql<number>`coalesce(sum(distinct session.message_count), 0)`.as("messages"),
          sql<number>`coalesce(sum(distinct session.customer_message_count), 0)`.as("customer_messages"),
          sql<number>`coalesce(sum(distinct session.agent_message_count), 0)`.as("agent_messages"),
          sql<number>`count(distinct session.conversation_id)`.as("consulting_customers"),
          sql<number>`count(distinct case when snapshot.status = 'ready' then session.id end)`.as("ready"),
          sql<number>`count(distinct case when snapshot.status = 'partial' then session.id end)`.as("partial"),
          sql<number>`count(distinct case when snapshot.status = 'failed' then session.id end)`.as("failed"),
          sql<number>`count(distinct case when snapshot.status = 'stale' then session.id end)`.as("stale"),
          sql<number>`count(distinct case when problem.resolution_status = 'resolved' then session.id end)`.as("resolved_sessions"),
          sql<number>`count(distinct case when problem.resolution_status = 'partially_resolved' then session.id end)`.as("partially_resolved_sessions"),
          sql<number>`count(distinct case when problem.resolution_status = 'unresolved' then session.id end)`.as("unresolved_resolution_sessions"),
          sql<number>`count(distinct case when problem.resolution_status = 'no_customer_problem' then session.id end)`.as("no_customer_problem_sessions"),
          sql<number>`count(distinct case when problem.resolution_status = 'unknown' then session.id end)`.as("unknown_sessions"),
          sql<number>`
            count(distinct case
              when problem.problem_detected = 1
                and problem.resolution_status not in ('no_customer_problem', 'unknown')
              then session.id
            end)
          `.as("problem_sessions"),
          sql<number>`
            count(distinct case
              when problem.resolution_status in ('unresolved', 'partially_resolved')
                and aggregate_action.id is not null
              then aggregate_action.id
            end)
          `.as("action_items_open"),
          sql<number>`
            count(distinct case
              when problem.resolution_status in ('unresolved', 'partially_resolved')
              then session.id
            end)
          `.as("unresolved_sessions"),
        ]),
      scope,
      filters,
    );
    const totals = await totalsQuery.executeTakeFirst() as OverviewAggregateTotalsQueryRow | undefined;
    const trendSelection = [
      sql<string>`date_format(from_unixtime(session.started_at / 1000), '%Y-%m-%d')`.as("date"),
      sql<number>`count(distinct session.id)`.as("logical_sessions"),
      sql<number>`coalesce(sum(session.message_count), 0)`.as("messages"),
      sql<number>`coalesce(sum(session.customer_message_count), 0)`.as("customer_messages"),
      sql<number>`coalesce(sum(session.agent_message_count), 0)`.as("agent_messages"),
      sql<number>`count(distinct session.conversation_id)`.as("consulting_customers"),
    ];
    const trendRows = needsCurrentSessionHydrationJoins(filters)
      ? await applyCurrentSessionFilters(
          buildCurrentSessionBaseQuery(this.db).select(trendSelection),
          scope,
          filters,
        )
          .groupBy(sql`date_format(from_unixtime(session.started_at / 1000), '%Y-%m-%d')`)
          .orderBy("date", "asc")
          .execute() as OverviewTrendQueryRow[]
      : await applyCurrentSessionFilters(
          buildCurrentSessionLeanBaseQuery(this.db).select(trendSelection),
          scope,
          filters,
        )
          .groupBy(sql`date_format(from_unixtime(session.started_at / 1000), '%Y-%m-%d')`)
          .orderBy("date", "asc")
          .execute() as OverviewTrendQueryRow[];
    const totalSessions = parseNumber(totals?.logical_sessions ?? 0);

    return {
      actionItemsOpen: parseNumber(totals?.action_items_open ?? 0),
      analysis: {
        failed: parseNumber(totals?.failed ?? 0),
        partial: parseNumber(totals?.partial ?? 0),
        ready: parseNumber(totals?.ready ?? 0),
        stale: parseNumber(totals?.stale ?? 0),
      },
      problemSessions: parseNumber(totals?.problem_sessions ?? 0),
      readySessions: parseNumber(totals?.ready ?? 0),
      resolution: {
        noCustomerProblem: parseNumber(totals?.no_customer_problem_sessions ?? 0),
        partiallyResolved: parseNumber(totals?.partially_resolved_sessions ?? 0),
        resolved: parseNumber(totals?.resolved_sessions ?? 0),
        unknown: parseNumber(totals?.unknown_sessions ?? 0),
        unresolved: parseNumber(totals?.unresolved_resolution_sessions ?? 0),
      },
      totalSessions,
      totals: {
        agentMessages: parseNumber(totals?.agent_messages ?? 0),
        consultingCustomers: parseNumber(totals?.consulting_customers ?? 0),
        customerMessages: parseNumber(totals?.customer_messages ?? 0),
        logicalSessions: totalSessions,
        messages: parseNumber(totals?.messages ?? 0),
      },
      trend: trendRows.map((row) => ({
        agentMessages: parseNumber(row.agent_messages),
        consultingCustomers: parseNumber(row.consulting_customers),
        customerMessages: parseNumber(row.customer_messages),
        date: row.date,
        logicalSessions: parseNumber(row.logical_sessions),
        messages: parseNumber(row.messages),
      })),
      unresolvedSessions: parseNumber(totals?.unresolved_sessions ?? 0),
    };
  }

  async listBusinessTopicFacts(
    scope: InsightsUidScope,
    filters: InsightsOverviewFilters = {},
  ): Promise<InsightBusinessTopicFactRow[]> {
    const [
      tags,
      entities,
      intents,
      assets,
    ] = await Promise.all([
      this.listBusinessTagFacts(scope, filters),
      this.listBusinessEntityFacts(scope, filters),
      this.listBusinessIntentFacts(scope, filters),
      this.listBusinessAssetFacts(scope, filters),
    ]);

    return [
      ...tags,
      ...entities,
      ...intents,
      ...assets,
    ];
  }

  private async listBusinessTagFacts(
    scope: InsightsUidScope,
    filters: InsightsOverviewFilters,
  ): Promise<InsightBusinessTopicFactRow[]> {
    let query = this.db
      .selectFrom("xy_wap_embed_session_tag as tag")
      .innerJoin("xy_wap_embed_session_insight_current as current", (join) =>
        join.onRef("current.current_snapshot_id", "=", "tag.snapshot_id"),
      )
      .innerJoin("xy_wap_embed_logical_session as session", (join) =>
        join.onRef("session.id", "=", "current.session_id"),
      )
      .select([
        "tag.tag_code as code",
        "tag.tag_name as name",
        "session.id as session_id",
        "session.started_at as started_at",
        "tag.snapshot_id as snapshot_id",
        sql<number>`count(tag.id)`.as("mention_count"),
      ])
      .where("tag.uid", "=", scope.uid)
      .groupBy(["tag.tag_code", "tag.tag_name", "session.id", "session.started_at", "tag.snapshot_id"])
      .orderBy(sql<number>`count(tag.id)`, "desc")
      .limit(500);

    query = applyTopicDateFilters(query, filters);

    const rows = await query.execute() as Array<Omit<BusinessTopicFactQueryRow, "sentiment" | "type">>;

    return rows.map((row) => ({
      code: row.code,
      dimension: "tag",
      mentionCount: parseNumber(row.mention_count),
      name: row.name,
      sessionId: String(row.session_id),
      snapshotId: String(row.snapshot_id),
      startedAt: parseNumber(row.started_at),
    }));
  }

  private async listBusinessEntityFacts(
    scope: InsightsUidScope,
    filters: InsightsOverviewFilters,
  ): Promise<InsightBusinessTopicFactRow[]> {
    let query = this.db
      .selectFrom("xy_wap_embed_session_entity as entity")
      .innerJoin("xy_wap_embed_session_insight_current as current", (join) =>
        join.onRef("current.current_snapshot_id", "=", "entity.snapshot_id"),
      )
      .innerJoin("xy_wap_embed_logical_session as session", (join) =>
        join.onRef("session.id", "=", "current.session_id"),
      )
      .select([
        "entity.entity_id as code",
        "entity.entity_name as name",
        "entity.entity_type as type",
        "entity.sentiment as sentiment",
        "session.id as session_id",
        "session.started_at as started_at",
        "entity.snapshot_id as snapshot_id",
        sql<number>`count(entity.id)`.as("mention_count"),
      ])
      .where("entity.uid", "=", scope.uid)
      .groupBy([
        "entity.entity_id",
        "entity.entity_name",
        "entity.entity_type",
        "entity.sentiment",
        "session.id",
        "session.started_at",
        "entity.snapshot_id",
      ])
      .orderBy(sql<number>`count(entity.id)`, "desc")
      .limit(500);

    query = applyTopicDateFilters(query, filters);

    const rows = await query.execute() as BusinessTopicFactQueryRow[];

    return rows.map((row) => ({
      code: row.code,
      dimension: "entity",
      mentionCount: parseNumber(row.mention_count),
      name: row.name,
      sentiment: row.sentiment,
      sessionId: String(row.session_id),
      snapshotId: String(row.snapshot_id),
      startedAt: parseNumber(row.started_at),
      type: row.type,
    }));
  }

  private async listBusinessIntentFacts(
    scope: InsightsUidScope,
    filters: InsightsOverviewFilters,
  ): Promise<InsightBusinessTopicFactRow[]> {
    let query = this.db
      .selectFrom("xy_wap_embed_session_intent as intent")
      .innerJoin("xy_wap_embed_session_insight_current as current", (join) =>
        join.onRef("current.current_snapshot_id", "=", "intent.snapshot_id"),
      )
      .innerJoin("xy_wap_embed_logical_session as session", (join) =>
        join.onRef("session.id", "=", "current.session_id"),
      )
      .select([
        "intent.intent_code as code",
        "intent.intent_label as name",
        "session.id as session_id",
        "session.started_at as started_at",
        "intent.snapshot_id as snapshot_id",
        sql<number>`count(intent.id)`.as("mention_count"),
      ])
      .where("intent.uid", "=", scope.uid)
      .groupBy(["intent.intent_code", "intent.intent_label", "session.id", "session.started_at", "intent.snapshot_id"])
      .orderBy(sql<number>`count(intent.id)`, "desc")
      .limit(500);

    query = applyTopicDateFilters(query, filters);

    const rows = await query.execute() as Array<Omit<BusinessTopicFactQueryRow, "sentiment" | "type">>;

    return rows.map((row) => ({
      code: row.code,
      dimension: "intent",
      mentionCount: parseNumber(row.mention_count),
      name: row.name,
      sessionId: String(row.session_id),
      snapshotId: String(row.snapshot_id),
      startedAt: parseNumber(row.started_at),
    }));
  }

  private async listBusinessAssetFacts(
    scope: InsightsUidScope,
    filters: InsightsOverviewFilters,
  ): Promise<InsightBusinessTopicFactRow[]> {
    const sessionScope = await this.listBusinessSessionScope(scope, filters);
    const sessionIds = normalizePositiveIntegers(sessionScope.map((row) => row.session_id));
    const snapshotIds = normalizePositiveIntegers(sessionScope.map((row) => row.snapshot_id));

    if (sessionIds.length === 0 || snapshotIds.length === 0) {
      return [];
    }

    const rows = await this.db
      .selectFrom("xy_wap_embed_logical_session_message as session_message")
      .innerJoin("xy_wap_embed_logical_session as session", (join) =>
        join.onRef("session.id", "=", "session_message.session_id"),
      )
      .innerJoin("xy_wap_embed_session_insight_current as current", (join) =>
        join.onRef("current.session_id", "=", "session.id"),
      )
      .innerJoin("xy_wap_embed_msg_audit_info as message", (join) =>
        join.onRef("message.id", "=", "session_message.source_message_id"),
      )
      .select([
        "message.content as content",
        "session_message.message_type as message_type",
        "session.id as session_id",
        "session.started_at as started_at",
        "current.current_snapshot_id as snapshot_id",
        "session_message.source_message_id as source_message_id",
      ])
      .where("session.uid", "=", scope.uid)
      .where("session_message.session_id", "in", sessionIds)
      .where("current.current_snapshot_id", "in", snapshotIds)
      .where("session_message.message_type", "in", ["link", "miniapp", "file"])
      .orderBy("session_message.source_message_id", "asc")
      .limit(2_000)
      .execute() as AssetTopicMessageQueryRow[];
    const factsByKey = new Map<string, InsightBusinessTopicFactRow>();

    for (const row of rows) {
      const asset = parseBusinessAssetTopic(row);

      if (!asset) {
        continue;
      }

      const key = `${row.session_id}:${asset.code}:${asset.type}`;
      const current = factsByKey.get(key) ?? {
        code: asset.code,
        dimension: "asset" as const,
        mentionCount: 0,
        name: asset.name,
        sessionId: String(row.session_id),
        snapshotId: String(row.snapshot_id),
        startedAt: parseNumber(row.started_at),
        type: asset.type,
      };

      current.mentionCount += 1;
      factsByKey.set(key, current);
    }

    return Array.from(factsByKey.values());
  }

  private async listBusinessSessionScope(
    scope: InsightsUidScope,
    filters: InsightsOverviewFilters,
  ) {
    let query = this.db
      .selectFrom("xy_wap_embed_session_insight_current as current")
      .innerJoin("xy_wap_embed_logical_session as session", (join) =>
        join.onRef("session.id", "=", "current.session_id"),
      )
      .select([
        "session.id as session_id",
        "session.started_at as started_at",
        "current.current_snapshot_id as snapshot_id",
      ])
      .where("session.uid", "=", scope.uid);

    query = applyTopicDateFilters(query, filters);

    return await query.execute() as BusinessSessionScopeRow[];
  }

  async listActionItems(
    scope: InsightsUidScope,
    filters: InsightsFollowUpFilters = {},
  ): Promise<InsightActionItemRow[]> {
    const rows = await this.listActionItemRows(scope, filters, {
      limit: 1_000,
      offset: 0,
    });
    const actionItems = mapFollowUpActionItemRows(rows);
    await this.hydrateActionItemCustomers(scope, actionItems);

    return actionItems;
  }

  async listActionItemsPage(
    scope: InsightsUidScope,
    filters: InsightsFollowUpFilters = {},
  ): Promise<InsightActionItemPage> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const rows = await this.listActionItemRows(scope, filters, {
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    const actionItems = mapFollowUpActionItemRows(rows);
    await this.hydrateActionItemCustomers(scope, actionItems);

    return {
      items: actionItems,
      total: parseNumber(rows[0]?.total_count ?? 0),
    };
  }

  private async listActionItemRows(
    scope: InsightsUidScope,
    filters: InsightsFollowUpFilters,
    pagination: { limit: number; offset: number },
  ) {
    let query = this.db
      .selectFrom("xy_wap_embed_session_action_item as action")
      .innerJoin("xy_wap_embed_session_insight_snapshot as snapshot", (join) =>
        join.onRef("snapshot.id", "=", "action.snapshot_id"),
      )
      .innerJoin("xy_wap_embed_logical_session as session", (join) =>
        join.onRef("session.id", "=", "snapshot.session_id"),
      )
      .leftJoin("xy_wap_embed_session_problem_resolution as problem", (join) =>
        join.onRef("problem.snapshot_id", "=", "snapshot.id"),
      )
      .select([
        "action.id as action_id",
        "action.action_type as action_type",
        "action.create_time as created_at",
        "action.priority as priority",
        "action.status as action_status",
        "action.title as title",
        "problem.resolution_status as resolution_status",
        "session.conversation_id as conversation_id",
        "session.id as session_id",
        "snapshot.id as snapshot_id",
        sql<number>`count(*) over()`.as("total_count"),
      ])
      .where("action.uid", "=", scope.uid)
      .where("problem.resolution_status", "in", ["unresolved", "partially_resolved"]);

    if (filters.status) {
      query = query.where("action.status", "=", filters.status);
    }

    if (filters.priority) {
      query = query.where("action.priority", "=", filters.priority);
    }

    return (await query
      .orderBy("action.id", "desc")
      .limit(pagination.limit)
      .offset(pagination.offset)
      .execute() as ActionItemQueryRow[]).map(toActionItemBaseRow);
  }

  async listEntityHotspots(scope: InsightsUidScope) {
    const rows = await this.db
      .selectFrom("xy_wap_embed_session_entity as entity")
      .innerJoin("xy_wap_embed_session_insight_snapshot as snapshot", (join) =>
        join.onRef("snapshot.id", "=", "entity.snapshot_id"),
      )
      .innerJoin("xy_wap_embed_logical_session as session", (join) =>
        join.onRef("session.id", "=", "snapshot.session_id"),
      )
      .select([
        "entity.entity_id as entity_id",
        "entity.entity_name as entity_name",
        "entity.entity_type as entity_type",
        sql<number>`count(entity.id)`.as("mention_count"),
        sql<number>`count(case when entity.sentiment = 'negative' then 1 end)`.as("negative_count"),
        sql<number>`count(distinct session.id)`.as("session_count"),
      ])
      .where("entity.uid", "=", scope.uid)
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
      sessionCount: parseNumber(row.session_count),
    }));
  }

  async listIntentDistribution(scope: InsightsUidScope) {
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
      .where("intent.uid", "=", scope.uid)
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
    scope: InsightsUidScope,
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
      .select([
        "current.current_snapshot_id as current_snapshot_id",
        "problem.problem_detected as problem_detected",
        "problem.problem_summary as problem_summary",
        "problem.resolution_status as resolution_status",
        "problem.unresolved_reason as unresolved_reason",
        "session.conversation_id as conversation_id",
        "session.ended_at as ended_at",
        "session.agent_message_count as agent_message_count",
        "session.customer_message_count as customer_message_count",
        "session.id as session_id",
        "session.last_message_at as last_message_at",
        "session.message_count as message_count",
        "session.started_at as started_at",
        "snapshot.phase as phase",
        "snapshot.create_time as generated_at",
        "snapshot.status as status",
        "summary.customer_intent as summary_customer_intent",
        "summary.follow_up as summary_follow_up",
        "summary.process_summary as summary_process",
        "summary.result_summary as summary_result",
      ])
      .where("session.uid", "=", scope.uid)
      .where("session.id", "=", parsePositiveInteger(sessionId) ?? -1)
      .execute() as DetailQueryRow[];

    if (rows.length === 0) {
      return undefined;
    }

    const [current] = mapCurrentSessionRows(
      rows.map((row) => ({
        ...row,
        last_customer_message_at: null,
      })),
    );

    if (!current) {
      return undefined;
    }

    await this.hydrateCurrentSessionAggregates([current]);
    await this.hydrateCurrentSessionActors(scope, [current]);

    const snapshotId = current.currentSnapshotId;
    const dimensionEvidence = await this.listDimensionEvidence(scope, current.sessionId, snapshotId);
    const [
      qaFindingRows,
      actionItems,
    ] = await Promise.all([
      this.listQaFindings(snapshotId),
      this.listSessionActionItems(snapshotId, current.conversationId, current.sessionId, current.resolutionStatus),
    ]);
    await this.hydrateActionItemCustomers(scope, actionItems);

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

    const qaFindingDetails = uniqueBy(
      qaFindingRows
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
          ruleName: row.qa_rule_name ?? row.qa_rule_code ?? "",
          severity: normalizeSeverity(row.qa_severity) ?? "low",
        })),
      (row) => row.ruleCode,
    );

    return {
      actionItems,
      current,
      entities,
      evidenceItems: dimensionEvidence.map((row) => ({
        dimensionRecordId: row.dimension_record_id == null ? undefined : String(row.dimension_record_id),
        dimensionType: row.dimension_type,
        evidenceRole: row.evidence_role,
        messageId: String(row.source_message_id),
        reason: row.reason ?? undefined,
      })),
      faqCandidates,
      intents,
      problemEvidenceMessageIds: current.problemEvidenceMessageIds,
      qaFindingDetails,
      qaFindings: qaFindingDetails.map(({ severity: _severity, ...item }) => item),
      sentiment,
      tags,
    };
  }

  private async listDimensionEvidence(
    scope: InsightsUidScope,
    sessionId: string,
    snapshotId: string,
  ): Promise<DimensionEvidenceRow[]> {
    return await this.db
      .selectFrom("xy_wap_embed_insight_evidence")
      .select([
        "dimension_record_id",
        "dimension_type",
        "evidence_role",
        "reason",
        "source_message_id",
      ])
      .where("uid", "=", scope.uid)
      .where("session_id", "=", parsePositiveInteger(sessionId) ?? -1)
      .where("snapshot_id", "=", parsePositiveInteger(snapshotId) ?? -1)
      .execute() as DimensionEvidenceRow[];
  }

  private async listQaFindings(snapshotId: string) {
    return await this.db
      .selectFrom("xy_wap_embed_session_qa_finding")
      .select([
        "id as qa_finding_id",
        "passed as qa_passed",
        "reason as qa_reason",
        "rule_code as qa_rule_code",
        "rule_name as qa_rule_name",
        "severity as qa_severity",
      ])
      .where("snapshot_id", "=", parsePositiveInteger(snapshotId) ?? -1)
      .execute() as QaFindingQueryRow[];
  }

  private async listSessionActionItems(
    snapshotId: string,
    conversationId: string,
    sessionId: string,
    resolutionStatus: string | null,
  ) {
    const snapshotNumericId = parsePositiveInteger(snapshotId);

    if (snapshotNumericId == null) {
      return [];
    }

    const rows = (await this.db
      .selectFrom("xy_wap_embed_session_action_item as action")
      .select([
        "action.id as action_id",
        "action.action_type as action_type",
        "action.priority as priority",
        "action.status as action_status",
        "action.title as title",
        "action.snapshot_id as snapshot_id",
      ])
      .where("action.snapshot_id", "=", snapshotNumericId)
      .execute() as Array<Pick<ActionItemQueryRow,
        "action_id" | "action_status" | "action_type" | "priority" | "snapshot_id" | "title"
      >>).map((row) => toActionItemBaseRow({
        ...row,
        conversation_id: conversationId,
        resolution_status: resolutionStatus,
        session_id: sessionId,
      }));
    const actionItems = mapActionItemRows(rows);

    await this.hydrateActionItemEvidence([snapshotNumericId], actionItems);

    return actionItems;
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
    scope: InsightsUidScope,
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
      .where("message.uid", "=", scope.uid)
      .where("message.id", "in", normalizedMessageIds)
      .orderBy("message.msgtime", "asc")
      .orderBy("message.id", "asc")
      .execute() as EvidenceMessageQueryRow[];

    return rows.map((row) => {
      return mapEvidenceMessageRow(row);
    });
  }

  async listEvidenceMessageRecords(
    scope: InsightsUidScope,
    sessionId: string,
    messageIds: string[],
  ): Promise<WorkbenchMessageDto[]> {
    const normalizedMessageIds = normalizePositiveIntegers(messageIds);
    const targetSessionId = parsePositiveInteger(sessionId);

    if (normalizedMessageIds.length === 0 || targetSessionId == null) {
      return [];
    }

    const target = await this.findInsightConversationBySession(
      scope,
      targetSessionId,
    );

    if (!target) {
      return [];
    }

    const messageRows = await this.listMessageRowsBySourceIds(
      target,
      normalizedMessageIds,
    );

    return await this.mapMessageRows(target, messageRows);
  }

  async listSessionMessageRecords(
    scope: InsightsUidScope,
    sessionId: string,
  ): Promise<WorkbenchMessageDto[]> {
    const targetSessionId = parsePositiveInteger(sessionId);

    if (targetSessionId == null) {
      return [];
    }

    const target = await this.findInsightConversationBySession(scope, targetSessionId);

    if (!target) {
      return [];
    }

    const rows = await this.buildSessionMessageRowsQuery(target)
      .orderBy("session_message.source_message_time", "asc")
      .orderBy("session_message.source_message_id", "asc")
      .execute() as MessageRow[];

    return await this.mapMessageRows(target, rows);
  }

  async listMessageContext(
    scope: InsightsUidScope,
    conversationId: string,
    messageId: string,
    options: { after: number; before: number },
  ): Promise<InsightMessageContextResponse> {
    const targetMessageId = parsePositiveInteger(messageId);
    const targetConversationId = parsePositiveInteger(conversationId);

    if (targetMessageId == null || targetConversationId == null) {
      return {
        contextAfter: options.after,
        contextBefore: options.before,
        conversationId,
        messages: [],
        targetMessageId: messageId,
      };
    }

    const target = await this.findInsightConversationByMessage(
      scope,
      targetConversationId,
      targetMessageId,
    );

    if (!target) {
      return {
        contextAfter: options.after,
        contextBefore: options.before,
        conversationId,
        messages: [],
        targetMessageId: messageId,
      };
    }

    const [beforeRows, targetRows, afterRows] = await Promise.all([
      this.listContextMessageRows(target, targetMessageId, {
        direction: "before",
        limit: options.before,
      }),
      this.listContextMessageRows(target, targetMessageId, {
        direction: "target",
        limit: 1,
      }),
      this.listContextMessageRows(target, targetMessageId, {
        direction: "after",
        limit: options.after,
      }),
    ]);
    const messageRows = [...beforeRows, ...targetRows, ...afterRows];
    const messages = await this.mapMessageRows(target, messageRows);

    return {
      contextAfter: options.after,
      contextBefore: options.before,
      conversationId: String(targetConversationId),
      messages,
      targetMessageId: String(targetMessageId),
    };
  }

  private async findInsightConversationBySession(
    scope: InsightsUidScope,
    sessionId: number,
  ) {
    return await this.buildInsightConversationQuery(scope)
      .where("session_message.session_id", "=", sessionId)
      .executeTakeFirst() as InsightConversationRow | undefined;
  }

  private async findInsightConversationByMessage(
    scope: InsightsUidScope,
    conversationId: number,
    messageId: number,
  ) {
    return await this.buildInsightConversationQuery(scope)
      .where("session_message.conversation_id", "=", conversationId)
      .where("session_message.source_message_id", "=", messageId)
      .executeTakeFirst() as InsightConversationRow | undefined;
  }

  private buildInsightConversationQuery(scope: InsightsUidScope) {
    return this.db
      .selectFrom("xy_wap_embed_logical_session_message as session_message")
      .innerJoin("xy_wap_embed_conversation as conversation", (join) =>
        join.onRef("conversation.id", "=", "session_message.conversation_id"),
      )
      .select([
        "conversation.chat_type as chat_type",
        "conversation.id as conversation_id",
        "conversation.platform as platform",
        "conversation.third_external_userid as conversation_external_id",
        "conversation.third_group_id as conversation_group_id",
        "conversation.third_userid as third_userid",
        "conversation.uid as uid",
        "session_message.session_id as session_id",
      ])
      .select((expressionBuilder) => [
        expressionBuilder
          .selectFrom("xy_wap_embed_user_seat as seat")
          .select("seat.id")
          .whereRef("seat.third_userid", "=", "conversation.third_userid")
          .whereRef("seat.uid", "=", "conversation.uid")
          .whereRef("seat.platform", "=", "conversation.platform")
          .where("seat.biz_status", "=", 1)
          .as("seat_id"),
        expressionBuilder
          .selectFrom("xy_wap_embed_group_seat as group_seat")
          .select("group_seat.id")
          .whereRef("group_seat.third_group_id", "=", "conversation.third_group_id")
          .whereRef("group_seat.third_userid", "=", "conversation.third_userid")
          .whereRef("group_seat.uid", "=", "conversation.uid")
          .whereRef("group_seat.platform", "=", "conversation.platform")
          .as("group_seat_id"),
      ])
      .where("session_message.uid", "=", scope.uid);
  }

  private async mapMessageRows(
    target: InsightConversationRow,
    messageRows: MessageRow[],
  ): Promise<WorkbenchMessageDto[]> {
    const quotedRows = await this.getQuotedMessageRows(messageRows, target);
    const allRowsToHydrate = [...messageRows, ...quotedRows.fetchedRows];
    const hydrationSources = await this.getMessageHydrationSources(
      allRowsToHydrate,
      target.uid,
      target.platform,
      toOptionalNumber(target.group_seat_id),
    );
    const hydratedRows = hydrateMessageRows(messageRows, hydrationSources);
    const hydratedQuotedRows = hydrateMessageRows(
      quotedRows.fetchedRows,
      hydrationSources,
    );
    const currentRowsById = new Map(
      hydratedRows.map((row) => [parseNumber(row.id), row] as const),
    );
    const fetchedRowsById = new Map(
      hydratedQuotedRows.map((row) => [parseNumber(row.id), row] as const),
    );
    const quotePreviewsByRowId = buildQuotePreviewsByRowId(
      hydratedRows,
      currentRowsById,
      fetchedRowsById,
    );

    return hydratedRows.map((row) =>
      mapMessageRow(row, quotePreviewsByRowId.get(parseNumber(row.id))),
    );
  }

  private async listContextMessageRows(
    conversation: InsightConversationRow,
    targetMessageId: number,
    options: {
      direction: "after" | "before" | "target";
      limit: number;
    },
  ): Promise<MessageRow[]> {
    let query = this.buildSessionMessageRowsQuery(conversation);

    if (options.direction === "before") {
      query = query
        .where("session_message.source_message_id", "<", targetMessageId)
        .orderBy("session_message.source_message_id", "desc")
        .limit(options.limit);
      const rows = await query.execute() as MessageRow[];
      return rows.reverse();
    }

    if (options.direction === "after") {
      query = query
        .where("session_message.source_message_id", ">", targetMessageId)
        .orderBy("session_message.source_message_id", "asc")
        .limit(options.limit);
      return await query.execute() as MessageRow[];
    }

    return await query
      .where("session_message.source_message_id", "=", targetMessageId)
      .limit(1)
      .execute() as MessageRow[];
  }

  private async listMessageRowsBySourceIds(
    conversation: InsightConversationRow,
    sourceMessageIds: number[],
  ): Promise<MessageRow[]> {
    return await this.buildSessionMessageRowsQuery(conversation)
      .where("session_message.source_message_id", "in", sourceMessageIds)
      .orderBy("session_message.source_message_id", "asc")
      .execute() as MessageRow[];
  }

  private buildSessionMessageRowsQuery(conversation: InsightConversationRow) {
    return this.db
      .selectFrom("xy_wap_embed_logical_session_message as session_message")
      .innerJoin("xy_wap_embed_msg_audit_info as message", (join) =>
        join.onRef("message.id", "=", "session_message.source_message_id"),
      )
      .select([
        "message.chat_type as chat_type",
        "message.content as content",
        "message.from_type as from_type",
        "message.id as id",
        "message.msgid as msgid",
        "message.msgtime as msgtime",
        "message.msgtype as msgtype",
        "message.opt_no as opt_no",
        "message.revoke_status as revoke_status",
        "message.status as status",
        "message.third_external_id as third_external_id",
        "message.third_from_id as third_from_id",
        "message.third_group_id as third_group_id",
        "message.third_user_id as third_user_id",
        "session_message.conversation_id as conversation_id",
      ])
      .select((expressionBuilder) => [
        expressionBuilder.val(conversation.seat_id).as("seat_id"),
        expressionBuilder
          .val(conversation.conversation_external_id)
          .as("conversation_external_id"),
        expressionBuilder
          .val(conversation.conversation_group_id)
          .as("conversation_group_id"),
        expressionBuilder
          .val(conversation.group_seat_id)
          .as("conversation_group_seat_id"),
      ])
      .where("session_message.uid", "=", conversation.uid)
      .where("session_message.session_id", "=", Number(conversation.session_id))
      .where("session_message.conversation_id", "=", Number(conversation.conversation_id));
  }

  private async getQuotedMessageRows(
    rows: MessageRow[],
    conversation: InsightConversationRow,
  ) {
    const quoteIds = uniquePositiveNumbers(rows.map(getQuoteMessageAuditId));
    const currentRowIds = new Set(rows.map((row) => parseNumber(row.id)));
    const missingQuoteIds = quoteIds.filter((id) => !currentRowIds.has(id));

    if (!missingQuoteIds.length) {
      return { fetchedRows: [] as MessageRow[] };
    }

    let query = this.db
      .selectFrom("xy_wap_embed_msg_audit_info as message")
      .select([
        "message.id as id",
        "message.msgid as msgid",
        "message.chat_type as chat_type",
        "message.from_type as from_type",
        "message.third_user_id as third_user_id",
        "message.third_external_id as third_external_id",
        "message.third_from_id as third_from_id",
        "message.third_group_id as third_group_id",
        "message.content as content",
        "message.msgtype as msgtype",
        "message.msgtime as msgtime",
        "message.opt_no as opt_no",
        "message.revoke_status as revoke_status",
        "message.status as status",
      ])
      .select((expressionBuilder) => [
        expressionBuilder.val(conversation.conversation_id).as("conversation_id"),
        expressionBuilder.val(conversation.seat_id).as("seat_id"),
        expressionBuilder
          .val(conversation.conversation_external_id)
          .as("conversation_external_id"),
        expressionBuilder
          .val(conversation.conversation_group_id)
          .as("conversation_group_id"),
        expressionBuilder
          .val(conversation.group_seat_id)
          .as("conversation_group_seat_id"),
      ])
      .where("message.id", "in", missingQuoteIds)
      .where("message.uid", "=", conversation.uid)
      .where("message.platform", "=", conversation.platform)
      .where("message.third_user_id", "=", conversation.third_userid);

    if (conversation.chat_type === 2) {
      query = query.where("message.third_group_id", "=", conversation.conversation_group_id);
    } else {
      query = query.where(
        "message.third_external_id",
        "=",
        conversation.conversation_external_id,
      );
    }

    return { fetchedRows: (await query.execute()) as MessageRow[] };
  }

  private async getMessageHydrationSources(
    rows: MessageRow[],
    uid: number,
    platform: number,
    groupSeatId?: number,
  ): Promise<MessageHydrationSources> {
    const groupMemberIds = uniqueNonEmpty(
      rows
        .filter((row) => row.chat_type === 2)
        .map((row) => row.third_from_id || row.third_user_id),
    );
    const seatThirdUserIds = uniqueNonEmpty(
      rows
        .filter((row) => row.chat_type !== 2 && row.from_type === 1)
        .map((row) => row.third_user_id),
    );
    const contactThirdExternalIds = uniqueNonEmpty(
      rows
        .filter((row) => row.chat_type !== 2 && row.from_type === 2)
        .map((row) => row.third_external_id || row.conversation_external_id),
    );

    const [groupMembers, seats, contacts] = await Promise.all([
      groupMemberIds.length && groupSeatId != null
        ? this.db
            .selectFrom("xy_wap_embed_group_member as member")
            .select([
              "member.third_userid as third_userid",
              "member.avatar as avatar",
              "member.name as name",
              "member.nickname as nickname",
            ])
            .where("member.group_seat_id", "=", groupSeatId)
            .where("member.uid", "=", uid)
            .where("member.platform", "=", platform)
            .where("member.third_userid", "in", groupMemberIds)
            .execute()
        : [],
      seatThirdUserIds.length
        ? this.db
            .selectFrom("xy_wap_embed_user_seat")
            .select(["third_userid", "third_avatar", "third_user_name"])
            .where("uid", "=", uid)
            .where("platform", "=", platform)
            .where("third_userid", "in", seatThirdUserIds)
            .where("biz_status", "=", 1)
            .execute()
        : [],
      contactThirdExternalIds.length
        ? this.db
            .selectFrom("xy_wap_embed_contact")
            .select(["third_external_userid", "avatar", "name", "real_name"])
            .where("uid", "=", uid)
            .where("platform", "=", platform)
            .where("third_external_userid", "in", contactThirdExternalIds)
            .where("biz_status", "=", 1)
            .execute()
        : [],
    ]);

    return {
      contactsByThirdExternalId: new Map(
        contacts.map((contact) => [
          contact.third_external_userid,
          {
            avatar: contact.avatar,
            name: contact.name,
            realName: contact.real_name,
          },
        ]),
      ),
      groupMembersByGroupAndThirdUserId: new Map(
        groupMembers.map((member) => [
          `${String(groupSeatId)}:${member.third_userid}`,
          {
            avatar: member.avatar,
            name: member.name,
            nickname: member.nickname,
          },
        ]),
      ),
      seatsByThirdUserId: new Map(
        seats.map((seat) => [
          seat.third_userid,
          {
            avatar: seat.third_avatar,
            name: seat.third_user_name,
          },
        ]),
      ),
    };
  }

  async updateActionStatus(
    scope: InsightsUidScope,
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

    const ownedAction = await this.db
      .selectFrom("xy_wap_embed_session_action_item as action")
      .innerJoin("xy_wap_embed_session_insight_snapshot as snapshot", (join) =>
        join.onRef("snapshot.id", "=", "action.snapshot_id"),
      )
      .innerJoin("xy_wap_embed_logical_session as session", (join) =>
        join.onRef("session.id", "=", "snapshot.session_id"),
      )
      .select(["action.id"])
      .where("action.id", "=", id)
      .where("action.status", "=", "open")
      .where("session.uid", "=", scope.uid)
      .executeTakeFirst();

    if (!ownedAction) {
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
    scope: InsightsUidScope,
    input: {
      analysisScope: InsightRescanAnalysisScope;
      createdBy?: string;
      from: Date;
      to: Date;
    },
    idempotencyKey: string,
  ): Promise<{ jobId: string; taskId: string }> {
    try {
      const insertedTask = await this.db
        .insertInto("xy_wap_embed_insight_rescan_task")
        .values({
          analysis_scope: input.analysisScope,
          created_by: input.createdBy ?? null,
          from_time: input.from,
          status: "pending",
          to_time: input.to,
          uid: scope.uid,
        })
        .executeTakeFirstOrThrow() as InsertResult;
      const taskId = parseInsertedMySqlId(insertedTask) ?? -1;
      const inserted = await this.db
        .insertInto("xy_wap_embed_insight_job")
        .values({
          analysis_scope: input.analysisScope,
          idempotency_key: idempotencyKey,
          job_type: "sync_messages",
          priority: 10,
          rescan_task_id: taskId,
          run_after: new Date(),
          status: "pending",
          target_id: input.from.toISOString(),
          target_type: "uid",
          uid: scope.uid,
        })
        .executeTakeFirstOrThrow() as InsertResult;

      return {
        jobId: String(parseInsertedMySqlId(inserted) ?? idempotencyKey),
        taskId: String(taskId),
      };
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      return await this.getInsightJobByIdempotencyKey(idempotencyKey)
        ?? { jobId: idempotencyKey, taskId: idempotencyKey };
    }
  }

  async listRescanTasks(
    scope: InsightsUidScope,
    filters: { limit: number; offset: number },
  ) {
    const rowsQuery = this.db
      .selectFrom("xy_wap_embed_insight_rescan_task")
      .select([
        "analysis_scope",
        "create_time",
        "created_by",
        "failed_sessions",
        "finished_at",
        "from_time",
        "id",
        "queued_sessions",
        "started_at",
        "status",
        "succeeded_sessions",
        "to_time",
        "total_sessions",
        "update_time",
      ])
      .where("uid", "=", scope.uid)
      .orderBy("create_time", "desc")
      .limit(filters.limit)
      .offset(filters.offset)
      .execute() as Promise<Array<{
        analysis_scope: string;
        create_time: Date | string;
        created_by: string | null;
        failed_sessions: number | string;
        finished_at: Date | string | null;
        from_time: Date | string;
        id: number | string;
        queued_sessions: number | string;
        started_at: Date | string | null;
        status: string;
        succeeded_sessions: number | string;
        to_time: Date | string | null;
        total_sessions: number | string;
        update_time: Date | string;
      }>>;

    const totalQuery = this.db
      .selectFrom("xy_wap_embed_insight_rescan_task")
      .select((eb) => eb.fn.countAll().as("count"))
      .where("uid", "=", scope.uid)
      .executeTakeFirst();

    const [rows, totalResult] = await Promise.all([rowsQuery, totalQuery]);

    return {
      items: rows.map((row) => ({
        analysisScope: normalizeRescanAnalysisScope(row.analysis_scope),
        createTime: toTimestamp(row.create_time),
        createdBy: row.created_by ?? undefined,
        failedSessions: parseNumber(row.failed_sessions),
        finishedAt: toOptionalTimestamp(row.finished_at),
        from: new Date(row.from_time).toISOString(),
        queuedSessions: parseNumber(row.queued_sessions),
        startedAt: toOptionalTimestamp(row.started_at),
        status: normalizeRescanTaskStatus(row.status),
        succeededSessions: parseNumber(row.succeeded_sessions),
        taskId: String(row.id),
        to: row.to_time == null ? undefined : new Date(row.to_time).toISOString(),
        totalSessions: parseNumber(row.total_sessions),
        updateTime: toTimestamp(row.update_time),
      })),
      total: Number(totalResult?.count ?? 0),
    };
  }

  async hasActiveRescanTask(scope: InsightsUidScope): Promise<boolean> {
    const row = await this.db
      .selectFrom("xy_wap_embed_insight_rescan_task")
      .select(["id"])
      .where("uid", "=", scope.uid)
      .where("status", "in", ["pending", "running"])
      .limit(1)
      .executeTakeFirst();

    return Boolean(row);
  }

  private async getInsightJobByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<{ jobId: string; taskId: string } | undefined> {
    const row = await this.db
      .selectFrom("xy_wap_embed_insight_job")
      .select(["id", "rescan_task_id"])
      .where("idempotency_key", "=", idempotencyKey)
      .executeTakeFirst() as { id: number | string; rescan_task_id: number | string | null } | undefined;

    return row
      ? {
          jobId: String(row.id),
          taskId: row.rescan_task_id == null ? String(row.id) : String(row.rescan_task_id),
        }
      : undefined;
  }

  private async hydrateCurrentSessionActors(
    scope: InsightsUidScope,
    rows: InsightCurrentSessionRow[],
  ) {
    const conversationIds = uniquePositiveNumbers(
      rows.map((row) => Number(row.conversationId)),
    );

    if (conversationIds.length === 0) {
      return;
    }

    const conversations = await this.db
      .selectFrom("xy_wap_embed_conversation")
      .select(["id", "platform", "third_external_userid", "third_userid"])
      .where("uid", "=", scope.uid)
      .where("id", "in", conversationIds)
      .execute();

    const contacts = await this.listContactProfiles(
      scope.uid,
      uniqueNonEmpty(conversations.map((row) => row.third_external_userid)),
    );
    const seats = await this.listSeatProfiles(
      scope.uid,
      uniqueNonEmpty(conversations.map((row) => row.third_userid)),
    );
    const conversationsById = new Map(
      conversations.map((row) => [String(row.id), row]),
    );

    for (const row of rows) {
      const conversation = conversationsById.get(row.conversationId);

      if (!conversation) {
        continue;
      }

      const contact = contacts.get(conversation.third_external_userid);
      const seat = seats.get(conversation.third_userid);

      row.customerAvatarUrl = contact?.avatarUrl ?? row.customerAvatarUrl;
      row.customerName = contact?.name ?? row.customerName;
      row.agentAvatarUrl = seat?.avatarUrl ?? row.agentAvatarUrl;
      row.agentName = seat?.name ?? row.agentName;
      row.agentSeatId = seat?.seatId ?? row.agentSeatId;
    }
  }

  private async hydrateCurrentSessionAggregates(rows: InsightCurrentSessionRow[]) {
    const snapshotIds = normalizePositiveIntegers(
      rows.map((row) => row.currentSnapshotId),
    );

    if (snapshotIds.length === 0) {
      return;
    }

    const [
      actions,
      problemEvidence,
    ] = await Promise.all([
      this.db
        .selectFrom("xy_wap_embed_session_action_item")
        .select([
          "snapshot_id",
          sql<number>`count(*)`.as("action_open_count"),
        ])
        .where("snapshot_id", "in", snapshotIds)
        .where("status", "=", "open")
        .groupBy(["snapshot_id"])
        .execute() as Promise<CurrentSessionActionAggregateRow[]>,
      this.listProblemEvidenceMessages(snapshotIds),
    ]);

    const actionsBySnapshotId = new Map(actions.map((row) => [String(row.snapshot_id), row]));
    const problemEvidenceBySnapshotId = groupProblemEvidenceMessages(problemEvidence);

    for (const row of rows) {
      const action = actionsBySnapshotId.get(row.currentSnapshotId);
      const evidence = problemEvidenceBySnapshotId.get(row.currentSnapshotId) ?? [];

      row.actionOpenCount = action ? parseNumber(action.action_open_count) : 0;
      row.problemEvidenceMessageIds = sortNumericStrings(
        evidence.map((item) => String(item.evidence_message_id)),
      );
      row.lastCustomerMessageAt = latestNullableNumber(
        evidence.map((item) => item.last_customer_message_at),
      );
    }
  }

  private async listProblemEvidenceMessages(snapshotIds: number[]) {
    if (snapshotIds.length === 0) {
      return [];
    }

    return await this.db
      .selectFrom("xy_wap_embed_insight_evidence as evidence")
      .leftJoin("xy_wap_embed_msg_audit_info as message", (join) =>
        join.onRef("message.id", "=", "evidence.source_message_id"),
      )
      .select([
        "evidence.snapshot_id as snapshot_id",
        "evidence.source_message_id as evidence_message_id",
        "message.msgtime as last_customer_message_at",
      ])
      .where("evidence.snapshot_id", "in", snapshotIds)
      .where("evidence.dimension_type", "=", "problem_resolution")
      .execute() as ProblemEvidenceMessageRow[];
  }

  private async hydrateCurrentSessionTopics(rows: InsightCurrentSessionRow[]) {
    const snapshotIds = uniquePositiveNumbers(
      rows.map((row) => Number(row.currentSnapshotId)),
    );

    if (snapshotIds.length === 0) {
      return;
    }

    const [
      tags,
      entities,
      intents,
      assets,
    ] = await Promise.all([
      this.db
        .selectFrom("xy_wap_embed_session_tag")
        .select(["snapshot_id", "tag_code", "tag_name"])
        .where("snapshot_id", "in", snapshotIds)
        .execute() as Promise<SessionTagTopicRow[]>,
      this.db
        .selectFrom("xy_wap_embed_session_entity")
        .select(["entity_id", "entity_name", "entity_type", "snapshot_id"])
        .where("snapshot_id", "in", snapshotIds)
        .execute() as Promise<SessionEntityTopicRow[]>,
      this.db
        .selectFrom("xy_wap_embed_session_intent")
        .select(["intent_code", "intent_label", "snapshot_id"])
        .where("snapshot_id", "in", snapshotIds)
        .execute() as Promise<SessionIntentTopicRow[]>,
      this.db
        .selectFrom("xy_wap_embed_logical_session_message as session_message")
        .innerJoin("xy_wap_embed_logical_session as session", (join) =>
          join.onRef("session.id", "=", "session_message.session_id"),
        )
        .innerJoin("xy_wap_embed_session_insight_current as current", (join) =>
          join.onRef("current.session_id", "=", "session.id"),
        )
        .innerJoin("xy_wap_embed_msg_audit_info as message", (join) =>
          join.onRef("message.id", "=", "session_message.source_message_id"),
        )
        .select([
          "message.content as content",
          "session_message.message_type as message_type",
          "session.id as session_id",
          "session.started_at as started_at",
          "current.current_snapshot_id as snapshot_id",
          "session_message.source_message_id as source_message_id",
        ])
        .where("current.current_snapshot_id", "in", snapshotIds)
        .where("session_message.message_type", "in", ["link", "miniapp", "file"])
        .execute() as Promise<SessionAssetTopicRow[]>,
    ]);

    const tagsBySnapshotId = groupBySnapshotId(tags, (row) => ({
      tagCode: row.tag_code,
      tagName: row.tag_name,
    }));
    const entitiesBySnapshotId = groupBySnapshotId(entities, (row) => ({
      entityId: row.entity_id,
      entityName: row.entity_name,
      entityType: row.entity_type,
    }));
    const intentsBySnapshotId = groupBySnapshotId(intents, (row) => ({
      intentCode: row.intent_code,
      intentLabel: row.intent_label,
    }));
    const assetsBySnapshotId = groupAssetsBySnapshotId(assets);

    for (const row of rows) {
      row.tags = tagsBySnapshotId.get(row.currentSnapshotId) ?? [];
      row.entities = entitiesBySnapshotId.get(row.currentSnapshotId) ?? [];
      row.intents = intentsBySnapshotId.get(row.currentSnapshotId) ?? [];
      row.assets = assetsBySnapshotId.get(row.currentSnapshotId) ?? [];
    }
  }

  private async hydrateActionItemCustomers(
    scope: InsightsUidScope,
    rows: Array<InsightActionItemRow | InsightDetailActionItemRow>,
  ) {
    const conversationIds = uniquePositiveNumbers(
      rows.map((row) => Number(row.conversationId)),
    );

    if (conversationIds.length === 0) {
      return;
    }

    const conversations = await this.db
      .selectFrom("xy_wap_embed_conversation")
      .select(["id", "third_external_userid"])
      .where("uid", "=", scope.uid)
      .where("id", "in", conversationIds)
      .execute();
    const contacts = await this.listContactProfiles(
      scope.uid,
      uniqueNonEmpty(conversations.map((row) => row.third_external_userid)),
    );
    const conversationsById = new Map(
      conversations.map((row) => [String(row.id), row]),
    );

    for (const row of rows) {
      const conversation = conversationsById.get(row.conversationId);
      const contact = conversation
        ? contacts.get(conversation.third_external_userid)
        : undefined;

      row.customerAvatarUrl = contact?.avatarUrl ?? row.customerAvatarUrl;
      row.customerName = contact?.name ?? row.customerName;
    }
  }

  private async hydrateActionItemEvidence(
    snapshotIds: number[],
    actionItems: InsightDetailActionItemRow[],
  ) {
    if (snapshotIds.length === 0 || actionItems.length === 0) {
      return;
    }

    const evidenceRows = await this.listActionItemEvidenceMessages(snapshotIds);
    const evidenceByActionId = groupByActionId(evidenceRows);

    for (const item of actionItems) {
      const evidence = evidenceByActionId.get(item.actionItemId) ?? [];
      item.evidenceMessageIds = sortNumericStrings(
        evidence.map((row) => String(row.evidence_message_id)),
      );
    }
  }

  private async listActionItemEvidenceMessages(snapshotIds: number[]) {
    if (snapshotIds.length === 0) {
      return [];
    }

    return await this.db
      .selectFrom("xy_wap_embed_insight_evidence as evidence")
      .select([
        "evidence.dimension_record_id as action_id",
        "evidence.source_message_id as evidence_message_id",
      ])
      .where("evidence.snapshot_id", "in", snapshotIds)
      .where("evidence.dimension_type", "=", "action_item")
      .execute() as Array<{
        action_id: number | string;
        evidence_message_id: number | string;
      }>;
  }

  private async listContactProfiles(
    uid: number,
    thirdExternalUserIds: string[],
  ): Promise<Map<string, ContactProfile>> {
    if (thirdExternalUserIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .selectFrom("xy_wap_embed_contact")
      .select(["avatar", "name", "real_name", "third_external_userid"])
      .where("uid", "=", uid)
      .where("third_external_userid", "in", thirdExternalUserIds)
      .where("biz_status", "=", 1)
      .execute();

    return new Map(
      rows.map((row) => [
        row.third_external_userid,
        {
          avatarUrl: row.avatar ?? "",
          name: row.name || row.real_name || "未知客户",
        },
      ]),
    );
  }

  private async listSeatProfiles(
    uid: number,
    thirdUserIds: string[],
  ): Promise<Map<string, SeatProfile>> {
    if (thirdUserIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .selectFrom("xy_wap_embed_user_seat")
      .select(["id", "third_avatar", "third_user_name", "third_userid"])
      .where("uid", "=", uid)
      .where("third_userid", "in", thirdUserIds)
      .where("biz_status", "=", 1)
      .execute();

    return new Map(
      rows.map((row) => [
        row.third_userid,
        {
          avatarUrl: row.third_avatar ?? "",
          name: row.third_user_name || "未分配客服",
          seatId: String(row.id),
        },
      ]),
    );
  }
}

function mapCurrentSessionRows(rows: CurrentSessionQueryRow[]): InsightCurrentSessionRow[] {
  const bySession = new Map<string, InsightCurrentSessionRow>();

  for (const row of rows) {
    const sessionId = String(row.session_id);
    const existing = bySession.get(sessionId);
    const current =
      existing ??
      {
        actionOpenCount: 0,
        agentAvatarUrl: null,
        agentMessageCount: parseNumber(row.agent_message_count),
        agentName: readOptionalDetailField<string>(row, "agent_name"),
        agentSeatId: normalizeOptionalString(
          readOptionalDetailField<number | string>(row, "agent_seat_id"),
        ),
        analysisStatus: normalizeAnalysisStatus(row.status),
        conversationId: String(row.conversation_id),
        currentSnapshotId: String(row.current_snapshot_id),
        customerAvatarUrl: null,
        customerMessageCount: parseNumber(row.customer_message_count),
        customerName: readOptionalDetailField<string>(row, "customer_name") ?? "未知客户",
        endedAt: parseNullableNumber(row.ended_at),
        generatedAt: parseNumber(row.generated_at),
        lastMessageAt: parseNullableNumber(row.last_message_at),
        lastCustomerMessageAt: parseNullableNumber(row.last_customer_message_at),
        messageCount: parseNumber(row.message_count),
        phase: row.phase === "final" ? "final" : "live",
        problemDetected: row.problem_detected === 1,
        problemEvidenceMessageIds: [],
        problemResolutionConfidence: parseNullableNumber(row.problem_confidence ?? null) ?? undefined,
        problemSummary: row.problem_summary ?? "",
        resolutionStatus: normalizeResolutionStatus(row.resolution_status),
        sessionId,
        startedAt: parseNumber(row.started_at),
        summaryCustomerIntent: row.summary_customer_intent ?? "",
        summaryFollowUp: row.summary_follow_up,
        summaryProcess: row.summary_process ?? "",
        summaryResult: row.summary_result ?? "",
        unresolvedReason: row.unresolved_reason,
      };

    bySession.set(sessionId, current);
  }

  return Array.from(bySession.values());
}

function readOptionalDetailField<T extends string | number>(
  row: CurrentSessionQueryRow,
  field: "agent_name" | "agent_seat_id" | "customer_name",
): T | null {
  if (!(field in row)) {
    return null;
  }

  return (row as unknown as Record<typeof field, T | null>)[field] ?? null;
}

function normalizeOptionalString(value: number | string | null) {
  if (value == null) {
    return null;
  }

  return String(value);
}

function sortNumericStrings(values: string[]) {
  return [...values].sort((left, right) => Number(left) - Number(right));
}

function latestNullableNumber(values: Array<Date | number | string | null>) {
  const numbers = values
    .map(parseNullableNumber)
    .filter((value): value is number => value != null);

  return numbers.length ? Math.max(...numbers) : null;
}

function groupProblemEvidenceMessages(rows: ProblemEvidenceMessageRow[]) {
  const bySnapshotId = new Map<string, ProblemEvidenceMessageRow[]>();

  for (const row of rows) {
    const snapshotId = String(row.snapshot_id);
    const current = bySnapshotId.get(snapshotId) ?? [];

    current.push(row);
    bySnapshotId.set(snapshotId, current);
  }

  return bySnapshotId;
}

function groupByActionId<T extends { action_id: number | string }>(rows: T[]) {
  const byActionId = new Map<string, T[]>();

  for (const row of rows) {
    const actionId = String(row.action_id);
    const current = byActionId.get(actionId) ?? [];

    current.push(row);
    byActionId.set(actionId, current);
  }

  return byActionId;
}

function entityHotspotKey(row: Pick<EntityHotspotQueryRow, "entity_id" | "entity_type">) {
  return `${row.entity_id}:${row.entity_type}`;
}

function uniqueEntityHotspotScopes(rows: EntityHotspotQueryRow[]) {
  const seenKeys = new Set<string>();
  const scopes: Array<{ entityId: string; entityType: string }> = [];

  for (const row of rows) {
    const key = entityHotspotKey(row);

    if (seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    scopes.push({
      entityId: row.entity_id,
      entityType: row.entity_type,
    });
  }

  return scopes;
}

function mapFollowUpActionItemRows(rows: ActionItemQueryRow[]): InsightActionItemRow[] {
  return rows.map((row) => ({
    actionItemId: String(row.action_id),
    conversationId: String(row.conversation_id),
    createdAt: parseNumber(row.created_at ?? 0),
    customerAvatarUrl: undefined,
    customerName: "未知客户",
    priority: normalizePriority(row.priority),
    resolutionStatus: normalizeResolutionStatus(row.resolution_status),
    sessionId: String(row.session_id),
    status: normalizeActionStatus(row.action_status),
    title: row.title,
  }));
}

function mapActionItemRows(rows: ActionItemQueryRow[]): InsightDetailActionItemRow[] {
  const byAction = new Map<string, InsightDetailActionItemRow>();

  for (const row of rows) {
    const actionItemId = String(row.action_id);
    const current =
      byAction.get(actionItemId) ??
      {
        actionItemId,
        conversationId: String(row.conversation_id),
        customerAvatarUrl: undefined,
        customerName: "未知客户",
        evidenceMessageIds: [],
        priority: normalizePriority(row.priority),
        resolutionStatus: normalizeResolutionStatus(row.resolution_status),
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

function toActionItemBaseRow(row: Omit<ActionItemQueryRow,
  "evidence_message_id" | "last_customer_message_at"
>): ActionItemQueryRow {
  return {
    ...row,
    evidence_message_id: null,
    last_customer_message_at: null,
  };
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

function normalizeSeverity(value: string | null): "high" | "low" | "medium" | null {
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

function normalizeRescanAnalysisScope(value: string): InsightRescanAnalysisScope {
  if (value === "all" || value === "qaFindings" || value === "classification") {
    return value;
  }

  return "all";
}

function normalizeRescanTaskStatus(value: string): InsightRescanTaskStatus {
  if (
    value === "pending" ||
    value === "running" ||
    value === "succeeded" ||
    value === "partial" ||
    value === "failed"
  ) {
    return value;
  }

  return "pending";
}

function toTimestamp(value: Date | string) {
  return new Date(value).getTime();
}

function toOptionalTimestamp(value: Date | string | null) {
  return value == null ? undefined : toTimestamp(value);
}

function parseDateBoundary(value?: string) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.getTime();
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

function parsePositiveInteger(value: number | string | undefined) {
  if (value == null) {
    return undefined;
  }

  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  }

  if (!/^[1-9]\d*$/.test(value)) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function normalizePreset(value: string): InsightSessionizationSettings["preset"] {
  return value === "realtime_service" || value === "private_domain" || value === "custom"
    ? value
    : "custom";
}

function normalizeConfigSeverity(value: string): "low" | "medium" | "high" {
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}

function encodeJson(value: unknown) {
  return value == null ? null : JSON.stringify(value);
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
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

function parseConfigStatus(value: number | string): InsightConfigStatus {
  const status = Number(value);
  return status === -1 || status === 0 || status === 1 ? status : 0;
}

function mapLabelPayload(id: string, payload: InsightLabelConfigMutationRequest): InsightLabelConfig {
  return {
    description: payload.description,
    status: payload.status,
    id,
    includeInStatistics: payload.includeInStatistics,
    labelCode: payload.labelCode,
    labelName: payload.labelName,
    negativeExamples: payload.negativeExamples,
    positiveExamples: payload.positiveExamples,
  };
}

function mapIntentPayload(id: string, payload: InsightIntentConfigMutationRequest): InsightIntentConfig {
  return {
    aliases: payload.aliases,
    description: payload.description,
    status: payload.status,
    id,
    includeInStatistics: payload.includeInStatistics,
    intentCode: payload.intentCode,
    intentName: payload.intentName,
    negativeExamples: payload.negativeExamples,
    positiveExamples: payload.positiveExamples,
    weight: payload.weight,
  };
}

function mapQaRulePayload(id: string, payload: InsightQaRuleConfigMutationRequest): InsightQaRuleConfig {
  return {
    applicableScene: payload.applicableScene,
    description: payload.description,
    status: payload.status,
    id,
    judgmentCriteria: payload.judgmentCriteria,
    negativeExamples: payload.negativeExamples,
    positiveExamples: payload.positiveExamples,
    ruleCode: payload.ruleCode,
    ruleName: payload.ruleName,
    severity: payload.severity,
  };
}

function mapEntityPayload(
  id: string,
  payload: InsightEntityDictionaryMutationRequest,
): InsightEntityDictionaryItem {
  return {
    aliases: payload.aliases,
    attributes: payload.attributes,
    canonicalName: payload.canonicalName,
    status: payload.status,
    entityType: payload.entityType,
    id,
    includeInAggregation: payload.includeInAggregation,
  };
}

function mapLabelRow(row: {
  description: string | null;
  status: number;
  id: number | string;
  include_in_statistics: number;
  label_code: string;
  label_name: string;
  negative_examples_json: string | null;
  positive_examples_json: string | null;
}): InsightLabelConfig {
  return {
    description: optionalString(row.description),
    status: parseConfigStatus(row.status),
    id: String(row.id),
    includeInStatistics: row.include_in_statistics === 1,
    labelCode: row.label_code,
    labelName: row.label_name,
    negativeExamples: parseJsonArray(row.negative_examples_json),
    positiveExamples: parseJsonArray(row.positive_examples_json),
  };
}

function mapIntentRow(row: {
  aliases_json: string | null;
  description: string | null;
  status: number;
  id: number | string;
  include_in_statistics: number;
  intent_code: string;
  intent_name: string;
  negative_examples_json: string | null;
  positive_examples_json: string | null;
  sort_order: number | string;
}): InsightIntentConfig {
  return {
    aliases: parseJsonArray(row.aliases_json),
    description: optionalString(row.description),
    status: parseConfigStatus(row.status),
    id: String(row.id),
    includeInStatistics: row.include_in_statistics === 1,
    intentCode: row.intent_code,
    intentName: row.intent_name,
    negativeExamples: parseJsonArray(row.negative_examples_json),
    positiveExamples: parseJsonArray(row.positive_examples_json),
    weight: parseNumber(row.sort_order),
  };
}

function mapQaRuleRow(row: {
  applicable_scene: string | null;
  description: string | null;
  status: number;
  id: number | string;
  judgment_criteria: string | null;
  negative_examples_json: string | null;
  positive_examples_json: string | null;
  rule_code: string;
  rule_name: string;
  severity: string;
}): InsightQaRuleConfig {
  return {
    applicableScene: optionalString(row.applicable_scene),
    description: optionalString(row.description),
    status: parseConfigStatus(row.status),
    id: String(row.id),
    judgmentCriteria: optionalString(row.judgment_criteria),
    negativeExamples: parseJsonArray(row.negative_examples_json),
    positiveExamples: parseJsonArray(row.positive_examples_json),
    ruleCode: row.rule_code,
    ruleName: row.rule_name,
    severity: normalizeConfigSeverity(row.severity),
  };
}

function mapEntityRow(row: {
  aliases_json: string | null;
  attributes_json: string | null;
  canonical_name: string;
  status: number;
  entity_type: string;
  id: number | string;
  include_in_aggregation: number;
}): InsightEntityDictionaryItem {
  return {
    aliases: parseJsonArray(row.aliases_json),
    attributes: parseJsonObject(row.attributes_json),
    canonicalName: row.canonical_name,
    status: parseConfigStatus(row.status),
    entityType: row.entity_type,
    id: String(row.id),
    includeInAggregation: row.include_in_aggregation === 1,
  };
}

function normalizePositiveIntegers(values: Array<number | string | undefined>) {
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

function mapEvidenceMessageRow(row: EvidenceMessageQueryRow): InsightEvidenceMessageRow {
  const input = buildInsightMessageInput(row);

  return {
    contentText: input.aiText,
    contentType: input.messageType,
    messageId: input.sourceMessageId,
    msgtime: input.occurredAt,
    senderName: row.sender_name ?? undefined,
    senderRole: input.senderRole,
  };
}

function buildQuotePreviewsByRowId(
  rows: MessageRow[],
  currentRowsById: Map<number, MessageRow>,
  fetchedRowsById: Map<number, MessageRow>,
) {
  const previews = new Map<number, MessageRowQuotePreview>();

  rows.forEach((row) => {
    const quoteId = getQuoteMessageAuditId(row);

    if (quoteId == null) {
      return;
    }

    const quotedRow = currentRowsById.get(quoteId) ?? fetchedRowsById.get(quoteId);
    previews.set(
      parseNumber(row.id),
      quotedRow ? buildQuotedMessagePreview(quotedRow) : buildMissingQuotedMessagePreview(),
    );
  });

  return previews;
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function toOptionalNumber(value: number | string | null) {
  if (value == null || value === "") {
    return undefined;
  }

  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function getAffectedRows(result: unknown) {
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

function applyTopicDateFilters<Query>(
  query: Query,
  filters: InsightsOverviewFilters,
): Query {
  let next = query as Query & {
    where(column: string, operator: string, value: unknown): Query;
  };
  const from = parseDateBoundary(filters.from);
  const to = parseDateBoundary(filters.to);

  if (from != null) {
    next = next.where("session.started_at", ">=", from) as typeof next;
  }

  if (to != null) {
    next = next.where("session.started_at", "<=", to) as typeof next;
  }

  return next;
}

function buildCurrentSessionLeanBaseQuery(db: Kysely<Database>) {
  return db
    .selectFrom("xy_wap_embed_session_insight_current as current")
    .innerJoin("xy_wap_embed_session_insight_snapshot as snapshot", (join) =>
      join.onRef("snapshot.id", "=", "current.current_snapshot_id"),
    )
    .innerJoin("xy_wap_embed_logical_session as session", (join) =>
      join.onRef("session.id", "=", "current.session_id"),
    );
}

function buildCurrentSessionBaseQuery(db: Kysely<Database>) {
  return buildCurrentSessionLeanBaseQuery(db)
    .leftJoin("xy_wap_embed_session_summary as summary", (join) =>
      join.onRef("summary.snapshot_id", "=", "snapshot.id"),
    )
    .leftJoin("xy_wap_embed_session_problem_resolution as problem", (join) =>
      join.onRef("problem.snapshot_id", "=", "snapshot.id"),
    );
}

function needsCurrentSessionHydrationJoins(filters: InsightsOverviewFilters) {
  const keyword = Boolean(filters.keyword?.trim());
  return (
    keyword
    || Boolean(filters.resolutionStatus)
    || filters.problemScope === "problem"
    || filters.problemScope === "unresolved"
  );
}

function applyCurrentSessionFilters<Query>(
  query: Query,
  scope: InsightsUidScope,
  filters: InsightsOverviewFilters,
): Query {
  let next = query as Query & {
    innerJoin(table: string, callback: (join: {
      onRef(left: string, operator: string, right: string): {
        onRef(left: string, operator: string, right: string): unknown;
      };
    }) => unknown): Query;
    where(column: string, operator: string, value: unknown): Query;
    where(expression: unknown): Query;
  };
  const from = parseDateBoundary(filters.from);
  const to = parseDateBoundary(filters.to);
  const keyword = filters.keyword?.trim();
  const sessionIds = uniquePositiveNumbers((filters.sessionIds ?? []).map(parsePositiveInteger));

  next = next.where("session.uid", "=", scope.uid) as typeof next;

  if (filters.sessionIds && sessionIds.length === 0) {
    next = next.where(sql<boolean>`1 = 0`) as typeof next;
  }

  if (sessionIds.length > 0) {
    next = next.where("session.id", "in", sessionIds) as typeof next;
  }

  if (from != null) {
    next = next.where("session.started_at", ">=", from) as typeof next;
  }

  if (to != null) {
    next = next.where("session.started_at", "<=", to) as typeof next;
  }

  if (filters.analysisStatus) {
    next = next.where("snapshot.status", "=", filters.analysisStatus) as typeof next;
  }

  if (filters.resolutionStatus) {
    next = next.where("problem.resolution_status", "=", filters.resolutionStatus) as typeof next;
  }

  if (filters.problemScope === "problem") {
    next = next.where(sql<boolean>`
      problem.problem_detected = 1
      and problem.resolution_status not in ('no_customer_problem', 'unknown')
    `) as typeof next;
  }

  if (filters.problemScope === "unresolved") {
    next = next.where(sql<boolean>`problem.resolution_status in ('unresolved', 'partially_resolved')`) as typeof next;
  }

  if (keyword) {
    const pattern = `%${escapeLikePattern(keyword)}%`;
    next = next.where(sql<boolean>`
      (
        problem.problem_summary like ${pattern} escape '\\'
        or summary.customer_intent like ${pattern} escape '\\'
      )
    `) as typeof next;
  }

  if (filters.tagCode) {
    next = next
      .innerJoin("xy_wap_embed_session_tag as tag_filter", (join) =>
        join.onRef("tag_filter.snapshot_id", "=", "snapshot.id"),
      ) as typeof next;
    next = next.where("tag_filter.uid", "=", scope.uid) as typeof next;
    next = next.where("tag_filter.tag_code", "=", filters.tagCode) as typeof next;
  }

  if (filters.entityName) {
    next = next
      .innerJoin("xy_wap_embed_session_entity as entity_filter", (join) =>
        join.onRef("entity_filter.snapshot_id", "=", "snapshot.id"),
      ) as typeof next;
    next = next.where("entity_filter.uid", "=", scope.uid) as typeof next;
    next = next.where("entity_filter.entity_name", "=", filters.entityName) as typeof next;
  }

  if (filters.intentCode) {
    next = next
      .innerJoin("xy_wap_embed_session_intent as intent_filter", (join) =>
        join.onRef("intent_filter.snapshot_id", "=", "snapshot.id"),
      ) as typeof next;
    next = next.where("intent_filter.uid", "=", scope.uid) as typeof next;
    next = next.where("intent_filter.intent_code", "=", filters.intentCode) as typeof next;
  }

  return next;
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function parseBusinessAssetTopic(row: AssetTopicMessageQueryRow) {
  const parsed = parseInsightMessageContent(row.content);

  if (row.message_type === "link") {
    const rawUrl =
      readInsightContentString(parsed, "url") ||
      readInsightContentString(parsed, "href") ||
      readInsightContentString(parsed, "linkUrl");
    const normalizedUrl = normalizeUrlWithoutQuery(rawUrl);
    const title =
      readInsightContentString(parsed, "title") ||
      readInsightContentString(parsed, "content") ||
      readInsightContentString(parsed, "description") ||
      normalizedUrl ||
      "未知链接";

    if (!normalizedUrl && !title) {
      return undefined;
    }

    return {
      code: normalizedUrl || `link:${title}`,
      name: title,
      type: "link",
    };
  }

  if (row.message_type === "miniapp") {
    const appId =
      readInsightContentString(parsed, "appId") ||
      readInsightContentString(parsed, "appid");
    const rawPath =
      readInsightContentString(parsed, "pagePath") ||
      readInsightContentString(parsed, "pagepath") ||
      readInsightContentString(parsed, "path");
    const normalizedPath = normalizePathWithoutQuery(rawPath);
    const title =
      readInsightContentString(parsed, "title") ||
      readInsightContentString(parsed, "appName") ||
      normalizedPath ||
      "未知小程序";
    const code = [appId, normalizedPath].filter(Boolean).join(":");

    return {
      code: code || `miniapp:${title}`,
      name: title,
      type: "miniapp",
    };
  }

  if (row.message_type === "file") {
    const fileName = readInsightContentString(parsed, "fileName") || "未知文件";
    const stableId =
      readInsightContentString(parsed, "fileSerialNo") ||
      readInsightContentString(parsed, "fileId") ||
      normalizeUrlWithoutQuery(readInsightContentString(parsed, "fileUrl")) ||
      normalizeUrlWithoutQuery(readInsightContentString(parsed, "url")) ||
      fileName;

    return {
      code: stableId,
      name: fileName,
      type: "file",
    };
  }

  return undefined;
}

function normalizeUrlWithoutQuery(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    parsed.search = "";
    parsed.hash = "";

    return parsed.toString();
  } catch {
    return stripQueryAndHash(trimmed);
  }
}

function normalizePathWithoutQuery(value: string) {
  return stripQueryAndHash(value.trim());
}

function stripQueryAndHash(value: string) {
  return value.split("#")[0]?.split("?")[0]?.trim() ?? "";
}

function groupBySnapshotId<Row extends { snapshot_id: number | string }, Value>(
  rows: Row[],
  mapValue: (row: Row) => Value,
) {
  const values = new Map<string, Value[]>();

  for (const row of rows) {
    const snapshotId = String(row.snapshot_id);
    values.set(snapshotId, [...(values.get(snapshotId) ?? []), mapValue(row)]);
  }

  return values;
}

function groupAssetsBySnapshotId(rows: SessionAssetTopicRow[]) {
  const values = new Map<string, Array<{
    assetCode: string;
    assetName: string;
    assetType: string;
  }>>();
  const seen = new Set<string>();

  for (const row of rows) {
    const asset = parseBusinessAssetTopic(row);

    if (!asset) {
      continue;
    }

    const snapshotId = String(row.snapshot_id);
    const key = `${snapshotId}:${asset.code}:${asset.type}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    values.set(snapshotId, [
      ...(values.get(snapshotId) ?? []),
      {
        assetCode: asset.code,
        assetName: asset.name,
        assetType: asset.type,
      },
    ]);
  }

  return values;
}

function isDuplicateKeyError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const value = error as { code?: unknown; errno?: unknown };

  return value.code === "ER_DUP_ENTRY" || value.errno === 1062;
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
