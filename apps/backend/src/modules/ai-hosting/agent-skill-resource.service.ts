import {
  AGENT_SKILL_TOOL_CATALOG,
  type AgentSkillKnowledgeBaseResource,
  type AgentSkillResources,
  type AgentSkillSaveRequest,
  type AgentSkillToolResource,
  type AgentSkillVariable,
  type AgentSkillVariableResource,
  type WorkTagComponentType,
  type WorkTagItem,
} from "@chatai/contracts";
import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import {
  noopLogger,
  type AppLogger,
  type RequestAwareLogger,
} from "../../shared/logger.js";
import {
  createCdpTagService,
  type CdpTagService,
} from "./cdp-tag.service.js";
import {
  createCustomFieldService,
  type CustomFieldService,
} from "./custom-field.service.js";
import {
  createSystemVariableService,
  type SystemVariableService,
} from "./system-variable.service.js";
import {
  createWorkTagService,
  type WorkTagService,
} from "./work-tag.service.js";

type SkillResourceInput = Pick<
  AgentSkillSaveRequest,
  "content" | "kbs" | "tools" | "variables"
>;

export type AgentSkillResourceDependencies = {
  cdpTagService: Pick<CdpTagService, "listGroups">;
  customFieldService: Pick<CustomFieldService, "listFields">;
  systemVariableService: Pick<SystemVariableService, "listAvailable">;
  workTagService: Pick<WorkTagService, "listGroups" | "listTags">;
};

type KnowledgeBaseRow = {
  id: number;
  name: string;
  status: number;
};

type VariableLookup = {
  names: Map<string, string>;
  tagIdsByGroup?: Map<number, Set<number>>;
  tagNamesByGroup?: Map<number, Map<number, string>>;
};

const dbActiveStatus = 1;
const workTagPageSize = 200;
const wecomCustomerTagType = 0 as const;
const mallTagType = 12 as const;

