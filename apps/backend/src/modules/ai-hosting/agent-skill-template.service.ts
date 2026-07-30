import type {
  AgentSkillTemplateGroup,
  AgentSkillTemplateItem,
  AgentSkillTemplateMarketplaceResponse,
  AgentSkillTemplateRecommendItem,
  AgentSkillTemplateRecommendType,
} from "@chatai/contracts";
import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";

const dbActiveStatus = 1;

type TemplateGroupRow = {
  id: number;
  name: string;
  sort: number;
};

type TemplateRow = {
  apply_scene: string | null;
  content: string | null;
  desc: string;
  group_id: number;
  icon: string;
  id: number;
  name: string;
  recommend_resources: string | null;
  sort: number;
  tip: string;
};

export class AgentSkillTemplateService {
  constructor(private readonly db: Kysely<Database>) {}

  async listMarketplace(): Promise<AgentSkillTemplateMarketplaceResponse> {
    const [groups, templates] = await Promise.all([
      this.listActiveGroups(),
      this.listOnlineTemplates(),
    ]);

    const templatesByGroupId = new Map<number, AgentSkillTemplateItem[]>();
    for (const template of templates) {
      const mapped = mapTemplateItem(template);
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

  private async listActiveGroups(): Promise<TemplateGroupRow[]> {
    return this.db
      .selectFrom("xy_wap_embed_agent_skill_template_group")
      .select(["id", "name", "sort"])
      .where("status", "=", dbActiveStatus)
      .orderBy("sort", "desc")
      .orderBy("id", "desc")
      .execute();
  }

  private async listOnlineTemplates(): Promise<TemplateRow[]> {
    return this.db
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
        "sort",
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

function mapTemplateItem(row: TemplateRow): AgentSkillTemplateItem {
  return {
    id: String(row.id),
    name: row.name,
    icon: row.icon?.trim() ?? "",
    description: row.desc?.trim() ?? "",
    tip: row.tip?.trim() ?? "",
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

    const title = readString(item.title) || readString(item.name);
    if (!title) {
      return [];
    }

    return [
      {
        type,
        title,
        description: readString(item.description) || readString(item.desc) || "",
      },
    ];
  });
}

function mapRecommendItem(value: unknown): AgentSkillTemplateRecommendItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const type = normalizeRecommendType(value.type);
  const title = readString(value.title) || readString(value.name);
  if (!type || !title) {
    return null;
  }

  return {
    type,
    title,
    description: readString(value.description) || readString(value.desc) || "",
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

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
