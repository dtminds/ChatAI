import type {
  AgentSkillTemplateDetail,
  AgentSkillTemplateGroup,
  AgentSkillTemplateListItem,
  AgentSkillTemplateMarketplaceResponse,
  AgentSkillTemplateRecommendItem,
  AgentSkillTemplateRecommendType,
} from "@chatai/contracts";
import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import { NotFoundError } from "../../shared/errors.js";

const dbActiveStatus = 1;

type TemplateGroupRow = {
  id: number;
  name: string;
};

type TemplateListRow = {
  desc: string;
  group_id: number;
  icon: string;
  id: number;
  name: string;
  tip: string;
};

type TemplateDetailRow = TemplateListRow & {
  apply_scene: string | null;
  content: string | null;
  recommend_resources: string | null;
};

export class AgentSkillTemplateService {
  constructor(private readonly db: Kysely<Database>) {}

  async listMarketplace(): Promise<AgentSkillTemplateMarketplaceResponse> {
    const [groups, templates] = await Promise.all([
      this.listActiveGroups(),
      this.listOnlineTemplates(),
    ]);

    const templatesByGroupId = new Map<number, AgentSkillTemplateListItem[]>();
    for (const template of templates) {
      const mapped = mapTemplateListItem(template);
      const current = templatesByGroupId.get(template.group_id) ?? [];
      current.push(mapped);
      templatesByGroupId.set(template.group_id, current);
    }

    const marketplaceGroups: AgentSkillTemplateGroup[] = [];
    for (const group of groups) {
      const groupTemplates = templatesByGroupId.get(group.id) ?? [];
      if (groupTemplates.length === 0) {
        continue;
      }

      marketplaceGroups.push({
        id: String(group.id),
        name: group.name,
        templates: groupTemplates,
      });
    }

    return { groups: marketplaceGroups };
  }

  async getTemplate(templateId: string): Promise<AgentSkillTemplateDetail> {
    const numericTemplateId = Number(templateId);
    const template = await this.db
      .selectFrom("xy_wap_embed_agent_skill_template")
      .select([
        "id",
        "group_id",
        "name",
        "icon",
        "desc",
        "tip",
        "apply_scene",
        "content",
        "recommend_resources",
      ])
      .where("id", "=", numericTemplateId)
      .where("status", "=", dbActiveStatus)
      .executeTakeFirst() as TemplateDetailRow | undefined;

    if (!template) {
      throw new NotFoundError("SKILL_TEMPLATE_NOT_FOUND", "技能模板不存在");
    }

    const group = await this.db
      .selectFrom("xy_wap_embed_agent_skill_template_group")
      .select("id")
      .where("id", "=", template.group_id)
      .where("status", "=", dbActiveStatus)
      .executeTakeFirst();

    if (!group) {
      throw new NotFoundError("SKILL_TEMPLATE_NOT_FOUND", "技能模板不存在");
    }

    return mapTemplateDetail(template);
  }

  private async listActiveGroups(): Promise<TemplateGroupRow[]> {
    return this.db
      .selectFrom("xy_wap_embed_agent_skill_template_group")
      .select(["id", "name"])
      .where("status", "=", dbActiveStatus)
      .orderBy("sort", "desc")
      .orderBy("id", "desc")
      .execute();
  }

  private async listOnlineTemplates(): Promise<TemplateListRow[]> {
    return this.db
      .selectFrom("xy_wap_embed_agent_skill_template")
      .select([
        "id",
        "group_id",
        "name",
        "icon",
        "desc",
        "tip",
      ])
      .where("status", "=", dbActiveStatus)
      .orderBy("sort", "desc")
      .orderBy("id", "desc")
      .execute();
  }
}

export function createAgentSkillTemplateService(db: Kysely<Database>) {
  return new AgentSkillTemplateService(db);
}

function mapTemplateListItem(row: TemplateListRow): AgentSkillTemplateListItem {
  return {
    id: String(row.id),
    name: row.name,
    icon: row.icon?.trim() ?? "",
    description: row.desc?.trim() ?? "",
    tip: row.tip?.trim() ?? "",
  };
}

function mapTemplateDetail(row: TemplateDetailRow): AgentSkillTemplateDetail {
  return {
    ...mapTemplateListItem(row),
    applyScene: row.apply_scene?.trim() ?? "",
    content: row.content?.trim() ?? "",
    recommendResources: parseRecommendResources(row.recommend_resources),
  };
}

export function parseRecommendResources(
  value: string | null | undefined,
): AgentSkillTemplateRecommendItem[] {
  if (!value?.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.flatMap((item) => {
        const mapped = mapRecommendItem(item);
        return mapped ? [mapped] : [];
      });
    }

    if (isRecord(parsed)) {
      return [
        ...mapRecommendBucket(parsed.variables, "variable"),
        ...mapRecommendBucket(parsed.variable, "variable"),
        ...mapRecommendBucket(parsed.tools, "tool"),
        ...mapRecommendBucket(parsed.tool, "tool"),
        ...mapRecommendBucket(parsed.knowledgeBases, "knowledge_base"),
        ...mapRecommendBucket(parsed.knowledge_bases, "knowledge_base"),
        ...mapRecommendBucket(parsed.kbs, "knowledge_base"),
      ];
    }
  } catch {
    return [];
  }

  return [];
}

function mapRecommendBucket(
  value: unknown,
  type: AgentSkillTemplateRecommendType,
): AgentSkillTemplateRecommendItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const mapped = mapRecommendItem({ ...item, type: item.type ?? item.resourceType ?? type });
    return mapped ? [mapped] : [];
  });
}

function mapRecommendItem(value: unknown): AgentSkillTemplateRecommendItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const type = normalizeRecommendType(value.type ?? value.resourceType);
  if (!type) {
    return null;
  }

  const variableType = normalizeRecommendVariableType(value.variableType);
  const toolId = readString(value.toolId) || readString(value.tool_id);
  const title =
    readString(value.title)
    || readString(value.name)
    || (type === "variable" ? recommendVariableTypeTitle(variableType) : "")
    || (type === "tool" ? "工具" : "")
    || (type === "knowledge_base" ? "知识库" : "");
  if (!title) {
    return null;
  }

  return {
    type,
    title,
    description: readString(value.description) || readString(value.desc) || "",
    ...(variableType ? { variableType } : {}),
    ...(type === "tool" && toolId ? { toolId } : {}),
  };
}

function normalizeRecommendType(value: unknown): AgentSkillTemplateRecommendType | null {
  if (value === "variable" || value === "tool" || value === "knowledge_base") {
    return value;
  }

  if (value === "kb" || value === "knowledgeBase") {
    return "knowledge_base";
  }

  return null;
}

function normalizeRecommendVariableType(
  value: unknown,
): AgentSkillTemplateRecommendItem["variableType"] | undefined {
  if (
    value === "custom_field"
    || value === "work_tag"
    || value === "mall_tag"
    || value === "auto_tag"
    || value === "system_variable"
  ) {
    return value;
  }

  return undefined;
}

function recommendVariableTypeTitle(
  variableType: AgentSkillTemplateRecommendItem["variableType"] | undefined,
) {
  if (variableType === "work_tag") {
    return "企微标签";
  }
  if (variableType === "mall_tag") {
    return "小店标签";
  }
  if (variableType === "custom_field") {
    return "自定义属性";
  }
  if (variableType === "auto_tag") {
    return "自动化标签";
  }
  if (variableType === "system_variable") {
    return "系统变量";
  }
  return "";
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