export class AgentSkillResourceService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly dependencies: AgentSkillResourceDependencies,
    private readonly logger: AppLogger | RequestAwareLogger = noopLogger,
  ) {}

  async resolveResources(
    uid: number,
    input: SkillResourceInput,
  ): Promise<AgentSkillResources> {
    const [knowledgeBases, tools, variables] = await Promise.all([
      this.resolveKnowledgeBases(uid, input.kbs, input.content),
      Promise.resolve(resolveTools(input.tools, input.content)),
      this.resolveVariables(uid, input.variables),
    ]);

    return { knowledgeBases, tools, variables };
  }

  private async resolveKnowledgeBases(
    uid: number,
    kbIds: readonly number[],
    content: string,
  ): Promise<AgentSkillKnowledgeBaseResource[]> {
    const ids = uniquePositiveNumbers(kbIds);
    if (ids.length === 0) {
      return [];
    }

    const rows = (await this.db
      .selectFrom("xy_wap_embed_agent_kb")
      .select(["id", "name", "status"])
      .where("uid", "=", uid)
      .where("id", "in", ids)
      .execute()) as KnowledgeBaseRow[];
    const rowMap = new Map(rows.map((row) => [row.id, row]));
    const embeddedNames = parseContentResourceNames(content).knowledgeBases;

    return ids.map((kbId) => {
      const row = rowMap.get(kbId);
      const available = row?.status === dbActiveStatus;

      return {
        id: `kb:${kbId}`,
        ...(available
          ? {}
          : { invalidReason: row ? "deleted" as const : "unavailable" as const }),
        kbId,
        name: row?.name ?? embeddedNames.get(String(kbId)) ?? `知识库 ${kbId}`,
        status: available ? "available" : "invalid",
      };
    });
  }

  private async resolveVariables(
    uid: number,
    variables: readonly AgentSkillVariable[],
  ): Promise<AgentSkillVariableResource[]> {
    if (variables.length === 0) {
      return [];
    }

    const types = new Set(variables.map((variable) => variable.type));
    const lookupEntries = await Promise.all(
      [...types].map(async (type) => {
        const typedVariables = variables.filter((variable) => variable.type === type);
        return [type, await this.loadVariableLookup(uid, type, typedVariables)] as const;
      }),
    );
    const lookups = new Map(lookupEntries);

    return variables.map((variable) => {
      const lookup = lookups.get(variable.type);
      const resourceKey = getVariableResourceKey(variable);
      const currentName = resolveCurrentVariableName(variable, lookup);
      const tagsAvailable = areSelectedTagsAvailable(variable, lookup);
      const available = Boolean(currentName) && tagsAvailable;
      const nextVariable = available
        ? { ...variable, name: currentName } as AgentSkillVariable
        : variable;

      return {
        id: getVariableStorageId(variable),
        ...(available ? {} : { invalidReason: "unavailable" as const }),
        name: formatVariableDisplayName(nextVariable),
        status: available ? "available" : "invalid",
        variable: nextVariable,
      };
    });
  }

  private async loadVariableLookup(
    uid: number,
    type: AgentSkillVariable["type"],
    variables: readonly AgentSkillVariable[],
  ): Promise<VariableLookup | null> {
    try {
      if (type === "custom_field") {
        const response = await this.dependencies.customFieldService.listFields(uid, {
          status: 1,
        });
        return {
          names: new Map(
            response.fields.map((field) => [
              `custom_field:${field.id}`,
              field.title,
            ]),
          ),
        };
      }

      if (type === "system_variable") {
        const response = await this.dependencies.systemVariableService.listAvailable(uid);
        return {
          names: new Map(
            response.variables.map((variable) => [
              `system_variable:${variable.key}`,
              variable.name,
            ]),
          ),
        };
      }

      if (type === "auto_tag") {
        const response = await this.dependencies.cdpTagService.listGroups(uid);
        return {
          names: new Map(
            response.groups.flatMap((group) =>
              group.tags.map((tag) => [
                `auto_tag:${tag.tag}`,
                `${group.groupName} · ${tag.name}`,
              ] as const),
            ),
          ),
        };
      }

      if (type === "work_tag") {
        // 与前端选择路径对齐：按标签组拉取；同时兼容普通(attr=1)/互斥(attr=2)
        const groupIds = uniquePositiveNumbers(
          variables.flatMap((variable) =>
            variable.type === "work_tag" ? [variable.select_id] : [],
          ),
        );
        const [normalGroups, exclusiveGroups, ...tagPages] = await Promise.all([
          this.dependencies.workTagService.listGroups(uid, {
            attr: 1,
            type: wecomCustomerTagType,
          }),
          this.dependencies.workTagService.listGroups(uid, {
            attr: 2,
            type: wecomCustomerTagType,
          }),
          ...groupIds.map((groupId) =>
            this.listAllWorkTags(uid, wecomCustomerTagType, groupId),
          ),
        ]);
        const groupNames = new Map<number, string>();
        for (const group of [...normalGroups.groups, ...exclusiveGroups.groups]) {
          groupNames.set(group.id, group.name);
        }
        return buildTagLookup("work_tag", groupNames, tagPages.flat());
      }

      const tags = await this.listAllWorkTags(uid, mallTagType);
      return buildTagLookup("mall_tag", new Map(), tags);
    } catch (error) {
      this.logger.warn(
        { error, type, uid },
        "技能资源有效性校验失败",
      );
      return null;
    }
  }

  private async listAllWorkTags(
    uid: number,
    type: WorkTagComponentType,
    groupId?: number,
  ): Promise<WorkTagItem[]> {
    const tags: WorkTagItem[] = [];
    let page = 1;

    while (true) {
      const response = await this.dependencies.workTagService.listTags(uid, {
        ...(groupId != null ? { groupId } : {}),
        page,
        pageSize: workTagPageSize,
        type,
      });
      tags.push(...response.tags);

      if (!response.pagination.hasNext) {
        return tags;
      }

      const nextPage = response.pagination.page + 1;
      if (nextPage <= page) {
        throw new Error("work-tag pagination did not advance");
      }
      page = nextPage;
    }
  }
}

export function createAgentSkillResourceService(
  db: Kysely<Database>,
  logger: AppLogger | RequestAwareLogger,
) {
  return new AgentSkillResourceService(
    db,
    {
      cdpTagService: createCdpTagService(logger),
      customFieldService: createCustomFieldService(logger),
      systemVariableService: createSystemVariableService(logger),
      workTagService: createWorkTagService(logger),
    },
    logger,
  );
}

function resolveTools(
  toolKeys: readonly string[],
  content: string,
): AgentSkillToolResource[] {
  const catalog = new Map<string, (typeof AGENT_SKILL_TOOL_CATALOG)[number]>(
    AGENT_SKILL_TOOL_CATALOG.map((tool) => [tool.id, tool]),
  );
  const embeddedNames = parseContentResourceNames(content).tools;

  return uniqueNonEmptyStrings(toolKeys).map((toolKey) => {
    const tool = catalog.get(toolKey);
    return {
      id: toolKey,
      ...(tool ? {} : { invalidReason: "unavailable" as const }),
      name: tool?.name ?? embeddedNames.get(toolKey) ?? toolKey,
      status: tool ? "available" : "invalid",
      toolKey,
    };
  });
}

