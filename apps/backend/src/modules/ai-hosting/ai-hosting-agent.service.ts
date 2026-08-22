import type {
  AiHostingAgentAutoLearnUpdateResponse,
  AiHostingAgentDetail,
  AiHostingAgentKbSummary,
  AiHostingAgentListItem,
  AiHostingAgentListResponse,
  AiHostingAgentModelSummary,
  AiHostingAgentPromptConfig,
  AiHostingAgentResourceSummary,
  AiHostingAgentRenameRequest,
  AiHostingAgentRemoveResponse,
  AiHostingAgentSaveRequest,
  AiHostingAgentSettingsSaveRequest,
  AiHostingModel,
  AiHostingModelListResponse,
} from "@chatai/contracts";
import { AI_HOSTING_AGENT_QUOTA_LIMIT } from "@chatai/contracts";
import { sql, type Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import {
  BadRequestError,
  NotFoundError,
  ServiceUnavailableError,
} from "../../shared/errors.js";
import { parseMySqlId } from "./ai-hosting-id-utils.js";
import { assertAiHostingAgentPromptConfigLimits } from "./agent-prompt-config-validation.js";
import { buildContainsLikePattern } from "./sql-like-utils.js";

type AgentTenantScope = {
  uid: number;
};

type AgentWriteContext = {
  operatorSubUserId: string;
  uid: number;
};

export type AgentRow = {
  id: number;
  last_publish_time?: number | string | null;
  model_id: number;
  name: string;
  prompt_config?: string | null;
  update_time?: Date | number | string | null;
};

type AgentListRow = {
  auto_learn_enabled?: number | string | null;
  available_kb_ids?: string | number[] | null;
  id: number;
  last_publish_time?: number | string | null;
  model_id: number;
  name: string;
  update_time?: Date | number | string | null;
};

type AgentHistoryRow = {
  agent_id: number;
  create_time?: Date | number | string | null;
  id: number;
  model_id: number;
  prompt_config: string | null;
};

type AiModelRow = {
  description?: string | null;
  id: number;
  model?: string | null;
  name: string;
  support_multimodal?: number | null;
  uid: number;
};

type AgentKbRow = {
  id: number;
  name: string;
};

type AgentKbResourceRow = AgentKbRow & {
  status: number;
};

type AgentSkillResourceRow = {
  id: number;
  is_del: number;
  name: string;
  status: number;
};

const dbActiveStatus = 1;
const dbDeletedStatus = 0;
const dbNotDeletedStatus = 0;
const dbPendingLearningStatus = 0;
const defaultPage = 1;
const defaultPageSize = 10;
const maxPageSize = 100;
const hostingSettingsAgentLimit = 100;

export class AiHostingAgentService {
  constructor(private readonly db: Kysely<Database>) {}

  async listAgents(
    uid: number,
    options: { page?: number; pageSize?: number; query?: string } = {},
  ): Promise<AiHostingAgentListResponse> {
    const scope = normalizeAgentTenantScope(uid);
    const pagination = normalizePagination(options);
    const normalizedQuery = options.query?.trim();
    const rowsPromise = this.listAgentRows(scope, pagination, normalizedQuery);
    const modelsPromise = this.listModelRows();
    const totalPromise = this.countAgents(scope, normalizedQuery);
    const [rows, models, total] = await Promise.all([
      rowsPromise,
      modelsPromise,
      totalPromise,
    ]);
    const modelMap = new Map(models.map((model) => [String(model.id), mapModelSummary(model)]));
    const kbMap = await this.getAgentKbMap(scope, rows);
    const pendingCountMap = await this.getPendingSuggestionCountMap(
      scope,
      rows.map((row) => row.id),
    );

    return {
      agents: rows.map((row) =>
        this.mapAgentListItem(row, modelMap, kbMap, pendingCountMap.get(row.id) ?? 0),
      ),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
      },
    };
  }

  async listModels(uid: number): Promise<AiHostingModelListResponse> {
    return {
      models: (await this.listModelRows()).map(mapModel),
    };
  }

  async getAgent(uid: number, agentId: string): Promise<AiHostingAgentDetail> {
    const scope = normalizeAgentTenantScope(uid);
    const numericAgentId = parseMySqlId(agentId);

    if (numericAgentId == null) {
      throw new BadRequestError("INVALID_AGENT", "Agent 不存在");
    }

    return this.getAgentDetailOrThrow(scope, numericAgentId);
  }

  async createAgent(
    context: AgentWriteContext,
    payload: AiHostingAgentSaveRequest,
  ): Promise<AiHostingAgentDetail> {
    const scope = normalizeAgentTenantScope(context.uid);
    const operatorId = parseMySqlId(context.operatorSubUserId);
    const normalized = await this.normalizeSavePayload(scope, payload);

    if (operatorId == null) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT", "当前账号无效");
    }

    await this.assertAgentQuotaAvailable(scope);

    const inserted = await this.db
      .insertInto("xy_wap_embed_agent")
      .values({
        last_operator_id: operatorId,
        model_id: normalized.modelId,
        name: normalized.name,
        operator_id: operatorId,
        prompt_config: normalized.promptConfig,
        status: dbActiveStatus,
        uid: scope.uid,
      })
      .executeTakeFirstOrThrow();
    const agentId = parseInsertedMySqlId(inserted);

    if (agentId == null) {
      throw new ServiceUnavailableError("AGENT_ID_UNAVAILABLE", "Agent 服务暂不可用");
    }

    return this.getAgentDetailOrThrow(scope, agentId);
  }

  async updateAgent(
    context: AgentWriteContext,
    agentId: string,
    payload: AiHostingAgentSettingsSaveRequest,
  ): Promise<AiHostingAgentDetail> {
    const scope = normalizeAgentTenantScope(context.uid);
    const operatorId = parseMySqlId(context.operatorSubUserId);
    const numericAgentId = parseMySqlId(agentId);
    const normalized = await this.normalizeSettingsSavePayload(scope, payload);

    if (operatorId == null) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT", "当前账号无效");
    }

    if (numericAgentId == null) {
      throw new BadRequestError("INVALID_AGENT", "Agent 不存在");
    }

    await this.assertAgentInScope(scope, numericAgentId);
    await this.db
      .updateTable("xy_wap_embed_agent")
      .set({
        last_operator_id: operatorId,
        model_id: normalized.modelId,
        prompt_config: normalized.promptConfig,
        update_time: new Date(),
      })
      .where("id", "=", numericAgentId)
      .where("uid", "=", scope.uid)
      .where("status", "=", dbActiveStatus)
      .execute();

    return this.getAgentDetailOrThrow(scope, numericAgentId);
  }

  async renameAgent(
    context: AgentWriteContext,
    agentId: string,
    payload: AiHostingAgentRenameRequest,
  ): Promise<AiHostingAgentDetail> {
    const scope = normalizeAgentTenantScope(context.uid);
    const operatorId = parseMySqlId(context.operatorSubUserId);
    const numericAgentId = parseMySqlId(agentId);
    const name = normalizeAgentName(payload.name);

    if (operatorId == null) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT", "当前账号无效");
    }

    if (numericAgentId == null) {
      throw new BadRequestError("INVALID_AGENT", "Agent 不存在");
    }

    if (!name) {
      throw new BadRequestError("INVALID_AGENT_NAME", "请输入 Agent 名称");
    }

    await this.assertAgentInScope(scope, numericAgentId);
    await this.db
      .updateTable("xy_wap_embed_agent")
      .set({
        last_operator_id: operatorId,
        name,
        update_time: new Date(),
      })
      .where("id", "=", numericAgentId)
      .where("uid", "=", scope.uid)
      .where("status", "=", dbActiveStatus)
      .execute();

    return this.getAgentDetailOrThrow(scope, numericAgentId);
  }

  async updateAutoLearn(
    context: AgentWriteContext,
    agentId: string,
    enabled: boolean,
  ): Promise<AiHostingAgentAutoLearnUpdateResponse> {
    const scope = normalizeAgentTenantScope(context.uid);
    const operatorId = parseMySqlId(context.operatorSubUserId);
    const numericAgentId = parseMySqlId(agentId);

    if (operatorId == null) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT", "当前账号无效");
    }

    if (numericAgentId == null) {
      throw new BadRequestError("INVALID_AGENT", "Agent 不存在");
    }

    await this.assertAgentInScope(scope, numericAgentId);
    await this.db
      .updateTable("xy_wap_embed_agent")
      .set({
        auto_learn_enabled: enabled ? 1 : 0,
        last_operator_id: operatorId,
        update_time: new Date(),
      })
      .where("id", "=", numericAgentId)
      .where("uid", "=", scope.uid)
      .where("status", "=", dbActiveStatus)
      .execute();

    const pendingCountMap = await this.getPendingSuggestionCountMap(scope, [numericAgentId]);

    return {
      autoLearnEnabled: enabled,
      pendingSuggestionCount: pendingCountMap.get(numericAgentId) ?? 0,
    };
  }

  async publishAgent(context: AgentWriteContext, agentId: string): Promise<AiHostingAgentDetail> {
    const scope = normalizeAgentTenantScope(context.uid);
    const operatorId = parseMySqlId(context.operatorSubUserId);
    const numericAgentId = parseMySqlId(agentId);

    if (operatorId == null) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT", "当前账号无效");
    }

    if (numericAgentId == null) {
      throw new BadRequestError("INVALID_AGENT", "Agent 不存在");
    }

    const agent = await this.getAgentRowOrThrow(scope, numericAgentId);
    await this.assertAgentResourcesAvailable(
      scope,
      parsePromptConfig(agent.prompt_config),
    );
    const latestHistory = await this.getLatestHistory(scope, numericAgentId);

    if (!hasPublishChanges(agent, latestHistory)) {
      throw new BadRequestError("AGENT_UNCHANGED", "当前配置已是正式版");
    }

    const publishTime = Date.now();

    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto("xy_wap_embed_agent_history")
        .values({
          agent_id: agent.id,
          create_time: new Date(publishTime),
          model_id: agent.model_id,
          operator_id: operatorId,
          prompt_config: normalizePromptConfigText(agent.prompt_config),
          uid: scope.uid,
        })
        .executeTakeFirstOrThrow();

      await trx
        .updateTable("xy_wap_embed_agent")
        .set({
          last_operator_id: operatorId,
          last_publish_time: publishTime,
          update_time: new Date(publishTime),
        })
        .where("id", "=", numericAgentId)
        .where("uid", "=", scope.uid)
        .where("status", "=", dbActiveStatus)
        .execute();
    });

    return this.getAgentDetailOrThrow(scope, numericAgentId);
  }

  async restorePublishedAgent(
    context: AgentWriteContext,
    agentId: string,
  ): Promise<AiHostingAgentDetail> {
    const scope = normalizeAgentTenantScope(context.uid);
    const operatorId = parseMySqlId(context.operatorSubUserId);
    const numericAgentId = parseMySqlId(agentId);

    if (operatorId == null) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT", "当前账号无效");
    }

    if (numericAgentId == null) {
      throw new BadRequestError("INVALID_AGENT", "Agent 不存在");
    }

    await this.assertAgentInScope(scope, numericAgentId);
    const latestHistory = await this.getLatestHistory(scope, numericAgentId);

    if (!latestHistory) {
      throw new BadRequestError("AGENT_HISTORY_EMPTY", "暂无正式版内容");
    }

    await this.db
      .updateTable("xy_wap_embed_agent")
      .set({
        last_operator_id: operatorId,
        model_id: latestHistory.model_id,
        prompt_config: normalizePromptConfigText(latestHistory.prompt_config),
        update_time: new Date(),
      })
      .where("id", "=", numericAgentId)
      .where("uid", "=", scope.uid)
      .where("status", "=", dbActiveStatus)
      .execute();

    return this.getAgentDetailOrThrow(scope, numericAgentId);
  }

  async removeAgent(
    context: AgentWriteContext,
    agentId: string,
  ): Promise<AiHostingAgentRemoveResponse> {
    const scope = normalizeAgentTenantScope(context.uid);
    const operatorId = parseMySqlId(context.operatorSubUserId);
    const numericAgentId = parseMySqlId(agentId);

    if (operatorId == null) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT", "当前账号无效");
    }

    if (numericAgentId == null) {
      throw new BadRequestError("INVALID_AGENT", "Agent 不存在");
    }

    await this.assertAgentInScope(scope, numericAgentId);
    await this.assertAgentNotUsedByHostingSettings(scope, numericAgentId);
    await this.db
      .updateTable("xy_wap_embed_agent")
      .set({
        last_operator_id: operatorId,
        status: dbDeletedStatus,
        update_time: new Date(),
      })
      .where("id", "=", numericAgentId)
      .where("uid", "=", scope.uid)
      .where("status", "=", dbActiveStatus)
      .execute();

    return { deleted: true };
  }

  listAllAgentRows(uid: number) {
    const scope = normalizeAgentTenantScope(uid);

    return this.db
      .selectFrom("xy_wap_embed_agent as agent")
      .select([
        "agent.id as id",
        "agent.last_publish_time as last_publish_time",
        "agent.model_id as model_id",
        "agent.name as name",
        "agent.update_time as update_time",
      ])
      .where("agent.uid", "=", scope.uid)
      .where("agent.status", "=", dbActiveStatus)
      .orderBy("agent.update_time", "desc")
      .orderBy("agent.id", "desc")
      .limit(hostingSettingsAgentLimit)
      .execute() as Promise<AgentRow[]>;
  }

  private listAgentRows(
    scope: AgentTenantScope,
    pagination: { page: number; pageSize: number },
    query?: string,
  ) {
    let builder = this.db
      .selectFrom("xy_wap_embed_agent as agent")
      .select([
        "agent.auto_learn_enabled as auto_learn_enabled",
        "agent.id as id",
        "agent.last_publish_time as last_publish_time",
        "agent.model_id as model_id",
        "agent.name as name",
        sql<string | null>`JSON_EXTRACT(agent.prompt_config, '$.available_kb_ids')`.as(
          "available_kb_ids",
        ),
        "agent.update_time as update_time",
      ])
      .where("agent.uid", "=", scope.uid)
      .where("agent.status", "=", dbActiveStatus);

    if (query) {
      builder = builder.where("agent.name", "like", buildContainsLikePattern(query));
    }

    return builder
      .orderBy("agent.update_time", "desc")
      .orderBy("agent.id", "desc")
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize)
      .execute() as Promise<AgentListRow[]>;
  }

  private async countAgents(scope: AgentTenantScope, query?: string) {
    let builder = this.db
      .selectFrom("xy_wap_embed_agent as agent")
      .select(({ fn }) => fn.count<number>("agent.id").as("total"))
      .where("agent.uid", "=", scope.uid)
      .where("agent.status", "=", dbActiveStatus);

    if (query) {
      builder = builder.where("agent.name", "like", buildContainsLikePattern(query));
    }

    const row = await builder.executeTakeFirst();

    return parseCount((row as { total?: number | string | bigint } | undefined)?.total);
  }

  private async assertAgentQuotaAvailable(scope: AgentTenantScope) {
    const used = await this.countAgents(scope);

    if (used >= AI_HOSTING_AGENT_QUOTA_LIMIT) {
      throw new BadRequestError(
        "AGENT_QUOTA_EXCEEDED",
        "Agent 数量已达上限",
        {
          limit: AI_HOSTING_AGENT_QUOTA_LIMIT,
          used,
        },
      );
    }
  }

  private listModelRows() {
    return this.db
      .selectFrom("xy_wap_embed_ai_model")
      .select(["description", "id", "model", "name", "support_multimodal", "uid"])
      .where("status", "=", dbActiveStatus)
      .where("uid", "=", 0)
      .orderBy("uid", "desc")
      .orderBy("id", "asc")
      .execute() as Promise<AiModelRow[]>;
  }

  private getModelRow(scope: AgentTenantScope, modelId: number) {
    return this.db
      .selectFrom("xy_wap_embed_ai_model")
      .select(["description", "id", "model", "name", "support_multimodal", "uid"])
      .where("id", "=", modelId)
      .where("status", "=", dbActiveStatus)
      .where("uid", "=", 0)
      .executeTakeFirst() as Promise<AiModelRow | undefined>;
  }

  private async normalizeSavePayload(scope: AgentTenantScope, payload: AiHostingAgentSaveRequest) {
    const normalized = await this.normalizeSettingsSavePayload(scope, payload);
    const name = normalizeAgentName(payload.name);

    if (!name) {
      throw new BadRequestError("INVALID_AGENT_NAME", "请输入 Agent 名称");
    }

    return {
      ...normalized,
      name,
    };
  }

  private async normalizeSettingsSavePayload(
    scope: AgentTenantScope,
    payload: AiHostingAgentSettingsSaveRequest,
  ) {
    assertAiHostingAgentPromptConfigLimits(payload.promptConfig);

    const modelId = parseMySqlId(payload.modelId);

    if (modelId == null || !(await this.getModelRow(scope, modelId))) {
      throw new BadRequestError("INVALID_AGENT_MODEL", "请选择有效的大模型");
    }

    await this.assertAgentResourcesAvailable(scope, payload.promptConfig);

    return {
      modelId,
      promptConfig: serializePromptConfig(payload.promptConfig),
    };
  }

  private getAgentRow(scope: AgentTenantScope, agentId: number) {
    return this.db
      .selectFrom("xy_wap_embed_agent")
      .select(["id", "last_publish_time", "model_id", "name", "prompt_config", "update_time"])
      .where("id", "=", agentId)
      .where("uid", "=", scope.uid)
      .where("status", "=", dbActiveStatus)
      .executeTakeFirst() as Promise<AgentRow | undefined>;
  }

  private async getAgentRowOrThrow(scope: AgentTenantScope, agentId: number) {
    const agent = await this.getAgentRow(scope, agentId);

    if (!agent) {
      throw new NotFoundError("AGENT_NOT_FOUND", "Agent 不存在");
    }

    return agent;
  }

  private async assertAgentInScope(scope: AgentTenantScope, agentId: number) {
    await this.getAgentRowOrThrow(scope, agentId);
  }

  async assertPublishedAgentInTenant(uid: number, agentId: number) {
    const scope = normalizeAgentTenantScope(uid);
    const agent = await this.getAgentRowOrThrow(scope, agentId);

    if (!isPublishedAgent(agent)) {
      throw new BadRequestError("AGENT_UNPUBLISHED", "Agent 未发布，不能用于托管设置");
    }
  }

  private async assertAgentNotUsedByHostingSettings(scope: AgentTenantScope, agentId: number) {
    const [usedSeatConfig, usedGroupConfig] = await Promise.all([
      this.db
        .selectFrom("xy_wap_embed_user_seat_agent")
        .select("id")
        .where("uid", "=", scope.uid)
        .where("agent_id", "=", agentId)
        .executeTakeFirst(),
      this.db
        .selectFrom("xy_wap_embed_user_seat_group_agent")
        .select("id")
        .where("uid", "=", scope.uid)
        .where("agent_id", "=", agentId)
        .executeTakeFirst(),
    ]);

    if (usedSeatConfig || usedGroupConfig) {
      throw new BadRequestError("AGENT_IN_USE", "Agent 已被托管设置引用，不能删除");
    }
  }

  private getLatestHistory(scope: AgentTenantScope, agentId: number) {
    return this.db
      .selectFrom("xy_wap_embed_agent_history")
      .select(["agent_id", "create_time", "id", "model_id", "prompt_config"])
      .where("uid", "=", scope.uid)
      .where("agent_id", "=", agentId)
      .orderBy("id", "desc")
      .limit(1)
      .executeTakeFirst() as Promise<AgentHistoryRow | undefined>;
  }

  private async getAgentDetailOrThrow(
    scope: AgentTenantScope,
    agentId: number,
  ): Promise<AiHostingAgentDetail> {
    const agent = await this.getAgentRowOrThrow(scope, agentId);
    const promptConfig = parsePromptConfig(agent.prompt_config);
    const [model, latestHistory, availableResources] = await Promise.all([
      this.getModelRow(scope, agent.model_id),
      this.getLatestHistory(scope, agent.id),
      this.getAgentAvailableResources(scope, promptConfig),
    ]);

    return {
      availableKbs: availableResources.knowledgeBases,
      availableSkills: availableResources.skills,
      hasUnpublishedChanges: hasPublishChanges(agent, latestHistory),
      id: String(agent.id),
      model: mapModelSummary(model),
      modelId: String(agent.model_id),
      name: agent.name,
      promptConfig,
      publishedAt: toOptionalTimestamp(agent.last_publish_time),
      updatedAt: toOptionalTimestamp(agent.update_time),
    };
  }

  private async getAgentAvailableResources(
    scope: AgentTenantScope,
    promptConfig: AiHostingAgentPromptConfig,
  ): Promise<{
    knowledgeBases: AiHostingAgentResourceSummary[];
    skills: AiHostingAgentResourceSummary[];
  }> {
    const kbIds = uniquePositiveIds(promptConfig.availableKbIds);
    const skillIds = uniquePositiveIds(promptConfig.availableSkillIds);
    const embeddedNames = parseConditionLogicResourceNames(
      promptConfig.conditionLogic,
    );
    const [kbRows, skillRows] = await Promise.all([
      kbIds.length > 0
        ? this.db
            .selectFrom("xy_wap_embed_agent_kb")
            .select(["id", "name", "status"])
            .where("uid", "=", scope.uid)
            .where("id", "in", kbIds)
            .execute() as Promise<AgentKbResourceRow[]>
        : Promise.resolve([]),
      skillIds.length > 0
        ? this.db
            .selectFrom("xy_wap_embed_agent_skill")
            .select(["id", "is_del", "name", "status"])
            .where("uid", "=", scope.uid)
            .where("id", "in", skillIds)
            .execute() as Promise<AgentSkillResourceRow[]>
        : Promise.resolve([]),
    ]);
    const kbMap = new Map(kbRows.map((row) => [row.id, row]));
    const skillMap = new Map(skillRows.map((row) => [row.id, row]));

    return {
      knowledgeBases: kbIds
        .map((id) =>
          mapAgentResourceSummary({
            available: kbMap.get(id)?.status === dbActiveStatus,
            fallbackName:
              embeddedNames.knowledgeBases.get(String(id)) ?? `知识库 ${id}`,
            id,
            invalidReason: resolveKnowledgeBaseInvalidReason(kbMap.get(id)),
            row: kbMap.get(id),
          }),
        ),
      skills: skillIds
        .map((id) =>
          mapAgentResourceSummary({
            available:
              skillMap.get(id)?.is_del === dbNotDeletedStatus &&
              skillMap.get(id)?.status === dbActiveStatus,
            fallbackName:
              embeddedNames.skills.get(String(id)) ?? `技能 ${id}`,
            id,
            invalidReason: resolveSkillInvalidReason(skillMap.get(id)),
            row: skillMap.get(id),
          }),
        ),
    };
  }

  private async assertAgentResourcesAvailable(
    scope: AgentTenantScope,
    promptConfig: AiHostingAgentPromptConfig,
  ) {
    const resources = await this.getAgentAvailableResources(scope, promptConfig);
    const knowledgeBases = resources.knowledgeBases.filter(
      (resource) => resource.status === "invalid",
    );
    const skills = resources.skills.filter(
      (resource) => resource.status === "invalid",
    );

    if (knowledgeBases.length === 0 && skills.length === 0) {
      return;
    }

    throw new BadRequestError(
      "AGENT_RESOURCES_INVALID",
      "Agent 依赖的资源已失效，请移除后重试",
      { knowledgeBases, skills },
    );
  }

  private mapAgentListItem(
    row: AgentListRow,
    modelMap: Map<string, AiHostingAgentModelSummary>,
    kbMap: Map<number, AiHostingAgentKbSummary>,
    pendingSuggestionCount: number,
  ): AiHostingAgentListItem {
    return {
      autoLearnEnabled: Number(row.auto_learn_enabled) === 1,
      id: String(row.id),
      kbList: uniquePositiveIds(parseAvailableKbIds(row.available_kb_ids))
        .map((kbId) => kbMap.get(kbId))
        .filter((kb): kb is AiHostingAgentKbSummary => Boolean(kb)),
      model: modelMap.get(String(row.model_id)) ?? fallbackModelSummary(row.model_id),
      name: row.name,
      pendingSuggestionCount,
      updatedAt: toOptionalTimestamp(row.update_time),
    };
  }

  private async getPendingSuggestionCountMap(
    scope: AgentTenantScope,
    agentIds: number[],
  ): Promise<Map<number, number>> {
    if (agentIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .selectFrom("xy_wap_embed_agent_kb_learning_candidate")
      .select(["agent_id", ({ fn }) => fn.countAll<number | string | bigint>().as("total")])
      .where("uid", "=", scope.uid)
      .where("agent_id", "in", agentIds)
      .where("status", "=", dbPendingLearningStatus)
      .groupBy("agent_id")
      .execute();

    return new Map(
      rows.map((row) => [
        Number((row as { agent_id: number }).agent_id),
        parseCount((row as { total?: number | string | bigint }).total),
      ]),
    );
  }

  private async getAgentKbMap(
    scope: AgentTenantScope,
    rows: AgentListRow[],
  ): Promise<Map<number, AiHostingAgentKbSummary>> {
    const kbIds = uniquePositiveIds(
      rows.flatMap((row) => parseAvailableKbIds(row.available_kb_ids)),
    );

    if (kbIds.length === 0) {
      return new Map();
    }

    const kbRows = await this.db
      .selectFrom("xy_wap_embed_agent_kb")
      .select(["id", "name"])
      .where("uid", "=", scope.uid)
      .where("status", "=", dbActiveStatus)
      .where("id", "in", kbIds)
      .execute() as AgentKbRow[];

    return new Map(
      kbRows.map((kb) => [
        kb.id,
        {
          id: String(kb.id),
          name: kb.name,
        },
      ]),
    );
  }
}

