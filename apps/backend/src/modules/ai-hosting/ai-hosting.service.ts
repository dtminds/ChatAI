import type {
  AiHostingAgentDetail,
  AiHostingAgentListItem,
  AiHostingAgentListResponse,
  AiHostingAgentModelSummary,
  AiHostingAgentPromptConfig,
  AiHostingAgentRemoveResponse,
  AiHostingAgentSaveRequest,
  AiHostingModel,
  AiHostingModelListResponse,
} from "@chatai/contracts";
import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import {
  BadRequestError,
  NotFoundError,
  ServiceUnavailableError,
} from "../../shared/errors.js";

type TenantScope = {
  platform: number;
  uid: number;
};

type AgentRow = {
  id: number;
  model_id: number;
  name: string;
  prompt_config: string | null;
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

const dbActiveStatus = 1;
const dbDeletedStatus = 0;
const defaultPage = 1;
const defaultPageSize = 10;
const maxPageSize = 100;

export class AiHostingService {
  constructor(private readonly db: Kysely<Database>) {}

  async listAgents(
    currentSubUserId: string,
    options: { page?: number; pageSize?: number; query?: string } = {},
  ): Promise<AiHostingAgentListResponse> {
    const scope = await this.getTenantScope(currentSubUserId);
    const pagination = normalizePagination(options);
    const normalizedQuery = options.query?.trim();
    const rows = await this.listAgentRows(scope, pagination, normalizedQuery);
    const models = await this.listModelRows(scope);
    const modelMap = new Map(models.map((model) => [String(model.id), mapModelSummary(model)]));

    return {
      agents: rows.map((row) => this.mapAgentListItem(row, modelMap)),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: await this.countAgents(scope, normalizedQuery),
      },
    };
  }

  async listModels(currentSubUserId: string): Promise<AiHostingModelListResponse> {
    const scope = await this.getTenantScope(currentSubUserId);

    return {
      models: (await this.listModelRows(scope)).map(mapModel),
    };
  }

  async getAgent(currentSubUserId: string, agentId: string): Promise<AiHostingAgentDetail> {
    const scope = await this.getTenantScope(currentSubUserId);
    const numericAgentId = parseMySqlId(agentId);

    if (numericAgentId == null) {
      throw new BadRequestError("INVALID_AGENT", "Agent不存在");
    }

    return this.getAgentDetailOrThrow(scope, numericAgentId);
  }

  async createAgent(
    currentSubUserId: string,
    payload: AiHostingAgentSaveRequest,
  ): Promise<AiHostingAgentDetail> {
    const scope = await this.getTenantScope(currentSubUserId);
    const operatorId = parseMySqlId(currentSubUserId);
    const normalized = await this.normalizeSavePayload(scope, payload);

    if (operatorId == null) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT", "当前账号无效");
    }

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
      throw new ServiceUnavailableError("AGENT_ID_UNAVAILABLE", "Agent服务暂不可用");
    }

    return this.getAgentDetailOrThrow(scope, agentId);
  }

  async updateAgent(
    currentSubUserId: string,
    agentId: string,
    payload: AiHostingAgentSaveRequest,
  ): Promise<AiHostingAgentDetail> {
    const scope = await this.getTenantScope(currentSubUserId);
    const operatorId = parseMySqlId(currentSubUserId);
    const numericAgentId = parseMySqlId(agentId);
    const normalized = await this.normalizeSavePayload(scope, payload);

    if (operatorId == null) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT", "当前账号无效");
    }

    if (numericAgentId == null) {
      throw new BadRequestError("INVALID_AGENT", "Agent不存在");
    }

    await this.assertAgentInScope(scope, numericAgentId);
    await this.db
      .updateTable("xy_wap_embed_agent")
      .set({
        last_operator_id: operatorId,
        model_id: normalized.modelId,
        name: normalized.name,
        prompt_config: normalized.promptConfig,
        update_time: new Date(),
      })
      .where("id", "=", numericAgentId)
      .where("uid", "=", scope.uid)
      .where("status", "=", dbActiveStatus)
      .execute();

    return this.getAgentDetailOrThrow(scope, numericAgentId);
  }

  async publishAgent(currentSubUserId: string, agentId: string): Promise<AiHostingAgentDetail> {
    const scope = await this.getTenantScope(currentSubUserId);
    const operatorId = parseMySqlId(currentSubUserId);
    const numericAgentId = parseMySqlId(agentId);

    if (operatorId == null) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT", "当前账号无效");
    }

    if (numericAgentId == null) {
      throw new BadRequestError("INVALID_AGENT", "Agent不存在");
    }

    const agent = await this.getAgentRowOrThrow(scope, numericAgentId);
    const latestHistory = await this.getLatestHistory(scope, numericAgentId);

    if (!hasPublishChanges(agent, latestHistory)) {
      throw new BadRequestError("AGENT_UNCHANGED", "当前配置已是正式版");
    }

    await this.db
      .insertInto("xy_wap_embed_agent_history")
      .values({
        agent_id: agent.id,
        model_id: agent.model_id,
        operator_id: operatorId,
        prompt_config: normalizePromptConfigText(agent.prompt_config),
        uid: scope.uid,
      })
      .executeTakeFirstOrThrow();

    return this.getAgentDetailOrThrow(scope, numericAgentId);
  }

  async restorePublishedAgent(
    currentSubUserId: string,
    agentId: string,
  ): Promise<AiHostingAgentDetail> {
    const scope = await this.getTenantScope(currentSubUserId);
    const operatorId = parseMySqlId(currentSubUserId);
    const numericAgentId = parseMySqlId(agentId);

    if (operatorId == null) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT", "当前账号无效");
    }

    if (numericAgentId == null) {
      throw new BadRequestError("INVALID_AGENT", "Agent不存在");
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
    currentSubUserId: string,
    agentId: string,
  ): Promise<AiHostingAgentRemoveResponse> {
    const scope = await this.getTenantScope(currentSubUserId);
    const operatorId = parseMySqlId(currentSubUserId);
    const numericAgentId = parseMySqlId(agentId);

    if (operatorId == null) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT", "当前账号无效");
    }

    if (numericAgentId == null) {
      throw new BadRequestError("INVALID_AGENT", "Agent不存在");
    }

    await this.assertAgentInScope(scope, numericAgentId);
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

  private async getTenantScope(currentSubUserId: string): Promise<TenantScope> {
    const numericSubUserId = parseMySqlId(currentSubUserId);

    if (numericSubUserId == null) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT", "当前账号无效");
    }

    const currentSubUser = await this.db
      .selectFrom("xy_wap_embed_sub_user")
      .select(["platform", "uid"])
      .where("id", "=", numericSubUserId)
      .where("status", "=", dbActiveStatus)
      .executeTakeFirst();

    if (!currentSubUser) {
      throw new NotFoundError("SUB_ACCOUNT_NOT_FOUND", "当前账号不存在");
    }

    return {
      platform: currentSubUser.platform,
      uid: currentSubUser.uid,
    };
  }

  private listAgentRows(
    scope: TenantScope,
    pagination: { page: number; pageSize: number },
    query?: string,
  ) {
    let builder = this.db
      .selectFrom("xy_wap_embed_agent as agent")
      .select([
        "agent.id as id",
        "agent.model_id as model_id",
        "agent.name as name",
        "agent.prompt_config as prompt_config",
        "agent.update_time as update_time",
      ])
      .where("agent.uid", "=", scope.uid)
      .where("agent.status", "=", dbActiveStatus);

    if (query) {
      builder = builder.where("agent.name", "like", `%${query}%`);
    }

    return builder
      .orderBy("agent.update_time", "desc")
      .orderBy("agent.id", "desc")
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize)
      .execute() as Promise<AgentRow[]>;
  }

  private async countAgents(scope: TenantScope, query?: string) {
    let builder = this.db
      .selectFrom("xy_wap_embed_agent as agent")
      .select(({ fn }) => fn.count<number>("agent.id").as("total"))
      .where("agent.uid", "=", scope.uid)
      .where("agent.status", "=", dbActiveStatus);

    if (query) {
      builder = builder.where("agent.name", "like", `%${query}%`);
    }

    const row = await builder.executeTakeFirst();

    return parseCount((row as { total?: number | string | bigint } | undefined)?.total);
  }

  private listModelRows(scope: TenantScope) {
    return this.db
      .selectFrom("xy_wap_embed_ai_model")
      .select(["description", "id", "model", "name", "support_multimodal", "uid"])
      .where("status", "=", dbActiveStatus)
      .where("uid", "in", [scope.uid, 0])
      .orderBy("uid", "desc")
      .orderBy("id", "asc")
      .execute() as Promise<AiModelRow[]>;
  }

  private getModelRow(scope: TenantScope, modelId: number) {
    return this.db
      .selectFrom("xy_wap_embed_ai_model")
      .select(["description", "id", "model", "name", "support_multimodal", "uid"])
      .where("id", "=", modelId)
      .where("status", "=", dbActiveStatus)
      .where("uid", "in", [scope.uid, 0])
      .executeTakeFirst() as Promise<AiModelRow | undefined>;
  }

  private async normalizeSavePayload(scope: TenantScope, payload: AiHostingAgentSaveRequest) {
    const modelId = parseMySqlId(payload.modelId);
    const name = payload.name.trim();

    if (!name) {
      throw new BadRequestError("INVALID_AGENT_NAME", "请输入Agent名称");
    }

    if (modelId == null || !(await this.getModelRow(scope, modelId))) {
      throw new BadRequestError("INVALID_AGENT_MODEL", "请选择有效的大模型");
    }

    return {
      modelId,
      name,
      promptConfig: serializePromptConfig(payload.promptConfig),
    };
  }

  private getAgentRow(scope: TenantScope, agentId: number) {
    return this.db
      .selectFrom("xy_wap_embed_agent")
      .select(["id", "model_id", "name", "prompt_config", "update_time"])
      .where("id", "=", agentId)
      .where("uid", "=", scope.uid)
      .where("status", "=", dbActiveStatus)
      .executeTakeFirst() as Promise<AgentRow | undefined>;
  }

  private async getAgentRowOrThrow(scope: TenantScope, agentId: number) {
    const agent = await this.getAgentRow(scope, agentId);

    if (!agent) {
      throw new NotFoundError("AGENT_NOT_FOUND", "Agent不存在");
    }

    return agent;
  }

  private async assertAgentInScope(scope: TenantScope, agentId: number) {
    await this.getAgentRowOrThrow(scope, agentId);
  }

  private getLatestHistory(scope: TenantScope, agentId: number) {
    return this.db
      .selectFrom("xy_wap_embed_agent_history")
      .select(["agent_id", "create_time", "id", "model_id", "prompt_config"])
      .where("uid", "=", scope.uid)
      .where("agent_id", "=", agentId)
      .orderBy("id", "desc")
      .executeTakeFirst() as Promise<AgentHistoryRow | undefined>;
  }

  private async getAgentDetailOrThrow(scope: TenantScope, agentId: number): Promise<AiHostingAgentDetail> {
    const agent = await this.getAgentRowOrThrow(scope, agentId);
    const model = await this.getModelRow(scope, agent.model_id);
    const latestHistory = await this.getLatestHistory(scope, agent.id);

    return {
      hasUnpublishedChanges: hasPublishChanges(agent, latestHistory),
      id: String(agent.id),
      model: mapModelSummary(model),
      modelId: String(agent.model_id),
      name: agent.name,
      promptConfig: parsePromptConfig(agent.prompt_config),
      publishedAt: toOptionalTimestamp(latestHistory?.create_time),
      updatedAt: toOptionalTimestamp(agent.update_time),
    };
  }

  private mapAgentListItem(
    row: AgentRow,
    modelMap: Map<string, AiHostingAgentModelSummary>,
  ): AiHostingAgentListItem {
    return {
      id: String(row.id),
      knowledgeBases: [],
      model: modelMap.get(String(row.model_id)) ?? fallbackModelSummary(row.model_id),
      name: row.name,
      updatedAt: toOptionalTimestamp(row.update_time),
    };
  }
}

