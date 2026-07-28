import type {
  AgentSkillDetail,
  AgentSkillListItem,
  AgentSkillListResponse,
  AgentSkillMutationResponse,
  AgentSkillSaveRequest,
  AgentSkillStatus,
  AgentSkillStatusUpdateRequest,
  AgentSkillVariable,
} from "@chatai/contracts";
import { sql, type Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import { BadRequestError, NotFoundError } from "../../shared/errors.js";
import { parseMySqlId } from "./ai-hosting-id-utils.js";
import { buildContainsLikePattern } from "./sql-like-utils.js";

type SkillWriteContext = {
  operatorSubUserId: string;
  uid: number;
};

type SkillListRow = {
  apply_scene: string | null;
  create_time: Date | string | null;
  id: number;
  name: string;
  status: number;
  update_time: Date | string | null;
};

type SkillDetailRow = SkillListRow & {
  content: string | null;
  kbs: string | null;
  tools: string | null;
  variables: string | null;
};

const dbEnabledStatus = 1;
const dbDisabledStatus = 0;
const dbNotDeleted = 0;
const dbDeleted = 1;
const defaultPage = 1;
const defaultPageSize = 10;
const maxPageSize = 100;

export class AgentSkillService {
  constructor(private readonly db: Kysely<Database>) {}

  async listSkills(
    uid: number,
    options: { page?: number; pageSize?: number; query?: string } = {},
  ): Promise<AgentSkillListResponse> {
    const pagination = normalizePagination(options);
    const normalizedQuery = options.query?.trim();
    const [rows, total] = await Promise.all([
      this.listSkillRows(uid, pagination, normalizedQuery),
      this.countSkills(uid, normalizedQuery),
    ]);

    return {
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
      },
      skills: rows.map(mapSkillListItem),
    };
  }

  async getSkill(uid: number, skillId: string): Promise<AgentSkillDetail> {
    const numericSkillId = parseMySqlId(skillId);
    if (numericSkillId == null) {
      throw new BadRequestError("INVALID_SKILL", "技能不存在");
    }

    const row = await this.getSkillRowOrThrow(uid, numericSkillId);
    return mapSkillDetail(row);
  }

  async createSkill(
    context: SkillWriteContext,
    payload: AgentSkillSaveRequest,
  ): Promise<AgentSkillMutationResponse> {
    const operatorId = requireOperatorId(context.operatorSubUserId);
    const normalized = normalizeSavePayload(payload);

    const result = await this.db
      .insertInto("xy_wap_embed_agent_skill")
      .values({
        apply_scene: normalized.applyScene,
        content: normalized.content,
        is_del: dbNotDeleted,
        kbs: JSON.stringify(normalized.kbs),
        last_operator_id: operatorId,
        name: normalized.name,
        operator_id: operatorId,
        status: dbEnabledStatus,
        tools: JSON.stringify(normalized.tools),
        uid: context.uid,
        variables: JSON.stringify(normalized.variables),
      })
      .executeTakeFirstOrThrow();

    const insertedId = Number(result.insertId);
    if (!Number.isSafeInteger(insertedId) || insertedId <= 0) {
      throw new BadRequestError("SKILL_CREATE_FAILED", "技能创建失败");
    }

    return { id: String(insertedId) };
  }

  async updateSkill(
    context: SkillWriteContext,
    skillId: string,
    payload: AgentSkillSaveRequest,
  ): Promise<AgentSkillMutationResponse> {
    const operatorId = requireOperatorId(context.operatorSubUserId);
    const numericSkillId = parseMySqlId(skillId);
    if (numericSkillId == null) {
      throw new BadRequestError("INVALID_SKILL", "技能不存在");
    }

    await this.getSkillRowOrThrow(context.uid, numericSkillId);
    const normalized = normalizeSavePayload(payload);

    await this.db
      .updateTable("xy_wap_embed_agent_skill")
      .set({
        apply_scene: normalized.applyScene,
        content: normalized.content,
        kbs: JSON.stringify(normalized.kbs),
        last_operator_id: operatorId,
        name: normalized.name,
        tools: JSON.stringify(normalized.tools),
        variables: JSON.stringify(normalized.variables),
      })
      .where("id", "=", numericSkillId)
      .where("uid", "=", context.uid)
      .where("is_del", "=", dbNotDeleted)
      .executeTakeFirstOrThrow();

    return { id: String(numericSkillId) };
  }

  async updateSkillStatus(
    context: SkillWriteContext,
    skillId: string,
    payload: AgentSkillStatusUpdateRequest,
  ): Promise<AgentSkillMutationResponse> {
    const operatorId = requireOperatorId(context.operatorSubUserId);
    const numericSkillId = parseMySqlId(skillId);
    if (numericSkillId == null) {
      throw new BadRequestError("INVALID_SKILL", "技能不存在");
    }

    await this.getSkillRowOrThrow(context.uid, numericSkillId);

    await this.db
      .updateTable("xy_wap_embed_agent_skill")
      .set({
        last_operator_id: operatorId,
        status: payload.status === "enabled" ? dbEnabledStatus : dbDisabledStatus,
      })
      .where("id", "=", numericSkillId)
      .where("uid", "=", context.uid)
      .where("is_del", "=", dbNotDeleted)
      .executeTakeFirstOrThrow();

    return { id: String(numericSkillId) };
  }

  async deleteSkill(
    context: SkillWriteContext,
    skillId: string,
  ): Promise<AgentSkillMutationResponse> {
    const operatorId = requireOperatorId(context.operatorSubUserId);
    const numericSkillId = parseMySqlId(skillId);
    if (numericSkillId == null) {
      throw new BadRequestError("INVALID_SKILL", "技能不存在");
    }

    await this.getSkillRowOrThrow(context.uid, numericSkillId);

    await this.db
      .updateTable("xy_wap_embed_agent_skill")
      .set({
        is_del: dbDeleted,
        last_operator_id: operatorId,
      })
      .where("id", "=", numericSkillId)
      .where("uid", "=", context.uid)
      .where("is_del", "=", dbNotDeleted)
      .executeTakeFirstOrThrow();

    return { id: String(numericSkillId) };
  }

  private async listSkillRows(
    uid: number,
    pagination: { page: number; pageSize: number },
    query?: string,
  ) {
    let builder = this.db
      .selectFrom("xy_wap_embed_agent_skill")
      .select([
        "id",
        "name",
        "apply_scene",
        "status",
        "create_time",
        "update_time",
      ])
      .where("uid", "=", uid)
      .where("is_del", "=", dbNotDeleted);

    if (query) {
      const pattern = buildContainsLikePattern(query);
      builder = builder.where((eb) =>
        eb.or([
          eb("name", "like", pattern),
          eb("apply_scene", "like", pattern),
        ]),
      );
    }

    return (await builder
      .orderBy("update_time", "desc")
      .orderBy("id", "desc")
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize)
      .execute()) as SkillListRow[];
  }

  private async countSkills(uid: number, query?: string) {
    let builder = this.db
      .selectFrom("xy_wap_embed_agent_skill")
      .select(sql<number>`count(*)`.as("count"))
      .where("uid", "=", uid)
      .where("is_del", "=", dbNotDeleted);

    if (query) {
      const pattern = buildContainsLikePattern(query);
      builder = builder.where((eb) =>
        eb.or([
          eb("name", "like", pattern),
          eb("apply_scene", "like", pattern),
        ]),
      );
    }

    const row = await builder.executeTakeFirst();
    return Number(row?.count ?? 0);
  }

  private async getSkillRowOrThrow(uid: number, skillId: number) {
    const row = (await this.db
      .selectFrom("xy_wap_embed_agent_skill")
      .select([
        "id",
        "name",
        "apply_scene",
        "content",
        "variables",
        "tools",
        "kbs",
        "status",
        "create_time",
        "update_time",
      ])
      .where("id", "=", skillId)
      .where("uid", "=", uid)
      .where("is_del", "=", dbNotDeleted)
      .executeTakeFirst()) as SkillDetailRow | undefined;

    if (!row) {
      throw new NotFoundError("SKILL_NOT_FOUND", "技能不存在");
    }

    return row;
  }
}