export function createAiHostingAgentService(db: Kysely<Database>) {
  return new AiHostingAgentService(db);
}

function normalizeAgentTenantScope(uid: number): AgentTenantScope {
  if (!Number.isSafeInteger(uid) || uid <= 0) {
    throw new BadRequestError("INVALID_TENANT", "当前租户无效");
  }

  return { uid };
}

function normalizePagination(input: { page?: number; pageSize?: number }) {
  const page = Number.isInteger(input.page) && input.page && input.page > 0 ? input.page : defaultPage;
  const pageSize =
    Number.isInteger(input.pageSize) && input.pageSize && input.pageSize > 0
      ? Math.min(input.pageSize, maxPageSize)
      : defaultPageSize;

  return { page, pageSize };
}

function parseInsertedMySqlId(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const insertId = (value as { insertId?: bigint | number | string }).insertId;

  if (typeof insertId === "bigint") {
    const asNumber = Number(insertId);
    return Number.isSafeInteger(asNumber) && asNumber > 0 ? asNumber : null;
  }

  return parseMySqlId(insertId);
}

function parseCount(value: bigint | number | string | null | undefined) {
  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function mapModel(row: AiModelRow): AiHostingModel {
  return {
    description: row.description ?? "",
    id: String(row.id),
    label: row.name,
    model: row.model?.trim() || row.name,
    name: row.name,
    supportMultimodal: row.support_multimodal === 1,
  };
}

function mapModelSummary(row: AiModelRow | undefined): AiHostingAgentModelSummary {
  if (!row) {
    return fallbackModelSummary(0);
  }

  return {
    id: String(row.id),
    label: row.name,
    model: row.model?.trim() || row.name,
    name: row.name,
  };
}

function mapAgentResourceSummary({
  available,
  fallbackName,
  id,
  invalidReason,
  row,
}: {
  available: boolean;
  fallbackName: string;
  id: number;
  invalidReason?: AiHostingAgentResourceSummary["invalidReason"];
  row?: { name: string };
}): AiHostingAgentResourceSummary {
  return {
    id: String(id),
    ...(available || !invalidReason ? {} : { invalidReason }),
    name: row?.name ?? fallbackName,
    status: available ? "available" : "invalid",
  };
}

function resolveSkillInvalidReason(
  row: AgentSkillResourceRow | undefined,
): AiHostingAgentResourceSummary["invalidReason"] {
  if (!row) {
    return "unavailable";
  }

  if (row.is_del !== dbNotDeletedStatus) {
    return "deleted";
  }

  if (row.status !== dbActiveStatus) {
    return "disabled";
  }

  return undefined;
}

function resolveKnowledgeBaseInvalidReason(
  row: AgentKbResourceRow | undefined,
): AiHostingAgentResourceSummary["invalidReason"] {
  if (!row) {
    return "unavailable";
  }

  return row.status === dbActiveStatus ? undefined : "deleted";
}

function fallbackModelSummary(modelId: number): AiHostingAgentModelSummary {
  const label = modelId > 0 ? `模型 ${modelId}` : "未知模型";

  return {
    id: String(modelId),
    label,
    model: label,
    name: label,
  };
}

export function isPublishedAgent(agent: AgentRow) {
  return Boolean(toOptionalTimestamp(agent.last_publish_time));
}

function normalizeAgentName(value: string) {
  return value.trim();
}

function serializePromptConfig(promptConfig: AiHostingAgentPromptConfig) {
  return JSON.stringify({
    available_kb_ids: promptConfig.availableKbIds,
    available_skill_ids: promptConfig.availableSkillIds,
    condition_logic: promptConfig.conditionLogic,
    handoff_rules: promptConfig.handoffRules,
    reply_style: {
      length: promptConfig.replyStyle.length,
      style_instruction: promptConfig.replyStyle.styleInstruction,
    },
    role: promptConfig.role,
    use_user_memory: promptConfig.useUserMemory === true,
  });
}

function parsePromptConfig(value: string | null | undefined): AiHostingAgentPromptConfig {
  const fallback: AiHostingAgentPromptConfig = {
    availableKbIds: [],
    availableSkillIds: [],
    conditionLogic: "",
    handoffRules: "",
    replyStyle: {
      length: "简洁",
      styleInstruction: "亲切自然",
    },
    role: "",
    useUserMemory: false,
  };

  if (!value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const replyStyle = isRecord(parsed.reply_style) ? parsed.reply_style : {};
    const keynote = isRecord(parsed.keynote) ? parsed.keynote : {};
    const legacyKeynoteStyle = Array.isArray(keynote.style)
      ? keynote.style.find((item): item is string => typeof item === "string")
      : "";

    return {
      availableKbIds: readNumberArray(parsed.available_kb_ids),
      availableSkillIds: readNumberArray(parsed.available_skill_ids),
      conditionLogic: readString(parsed.condition_logic),
      handoffRules: readString(parsed.handoff_rules) || readString(parsed.trans_manual),
      replyStyle: {
        length:
          readString(replyStyle.length) ||
          readString(keynote.length) ||
          fallback.replyStyle.length,
        styleInstruction:
          readString(replyStyle.style_instruction) ||
          readString(parsed.style) ||
          legacyKeynoteStyle ||
          fallback.replyStyle.styleInstruction,
      },
      role: readString(parsed.role),
      useUserMemory: parsed.use_user_memory === true,
    };
  } catch {
    return fallback;
  }
}

function parseAvailableKbIds(value: number[] | string | null | undefined) {
  if (Array.isArray(value)) {
    return readNumberArray(value);
  }

  if (!value) {
    return [];
  }

  try {
    return readNumberArray(JSON.parse(value));
  } catch {
    return [];
  }
}

function normalizePromptConfigText(value: string | null | undefined) {
  return serializePromptConfig(parsePromptConfig(value));
}

function hasPublishChanges(agent: AgentRow, latestHistory: AgentHistoryRow | undefined) {
  if (!latestHistory) {
    return true;
  }

  return (
    agent.model_id !== latestHistory.model_id ||
    normalizePromptConfigText(agent.prompt_config) !== normalizePromptConfigText(latestHistory.prompt_config)
  );
}

function toOptionalTimestamp(value: Date | number | string | null | undefined) {
  if (value == null) {
    return undefined;
  }

  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : undefined;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  if (/^\d+$/.test(value)) {
    const parsed = Number(value);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readNumberArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is number => Number.isSafeInteger(item) && item > 0);
}

function uniquePositiveIds(values: number[]) {
  return Array.from(new Set(values.filter((value) => Number.isSafeInteger(value) && value > 0)));
}

function parseConditionLogicResourceNames(value: string) {
  const knowledgeBases = new Map<string, string>();
  const skills = new Map<string, string>();
  const tokenPattern = /<resource\b[^>]*\/>/g;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(value))) {
    const token = match[0] ?? "";
    const type = readConditionLogicResourceAttribute(token, "type");
    const name = unescapeConditionLogicResourceAttribute(
      readConditionLogicResourceAttribute(token, "name"),
    );

    if (!name) {
      continue;
    }

    if (type === "knowledge_base") {
      const id = unescapeConditionLogicResourceAttribute(
        readConditionLogicResourceAttribute(token, "kbId"),
      );
      if (id) {
        knowledgeBases.set(id, name);
      }
    } else if (type === "skill") {
      const id = unescapeConditionLogicResourceAttribute(
        readConditionLogicResourceAttribute(token, "skillId"),
      );
      if (id) {
        skills.set(id, name);
      }
    }
  }

  return { knowledgeBases, skills };
}

function readConditionLogicResourceAttribute(token: string, attribute: string) {
  return token.match(new RegExp(`${attribute}="([^"]*)"`))?.[1] ?? "";
}

function unescapeConditionLogicResourceAttribute(value: string) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}