export function createAiHostingService(db: Kysely<Database>) {
  return new AiHostingService(db);
}

function normalizePagination(input: { page?: number; pageSize?: number }) {
  const page = Number.isInteger(input.page) && input.page && input.page > 0 ? input.page : defaultPage;
  const pageSize =
    Number.isInteger(input.pageSize) && input.pageSize && input.pageSize > 0
      ? Math.min(input.pageSize, maxPageSize)
      : defaultPageSize;

  return { page, pageSize };
}

function parseMySqlId(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }

  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
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

function fallbackModelSummary(modelId: number): AiHostingAgentModelSummary {
  const label = modelId > 0 ? `模型 ${modelId}` : "未知模型";

  return {
    id: String(modelId),
    label,
    model: label,
    name: label,
  };
}

function serializePromptConfig(promptConfig: AiHostingAgentPromptConfig) {
  return JSON.stringify({
    condition_logic: promptConfig.conditionLogic,
    keynote: {
      length: promptConfig.keynote.length,
      style: promptConfig.keynote.style,
    },
    role: promptConfig.role,
    style: promptConfig.style,
    trans_manual: promptConfig.transferToHuman,
  });
}

function parsePromptConfig(value: string | null | undefined): AiHostingAgentPromptConfig {
  const fallback: AiHostingAgentPromptConfig = {
    conditionLogic: "",
    keynote: {
      length: "简洁",
      style: ["亲切自然"],
    },
    role: "",
    style: "",
    transferToHuman: "",
  };

  if (!value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const keynote = isRecord(parsed.keynote) ? parsed.keynote : {};

    return {
      conditionLogic: readString(parsed.condition_logic),
      keynote: {
        length: readString(keynote.length) || fallback.keynote.length,
        style: Array.isArray(keynote.style)
          ? keynote.style.filter((item): item is string => typeof item === "string")
          : fallback.keynote.style,
      },
      role: readString(parsed.role),
      style: readString(parsed.style),
      transferToHuman: readString(parsed.trans_manual),
    };
  } catch {
    return fallback;
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
    return Number.isFinite(value) ? value : undefined;
  }

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}
