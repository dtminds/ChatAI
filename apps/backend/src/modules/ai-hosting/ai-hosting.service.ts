import type {
  AiHostingAgentDetail,
  AiHostingAgentListItem,
  AiHostingAgentListResponse,
  AiHostingAgentModelSummary,
  AiHostingAgentPromptConfig,
  AiHostingAgentRenameRequest,
  AiHostingAgentRemoveResponse,
  AiHostingAgentSaveRequest,
  AiHostingAgentSettingsSaveRequest,
  AiHostingSettingsAccount,
  AiHostingSettingsAgentOption,
  AiHostingSettingsResponse,
  AiHostingSettingsUpdateRequest,
  AiHostingModel,
  AiHostingModelListResponse,
} from "@chatai/contracts";
import type { Insertable, Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import {
  BadRequestError,
  NotFoundError,
  ServiceUnavailableError,
} from "../../shared/errors.js";
import { buildContainsLikePattern } from "./sql-like-utils.js";

type TenantScope = {
  platform: number;
  uid: number;
};

type AgentRow = {
  id: number;
  last_publish_time?: number | string | null;
  model_id: number;
  name: string;
  prompt_config?: string | null;
  update_time?: Date | number | string | null;
};

type AgentHistoryRow = {
  agent_id: number;
  create_time?: Date | number | string | null;
  id: number;
  model_id: number;
  prompt_config: string | null;
};

type HostingSettingsSeatRow = {
  avatarUrl: string | null;
  id: number;
  third_user_name: string | null;
};

type UserSeatAgentRow = {
  agent_id: number;
  full_auto_auth: number | null;
  semi_auto_auth: number | null;
  user_seat_id: number;
};

type UserSeatAgentInsert = Insertable<Database["xy_wap_embed_user_seat_agent"]>;

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
const hostingSettingsSeatLimit = 200;

export class AiHostingService {
  constructor(private readonly db: Kysely<Database>) {}

  async listAgents(
    currentSubUserId: string,
    options: { page?: number; pageSize?: number; query?: string } = {},
  ): Promise<AiHostingAgentListResponse> {
    const scope = await this.getTenantScope(currentSubUserId);
    const pagination = normalizePagination(options);
    const normalizedQuery = options.query?.trim();
    const [rows, models, total] = await Promise.all([
      this.listAgentRows(scope, pagination, normalizedQuery),
      this.listModelRows(scope),
      this.countAgents(scope, normalizedQuery),
    ]);
    const modelMap = new Map(models.map((model) => [String(model.id), mapModelSummary(model)]));

    return {
      agents: rows.map((row) => this.mapAgentListItem(row, modelMap)),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
      },
    };
  }

  async listModels(currentSubUserId: string): Promise<AiHostingModelListResponse> {
    const scope = await this.getTenantScope(currentSubUserId);

    return {
      models: (await this.listModelRows(scope)).map(mapModel),
    };
  }

  async listHostingSettings(currentSubUserId: string): Promise<AiHostingSettingsResponse> {
    const scope = await this.getTenantScope(currentSubUserId);
    const [seats, agents] = await Promise.all([
      this.listHostingSettingSeats(scope),
      this.listAllAgentRows(scope),
    ]);
    const seatIds = seats.map((seat) => seat.id);
    const configs = await this.listUserSeatAgentRows(scope, seatIds);
    const configsBySeatId = new Map(configs.map((config) => [config.user_seat_id, config]));

    return {
      accounts: seats.map((seat) => mapHostingSettingsAccount(seat, configsBySeatId.get(seat.id))),
      agents: agents.map(mapHostingSettingsAgent),
    };
  }

  async updateHostingSettings(
    currentSubUserId: string,
    payload: AiHostingSettingsUpdateRequest,
  ): Promise<AiHostingSettingsResponse> {
    const scope = await this.getTenantScope(currentSubUserId);
    const agentId = parseMySqlId(payload.agentId);
    const userSeatIds = normalizeIdList(payload.userSeatIds);

    if (agentId == null) {
      throw new BadRequestError("INVALID_AGENT", "Agent 不存在");
    }

    if (userSeatIds == null || userSeatIds.length === 0) {
      throw new BadRequestError("INVALID_USER_SEAT", "企微账号不存在");
    }

    await this.assertPublishedAgentInScope(scope, agentId);
    await this.assertUserSeatsInScope(scope, userSeatIds);

    const currentConfigs = await this.listUserSeatAgentRows(scope, userSeatIds);
    const existingSeatIds = new Set(currentConfigs.map((config) => config.user_seat_id));
    const insertRows: UserSeatAgentInsert[] = [];
    const updateSeatIds: number[] = [];
    const values = {
      agent_id: agentId,
      full_auto_auth: payload.fullAutoAuth ? 1 : 0,
      semi_auto_auth: payload.semiAutoAuth ? 1 : 0,
    };

    for (const userSeatId of userSeatIds) {
      if (existingSeatIds.has(userSeatId)) {
        updateSeatIds.push(userSeatId);
        continue;
      }

      insertRows.push({
        ...values,
        uid: scope.uid,
        user_seat_id: userSeatId,
      });
    }

    if (insertRows.length > 0) {
      await this.db
        .insertInto("xy_wap_embed_user_seat_agent")
        .values(insertRows)
        .executeTakeFirstOrThrow();
    }

    if (updateSeatIds.length > 0) {
      await this.db
        .updateTable("xy_wap_embed_user_seat_agent")
        .set({
          ...values,
          update_time: new Date(),
        })
        .where("uid", "=", scope.uid)
        .where("user_seat_id", "in", updateSeatIds)
        .execute();
    }

    return this.listHostingSettings(currentSubUserId);
  }

  async getAgent(currentSubUserId: string, agentId: string): Promise<AiHostingAgentDetail> {
    const scope = await this.getTenantScope(currentSubUserId);
    const numericAgentId = parseMySqlId(agentId);

    if (numericAgentId == null) {
      throw new BadRequestError("INVALID_AGENT", "Agent 不存在");
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
      throw new ServiceUnavailableError("AGENT_ID_UNAVAILABLE", "Agent 服务暂不可用");
    }

    return this.getAgentDetailOrThrow(scope, agentId);
  }

  async updateAgent(
    currentSubUserId: string,
    agentId: string,
    payload: AiHostingAgentSettingsSaveRequest,
  ): Promise<AiHostingAgentDetail> {
    const scope = await this.getTenantScope(currentSubUserId);
    const operatorId = parseMySqlId(currentSubUserId);
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
    currentSubUserId: string,
    agentId: string,
    payload: AiHostingAgentRenameRequest,
  ): Promise<AiHostingAgentDetail> {
    const scope = await this.getTenantScope(currentSubUserId);
    const operatorId = parseMySqlId(currentSubUserId);
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

  async publishAgent(currentSubUserId: string, agentId: string): Promise<AiHostingAgentDetail> {
    const scope = await this.getTenantScope(currentSubUserId);
    const operatorId = parseMySqlId(currentSubUserId);
    const numericAgentId = parseMySqlId(agentId);

    if (operatorId == null) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT", "当前账号无效");
    }

    if (numericAgentId == null) {
      throw new BadRequestError("INVALID_AGENT", "Agent 不存在");
    }

    const agent = await this.getAgentRowOrThrow(scope, numericAgentId);
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

  private listAllAgentRows(scope: TenantScope) {
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
      .execute() as Promise<AgentRow[]>;
  }

  private listHostingSettingSeats(scope: TenantScope, seatIds?: number[]) {
    let query = this.db
      .selectFrom("xy_wap_embed_user_seat as seat")
      .select([
        "seat.third_avatar as avatarUrl",
        "seat.id",
        "seat.third_user_name",
      ])
      .where("seat.uid", "=", scope.uid)
      .where("seat.platform", "=", scope.platform);

    if (seatIds !== undefined) {
      query = query.where("seat.id", "in", seatIds);
    }

    query = query.orderBy("seat.id", "desc");

    if (seatIds === undefined) {
      query = query.limit(hostingSettingsSeatLimit);
    }

    return query.execute() as Promise<HostingSettingsSeatRow[]>;
  }

  private listUserSeatAgentRows(scope: TenantScope, seatIds: number[]) {
    if (seatIds.length === 0) {
      return Promise.resolve([]);
    }

    return this.db
      .selectFrom("xy_wap_embed_user_seat_agent")
      .select(["agent_id", "full_auto_auth", "semi_auto_auth", "user_seat_id"])
      .where("uid", "=", scope.uid)
      .where("user_seat_id", "in", seatIds)
      .execute() as Promise<UserSeatAgentRow[]>;
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
        "agent.last_publish_time as last_publish_time",
        "agent.model_id as model_id",
        "agent.name as name",
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
      .execute() as Promise<AgentRow[]>;
  }

  private async countAgents(scope: TenantScope, query?: string) {
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
    scope: TenantScope,
    payload: AiHostingAgentSettingsSaveRequest,
  ) {
    const modelId = parseMySqlId(payload.modelId);

    if (modelId == null || !(await this.getModelRow(scope, modelId))) {
      throw new BadRequestError("INVALID_AGENT_MODEL", "请选择有效的大模型");
    }

    return {
      modelId,
      promptConfig: serializePromptConfig(payload.promptConfig),
    };
  }

  private getAgentRow(scope: TenantScope, agentId: number) {
    return this.db
      .selectFrom("xy_wap_embed_agent")
      .select(["id", "last_publish_time", "model_id", "name", "prompt_config", "update_time"])
      .where("id", "=", agentId)
      .where("uid", "=", scope.uid)
      .where("status", "=", dbActiveStatus)
      .executeTakeFirst() as Promise<AgentRow | undefined>;
  }

  private async getAgentRowOrThrow(scope: TenantScope, agentId: number) {
    const agent = await this.getAgentRow(scope, agentId);

    if (!agent) {
      throw new NotFoundError("AGENT_NOT_FOUND", "Agent 不存在");
    }

    return agent;
  }

  private async assertAgentInScope(scope: TenantScope, agentId: number) {
    await this.getAgentRowOrThrow(scope, agentId);
  }

  private async assertPublishedAgentInScope(scope: TenantScope, agentId: number) {
    const agent = await this.getAgentRowOrThrow(scope, agentId);

    if (!isPublishedAgent(agent)) {
      throw new BadRequestError("AGENT_UNPUBLISHED", "Agent 未发布，不能用于托管设置");
    }
  }

  private async assertUserSeatsInScope(scope: TenantScope, userSeatIds: number[]) {
    const seats = await this.listHostingSettingSeats(scope, userSeatIds);
    const validSeatIds = new Set(seats.map((seat) => seat.id));

    if (userSeatIds.some((userSeatId) => !validSeatIds.has(userSeatId))) {
      throw new BadRequestError("INVALID_USER_SEAT", "企微账号不存在");
    }
  }

  private async assertAgentNotUsedByHostingSettings(scope: TenantScope, agentId: number) {
    const usedConfig = await this.db
      .selectFrom("xy_wap_embed_user_seat_agent")
      .select("id")
      .where("uid", "=", scope.uid)
      .where("agent_id", "=", agentId)
      .executeTakeFirst();

    if (usedConfig) {
      throw new BadRequestError("AGENT_IN_USE", "Agent 已被托管设置引用，不能删除");
    }
  }

  private getLatestHistory(scope: TenantScope, agentId: number) {
    return this.db
      .selectFrom("xy_wap_embed_agent_history")
      .select(["agent_id", "create_time", "id", "model_id", "prompt_config"])
      .where("uid", "=", scope.uid)
      .where("agent_id", "=", agentId)
      .orderBy("id", "desc")
      .limit(1)
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
      publishedAt: toOptionalTimestamp(agent.last_publish_time),
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

function normalizeIdList(values: string[]) {
  const normalizedValues = values.map(parseMySqlId);

  if (normalizedValues.some((value) => value == null)) {
    return null;
  }

  return Array.from(new Set(normalizedValues as number[]));
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

function mapHostingSettingsAccount(
  seat: HostingSettingsSeatRow,
  config: UserSeatAgentRow | undefined,
): AiHostingSettingsAccount {
  return {
    agentId: config && config.agent_id > 0 ? String(config.agent_id) : null,
    avatarUrl: seat.avatarUrl || "",
    fullAutoAuth: config?.full_auto_auth === 1,
    id: String(seat.id),
    name: seat.third_user_name || "未命名托管账号",
    semiAutoAuth: config?.semi_auto_auth === 1,
  };
}

function mapHostingSettingsAgent(agent: AgentRow): AiHostingSettingsAgentOption {
  return {
    id: String(agent.id),
    isPublished: isPublishedAgent(agent),
    name: agent.name,
  };
}

function isPublishedAgent(agent: AgentRow) {
  return Boolean(toOptionalTimestamp(agent.last_publish_time));
}

function normalizeAgentName(value: string) {
  return value.trim();
}

function serializePromptConfig(promptConfig: AiHostingAgentPromptConfig) {
  return JSON.stringify({
    condition_logic: promptConfig.conditionLogic,
    handoff_rules: promptConfig.handoffRules,
    reply_style: {
      length: promptConfig.replyStyle.length,
      style_instruction: promptConfig.replyStyle.styleInstruction,
    },
    role: promptConfig.role,
  });
}

function parsePromptConfig(value: string | null | undefined): AiHostingAgentPromptConfig {
  const fallback: AiHostingAgentPromptConfig = {
    conditionLogic: "",
    handoffRules: "",
    replyStyle: {
      length: "简洁",
      styleInstruction: "亲切自然",
    },
    role: "",
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