export function createAgentSkillService(db: Kysely<Database>) {
  return new AgentSkillService(db);
}

function requireOperatorId(operatorSubUserId: string) {
  const operatorId = parseMySqlId(operatorSubUserId);
  if (operatorId == null) {
    throw new BadRequestError("INVALID_SUB_ACCOUNT", "当前账号无效");
  }

  return operatorId;
}

function normalizeSavePayload(payload: AgentSkillSaveRequest) {
  const name = payload.name.trim();
  if (!name) {
    throw new BadRequestError("INVALID_SKILL_NAME", "请填写技能名称");
  }

  if (name.length > 50) {
    throw new BadRequestError("INVALID_SKILL_NAME", "技能名称不能超过50个字");
  }

  return {
    applyScene: payload.applyScene.trim(),
    content: payload.content.trim(),
    kbs: dedupePositiveNumbers(payload.kbs),
    name,
    tools: dedupeNonEmptyStrings(payload.tools),
    variables: payload.variables,
  };
}

function dedupePositiveNumbers(values: number[]) {
  const seen = new Set<number>();
  const result: number[] = [];

  for (const value of values) {
    if (!Number.isSafeInteger(value) || value <= 0 || seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(value);
  }

  return result;
}

function dedupeNonEmptyStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

function normalizePagination(options: { page?: number; pageSize?: number }) {
  const page =
    typeof options.page === "number" &&
    Number.isSafeInteger(options.page) &&
    options.page > 0
      ? options.page
      : defaultPage;
  const pageSize =
    typeof options.pageSize === "number" &&
    Number.isSafeInteger(options.pageSize) &&
    options.pageSize > 0
      ? Math.min(options.pageSize, maxPageSize)
      : defaultPageSize;

  return { page, pageSize };
}

function mapSkillListItem(row: SkillListRow): AgentSkillListItem {
  return {
    applyScene: row.apply_scene ?? "",
    createdAt: formatDateTime(row.create_time),
    id: String(row.id),
    name: row.name,
    status: mapStatus(row.status),
    updatedAt: formatDateTime(row.update_time),
  };
}

function mapSkillDetail(row: SkillDetailRow): AgentSkillDetail {
  return {
    ...mapSkillListItem(row),
    content: row.content ?? "",
    kbs: parseNumberArray(row.kbs),
    tools: parseStringArray(row.tools),
    variables: parseVariables(row.variables),
  };
}

function mapStatus(status: number): AgentSkillStatus {
  return status === dbEnabledStatus ? "enabled" : "disabled";
}

function parseNumberArray(raw: string | null): number[] {
  if (!raw?.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => Number(item))
      .filter((item) => Number.isSafeInteger(item) && item > 0);
  } catch {
    return [];
  }
}

function parseStringArray(raw: string | null): string[] {
  if (!raw?.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function parseVariables(raw: string | null): AgentSkillVariable[] {
  if (!raw?.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isAgentSkillVariable);
  } catch {
    return [];
  }
}

function isAgentSkillVariable(value: unknown): value is AgentSkillVariable {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  const type = record.type;
  const name = typeof record.name === "string" ? record.name : "";

  if (!name) {
    return false;
  }

  if (type === "custom_field") {
    return typeof record.select_id === "number";
  }

  if (type === "work_tag" || type === "mall_tag") {
    return (
      typeof record.select_id === "number" &&
      Array.isArray(record.select_sub_ids) &&
      record.select_sub_ids.every((item) => typeof item === "number")
    );
  }

  if (type === "auto_tag" || type === "system_variable") {
    return typeof record.select_key === "string" && record.select_key.length > 0;
  }

  return false;
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : "";
  }

  const pad = (part: number) => String(part).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