function buildTagLookup(
  variableType: "mall_tag" | "work_tag",
  groupNames: Map<number, string>,
  tags: readonly WorkTagItem[],
): VariableLookup {
  const tagIdsByGroup = new Map<number, Set<number>>();
  const tagNamesByGroup = new Map<number, Map<number, string>>();

  for (const tag of tags) {
    groupNames.set(tag.groupId, tag.groupName);
    const ids = tagIdsByGroup.get(tag.groupId) ?? new Set<number>();
    ids.add(tag.id);
    tagIdsByGroup.set(tag.groupId, ids);
    const names = tagNamesByGroup.get(tag.groupId) ?? new Map<number, string>();
    names.set(tag.id, tag.name);
    tagNamesByGroup.set(tag.groupId, names);
  }

  return {
    names: new Map(
      [...groupNames].map(([groupId, groupName]) => {
        return [
          `${variableType}:${groupId}`,
          groupName,
        ];
      }),
    ),
    tagIdsByGroup,
    tagNamesByGroup,
  };
}

function resolveCurrentVariableName(
  variable: AgentSkillVariable,
  lookup: VariableLookup | null | undefined,
) {
  if (!lookup) {
    return undefined;
  }

  const baseName = lookup.names.get(getVariableResourceKey(variable));
  if (
    !baseName ||
    (variable.type !== "work_tag" && variable.type !== "mall_tag") ||
    variable.select_sub_ids.length === 0
  ) {
    return baseName;
  }

  const tagNames = variable.select_sub_ids.flatMap((tagId) => {
    const name = lookup.tagNamesByGroup?.get(variable.select_id)?.get(tagId);
    return name ? [name] : [];
  });

  return tagNames.length > 0 ? `${baseName} | ${tagNames.join("、")}` : baseName;
}

function areSelectedTagsAvailable(
  variable: AgentSkillVariable,
  lookup: VariableLookup | null | undefined,
) {
  if (!lookup || (variable.type !== "work_tag" && variable.type !== "mall_tag")) {
    return lookup != null;
  }

  if (variable.select_sub_ids.length === 0) {
    return true;
  }

  const availableIds = lookup.tagIdsByGroup?.get(variable.select_id);
  return Boolean(
    availableIds && variable.select_sub_ids.every((tagId) => availableIds.has(tagId)),
  );
}

function getVariableResourceKey(variable: AgentSkillVariable) {
  if (variable.type === "system_variable" || variable.type === "auto_tag") {
    return `${variable.type}:${variable.select_key}`;
  }

  return `${variable.type}:${variable.select_id}`;
}

function getVariableStorageId(variable: AgentSkillVariable) {
  if (variable.type === "system_variable" || variable.type === "auto_tag") {
    return `${variable.type}:${variable.select_key}`;
  }

  return `${variable.type}:${variable.select_id}`;
}

function formatVariableDisplayName(variable: AgentSkillVariable) {
  switch (variable.type) {
    case "custom_field":
      return `自定义属性 · ${variable.name}`;
    case "system_variable":
      return `系统变量 · ${variable.name}`;
    case "auto_tag":
      return `自动化标签 · ${variable.name}`;
    case "work_tag":
      return `企微标签 · ${variable.name}`;
    case "mall_tag":
      return `小店标签 · ${variable.name}`;
  }
}

function uniquePositiveNumbers(values: readonly number[]) {
  return [...new Set(values.filter((value) => Number.isSafeInteger(value) && value > 0))];
}

function uniqueNonEmptyStrings(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function parseContentResourceNames(content: string) {
  const knowledgeBases = new Map<string, string>();
  const tools = new Map<string, string>();
  const tokenPattern = /<resource\b[^>]*\/>/g;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(content))) {
    const token = match[0] ?? "";
    const type = readResourceAttribute(token, "type");
    const name = unescapeResourceAttribute(readResourceAttribute(token, "name"));
    if (!name) {
      continue;
    }

    if (type === "knowledge_base") {
      const id = readResourceAttribute(token, "kbId");
      if (id) {
        knowledgeBases.set(id, name);
      }
    } else if (type === "tool") {
      const id = readResourceAttribute(token, "toolId");
      if (id) {
        tools.set(id, name);
      }
    }
  }

  return { knowledgeBases, tools };
}

function readResourceAttribute(token: string, attribute: string) {
  return token.match(new RegExp(`${attribute}="([^"]*)"`))?.[1] ?? "";
}

function unescapeResourceAttribute(value: string) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}
