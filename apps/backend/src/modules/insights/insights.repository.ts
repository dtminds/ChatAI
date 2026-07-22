import type {
  InsightAnalysisPolicy,
  InsightAnalysisPolicyUpdateRequest,
  InsightActionStatus,
  InsightAnalysisStatus,
  InsightConfigStatus,
  InsightCreateActionItemRequest,
  InsightCreateActionItemResponse,
  InsightDetailResponse,
  InsightEntityDictionaryItem,
  InsightEntityDictionaryMutationRequest,
  InsightFeatureConfig,
  InsightFeatureConfigUpdateRequest,
  InsightFilterOptionsResponse,
  InsightIntentConfig,
  InsightIntentConfigMutationRequest,
  InsightLabelConfig,
  InsightLabelConfigMutationRequest,
  InsightMessageContextResponse,
  InsightQaRuleConfig,
  InsightQaRuleConfigMutationRequest,
  InsightRescanAnalysisScope,
  InsightRescanTaskStatus,
  InsightBusinessTopicsResponse,
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
import { BadRequestError } from "../../shared/errors.js";
import type {
  InsightActionItemPage,
  InsightDetailActionItemRow,
  InsightActionItemRow,
  InsightBusinessTopicAnalytics,
  InsightCurrentSessionPage,
  InsightCurrentSessionRow,
  InsightDetailRow,
  InsightOverviewAggregateRow,
  InsightQualityAgentStatRow,
  InsightQualityAggregateRow,
  InsightQualityResultPage,
  InsightsFollowUpFilters,
  InsightsBusinessRelatedSessionFilters,
  InsightsOverviewFilters,
  InsightsRepositoryPort,
  InsightsUidScope,
} from "./insights.service.js";
import {
  parseInsightMessageContent,
  readInsightContentString,
} from "./insight-message-input-builder.js";
import { parseFeatureConfigRow } from "./insights-feature-config-mapper.js";
import { DEFAULT_INSIGHT_SETTINGS } from "./insights-seeds.js";

type JsonColumnValue =
  | Array<unknown>
  | Record<string, unknown>
  | boolean
  | number
  | string
  | null
  | undefined;

type CurrentSessionQueryRow = {
  agent_message_count: number | string;
  action_id?: number | string | null;
  action_status?: string | null;
  action_type?: string | null;
  action_priority?: string | null;
  action_title?: string | null;
  conversation_id: number | string;
  current_snapshot_id: number | string | null;
  customer_message_count: number | string;
  ended_at: number | string | null;
  evidence_message_id?: number | string | null;
  evidence_role?: string | null;
  final_analysis_failed: number | string;
  generated_at: number | string | Date | null;
  last_message_at: number | string | null;
  last_customer_message_at: number | string | null;
  logical_session_status: string;
  live_analysis_enabled: number | string;
  message_count: number | string;
  phase: string | null;
  problem_detected: number | string | null;
  problem_confidence?: number | string | null;
  problem_summary: string | null;
  resolution_status: string | null;
  session_id: number | string;
  started_at: number | string;
  status: string | null;
  summary_session_title: string | null;
  summary_text: string | null;
  source_message_high_watermark?: number | string | null;
  third_external_userid: string;
  third_userid: string;
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
  snapshot_id?: number | string | null;
  third_external_userid: string | null;
  title: string;
};

type FollowUpActionItemQueryRow = Omit<
  ActionItemQueryRow,
  "evidence_message_id" | "last_customer_message_at" | "resolution_status"
>;

type QualityResultQueryRow = {
  current_snapshot_id: number | string;
  conversation_id: number | string;
  qa_status: number | string;
  session_id: number | string;
  started_at: number | string;
  third_external_userid: string;
  third_userid: string;
};

type QualityRuleQueryRow = {
  qa_finding_id: number | string;
  passed: number | string;
  rule_code: string;
  rule_name: string;
  snapshot_id: number | string;
};

type QualityResultListItemWithSnapshot = InsightQualityResultPage["items"][number] & {
  currentSnapshotId: string;
  thirdExternalUserId: string;
  thirdUserId: string;
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
  inspected_sessions: number | string;
  passed_sessions: number | string;
  total_sessions: number | string;
};

type QualityAgentStatQueryRow = {
  agent_avatar_url: string | null;
  agent_name: string | null;
  agent_seat_id: string | null;
  failed_sessions: number | string;
  inspected_sessions: number | string;
  passed_sessions: number | string;
  total_sessions: number | string;
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
  tag_id: number | string;
  tag_name: string;
};

type EntityQueryRow = {
  entity_id: number | string;
  entity_name: string;
  id: number | string;
  sentiment: string | null;
};

type IntentQueryRow = {
  confidence: number | string | null;
  id: number | string;
  intent_id: number | string;
  intent_label: string;
};

type FaqCandidateQueryRow = {
  answer_hint: string;
  id: number | string;
  question: string;
  status: string;
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

type BusinessRelatedTopicDefinition = {
  idColumn: "topic.entity_id" | "topic.intent_id" | "topic.tag_id";
  snapshotColumn: "topic.snapshot_id";
  table:
    | "xy_wap_embed_session_entity as topic"
    | "xy_wap_embed_session_intent as topic"
    | "xy_wap_embed_session_tag as topic";
  uidColumn: "topic.uid";
};

type CurrentSessionHydrationOptions = {
  aggregates?: boolean;
  actors?: boolean;
  topics?: boolean;
};

type DynamicSelectQueryBuilder = {
  execute(): Promise<unknown[]>;
  executeTakeFirst(): Promise<unknown>;
  groupBy(columns: unknown): DynamicSelectQueryBuilder;
  innerJoin(...args: unknown[]): DynamicSelectQueryBuilder;
  leftJoin(...args: unknown[]): DynamicSelectQueryBuilder;
  limit(value: number): DynamicSelectQueryBuilder;
  offset(value: number): DynamicSelectQueryBuilder;
  orderBy(column: unknown, direction: "asc" | "desc"): DynamicSelectQueryBuilder;
  select(selection: unknown): DynamicSelectQueryBuilder;
  where(column: string, operator: string, value: unknown): DynamicSelectQueryBuilder;
  where(expression: unknown): DynamicSelectQueryBuilder;
};

type SessionAssetTopicRow = {
  content: string | null;
  message_type: string;
  snapshot_id: number | string;
};

type BusinessTopicDefinition = {
  dimension: Exclude<InsightBusinessTopicsResponse["dimension"], "asset">;
  idColumn: "topic.entity_id" | "topic.intent_id" | "topic.tag_id";
  nameColumn: "topic.entity_name" | "topic.intent_label" | "topic.tag_name";
  table:
    | "xy_wap_embed_session_entity as topic"
    | "xy_wap_embed_session_intent as topic"
    | "xy_wap_embed_session_tag as topic";
};

type BusinessTopicQueryRow = {
  mention_count: number | string;
  name: string;
  session_count: number | string;
  topic_id: number | string;
  type?: string | null;
};

type BusinessTopicTrendQueryRow = {
  date: string;
  mention_count: number | string;
  session_count: number | string;
};

type BusinessTopicTotalsQueryRow = {
  mention_count: number | string;
  session_count: number | string;
};

type BusinessIntentTrendQueryRow = {
  date: string;
  intent_id: number | string;
  intent_name: string;
  session_count: number | string;
};

type BusinessAssetTopicQueryRow = {
  asset_id: number | string;
  asset_name: string;
  asset_type: string;
  mention_count: number | string;
  session_count: number | string;
};

type SessionTagTopicRow = {
  snapshot_id: number | string;
  tag_id: number | string;
  tag_name: string;
};

type SessionEntityTopicRow = {
  entity_id: number | string;
  entity_name: string;
  snapshot_id: number | string;
};

type SessionIntentTopicRow = {
  intent_id: number | string;
  intent_label: string;
  snapshot_id: number | string;
};

type ContactProfile = {
  avatarUrl: string;
  name: string;
};

type SeatProfile = {
  avatarUrl: string;
  name: string;
  seatId: string;
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

const manualActionStatuses = new Set<InsightActionStatus>(["open", "done", "dismissed"]);
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

  async getFilterOptions(scope: InsightsUidScope): Promise<InsightFilterOptionsResponse> {
    const [entities, intents, tags] = await Promise.all([
      this.db
        .selectFrom("xy_wap_embed_insight_entity_dictionary")
        .select([
          "id",
          "entity_name",
        ])
        .where("uid", "=", scope.uid)
        .where("status", "=", 1)
        .orderBy("id", "desc")
        .execute(),
      this.db
        .selectFrom("xy_wap_embed_insight_intent_config")
        .select([
          "id",
          "intent_name",
        ])
        .where("uid", "=", scope.uid)
        .where("status", "=", 1)
        .orderBy("sort_order", "desc")
        .orderBy("id", "desc")
        .execute(),
      this.db
        .selectFrom("xy_wap_embed_insight_label_config")
        .select([
          "id",
          "label_name",
        ])
        .where("uid", "=", scope.uid)
        .where("status", "=", 1)
        .orderBy("id", "desc")
        .execute(),
    ]);

    return {
      entities: entities.map(mapEntityFilterOptionRow),
      intents: intents.map(mapIntentFilterOptionRow),
      tags: tags.map(mapTagFilterOptionRow),
    };
  }

  async getSettingsSummary(scope: InsightsUidScope): Promise<InsightSettingsSummaryResponse> {
    const [
      enabledIntentResult,
      enabledLabelResult,
      enabledQaResult,
      entityResult,
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
      this.getFeatureConfig(scope),
    ]);

    return {
      enabledIntentCount: Number(enabledIntentResult?.count ?? 0),
      intentLimit: 15,
      intentSoftLimit: 12,
      enabledLabelCount: Number(enabledLabelResult?.count ?? 0),
      labelLimit: 20,
      labelSoftLimit: 15,
      enabledQaCount: Number(enabledQaResult?.count ?? 0),
      qaLimit: 10,
      qaSoftLimit: 8,
      enabledEntityCount: Number(entityResult?.count ?? 0),
      entityLimit: 20,
      entitySoftLimit: 15,
      entityEnabled: featureConfig.entityEnabled,
      insightEnabled: featureConfig.insightEnabled,
      intentEnabled: featureConfig.intentEnabled,
      labelEnabled: featureConfig.labelEnabled,
      qaEnabled: featureConfig.qaEnabled,
      todoEnabled: featureConfig.todoEnabled,
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
        min_analysis_messages: payload.minAnalysisMessages,
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
        min_analysis_messages: payload.minAnalysisMessages,
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

    return this.getFeatureConfig(scope);
  }

  async createIntentConfig(
    scope: InsightsUidScope,
    payload: InsightIntentConfigMutationRequest,
  ): Promise<InsightIntentConfig> {
    const inserted = await this.db
      .insertInto("xy_wap_embed_insight_intent_config")
      .values({
        description: payload.description ?? null,
        status: payload.status,
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
      ?? raiseConfigWriteConflict("intentConfigs", payload.intentCode);
  }

  async activatePresetIntentConfig(
    scope: InsightsUidScope,
    presetCode: string,
    preset: InsightIntentConfigMutationRequest,
  ): Promise<InsightIntentConfig> {
    return this.upsertPresetIntentConfig(scope, presetCode, preset);
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

    await this.writeIntentConfig(scope, id, payload);

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
        label_code: payload.labelCode,
        label_name: payload.labelName,
        negative_examples_json: encodeJson(payload.negativeExamples),
        positive_examples_json: encodeJson(payload.positiveExamples),
        uid: scope.uid,
      })
      .executeTakeFirstOrThrow() as InsertResult;

    return await this.getLabelConfigById(scope, String(parseInsertedMySqlId(inserted) ?? ""))
      ?? await this.getLabelConfigByCode(scope, payload.labelCode)
      ?? raiseConfigWriteConflict("labelConfigs", payload.labelCode);
  }

  async activatePresetLabelConfig(
    scope: InsightsUidScope,
    presetCode: string,
    preset: InsightLabelConfigMutationRequest,
  ): Promise<InsightLabelConfig> {
    return this.upsertPresetLabelConfig(scope, presetCode, preset);
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

    await this.writeLabelConfig(scope, id, payload);

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
      ?? raiseConfigWriteConflict("qaRuleConfigs", payload.ruleCode);
  }

  async activatePresetQaRuleConfig(
    scope: InsightsUidScope,
    presetCode: string,
    preset: InsightQaRuleConfigMutationRequest,
  ): Promise<InsightQaRuleConfig> {
    return this.upsertPresetQaRuleConfig(scope, presetCode, preset);
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

    await this.writeQaRuleConfig(scope, id, payload);

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
        entity_code: payload.entityCode,
        entity_name: payload.entityName,
        status: payload.status,
        uid: scope.uid,
      })
      .executeTakeFirstOrThrow() as InsertResult;

    return await this.getEntityDictionaryItemById(scope, String(parseInsertedMySqlId(inserted) ?? ""))
      ?? await this.getEntityDictionaryItemByCode(scope, payload.entityCode)
      ?? raiseConfigWriteConflict("entityDictionary", payload.entityCode);
  }

  async activatePresetEntityDictionaryItem(
    scope: InsightsUidScope,
    presetCode: string,
    preset: InsightEntityDictionaryMutationRequest,
  ): Promise<InsightEntityDictionaryItem> {
    return this.upsertPresetEntityDictionaryItem(scope, presetCode, preset);
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

    await this.writeEntityDictionaryItem(scope, id, payload);

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
        "min_analysis_messages",
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
      minAnalysisMessages: Number(row.min_analysis_messages),
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
        "description",
        "status",
        "id",
        "intent_code",
        "intent_name",
        "negative_examples_json",
        "positive_examples_json",
        "sort_order",
      ])
      .where("uid", "=", scope.uid)
      .where("status", "!=", -1)
      .orderBy("id", "desc")
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
        "description",
        "status",
        "id",
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
    includeDeleted = false,
  ): Promise<InsightIntentConfig | undefined> {
    let query = this.db
      .selectFrom("xy_wap_embed_insight_intent_config")
      .select([
        "description",
        "status",
        "id",
        "intent_code",
        "intent_name",
        "negative_examples_json",
        "positive_examples_json",
        "sort_order",
      ])
      .where("uid", "=", scope.uid)
      .where("intent_code", "=", intentCode);

    if (!includeDeleted) {
      // Kysely changes builder types after conditional where clauses.
      query = query.where("status", "!=", -1) as typeof query;
    }

    const row = await query.executeTakeFirst();

    return row ? mapIntentRow(row) : undefined;
  }

  async listLabelConfigs(scope: InsightsUidScope): Promise<InsightLabelConfig[]> {
    const rows = await this.db
      .selectFrom("xy_wap_embed_insight_label_config")
      .select([
        "description",
        "status",
        "id",
        "label_code",
        "label_name",
        "negative_examples_json",
        "positive_examples_json",
      ])
      .where("uid", "=", scope.uid)
      .where("status", "!=", -1)
      .orderBy("id", "desc")
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
    includeDeleted = false,
  ): Promise<InsightLabelConfig | undefined> {
    let query = this.db
      .selectFrom("xy_wap_embed_insight_label_config")
      .select([
        "description",
        "status",
        "id",
        "label_code",
        "label_name",
        "negative_examples_json",
        "positive_examples_json",
      ])
      .where("uid", "=", scope.uid)
      .where("label_code", "=", labelCode);

    if (!includeDeleted) {
      // Kysely changes builder types after conditional where clauses.
      query = query.where("status", "!=", -1) as typeof query;
    }

    const row = await query.executeTakeFirst();

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
      .orderBy("id", "desc")
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
    includeDeleted = false,
  ): Promise<InsightQaRuleConfig | undefined> {
    let query = this.db
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
      .where("rule_code", "=", ruleCode);

    if (!includeDeleted) {
      // Kysely changes builder types after conditional where clauses.
      query = query.where("status", "!=", -1) as typeof query;
    }

    const row = await query.executeTakeFirst();

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
        "entity_code",
        "entity_name",
        "status",
        "id",
      ])
      .where("uid", "=", scope.uid)
      .where("status", "!=", -1)
      .orderBy("id", "desc")
      .execute();

    return rows.map(mapEntityRow);
  }

  private async getEntityDictionaryItemByCode(
    scope: InsightsUidScope,
    entityCode: string,
    includeDeleted = false,
  ): Promise<InsightEntityDictionaryItem | undefined> {
    let query = this.db
      .selectFrom("xy_wap_embed_insight_entity_dictionary")
      .select([
        "aliases_json",
        "attributes_json",
        "entity_code",
        "entity_name",
        "status",
        "id",
      ])
      .where("uid", "=", scope.uid)
      .where("entity_code", "=", entityCode);

    if (!includeDeleted) {
      // Kysely changes builder types after conditional where clauses.
      query = query.where("status", "!=", -1) as typeof query;
    }

    const row = await query.executeTakeFirst();

    return row ? mapEntityRow(row) : undefined;
  }

  async countEnabledConfigs(
    scope: InsightsUidScope,
    configType: "entityDictionary" | "intentConfigs" | "labelConfigs" | "qaRuleConfigs",
  ): Promise<number> {
    const result = await this.db
      .selectFrom(getConfigTableName(configType))
      .select((eb) => eb.fn.countAll().as("count"))
      .where("uid", "=", scope.uid)
      .where("status", "=", 1)
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  }

  async countActiveConfigs(
    scope: InsightsUidScope,
    configType: "entityDictionary" | "intentConfigs" | "labelConfigs" | "qaRuleConfigs",
  ): Promise<number> {
    const result = await this.db
      .selectFrom(getConfigTableName(configType))
      .select((eb) => eb.fn.countAll().as("count"))
      .where("uid", "=", scope.uid)
      .where("status", "!=", -1)
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  }

  private async upsertPresetIntentConfig(
    scope: InsightsUidScope,
    presetCode: string,
    preset: InsightIntentConfigMutationRequest,
  ): Promise<InsightIntentConfig> {
    const existing = await this.getIntentConfigByCode(scope, presetCode, true);

    if (existing) {
      if (existing.status !== -1) {
        return existing;
      }
      await this.writeIntentConfig(scope, existing.id, preset, true);
      return await this.getIntentConfigByCode(scope, presetCode)
        ?? raisePresetActivateConflict("intentConfigs", presetCode);
    }

    try {
      return await this.createIntentConfig(scope, preset);
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      return await this.getIntentConfigByCode(scope, presetCode, true)
        ?? raisePresetActivateConflict("intentConfigs", presetCode);
    }
  }

  private async upsertPresetLabelConfig(
    scope: InsightsUidScope,
    presetCode: string,
    preset: InsightLabelConfigMutationRequest,
  ): Promise<InsightLabelConfig> {
    const existing = await this.getLabelConfigByCode(scope, presetCode, true);

    if (existing) {
      if (existing.status !== -1) {
        return existing;
      }
      await this.writeLabelConfig(scope, existing.id, preset, true);
      return await this.getLabelConfigByCode(scope, presetCode)
        ?? raisePresetActivateConflict("labelConfigs", presetCode);
    }

    try {
      return await this.createLabelConfig(scope, preset);
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      return await this.getLabelConfigByCode(scope, presetCode, true)
        ?? raisePresetActivateConflict("labelConfigs", presetCode);
    }
  }

  private async upsertPresetQaRuleConfig(
    scope: InsightsUidScope,
    presetCode: string,
    preset: InsightQaRuleConfigMutationRequest,
  ): Promise<InsightQaRuleConfig> {
    const existing = await this.getQaRuleConfigByCode(scope, presetCode, true);

    if (existing) {
      if (existing.status !== -1) {
        return existing;
      }
      await this.writeQaRuleConfig(scope, existing.id, preset, true);
      return await this.getQaRuleConfigByCode(scope, presetCode)
        ?? raisePresetActivateConflict("qaRuleConfigs", presetCode);
    }

    try {
      return await this.createQaRuleConfig(scope, preset);
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      return await this.getQaRuleConfigByCode(scope, presetCode, true)
        ?? raisePresetActivateConflict("qaRuleConfigs", presetCode);
    }
  }

  private async upsertPresetEntityDictionaryItem(
    scope: InsightsUidScope,
    presetCode: string,
    preset: InsightEntityDictionaryMutationRequest,
  ): Promise<InsightEntityDictionaryItem> {
    const existing = await this.getEntityDictionaryItemByCode(scope, presetCode, true);

    if (existing) {
      if (existing.status !== -1) {
        return existing;
      }
      await this.writeEntityDictionaryItem(scope, existing.id, preset, true);
      return await this.getEntityDictionaryItemByCode(scope, presetCode)
        ?? raisePresetActivateConflict("entityDictionary", presetCode);
    }

    try {
      return await this.createEntityDictionaryItem(scope, preset);
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      return await this.getEntityDictionaryItemByCode(scope, presetCode, true)
        ?? raisePresetActivateConflict("entityDictionary", presetCode);
    }
  }

  private async writeIntentConfig(
    scope: InsightsUidScope,
    id: string,
    payload: InsightIntentConfigMutationRequest,
    includeDeleted = false,
  ) {
    let query = this.db
      .updateTable("xy_wap_embed_insight_intent_config")
      .set({
        description: payload.description ?? null,
        status: payload.status,
        intent_code: payload.intentCode,
        intent_name: payload.intentName,
        negative_examples_json: encodeJson(payload.negativeExamples),
        positive_examples_json: encodeJson(payload.positiveExamples),
        sort_order: payload.weight,
        update_time: new Date(),
      })
      .where("id", "=", parsePositiveInteger(id) ?? -1)
      .where("uid", "=", scope.uid);

    if (!includeDeleted) {
      // Kysely changes builder types after conditional where clauses.
      query = query.where("status", "!=", -1) as typeof query;
    }

    await query.execute();
  }

  private async writeLabelConfig(
    scope: InsightsUidScope,
    id: string,
    payload: InsightLabelConfigMutationRequest,
    includeDeleted = false,
  ) {
    let query = this.db
      .updateTable("xy_wap_embed_insight_label_config")
      .set({
        description: payload.description ?? null,
        status: payload.status,
        label_code: payload.labelCode,
        label_name: payload.labelName,
        negative_examples_json: encodeJson(payload.negativeExamples),
        positive_examples_json: encodeJson(payload.positiveExamples),
        update_time: new Date(),
      })
      .where("id", "=", parsePositiveInteger(id) ?? -1)
      .where("uid", "=", scope.uid);

    if (!includeDeleted) {
      // Kysely changes builder types after conditional where clauses.
      query = query.where("status", "!=", -1) as typeof query;
    }

    await query.execute();
  }

  private async writeQaRuleConfig(
    scope: InsightsUidScope,
    id: string,
    payload: InsightQaRuleConfigMutationRequest,
    includeDeleted = false,
  ) {
    let query = this.db
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
      .where("id", "=", parsePositiveInteger(id) ?? -1)
      .where("uid", "=", scope.uid);

    if (!includeDeleted) {
      // Kysely changes builder types after conditional where clauses.
      query = query.where("status", "!=", -1) as typeof query;
    }

    await query.execute();
  }

  private async writeEntityDictionaryItem(
    scope: InsightsUidScope,
    id: string,
    payload: InsightEntityDictionaryMutationRequest,
    includeDeleted = false,
  ) {
    let query = this.db
      .updateTable("xy_wap_embed_insight_entity_dictionary")
      .set({
        aliases_json: encodeJson(payload.aliases),
        attributes_json: encodeJson(payload.attributes),
        entity_code: payload.entityCode,
        entity_name: payload.entityName,
        status: payload.status,
        update_time: new Date(),
      })
      .where("id", "=", parsePositiveInteger(id) ?? -1)
      .where("uid", "=", scope.uid);

    if (!includeDeleted) {
      // Kysely changes builder types after conditional where clauses.
      query = query.where("status", "!=", -1) as typeof query;
    }

    await query.execute();
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
        "entity_code",
        "entity_name",
        "status",
        "id",
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
    }, {
      actors: true,
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
    }, {
      actors: true,
      aggregates: true,
      topics: true,
    });
  }

  async getQualityAggregate(
    scope: InsightsUidScope,
    filters: { from?: string; to?: string } = {},
  ): Promise<InsightQualityAggregateRow> {
    let query = buildAnalyzedCurrentSessionLeanBaseQuery(this.db)
      .select([
        sql<number>`count(distinct session.id)`.as("total_sessions"),
        sql<number>`count(distinct case when session.qa_status in (0, 1) then session.id end)`.as("inspected_sessions"),
        sql<number>`count(distinct case when session.qa_status = 1 then session.id end)`.as("passed_sessions"),
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

    const inspectedSessions = parseNumber(row?.inspected_sessions ?? 0);
    const passedSessions = parseNumber(row?.passed_sessions ?? 0);
    const totalSessions = parseNumber(row?.total_sessions ?? 0);

    return {
      inspectedSessions,
      inspectionRate: totalSessions > 0 ? Math.min(1, inspectedSessions / totalSessions) : 0,
      passRate: inspectedSessions > 0 ? passedSessions / inspectedSessions : 0,
      ruleDistribution: [],
      totalSessions,
    };
  }

  async listQualityAgentStats(
    scope: InsightsUidScope,
    filters: { from?: string; to?: string } = {},
  ): Promise<InsightQualityAgentStatRow[]> {
    let query = buildAnalyzedCurrentSessionLeanBaseQuery(this.db)
      .leftJoin("xy_wap_embed_user_seat as seat", (join) =>
        join
          .onRef("seat.uid", "=", "session.uid")
          .onRef("seat.third_userid", "=", "session.third_userid"),
      )
      .select([
        "seat.third_avatar as agent_avatar_url",
        "seat.third_user_name as agent_name",
        "seat.id as agent_seat_id",
        sql<number>`count(distinct session.id)`.as("total_sessions"),
        sql<number>`count(distinct case when session.qa_status in (0, 1) then session.id end)`.as("inspected_sessions"),
        sql<number>`count(distinct case when session.qa_status = 0 then session.id end)`.as("failed_sessions"),
        sql<number>`count(distinct case when session.qa_status = 1 then session.id end)`.as("passed_sessions"),
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
      const passedSessions = parseNumber(row.passed_sessions);
      const failedSessions = parseNumber(row.failed_sessions);
      const inspectedSessions = parseNumber(row.inspected_sessions);
      const totalSessions = parseNumber(row.total_sessions);

      return {
        agentAvatarUrl: row.agent_avatar_url ?? undefined,
        agentName: row.agent_name ?? "未分配客服",
        agentSeatId: row.agent_seat_id == null ? "unknown" : String(row.agent_seat_id),
        failedSessions,
        inspectionRate: totalSessions > 0 ? Math.min(1, inspectedSessions / totalSessions) : 0,
        inspectedSessions,
        passedSessions,
        passRate: inspectedSessions > 0 ? passedSessions / inspectedSessions : 0,
        totalSessions,
      };
    });
  }

  async listQualityResults(
    scope: InsightsUidScope,
    filters: { from?: string; page?: number; pageSize?: number; passed?: boolean; to?: string } = {},
  ): Promise<InsightQualityResultPage> {
    const page = normalizeQualityPage(filters.page);
    const pageSize = normalizeQualityPageSize(filters.pageSize);
    const fromTs = parseDateBoundary(filters.from);
    const toTs = parseDateBoundary(filters.to);

    const baseFilters = {
      fromTs,
      passed: filters.passed,
      toTs,
      uid: scope.uid,
    };
    const countRow = await buildQualityResultBaseSessionQuery(this.db, baseFilters)
      .$call((query) => applyQualityResultSessionStatusFilter(query, filters.passed))
      .select(sql<number>`count(*)`.as("total_count"))
      .executeTakeFirst() as { total_count: number | string } | undefined;
    const total = parseNumber(countRow?.total_count ?? 0);

    const rows = await buildQualityResultSessionQuery(this.db, baseFilters)
      .$call((query) => applyQualityResultSessionStatusFilter(query, filters.passed))
      .orderBy("session.started_at", "desc")
      .orderBy("session.id", "desc")
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .execute() as unknown as QualityResultQueryRow[];

    const ruleRows = await this.listQualityRules(
      uniquePositiveNumbers(rows.map((row) => Number(row.current_snapshot_id))),
    );
    const items = mapQualityResultRows(rows, ruleRows);
    await Promise.all([
      this.hydrateQualityResultSummaries(items),
      this.hydrateQualityResultActors(scope, items),
    ]);

    return {
      items: items.map(({
        currentSnapshotId: _currentSnapshotId,
        thirdExternalUserId: _thirdExternalUserId,
        thirdUserId: _thirdUserId,
        ...item
      }) => item),
      total,
    };
  }

  async getQaFindingAggregate(
    scope: InsightsUidScope,
    filters: { from?: string; to?: string } = {},
  ): Promise<{
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

    const ruleRows = await (
      applyDateFilters(
        buildAnalyzedCurrentSessionLeanBaseQuery(this.db)
          .innerJoin("xy_wap_embed_session_qa_finding as qa", (join) =>
            join.onRef("qa.snapshot_id", "=", "snapshot.id"),
          )
          .where("session.uid", "=", scope.uid)
          .where("snapshot.status", "in", ["ready", "partial"])
          .where("session.qa_status", "=", 0)
          .where("qa.passed", "=", 0),
      )
        .select([
          "qa.rule_code as rule_code",
          "qa.rule_name as rule_name",
          sql<number>`count(*)`.as("count"),
        ])
        .groupBy(["qa.rule_code", "qa.rule_name"])
        .orderBy(sql`count(*)`, "desc")
        .execute() as Promise<Array<{ rule_code: string; rule_name: string; count: number }>>
    );

    return {
      ruleDistribution: ruleRows.map((row) => ({
        count: parseNumber(row.count),
        ruleCode: row.rule_code,
        ruleName: row.rule_name,
      })),
    };
  }

  private async listCurrentSessionRows(
    scope: InsightsUidScope,
    filters: InsightsOverviewFilters,
    pagination?: { limit: number; offset: number },
    hydration: CurrentSessionHydrationOptions = {
      actors: true,
      aggregates: true,
      topics: true,
    },
  ) {
    let query = buildCurrentSessionBaseQuery(this.db)
      .select([
        "session.current_snapshot_id as current_snapshot_id",
        "session.agent_message_count as agent_message_count",
        "session.customer_message_count as customer_message_count",
        "problem.confidence as problem_confidence",
        "problem.problem_detected as problem_detected",
        "problem.problem_summary as problem_summary",
        "problem.resolution_status as resolution_status",
        "problem.unresolved_reason as unresolved_reason",
        "session.conversation_id as conversation_id",
        "session.ended_at as ended_at",
        "session.id as session_id",
        "session.last_message_at as last_message_at",
        "session.message_count as message_count",
        "session.status as logical_session_status",
        "session.started_at as started_at",
        "session.third_external_userid as third_external_userid",
        "session.third_userid as third_userid",
        sql<number>`coalesce(analysis_policy.live_analysis_enabled, 1)`.as("live_analysis_enabled"),
        sql<number>`case when exists (
          select 1
          from xy_wap_embed_analysis_run as final_run
          where final_run.session_id = session.id
            and final_run.mode = 'final'
            and final_run.status = 'failed'
            and final_run.id = (
              select max(latest_final_run.id)
              from xy_wap_embed_analysis_run as latest_final_run
              where latest_final_run.session_id = session.id
                and latest_final_run.mode = 'final'
            )
            and (
              snapshot.create_time is null
              or final_run.create_time > snapshot.create_time
            )
        ) then 1 else 0 end`.as("final_analysis_failed"),
        "snapshot.phase as phase",
        "snapshot.create_time as generated_at",
        "snapshot.source_message_high_watermark as source_message_high_watermark",
        "snapshot.status as status",
        "summary.session_title as summary_session_title",
        "summary.summary_text as summary_text",
      ]);

    query = applyCurrentSessionFilters(query, scope, filters);

    let groupedQuery = query
      .groupBy([
        "session.current_snapshot_id",
        "session.agent_message_count",
        "session.customer_message_count",
        "problem.confidence",
        "problem.problem_detected",
        "problem.problem_summary",
        "problem.resolution_status",
        "problem.unresolved_reason",
        "session.conversation_id",
        "session.ended_at",
        "session.id",
        "session.last_message_at",
        "session.message_count",
        "session.status",
        "session.started_at",
        "session.third_external_userid",
        "session.third_userid",
        "analysis_policy.live_analysis_enabled",
        "snapshot.phase",
        "snapshot.create_time",
        "snapshot.status",
        "summary.session_title",
        "summary.summary_text",
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
    if (hydration.aggregates) {
      await this.hydrateCurrentSessionAggregates(sessionRows);
    }
    await Promise.all([
      hydration.actors
        ? this.hydrateCurrentSessionActors(scope, sessionRows)
        : Promise.resolve(),
      hydration.topics
        ? this.hydrateCurrentSessionTopics(sessionRows)
        : Promise.resolve(),
    ]);

    return sessionRows;
  }

  async getOverviewAggregate(
    scope: InsightsUidScope,
    filters: InsightsOverviewFilters = {},
  ): Promise<InsightOverviewAggregateRow> {
    const totalsQuery = applyCurrentSessionFilters(
      buildCurrentSessionBaseQuery(this.db)
        .select([
          sql<number>`count(distinct session.id)`.as("logical_sessions"),
          sql<number>`coalesce(sum(session.message_count), 0)`.as("messages"),
          sql<number>`coalesce(sum(session.customer_message_count), 0)`.as("customer_messages"),
          sql<number>`coalesce(sum(session.agent_message_count), 0)`.as("agent_messages"),
          sql<number>`count(distinct session.conversation_id)`.as("consulting_customers"),
          sql<number>`count(distinct case when snapshot.phase = 'final' and snapshot.status = 'ready' then session.id end)`.as("ready"),
          sql<number>`count(distinct case when snapshot.phase = 'final' and snapshot.status = 'partial' then session.id end)`.as("partial"),
          sql<number>`count(distinct case when snapshot.phase = 'final' and snapshot.status = 'failed' then session.id end)`.as("failed"),
          sql<number>`count(distinct case when snapshot.phase = 'final' and snapshot.status = 'stale' then session.id end)`.as("stale"),
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
          // Overview avoids joining action_item on this high-traffic aggregate path;
          // action-items are served by the dedicated follow-up endpoint.
          sql<number>`0`.as("action_items_open"),
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

  async getSessionizationCoverageStart(
    scope: InsightsUidScope,
  ): Promise<number | undefined> {
    const rows = await this.db
      .selectFrom("xy_wap_embed_insight_sync_cursor")
      .select(["create_time", "uid"])
      .where("source", "=", "xy_wap_embed_msg_audit_info")
      .where("uid", "in", [0, scope.uid])
      .execute() as Array<{ create_time: Date | string; uid: number | string }>;
    const timestamps = rows
      .map((row) => row.create_time instanceof Date
        ? row.create_time.getTime()
        : Date.parse(row.create_time))
      .filter(Number.isFinite);

    return timestamps.length > 0 ? Math.max(...timestamps) : undefined;
  }

  async getBusinessTopicAnalytics(
    scope: InsightsUidScope,
    filters: InsightsOverviewFilters & { dimension: InsightBusinessTopicsResponse["dimension"] },
  ): Promise<InsightBusinessTopicAnalytics> {
    if (filters.dimension === "asset") {
      return this.getBusinessAssetTopicAnalytics(scope, filters);
    }

    return this.getBusinessSnapshotTopicAnalytics(
      scope,
      filters,
      getBusinessTopicDefinition(filters.dimension),
    );
  }

  private async getBusinessAssetTopicAnalytics(
    scope: InsightsUidScope,
    filters: InsightsOverviewFilters,
  ): Promise<InsightBusinessTopicAnalytics> {
    let topicQuery = this.db
      .selectFrom("xy_wap_embed_logical_session_message as session_message")
      .innerJoin("xy_wap_embed_insight_asset as asset", (join) =>
        join.onRef("asset.id", "=", "session_message.asset_id"),
      )
      .select([
        "asset.id as asset_id",
        "asset.asset_name as asset_name",
        "asset.asset_type as asset_type",
        sql<number>`count(session_message.id)`.as("mention_count"),
        sql<number>`count(distinct session_message.session_id)`.as("session_count"),
      ])
      .where("session_message.uid", "=", scope.uid)
      .where("session_message.asset_id", "is not", null)
      .groupBy([
        "asset.id",
        "asset.asset_name",
        "asset.asset_type",
      ])
      .orderBy(sql<number>`count(session_message.id)`, "desc")
      .orderBy(sql<number>`count(distinct session_message.session_id)`, "desc")
      .orderBy("asset.id", "asc")
      .limit(10);

    topicQuery = applyAssetMessageDateFilters(topicQuery, filters);

    // 28800000 = 8h * 3600s * 1000ms; align date buckets to Asia/Shanghai (UTC+8).
    const assetTrendDateBucket = sql<string>`
      date_format(
        from_days(
          to_days('1970-01-01') + floor((session_message.source_message_time + 28800000) / 86400000)
        ),
        '%Y-%m-%d'
      )
    `;
    let trendQuery = this.db
      .selectFrom("xy_wap_embed_logical_session_message as session_message")
      .select([
        assetTrendDateBucket.as("date"),
        sql<number>`count(session_message.id)`.as("mention_count"),
        sql<number>`count(distinct session_message.session_id)`.as("session_count"),
      ])
      .where("session_message.uid", "=", scope.uid)
      .where("session_message.asset_id", "is not", null)
      .groupBy(assetTrendDateBucket)
      .orderBy("date", "asc");

    trendQuery = applyAssetMessageDateFilters(trendQuery, filters);

    let totalsQuery = this.db
      .selectFrom("xy_wap_embed_logical_session_message as session_message")
      .select([
        sql<number>`count(session_message.id)`.as("mention_count"),
        sql<number>`count(distinct session_message.session_id)`.as("session_count"),
      ])
      .where("session_message.uid", "=", scope.uid)
      .where("session_message.asset_id", "is not", null);

    totalsQuery = applyAssetMessageDateFilters(totalsQuery, filters);

    const [topicRows, trendRows, totalsRow] = await Promise.all([
      topicQuery.execute() as Promise<BusinessAssetTopicQueryRow[]>,
      trendQuery.execute() as Promise<BusinessTopicTrendQueryRow[]>,
      totalsQuery.executeTakeFirst() as Promise<BusinessTopicTotalsQueryRow | undefined>,
    ]);
    const totalTopicSessions = parseNumber(totalsRow?.session_count ?? 0);
    const topics = topicRows.map((row) => {
      const sessionCount = parseNumber(row.session_count);

      return {
        code: String(row.asset_id),
        dimension: "asset" as const,
        mentionCount: parseNumber(row.mention_count),
        name: row.asset_name,
        sessionCount,
        share: totalTopicSessions > 0 ? sessionCount / totalTopicSessions : 0,
        type: row.asset_type,
      };
    });

    return {
      intentTrend: [],
      topics,
      totals: {
        mentionCount: parseNumber(totalsRow?.mention_count ?? 0),
        topicSessions: totalTopicSessions,
      },
      trend: trendRows.map((row) => ({
        assetMentions: parseNumber(row.mention_count),
        date: row.date,
        entityMentions: 0,
        intentMentions: 0,
        tagMentions: 0,
        topicSessions: parseNumber(row.session_count),
      })),
    };
  }

  private async getBusinessSnapshotTopicAnalytics(
    scope: InsightsUidScope,
    filters: InsightsOverviewFilters,
    topic: BusinessTopicDefinition,
  ): Promise<InsightBusinessTopicAnalytics> {
    let topicQuery = this.buildBusinessSnapshotTopicBaseQuery(scope, topic)
      .select([
        `${topic.idColumn} as topic_id`,
        `${topic.nameColumn} as name`,
        sql<number>`count(topic.id)`.as("mention_count"),
        sql<number>`count(distinct session.id)`.as("session_count"),
      ])
      .groupBy([topic.idColumn, topic.nameColumn])
      .orderBy(sql<number>`count(distinct session.id)`, "desc")
      .orderBy(sql<number>`count(topic.id)`, "desc")
      .orderBy(topic.nameColumn, "asc")
      .orderBy(topic.idColumn, "asc")
      .limit(getBusinessSnapshotTopicLimit(topic.dimension));

    topicQuery = applyTopicDateFilters(topicQuery, filters);

    // 28800000 = 8h * 3600s * 1000ms; align date buckets to Asia/Shanghai (UTC+8).
    const trendDateBucket = sql<string>`
      date_format(
        from_days(
          to_days('1970-01-01') + floor((session.started_at + 28800000) / 86400000)
        ),
        '%Y-%m-%d'
      )
    `;
    let trendQuery = this.buildBusinessSnapshotTopicBaseQuery(scope, topic)
      .select([
        trendDateBucket.as("date"),
        sql<number>`count(topic.id)`.as("mention_count"),
        sql<number>`count(distinct session.id)`.as("session_count"),
      ])
      .groupBy(trendDateBucket)
      .orderBy("date", "asc");

    trendQuery = applyTopicDateFilters(trendQuery, filters);

    let totalsQuery = this.buildBusinessSnapshotTopicBaseQuery(scope, topic)
      .select([
        sql<number>`count(topic.id)`.as("mention_count"),
        sql<number>`count(distinct session.id)`.as("session_count"),
      ]);

    totalsQuery = applyTopicDateFilters(totalsQuery, filters);

    const queries: [
      Promise<BusinessTopicQueryRow[]>,
      Promise<BusinessTopicTrendQueryRow[]>,
      Promise<BusinessTopicTotalsQueryRow | undefined>,
    ] = [
      topicQuery.execute() as Promise<BusinessTopicQueryRow[]>,
      trendQuery.execute() as Promise<BusinessTopicTrendQueryRow[]>,
      totalsQuery.executeTakeFirst() as Promise<BusinessTopicTotalsQueryRow | undefined>,
    ];
    const [topicRows, trendRows, totalsRow] = await Promise.all(queries);
    const intentTrendRows = topic.dimension === "intent"
      ? await this.listBusinessIntentTrendRows(
          scope,
          filters,
          topic,
          trendDateBucket,
          topicRows.map((row) => parseNumber(row.topic_id)),
        )
      : [];
    const totalTopicSessions = parseNumber(totalsRow?.session_count ?? 0);

    return {
      intentTrend: intentTrendRows.map((row) => ({
        date: row.date,
        intentId: String(row.intent_id),
        intentName: row.intent_name,
        sessionCount: parseNumber(row.session_count),
      })),
      topics: topicRows.map((row) => {
        const sessionCount = parseNumber(row.session_count);

        return {
          code: String(row.topic_id),
          dimension: topic.dimension,
          mentionCount: parseNumber(row.mention_count),
          name: row.name,
          sessionCount,
          share: totalTopicSessions > 0 ? sessionCount / totalTopicSessions : 0,
          type: row.type ?? undefined,
        };
      }),
      totals: {
        mentionCount: parseNumber(totalsRow?.mention_count ?? 0),
        topicSessions: totalTopicSessions,
      },
      trend: trendRows.map((row) => ({
        assetMentions: 0,
        date: row.date,
        entityMentions: topic.dimension === "entity" ? parseNumber(row.mention_count) : 0,
        intentMentions: topic.dimension === "intent" ? parseNumber(row.mention_count) : 0,
        tagMentions: topic.dimension === "tag" ? parseNumber(row.mention_count) : 0,
        topicSessions: parseNumber(row.session_count),
      })),
    };
  }

  private buildBusinessSnapshotTopicBaseQuery(
    scope: InsightsUidScope,
    topic: BusinessTopicDefinition,
  ) {
    let query = (this.db
      .selectFrom("xy_wap_embed_logical_session as session")
    ) as DynamicSelectQueryBuilder;

    query = query
      .innerJoin(topic.table, "topic.snapshot_id", "session.current_snapshot_id")
      .where("session.uid", "=", scope.uid)
      .where("topic.uid", "=", scope.uid);

    return query;
  }

  private async listBusinessIntentTrendRows(
    scope: InsightsUidScope,
    filters: InsightsOverviewFilters,
    topic: BusinessTopicDefinition,
    trendDateBucket: ReturnType<typeof sql<string>>,
    intentIds: number[],
  ): Promise<BusinessIntentTrendQueryRow[]> {
    if (intentIds.length === 0) {
      return [];
    }

    let query = this.buildBusinessSnapshotTopicBaseQuery(scope, topic)
      .select([
        trendDateBucket.as("date"),
        "topic.intent_id as intent_id",
        "topic.intent_label as intent_name",
        sql<number>`count(distinct session.id)`.as("session_count"),
      ])
      .groupBy([trendDateBucket, "topic.intent_id", "topic.intent_label"])
      .orderBy("date", "asc")
      .orderBy("topic.intent_label", "asc")
      .orderBy("topic.intent_id", "asc");

    query = applyTopicDateFilters(query, filters);
    query = query.where("topic.intent_id", "in", intentIds);

    return await query.execute() as BusinessIntentTrendQueryRow[];
  }

  async listBusinessRelatedSessions(
    scope: InsightsUidScope,
    filters: InsightsBusinessRelatedSessionFilters,
  ): Promise<InsightCurrentSessionPage> {
    if (filters.dimension === "asset") {
      return this.listBusinessAssetRelatedSessions(scope, filters);
    }

    const topicId = parsePositiveInteger(filters.topicCode);

    if (topicId == null) {
      return { items: [], total: 0 };
    }

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const offset = (page - 1) * pageSize;
    const totalRow = await this.buildBusinessRelatedSessionQuery(scope, filters, topicId)
      .select(sql<number>`count(distinct session.id)`.as("count"))
      .executeTakeFirst() as CountQueryRow | undefined;
    const total = parseNumber(totalRow?.count ?? 0);
    const rows = (await this.buildBusinessRelatedSessionQuery(scope, filters, topicId)
      .select([
        "session.conversation_id as conversation_id",
        "session.ended_at as ended_at",
        "session.id as session_id",
        "session.last_message_at as last_message_at",
        "session.started_at as started_at",
        "session.third_external_userid as third_external_userid",
        "session.third_userid as third_userid",
        "summary.session_title as summary_session_title",
        "summary.summary_text as summary_text",
      ])
      .groupBy([
        "session.conversation_id",
        "session.ended_at",
        "session.id",
        "session.last_message_at",
        "session.started_at",
        "session.third_external_userid",
        "session.third_userid",
        "summary.session_title",
        "summary.summary_text",
      ])
      .orderBy("session.started_at", "desc")
      .orderBy("session.id", "desc")
      .limit(pageSize)
      .offset(offset)
      .execute() as CurrentSessionCoreQueryRow[]).map((row) => ({
        ...row,
        last_customer_message_at: row.last_customer_message_at ?? null,
    }));
    const sessionRows = mapCurrentSessionRows(rows);

    await this.hydrateCurrentSessionActors(scope, sessionRows);

    return {
      items: sessionRows,
      total,
    };
  }

  private buildBusinessRelatedSessionQuery(
    scope: InsightsUidScope,
    filters: InsightsBusinessRelatedSessionFilters,
    topicId: number,
  ) {
    const topic = getBusinessRelatedTopicDefinition(filters.dimension);
    let query = (this.db.selectFrom(topic.table) as DynamicSelectQueryBuilder)
      .innerJoin(
        "xy_wap_embed_logical_session as session",
        "session.current_snapshot_id",
        topic.snapshotColumn,
      )
      .leftJoin(
        "xy_wap_embed_session_summary as summary",
        "summary.snapshot_id",
        "session.current_snapshot_id",
      )
      .where(topic.uidColumn, "=", scope.uid)
      .where(topic.idColumn, "=", topicId)
      .where("session.uid", "=", scope.uid);

    query = applyTopicDateFilters(query, filters);

    return query;
  }

  private async listBusinessAssetRelatedSessions(
    scope: InsightsUidScope,
    filters: InsightsBusinessRelatedSessionFilters,
  ): Promise<InsightCurrentSessionPage> {
    const assetId = parsePositiveInteger(filters.topicCode);

    if (assetId == null) {
      return { items: [], total: 0 };
    }

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const offset = (page - 1) * pageSize;
    let totalQuery = this.db
      .selectFrom("xy_wap_embed_logical_session_message as session_message")
      .select(sql<number>`count(distinct session_message.session_id)`.as("count"))
      .where("session_message.uid", "=", scope.uid)
      .where("session_message.asset_id", "=", assetId);
    totalQuery = applyAssetMessageDateFilters(totalQuery, filters);
    const totalRow = await totalQuery.executeTakeFirst() as CountQueryRow | undefined;
    const total = parseNumber(totalRow?.count ?? 0);

    if (total === 0) {
      return { items: [], total: 0 };
    }

    let pageQuery = this.db
      .selectFrom("xy_wap_embed_logical_session_message as session_message")
      .select(["session_message.session_id as session_id"])
      .where("session_message.uid", "=", scope.uid)
      .where("session_message.asset_id", "=", assetId)
      .groupBy(["session_message.session_id"])
      .orderBy("session_message.session_id", "desc")
      .limit(pageSize)
      .offset(offset);

    pageQuery = applyAssetMessageDateFilters(pageQuery, filters);

    const rows = await pageQuery.execute() as Array<{ session_id: number | string }>;
    const sessionIds = Array.from(
      new Set(
        rows.map((row) => String(row.session_id)),
      ),
    );

    if (sessionIds.length === 0) {
      return { items: [], total };
    }

    return {
      items: await this.listBusinessRelatedSessionDetails(scope, sessionIds),
      total,
    };
  }

  private async listBusinessRelatedSessionDetails(
    scope: InsightsUidScope,
    sessionIds: string[],
  ): Promise<InsightCurrentSessionRow[]> {
    const numericSessionIds = normalizePositiveIntegers(sessionIds);

    if (numericSessionIds.length === 0) {
      return [];
    }

    const query = this.db
      .selectFrom("xy_wap_embed_logical_session as session")
      .leftJoin("xy_wap_embed_session_summary as summary", (join) =>
        join.onRef("summary.snapshot_id", "=", "session.current_snapshot_id"),
      )
      .select([
        "session.conversation_id as conversation_id",
        "session.ended_at as ended_at",
        "session.id as session_id",
        "session.last_message_at as last_message_at",
        "session.started_at as started_at",
        "session.third_external_userid as third_external_userid",
        "session.third_userid as third_userid",
        "summary.session_title as summary_session_title",
        "summary.summary_text as summary_text",
      ])
      .where("session.uid", "=", scope.uid)
      .where("session.id", "in", numericSessionIds);

    const rows = (await query
      .orderBy("session.id", "desc")
      .execute() as CurrentSessionCoreQueryRow[]).map((row) => ({
        ...row,
        last_customer_message_at: row.last_customer_message_at ?? null,
    }));
    const sessionRows = mapCurrentSessionRows(rows);

    await this.hydrateCurrentSessionActors(scope, sessionRows);

    return sessionRows;
  }

  async listActionItemsPage(
    scope: InsightsUidScope,
    filters: InsightsFollowUpFilters = {},
  ): Promise<InsightActionItemPage> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const total = await this.countActionItemRows(scope, filters);
    const rows = await this.listActionItemRows(scope, filters, {
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    const actionItems = mapFollowUpActionItemRows(rows);
    await this.hydrateActionItemCustomers(scope, actionItems);

    return {
      items: actionItems,
      total,
    };
  }

  private buildActionItemListBaseQuery(
    scope: InsightsUidScope,
    filters: InsightsFollowUpFilters,
  ) {
    let query = this.db
      .selectFrom("xy_wap_embed_session_action_item as action")
      .where("action.uid", "=", scope.uid);

    if (filters.status === "processed") {
      query = query.where("action.status", "in", ["done", "dismissed"]);
    } else if (filters.status) {
      query = query.where("action.status", "=", filters.status);
    }

    if (filters.priority) {
      query = query.where("action.priority", "=", filters.priority);
    }

    return applyActionItemDateFilters(query, filters);
  }

  private async countActionItemRows(
    scope: InsightsUidScope,
    filters: InsightsFollowUpFilters,
  ) {
    const row = await this.buildActionItemListBaseQuery(scope, filters)
      .select(sql<number>`count(*)`.as("total_count"))
      .executeTakeFirst() as { total_count: number | string } | undefined;

    return parseNumber(row?.total_count ?? 0);
  }

  private async listActionItemRows(
    scope: InsightsUidScope,
    filters: InsightsFollowUpFilters,
    pagination: { limit: number; offset: number },
  ) {
    return (await this.buildActionItemListBaseQuery(scope, filters)
      .leftJoin("xy_wap_embed_logical_session as session", (join) =>
        join.onRef("session.id", "=", "action.session_id"),
      )
      .select([
        "action.id as action_id",
        "action.action_type as action_type",
        "action.create_time as created_at",
        "action.priority as priority",
        "action.status as action_status",
        "action.title as title",
        "action.conversation_id as conversation_id",
        "action.session_id as session_id",
        "action.snapshot_id as snapshot_id",
        "session.third_external_userid as third_external_userid",
      ])
      .orderBy("action.id", "desc")
      .limit(pagination.limit)
      .offset(pagination.offset)
      .execute() as FollowUpActionItemQueryRow[]);
  }

  async findDetail(
    scope: InsightsUidScope,
    sessionId: string,
  ): Promise<InsightDetailRow | undefined> {
    const rows = await buildCurrentSessionBaseQuery(this.db)
      .select([
        "session.current_snapshot_id as current_snapshot_id",
        "problem.confidence as problem_confidence",
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
        "session.third_external_userid as third_external_userid",
        "session.third_userid as third_userid",
        "snapshot.phase as phase",
        "snapshot.create_time as generated_at",
        "snapshot.source_message_high_watermark as source_message_high_watermark",
        "snapshot.status as status",
        "summary.session_title as summary_session_title",
        "summary.summary_text as summary_text",
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
    if (!snapshotId) {
      return {
        actionItems: [],
        current,
        entities: [],
        evidenceItems: [],
        faqCandidates: [],
        intents: [],
        problemEvidenceMessageIds: [],
        qaFindings: [],
        sentiment: [],
        tags: [],
      };
    }

    const dimensionEvidence = await this.listDimensionEvidence(scope, current.sessionId, snapshotId);
    const [
      qaFindingRows,
      actionItems,
    ] = await Promise.all([
      this.listQaFindings(snapshotId),
      this.listSessionActionItems(
        scope,
        snapshotId,
        current.conversationId,
        current.sessionId,
        current.resolutionStatus,
        current.thirdExternalUserId,
      ),
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

  async hasSession(
    scope: InsightsUidScope,
    sessionId: string,
  ): Promise<boolean> {
    const row = await this.db
      .selectFrom("xy_wap_embed_logical_session as session")
      .select("session.id")
      .where("session.uid", "=", scope.uid)
      .where("session.id", "=", parsePositiveInteger(sessionId) ?? -1)
      .executeTakeFirst();

    return row != null;
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
    scope: InsightsUidScope,
    snapshotId: string,
    conversationId: string,
    sessionId: string,
    resolutionStatus: string | null,
    thirdExternalUserId: string,
  ) {
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
      .where("action.uid", "=", scope.uid)
      .where("action.session_id", "=", parsePositiveInteger(sessionId) ?? -1)
      .execute() as Array<Pick<ActionItemQueryRow,
        "action_id" | "action_status" | "action_type" | "priority" | "snapshot_id" | "title"
      >>).map((row) => toActionItemBaseRow({
        ...row,
        conversation_id: conversationId,
        resolution_status: resolutionStatus,
        session_id: sessionId,
        third_external_userid: thirdExternalUserId,
      }));
    const actionItems = mapActionItemRows(rows);

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
      .select(["confidence", "id", "tag_id", "tag_name"])
      .where("snapshot_id", "=", parsePositiveInteger(snapshotId) ?? -1)
      .execute() as TagQueryRow[];

    return rows.map((row) => ({
      confidence: parseConfidence(row.confidence),
      evidenceMessageIds: evidenceForDimension(evidence, "tag", row.id),
      tagId: String(row.tag_id),
      tagName: row.tag_name,
    }));
  }

  private async listEntities(snapshotId: string, evidence: DimensionEvidenceRow[]) {
    const rows = await this.db
      .selectFrom("xy_wap_embed_session_entity")
      .select(["entity_id", "entity_name", "id", "sentiment"])
      .where("snapshot_id", "=", parsePositiveInteger(snapshotId) ?? -1)
      .execute() as EntityQueryRow[];

    return rows.map((row) => ({
      entityId: String(row.entity_id),
      entityName: row.entity_name,
      evidenceMessageIds: evidenceForDimension(evidence, "entity", row.id),
      sentiment: row.sentiment ?? undefined,
    }));
  }

  private async listIntents(snapshotId: string, evidence: DimensionEvidenceRow[]) {
    const rows = await this.db
      .selectFrom("xy_wap_embed_session_intent")
      .select(["confidence", "id", "intent_id", "intent_label"])
      .where("snapshot_id", "=", parsePositiveInteger(snapshotId) ?? -1)
      .execute() as IntentQueryRow[];

    return rows.map((row) => ({
      confidence: parseConfidence(row.confidence),
      evidenceMessageIds: evidenceForDimension(evidence, "intent", row.id),
      intentId: String(row.intent_id),
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

  async listSessionMessageRecords(
    scope: InsightsUidScope,
    sessionId: string,
  ): Promise<WorkbenchMessageDto[] | undefined> {
    const targetSessionId = parsePositiveInteger(sessionId);

    if (targetSessionId == null) {
      return undefined;
    }

    const target = await this.findInsightConversationBySession(scope, targetSessionId);

    if (!target) {
      return undefined;
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
    status: Extract<InsightActionStatus, "open" | "done" | "dismissed">,
  ): Promise<boolean> {
    if (!manualActionStatuses.has(status)) {
      return false;
    }

    const id = parsePositiveInteger(actionItemId);

    if (id == null) {
      return false;
    }

    const now = new Date();
    const result = await this.db
      .updateTable("xy_wap_embed_session_action_item")
      .set({
        completed_at: status === "done" ? now : null,
        dismissed_at: status === "dismissed" ? now : null,
        status,
        update_time: now,
      })
      .where("id", "=", id)
      .where("uid", "=", scope.uid)
      .where("status", "in", ["open", "done", "dismissed"])
      .executeTakeFirst();

    return getAffectedRows(result) !== 0;
  }

  async validateActionItemTarget(
    scope: InsightsUidScope,
    input: Pick<InsightCreateActionItemRequest, "conversationId" | "sessionId">,
  ): Promise<boolean> {
    const conversationId = parsePositiveInteger(input.conversationId);

    if (conversationId == null) {
      return false;
    }

    const conversation = await this.db
      .selectFrom("xy_wap_embed_conversation")
      .select(["id"])
      .where("id", "=", conversationId)
      .where("uid", "=", scope.uid)
      .executeTakeFirst();

    if (!conversation) {
      return false;
    }

    const sessionId = parsePositiveInteger(input.sessionId);

    if (sessionId == null) {
      return false;
    }

    const session = await this.db
      .selectFrom("xy_wap_embed_logical_session")
      .select(["id"])
      .where("id", "=", sessionId)
      .where("uid", "=", scope.uid)
      .where("conversation_id", "=", conversationId)
      .executeTakeFirst();

    return Boolean(session);
  }

  async createActionItem(
    scope: InsightsUidScope,
    input: InsightCreateActionItemRequest & { createdBySubUserId?: string },
  ): Promise<InsightCreateActionItemResponse> {
    const conversationId = parsePositiveInteger(input.conversationId);
    const sessionId = parsePositiveInteger(input.sessionId);

    if (conversationId == null || sessionId == null) {
      throw new BadRequestError("INVALID_ACTION_ITEM_TARGET", "待办关联会话无效");
    }

    const inserted = await this.db
      .insertInto("xy_wap_embed_session_action_item")
      .values({
        action_type: "follow_up",
        conversation_id: conversationId,
        created_by_sub_user_id: input.createdBySubUserId == null
          ? null
          : parsePositiveInteger(input.createdBySubUserId) ?? null,
        due_hint: input.dueHint ?? null,
        priority: input.priority,
        session_id: sessionId,
        snapshot_id: null,
        source_type: "manual",
        status: "open",
        title: input.title,
        uid: scope.uid,
        updated_by_sub_user_id: input.createdBySubUserId == null
          ? null
          : parsePositiveInteger(input.createdBySubUserId) ?? null,
      })
      .executeTakeFirstOrThrow() as InsertResult;

    return {
      actionItemId: String(parseInsertedMySqlId(inserted) ?? ""),
    };
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
          from_time: input.from.getTime(),
          status: "pending",
          to_time: input.to.getTime(),
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
          target_id: String(scope.uid),
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
        from_time: number | string;
        id: number | string;
        queued_sessions: number | string;
        started_at: Date | string | null;
        status: string;
        succeeded_sessions: number | string;
        to_time: number | string | null;
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
        from: new Date(parseNumber(row.from_time)).toISOString(),
        queuedSessions: parseNumber(row.queued_sessions),
        startedAt: toOptionalTimestamp(row.started_at),
        status: normalizeRescanTaskStatus(row.status),
        succeededSessions: parseNumber(row.succeeded_sessions),
        taskId: String(row.id),
        to: row.to_time == null ? undefined : new Date(parseNumber(row.to_time)).toISOString(),
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
    if (rows.length === 0) {
      return;
    }

    const contacts = await this.listContactProfiles(
      scope.uid,
      uniqueNonEmpty(rows.map((row) => row.thirdExternalUserId)),
    );
    const seats = await this.listSeatProfiles(
      scope.uid,
      uniqueNonEmpty(rows.map((row) => row.thirdUserId)),
    );

    for (const row of rows) {
      const contact = row.thirdExternalUserId
        ? contacts.get(row.thirdExternalUserId)
        : undefined;
      const seat = row.thirdUserId
        ? seats.get(row.thirdUserId)
        : undefined;

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

    const problemEvidence = await this.listProblemEvidenceMessages(snapshotIds);
    const problemEvidenceBySnapshotId = groupProblemEvidenceMessages(problemEvidence);

    for (const row of rows) {
      const snapshotId = row.currentSnapshotId;

      if (!snapshotId) {
        row.actionOpenCount = 0;
        row.problemEvidenceMessageIds = [];
        row.lastCustomerMessageAt = row.lastCustomerMessageAt ?? null;
        continue;
      }

      const evidence = problemEvidenceBySnapshotId.get(snapshotId) ?? [];

      // Avoid per-page action_item fan-out here; follow-up counts are loaded by the dedicated endpoint.
      row.actionOpenCount = 0;
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
    const snapshotIds = normalizePositiveIntegers(
      rows.map((row) => row.currentSnapshotId),
    );

    if (snapshotIds.length === 0) {
      return;
    }

    const [
      tags,
      entities,
      intents,
    ] = await Promise.all([
      this.db
        .selectFrom("xy_wap_embed_session_tag")
        .select(["snapshot_id", "tag_id", "tag_name"])
        .where("snapshot_id", "in", snapshotIds)
        .execute() as Promise<SessionTagTopicRow[]>,
      this.db
        .selectFrom("xy_wap_embed_session_entity")
        .select(["entity_id", "entity_name", "snapshot_id"])
        .where("snapshot_id", "in", snapshotIds)
        .execute() as Promise<SessionEntityTopicRow[]>,
      this.db
        .selectFrom("xy_wap_embed_session_intent")
        .select(["intent_id", "intent_label", "snapshot_id"])
        .where("snapshot_id", "in", snapshotIds)
        .execute() as Promise<SessionIntentTopicRow[]>,
    ]);

    const tagsBySnapshotId = groupBySnapshotId(tags, (row) => ({
      tagId: String(row.tag_id),
      tagName: row.tag_name,
    }));
    const entitiesBySnapshotId = groupBySnapshotId(entities, (row) => ({
      entityId: String(row.entity_id),
      entityName: row.entity_name,
    }));
    const intentsBySnapshotId = groupBySnapshotId(intents, (row) => ({
      intentId: String(row.intent_id),
      intentLabel: row.intent_label,
    }));

    for (const row of rows) {
      const snapshotId = row.currentSnapshotId;

      row.tags = snapshotId ? tagsBySnapshotId.get(snapshotId) ?? [] : [];
      row.entities = snapshotId ? entitiesBySnapshotId.get(snapshotId) ?? [] : [];
      row.intents = snapshotId ? intentsBySnapshotId.get(snapshotId) ?? [] : [];
    }
  }

  private async hydrateActionItemCustomers(
    scope: InsightsUidScope,
    rows: Array<InsightActionItemRow | InsightDetailActionItemRow>,
  ) {
    if (rows.length === 0) {
      return;
    }

    const contacts = await this.listContactProfiles(
      scope.uid,
      uniqueNonEmpty(rows.map((row) => row.thirdExternalUserId)),
    );

    for (const row of rows) {
      const contact = row.thirdExternalUserId
        ? contacts.get(row.thirdExternalUserId)
        : undefined;

      row.customerAvatarUrl = contact?.avatarUrl ?? row.customerAvatarUrl;
      row.customerName = contact?.name ?? row.customerName;
    }
  }

  private async hydrateQualityResultSummaries(
    rows: QualityResultListItemWithSnapshot[],
  ) {
    const snapshotIds = uniquePositiveNumbers(
      rows.map((row) => Number(row.currentSnapshotId)),
    );

    if (snapshotIds.length === 0) {
      return;
    }

    const summaries = await this.db
      .selectFrom("xy_wap_embed_session_problem_resolution")
      .select(["problem_summary", "snapshot_id"])
      .where("snapshot_id", "in", snapshotIds)
      .execute();
    const summariesBySnapshotId = new Map(
      summaries.map((row) => [String(row.snapshot_id), row.problem_summary]),
    );

    for (const row of rows) {
      row.summary = summariesBySnapshotId.get(row.currentSnapshotId) ?? row.summary;
    }
  }

  private async hydrateQualityResultActors(
    scope: InsightsUidScope,
    rows: QualityResultListItemWithSnapshot[],
  ) {
    if (rows.length === 0) {
      return;
    }

    const contacts = await this.listContactProfiles(
      scope.uid,
      uniqueNonEmpty(rows.map((row) => row.thirdExternalUserId)),
    );
    const seats = await this.listSeatProfiles(
      scope.uid,
      uniqueNonEmpty(rows.map((row) => row.thirdUserId)),
    );

    for (const row of rows) {
      const contact = contacts.get(row.thirdExternalUserId);
      const seat = seats.get(row.thirdUserId);

      row.customerAvatarUrl = contact?.avatarUrl ?? row.customerAvatarUrl;
      row.customerName = contact?.name ?? row.customerName;
      row.agentAvatarUrl = seat?.avatarUrl ?? row.agentAvatarUrl;
      row.agentName = seat?.name ?? row.agentName;
    }
  }

  private async listQualityRules(
    snapshotIds: number[],
  ): Promise<QualityRuleQueryRow[]> {
    if (snapshotIds.length === 0) {
      return [];
    }

    return await this.db
      .selectFrom("xy_wap_embed_session_qa_finding")
      .select([
        "id as qa_finding_id",
        "passed",
        "rule_code",
        "rule_name",
        "snapshot_id",
      ])
      .where("snapshot_id", "in", snapshotIds)
      .execute() as unknown as QualityRuleQueryRow[];
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
        agentName: readOptionalDetailField<string>(row, "agent_name"),
        agentSeatId: normalizeOptionalString(
          readOptionalDetailField<number | string>(row, "agent_seat_id"),
        ),
        agentMessageCount: parseNumber(row.agent_message_count),
        analysisStatus: deriveAnalysisStatus(row),
        conversationId: String(row.conversation_id),
        currentSnapshotId: normalizeOptionalId(row.current_snapshot_id),
        customerAvatarUrl: null,
        customerMessageCount: parseNumber(row.customer_message_count),
        customerName: readOptionalDetailField<string>(row, "customer_name") ?? "未知客户",
        endedAt: parseNullableNumber(row.ended_at),
        generatedAt: parseNullableNumber(row.generated_at) ?? undefined,
        lastMessageAt: parseNullableNumber(row.last_message_at),
        lastCustomerMessageAt: parseNullableNumber(row.last_customer_message_at),
        logicalSessionStatus: normalizeLogicalSessionStatus(row.logical_session_status),
        messageCount: parseNumber(row.message_count),
        phase: row.phase == null ? undefined : row.phase === "final" ? "final" : "live",
        problemDetected: parseNullableNumber(row.problem_detected) === 1,
        problemEvidenceMessageIds: [],
        problemResolutionConfidence: parseNullableNumber(row.problem_confidence ?? null) ?? undefined,
        problemSummary: row.problem_summary ?? "",
        resolutionStatus: normalizeResolutionStatus(row.resolution_status),
        sessionId,
        sourceMessageHighWatermark: normalizeOptionalId(row.source_message_high_watermark ?? null),
        startedAt: parseNumber(row.started_at),
        summarySessionTitle: row.summary_session_title ?? "",
        summaryText: row.summary_text ?? "",
        thirdExternalUserId: row.third_external_userid,
        thirdUserId: row.third_userid,
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

function deriveAnalysisStatus(row: CurrentSessionQueryRow): InsightAnalysisStatus | undefined {
  if (row.logical_session_status === "closed_pending_analysis") {
    return "analyzing";
  }

  if (parseNumber(row.final_analysis_failed) === 1) {
    return "failed";
  }

  if (row.current_snapshot_id == null || row.status == null) {
    if (row.logical_session_status === "open") {
      return row.live_analysis_enabled == null || parseNumber(row.live_analysis_enabled) === 1
        ? "analyzing"
        : undefined;
    }

    return "skipped";
  }

  return normalizeAnalysisStatus(row.status);
}

function normalizeLogicalSessionStatus(
  value: string,
): InsightCurrentSessionRow["logicalSessionStatus"] {
  if (
    value === "analyzed"
    || value === "canceled"
    || value === "closed_pending_analysis"
    || value === "open"
  ) {
    return value;
  }

  return "analyzed";
}

function normalizeOptionalString(value: number | string | null) {
  if (value == null) {
    return null;
  }

  return String(value);
}

function normalizeOptionalId(value: number | string | null) {
  if (value == null) {
    return undefined;
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

function mapFollowUpActionItemRows(rows: FollowUpActionItemQueryRow[]): InsightActionItemRow[] {
  return rows.map((row) => ({
    actionItemId: String(row.action_id),
    conversationId: String(row.conversation_id),
    createdAt: parseNumber(row.created_at ?? 0),
    customerAvatarUrl: undefined,
    customerName: "未知客户",
    priority: normalizePriority(row.priority),
    sessionId: String(row.session_id),
    status: normalizeActionStatus(row.action_status),
    thirdExternalUserId: row.third_external_userid ?? undefined,
    title: row.title,
  }));
}

function mapQualityResultRows(
  rows: QualityResultQueryRow[],
  ruleRows: QualityRuleQueryRow[],
): QualityResultListItemWithSnapshot[] {
  const rulesBySession = new Map<
    string,
    Map<string, InsightQualityResultPage["items"][number]["rules"][number]>
  >();

  for (const row of ruleRows) {
    const snapshotId = String(row.snapshot_id);
    const findingId = String(row.qa_finding_id);
    let sessionRuleResults = rulesBySession.get(snapshotId);

    if (!sessionRuleResults) {
      sessionRuleResults = new Map();
      rulesBySession.set(snapshotId, sessionRuleResults);
    }

    sessionRuleResults.set(findingId, {
      passed: row.passed === 1 || row.passed === "1",
      ruleCode: row.rule_code,
      ruleName: row.rule_name,
    });
  }

  return rows.map((row) => {
    const sessionId = String(row.session_id);
    const snapshotId = String(row.current_snapshot_id);
    const rules = Array.from(rulesBySession.get(snapshotId)?.values() ?? []);
    const failedRuleCount = rules.filter((rule) => !rule.passed).length;

    return {
      agentAvatarUrl: undefined,
      agentName: undefined,
      conversationId: String(row.conversation_id),
      currentSnapshotId: snapshotId,
      customerAvatarUrl: undefined,
      customerName: "未知客户",
      passed: parseNumber(row.qa_status) === 1,
      passedRules: rules.length - failedRuleCount,
      rules,
      sessionId,
      startedAt: parseNumber(row.started_at),
      summary: "",
      thirdExternalUserId: row.third_external_userid,
      thirdUserId: row.third_userid,
      totalRules: rules.length,
    };
  });
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
        thirdExternalUserId: row.third_external_userid ?? undefined,
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

function normalizeQualityPage(value: number | undefined) {
  if (!value || !Number.isFinite(value) || value < 1) {
    return 1;
  }

  return Math.trunc(value);
}

function normalizeQualityPageSize(value: number | undefined) {
  if (!value || !Number.isFinite(value) || value < 1) {
    return 20;
  }

  return Math.min(Math.trunc(value), 100);
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

function parseJsonArray(value: JsonColumnValue): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: JsonColumnValue) {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
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
    labelCode: payload.labelCode,
    labelName: payload.labelName,
    negativeExamples: payload.negativeExamples,
    positiveExamples: payload.positiveExamples,
  };
}

function mapIntentPayload(id: string, payload: InsightIntentConfigMutationRequest): InsightIntentConfig {
  return {
    description: payload.description,
    status: payload.status,
    id,
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
    entityCode: payload.entityCode,
    entityName: payload.entityName,
    status: payload.status,
    id,
  };
}

function mapLabelRow(row: {
  description: string | null;
  status: number;
  id: number | string;
  label_code: string;
  label_name: string;
  negative_examples_json: JsonColumnValue;
  positive_examples_json: JsonColumnValue;
}): InsightLabelConfig {
  return {
    description: optionalString(row.description),
    status: parseConfigStatus(row.status),
    id: String(row.id),
    labelCode: row.label_code,
    labelName: row.label_name,
    negativeExamples: parseJsonArray(row.negative_examples_json),
    positiveExamples: parseJsonArray(row.positive_examples_json),
  };
}

function mapIntentRow(row: {
  description: string | null;
  status: number;
  id: number | string;
  intent_code: string;
  intent_name: string;
  negative_examples_json: JsonColumnValue;
  positive_examples_json: JsonColumnValue;
  sort_order: number | string;
}): InsightIntentConfig {
  return {
    description: optionalString(row.description),
    status: parseConfigStatus(row.status),
    id: String(row.id),
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
  negative_examples_json: JsonColumnValue;
  positive_examples_json: JsonColumnValue;
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
  aliases_json: JsonColumnValue;
  attributes_json: JsonColumnValue;
  entity_code: string;
  entity_name: string;
  status: number;
  id: number | string;
}): InsightEntityDictionaryItem {
  return {
    aliases: parseJsonArray(row.aliases_json),
    attributes: parseJsonObject(row.attributes_json),
    entityCode: row.entity_code,
    entityName: row.entity_name,
    status: parseConfigStatus(row.status),
    id: String(row.id),
  };
}

function mapEntityFilterOptionRow(row: {
  entity_name: string;
  id: number | string;
}): InsightFilterOptionsResponse["entities"][number] {
  return {
    id: String(row.id),
    name: row.entity_name,
  };
}

function mapIntentFilterOptionRow(row: {
  id: number | string;
  intent_name: string;
}): InsightFilterOptionsResponse["intents"][number] {
  return {
    id: String(row.id),
    name: row.intent_name,
  };
}

function mapTagFilterOptionRow(row: {
  id: number | string;
  label_name: string;
}): InsightFilterOptionsResponse["tags"][number] {
  return {
    id: String(row.id),
    name: row.label_name,
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

function applyAssetMessageDateFilters<Query>(
  query: Query,
  filters: InsightsOverviewFilters,
): Query {
  let next = query as Query & {
    where(column: string, operator: string, value: unknown): Query;
  };
  const from = parseDateBoundary(filters.from);
  const to = parseDateBoundary(filters.to);

  if (from != null) {
    next = next.where("session_message.source_message_time", ">=", from) as typeof next;
  }

  if (to != null) {
    next = next.where("session_message.source_message_time", "<=", to) as typeof next;
  }

  return next;
}

function applyActionItemDateFilters<Query>(
  query: Query,
  filters: InsightsFollowUpFilters,
): Query {
  let next = query as Query & {
    where(column: string, operator: string, value: unknown): Query;
  };
  const from = parseDateBoundary(filters.from);
  const to = parseDateBoundary(filters.to);

  if (from != null) {
    next = next.where("action.create_time", ">=", from) as typeof next;
  }

  if (to != null) {
    next = next.where("action.create_time", "<=", to) as typeof next;
  }

  return next;
}

function getBusinessRelatedTopicDefinition(
  dimension: InsightsBusinessRelatedSessionFilters["dimension"],
): BusinessRelatedTopicDefinition {
  if (dimension === "entity") {
    return {
      idColumn: "topic.entity_id",
      snapshotColumn: "topic.snapshot_id",
      table: "xy_wap_embed_session_entity as topic",
      uidColumn: "topic.uid",
    };
  }

  if (dimension === "intent") {
    return {
      idColumn: "topic.intent_id",
      snapshotColumn: "topic.snapshot_id",
      table: "xy_wap_embed_session_intent as topic",
      uidColumn: "topic.uid",
    };
  }

  return {
    idColumn: "topic.tag_id",
    snapshotColumn: "topic.snapshot_id",
    table: "xy_wap_embed_session_tag as topic",
    uidColumn: "topic.uid",
  };
}

function getBusinessSnapshotTopicLimit(
  dimension: BusinessTopicDefinition["dimension"],
): number {
  if (dimension === "intent") {
    return 15;
  }

  return 10;
}

function getBusinessTopicDefinition(
  dimension: Exclude<InsightBusinessTopicsResponse["dimension"], "asset">,
): BusinessTopicDefinition {
  if (dimension === "entity") {
    return {
      dimension,
      idColumn: "topic.entity_id",
      nameColumn: "topic.entity_name",
      table: "xy_wap_embed_session_entity as topic",
    };
  }

  if (dimension === "intent") {
    return {
      dimension,
      idColumn: "topic.intent_id",
      nameColumn: "topic.intent_label",
      table: "xy_wap_embed_session_intent as topic",
    };
  }

  return {
    dimension,
    idColumn: "topic.tag_id",
    nameColumn: "topic.tag_name",
    table: "xy_wap_embed_session_tag as topic",
  };
}

function buildAnalyzedCurrentSessionLeanBaseQuery(db: Kysely<Database>) {
  return db
    .selectFrom("xy_wap_embed_logical_session as session")
    .innerJoin("xy_wap_embed_session_insight_snapshot as snapshot", (join) =>
      join.onRef("snapshot.id", "=", "session.current_snapshot_id"),
    );
}

function buildAnalyzedCurrentSessionBaseQuery(db: Kysely<Database>) {
  return buildAnalyzedCurrentSessionLeanBaseQuery(db)
    .leftJoin("xy_wap_embed_session_problem_resolution as problem", (join) =>
      join.onRef("problem.snapshot_id", "=", "snapshot.id"),
    );
}

function buildCurrentSessionLeanBaseQuery(db: Kysely<Database>) {
  return db
    .selectFrom("xy_wap_embed_logical_session as session")
    .leftJoin("xy_wap_embed_insight_analysis_policy as analysis_policy", (join) =>
      join
        .onRef("analysis_policy.uid", "=", "session.uid")
        .on("analysis_policy.enabled", "=", 1),
    )
    .leftJoin("xy_wap_embed_session_insight_snapshot as snapshot", (join) =>
      join.onRef("snapshot.id", "=", "session.current_snapshot_id"),
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

function buildQualityResultSessionQuery(
  db: Pick<Kysely<Database>, "selectFrom">,
  filters: {
    fromTs: number | null | undefined;
    passed: boolean | undefined;
    toTs: number | null | undefined;
    uid: number;
  },
) {
  return buildQualityResultBaseSessionQuery(db, filters)
    .select([
      "session.current_snapshot_id as current_snapshot_id",
      "session.conversation_id as conversation_id",
      "session.id as session_id",
      "session.qa_status as qa_status",
      "session.started_at as started_at",
      "session.third_external_userid as third_external_userid",
      "session.third_userid as third_userid",
    ]);
}

function buildQualityResultBaseSessionQuery(
  db: Pick<Kysely<Database>, "selectFrom">,
  filters: {
    fromTs: number | null | undefined;
    passed: boolean | undefined;
    toTs: number | null | undefined;
    uid: number;
  },
) {
  return applyQualityResultFilters(
    (db as Kysely<Database>)
      .selectFrom("xy_wap_embed_logical_session as session")
      .innerJoin("xy_wap_embed_session_insight_snapshot as snapshot", (join) =>
        join.onRef("snapshot.id", "=", "session.current_snapshot_id"),
      ),
    filters,
  );
}

function applyQualityResultFilters<Query>(
  query: Query,
  filters: {
    fromTs: number | null | undefined;
    passed: boolean | undefined;
    toTs: number | null | undefined;
    uid: number;
  },
): Query {
  let next = query as Query & {
    where(column: string, operator: string, value: unknown): Query;
  };

  next = next.where("session.uid", "=", filters.uid) as typeof next;
  next = next.where("snapshot.status", "in", ["ready", "partial"]) as typeof next;

  if (filters.fromTs != null) {
    next = next.where("session.started_at", ">=", filters.fromTs) as typeof next;
  }
  if (filters.toTs != null) {
    next = next.where("session.started_at", "<=", filters.toTs) as typeof next;
  }

  return next;
}

function applyQualityResultSessionStatusFilter<Query>(
  query: Query,
  passed: boolean | undefined,
): Query {
  const next = query as Query & {
    where(column: string, operator: string, value: unknown): Query;
  };

  if (passed == null) {
    return next.where("session.qa_status", "in", [0, 1]);
  }

  return next.where("session.qa_status", "=", passed ? 1 : 0);
}

function needsCurrentSessionHydrationJoins(filters: InsightsOverviewFilters) {
  const keyword = Boolean(filters.keyword?.trim()) && filters.searchMode !== "basic";
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
    if (filters.analysisStatus === "analyzing") {
      next = next.where(sql<boolean>`
        session.status = 'closed_pending_analysis'
        or (
          session.status = 'open'
          and session.current_snapshot_id is null
          and coalesce(analysis_policy.live_analysis_enabled, 1) = 1
        )
      `) as typeof next;
    } else if (filters.analysisStatus === "skipped") {
      next = next.where(sql<boolean>`
        session.status in ('analyzed', 'canceled')
        and session.current_snapshot_id is null
      `) as typeof next;
    } else if (filters.analysisStatus === "failed") {
      next = next.where(sql<boolean>`
        snapshot.status = 'failed'
        or (
          session.status in ('analyzed', 'canceled')
          and exists (
            select 1
            from xy_wap_embed_analysis_run as final_run
            where final_run.session_id = session.id
              and final_run.mode = 'final'
              and final_run.status = 'failed'
              and final_run.id = (
                select max(latest_final_run.id)
                from xy_wap_embed_analysis_run as latest_final_run
                where latest_final_run.session_id = session.id
                  and latest_final_run.mode = 'final'
              )
              and (
                snapshot.create_time is null
                or final_run.create_time > snapshot.create_time
              )
          )
        )
      `) as typeof next;
    } else {
      next = next.where("snapshot.status", "=", filters.analysisStatus) as typeof next;
    }
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
    if (filters.searchMode === "basic") {
      next = next.where(sql<boolean>`
        cast(session.id as char) like ${pattern} escape '\\'
        or cast(session.conversation_id as char) like ${pattern} escape '\\'
        or session.third_external_userid like ${pattern} escape '\\'
        or session.third_userid like ${pattern} escape '\\'
        or exists (
          select 1
          from xy_wap_embed_contact as contact
          where contact.uid = session.uid
            and contact.third_external_userid = session.third_external_userid
            and contact.biz_status = 1
            and (
              contact.name like ${pattern} escape '\\'
              or contact.real_name like ${pattern} escape '\\'
            )
        )
        or exists (
          select 1
          from xy_wap_embed_user_seat as seat
          where seat.uid = session.uid
            and seat.third_userid = session.third_userid
            and seat.biz_status = 1
            and seat.third_user_name like ${pattern} escape '\\'
        )
      `) as typeof next;
    } else {
      next = next.where(sql<boolean>`
        problem.problem_summary like ${pattern} escape '\\'
        or summary.session_title like ${pattern} escape '\\'
        or summary.summary_text like ${pattern} escape '\\'
      `) as typeof next;
    }
  }

  if (filters.tagId) {
    next = next
      .innerJoin("xy_wap_embed_session_tag as tag_filter", (join) =>
        join.onRef("tag_filter.snapshot_id", "=", "snapshot.id"),
      ) as typeof next;
    next = next.where("tag_filter.uid", "=", scope.uid) as typeof next;
    next = next.where("tag_filter.tag_id", "=", parsePositiveInteger(filters.tagId) ?? 0) as typeof next;
  }

  if (filters.entityId) {
    next = next
      .innerJoin("xy_wap_embed_session_entity as entity_filter", (join) =>
        join.onRef("entity_filter.snapshot_id", "=", "snapshot.id"),
      ) as typeof next;
    next = next.where("entity_filter.uid", "=", scope.uid) as typeof next;
    next = next.where("entity_filter.entity_id", "=", parsePositiveInteger(filters.entityId) ?? 0) as typeof next;
  }

  if (filters.intentId) {
    next = next
      .innerJoin("xy_wap_embed_session_intent as intent_filter", (join) =>
        join.onRef("intent_filter.snapshot_id", "=", "snapshot.id"),
      ) as typeof next;
    next = next.where("intent_filter.uid", "=", scope.uid) as typeof next;
    next = next.where("intent_filter.intent_id", "=", parsePositiveInteger(filters.intentId) ?? 0) as typeof next;
  }

  return next;
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function parseBusinessAssetTopic(row: SessionAssetTopicRow) {
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
      readInsightContentString(parsed, "description") ||
      readInsightContentString(parsed, "appName") ||
      readInsightContentString(parsed, "title") ||
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

function raisePresetActivateConflict(
  configType: "entityDictionary" | "intentConfigs" | "labelConfigs" | "qaRuleConfigs",
  presetCode: string,
): never {
  throw new BadRequestError(
    "INSIGHT_PRESET_ACTIVATE_CONFLICT",
    "预置配置添加失败，请刷新后重试",
    { configType, presetCode },
  );
}

function raiseConfigWriteConflict(
  configType: "entityDictionary" | "intentConfigs" | "labelConfigs" | "qaRuleConfigs",
  configCode: string,
): never {
  throw new BadRequestError(
    "INSIGHT_CONFIG_WRITE_CONFLICT",
    "配置写入后读取失败，请刷新后重试",
    { configCode, configType },
  );
}

function getConfigTableName(
  configType: "entityDictionary" | "intentConfigs" | "labelConfigs" | "qaRuleConfigs",
) {
  if (configType === "intentConfigs") {
    return "xy_wap_embed_insight_intent_config";
  }

  if (configType === "labelConfigs") {
    return "xy_wap_embed_insight_label_config";
  }

  if (configType === "qaRuleConfigs") {
    return "xy_wap_embed_insight_qa_rule_config";
  }

  return "xy_wap_embed_insight_entity_dictionary";
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
