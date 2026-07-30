/** AI 技能资源：与需求文档 variables / tools / kbs / 占位符约定对齐 */

export type SkillVariableType =
  | "custom_field"
  | "work_tag"
  | "mall_tag"
  | "auto_tag"
  | "system_variable";

export type SkillCustomFieldVariable = {
  name: string;
  select_id: number;
  type: "custom_field";
};

export type SkillTagGroupVariable = {
  name: string;
  select_id: number;
  select_sub_ids: number[];
  type: "work_tag" | "mall_tag";
};

export type SkillAutoTagVariable = {
  name: string;
  /** CDP 分组标识 groupTag */
  select_key: string;
  type: "auto_tag";
};

export type SkillSystemVariable = {
  name: string;
  select_key: string;
  type: "system_variable";
};

export type SkillVariableConfig =
  | SkillCustomFieldVariable
  | SkillTagGroupVariable
  | SkillAutoTagVariable
  | SkillSystemVariable;

export type SkillResourceItem = {
  description: string;
  id: string;
  placeholder: string;
  title: string;
  kbId?: number;
  toolKey?: string;
  variable?: SkillVariableConfig;
};

export type SkillContentResourceKind = "variable" | "tool" | "knowledge_base";

export type SkillContentResourceSegment = {
  id: string;
  kind: SkillContentResourceKind;
  name: string;
  placeholder: string;
  type: "resource";
};

export type SkillContentTextSegment = {
  type: "text";
  value: string;
};

export type SkillContentSegment =
  | SkillContentTextSegment
  | SkillContentResourceSegment;

/** 变量在资源池 / 引用菜单 / 描述块中的完整展示名 */
export function getSkillVariableDisplayName(variable: SkillVariableConfig) {
  if (variable.type === "custom_field") {
    return `客户自定义属性 · ${variable.name}`;
  }

  if (variable.type === "system_variable") {
    return `系统变量 · ${variable.name}`;
  }

  if (variable.type === "work_tag") {
    return `客户标签 · 企微标签 · ${variable.name}`;
  }

  if (variable.type === "mall_tag") {
    return `客户标签 · 小店标签 · ${variable.name}`;
  }

  return `客户标签 · 自动化标签 · ${variable.name}`;
}

export function getSkillResourceChipName(item: SkillResourceItem) {
  if (item.title) {
    return item.title;
  }

  if (item.variable) {
    return getSkillVariableDisplayName(item.variable);
  }

  return item.id;
}

export function getSkillResourceKind(
  item: SkillResourceItem,
): SkillContentResourceKind {
  if (item.variable) {
    return "variable";
  }

  if (item.toolKey) {
    return "tool";
  }

  return "knowledge_base";
}

export function toSkillContentResourceSegment(
  item: SkillResourceItem,
): SkillContentResourceSegment {
  return {
    id: item.id,
    kind: getSkillResourceKind(item),
    name: getSkillResourceChipName(item),
    placeholder: item.placeholder,
    type: "resource",
  };
}

export function appendResourceToSkillContent(
  segments: SkillContentSegment[],
  resource: SkillContentResourceSegment,
): SkillContentSegment[] {
  const normalized = normalizeSkillContentSegments(segments);

  if (
    normalized.some(
      (segment) =>
        segment.type === "resource" && segment.placeholder === resource.placeholder,
    )
  ) {
    return normalized;
  }

  return normalizeSkillContentSegments([...normalized, resource]);
}

export function removeResourceFromSkillContent(
  segments: SkillContentSegment[],
  resource: Pick<SkillContentResourceSegment, "id" | "placeholder">,
): SkillContentSegment[] {
  return normalizeSkillContentSegments(
    segments.filter(
      (segment) =>
        !(
          segment.type === "resource" &&
          (segment.id === resource.id || segment.placeholder === resource.placeholder)
        ),
    ),
  );
}

export function normalizeSkillContentSegments(
  segments: SkillContentSegment[],
): SkillContentSegment[] {
  if (segments.length === 0) {
    return [{ type: "text", value: "" }];
  }

  const merged: SkillContentSegment[] = [];

  for (const segment of segments) {
    if (segment.type === "resource") {
      merged.push(segment);
      continue;
    }

    const lastSegment = merged[merged.length - 1];

    if (lastSegment?.type === "text") {
      merged[merged.length - 1] = {
        type: "text",
        value: `${lastSegment.value}${segment.value}`,
      };
      continue;
    }

    merged.push({ type: "text", value: segment.value });
  }

  if (merged.length === 0 || merged[0]?.type !== "text") {
    merged.unshift({ type: "text", value: "" });
  }

  const lastSegment = merged[merged.length - 1];

  if (lastSegment?.type !== "text") {
    merged.push({ type: "text", value: "" });
  }

  return merged;
}

export function skillContentSegmentsEqual(
  left: SkillContentSegment[],
  right: SkillContentSegment[],
) {
  return (
    JSON.stringify(normalizeSkillContentSegments(left)) ===
    JSON.stringify(normalizeSkillContentSegments(right))
  );
}

export function isSkillContentEmpty(segments: SkillContentSegment[]) {
  return !normalizeSkillContentSegments(segments).some(
    (segment) =>
      segment.type === "resource" ||
      (segment.type === "text" && segment.value.length > 0),
  );
}

export function serializeSkillContentSegments(segments: SkillContentSegment[]) {
  return normalizeSkillContentSegments(segments)
    .map((segment) =>
      segment.type === "resource" ? segment.placeholder : segment.value,
    )
    .join("")
    .trim();
}

const skillResourceTagPattern = /<resource\b[^>]*\/>/gi;

function readResourceAttribute(tag: string, attributeName: string) {
  const matched = new RegExp(
    `${attributeName}\\s*=\\s*"([^"]*)"`,
    "i",
  ).exec(tag);
  if (!matched?.[1]) {
    return "";
  }

  return matched[1]
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

export function getSkillResourceAttribute(
  placeholder: string,
  attributeName: string,
) {
  return readResourceAttribute(placeholder, attributeName);
}

/** 模版里未绑定具体资源的蓝色区块（如 toolId=""） */
export function isIncompleteSkillResource(
  segment: SkillContentResourceSegment,
): boolean {
  if (segment.kind === "tool") {
    return !readResourceAttribute(segment.placeholder, "toolId").trim();
  }

  if (segment.kind === "knowledge_base") {
    // type=knowledge_base：kbId 为空则需弹窗让用户选择并替换
    return !readResourceAttribute(segment.placeholder, "kbId").trim();
  }

  const variableType = readResourceAttribute(
    segment.placeholder,
    "variableType",
  ).trim();
  // 系统变量模版自带绑定，预览时不要求用户再选
  if (variableType === "system_variable") {
    return false;
  }

  const variableId = readResourceAttribute(segment.placeholder, "variableId").trim();
  return !variableType || !variableId;
}

export function listIncompleteSkillResources(
  content: string,
): SkillContentResourceSegment[] {
  return parseSkillContentSegments(content).flatMap((segment) =>
    segment.type === "resource" && isIncompleteSkillResource(segment)
      ? [segment]
      : [],
  );
}

export function resolveTemplateVariableType(
  segment: SkillContentResourceSegment,
): SkillVariableType | null {
  if (segment.kind !== "variable") {
    return null;
  }

  const variableType = readResourceAttribute(segment.placeholder, "variableType");
  if (
    variableType === "custom_field"
    || variableType === "work_tag"
    || variableType === "mall_tag"
    || variableType === "auto_tag"
    || variableType === "system_variable"
  ) {
    return variableType;
  }

  const name = segment.name;
  if (name.includes("小店")) {
    return "mall_tag";
  }
  if (name.includes("自动化") || name.includes("CDP")) {
    return "auto_tag";
  }
  if (name.includes("系统")) {
    return "system_variable";
  }
  if (name.includes("自定义")) {
    return "custom_field";
  }
  if (name.includes("企微") || name.includes("客户标签") || name.includes("标签")) {
    return "work_tag";
  }

  return null;
}

export function replaceSkillContentResource(
  content: string,
  targetPlaceholder: string,
  nextPlaceholder: string,
) {
  if (!targetPlaceholder || targetPlaceholder === nextPlaceholder) {
    return content;
  }

  return content.split(targetPlaceholder).join(nextPlaceholder);
}

/** 从已绑定 ID 的资源块还原资源池条目（标签类缺 select_sub_ids 时用空数组） */
export function collectCompleteSkillResourcesFromContent(content: string): {
  "knowledge-bases": SkillResourceItem[];
  tools: SkillResourceItem[];
  variables: SkillResourceItem[];
} {
  const resources = {
    variables: [] as SkillResourceItem[],
    tools: [] as SkillResourceItem[],
    "knowledge-bases": [] as SkillResourceItem[],
  };

  for (const segment of parseSkillContentSegments(content)) {
    if (segment.type !== "resource" || isIncompleteSkillResource(segment)) {
      continue;
    }

    const item = buildSkillResourceFromCompleteSegment(segment);
    if (!item) {
      continue;
    }

    if (segment.kind === "variable") {
      resources.variables.push(item);
    } else if (segment.kind === "tool") {
      resources.tools.push(item);
    } else {
      resources["knowledge-bases"].push(item);
    }
  }

  return resources;
}

function buildSkillResourceFromCompleteSegment(
  segment: SkillContentResourceSegment,
): SkillResourceItem | null {
  if (segment.kind === "tool") {
    const toolId = readResourceAttribute(segment.placeholder, "toolId").trim();
    if (!toolId) {
      return null;
    }

    return {
      description: "",
      id: toolId,
      placeholder: segment.placeholder,
      title: segment.name,
      toolKey: toolId,
    };
  }

  if (segment.kind === "knowledge_base") {
    const kbId = Number(readResourceAttribute(segment.placeholder, "kbId"));
    if (!Number.isFinite(kbId)) {
      return null;
    }

    return {
      description: "",
      id: `kb:${kbId}`,
      kbId,
      placeholder: segment.placeholder,
      title: segment.name,
    };
  }

  const variableType = resolveTemplateVariableType(segment);
  if (!variableType) {
    return null;
  }

  if (variableType === "system_variable" || variableType === "auto_tag") {
    const selectKey = readResourceAttribute(segment.placeholder, "variableKey").trim();
    if (!selectKey) {
      return null;
    }

    return buildSkillVariableResourceItem({
      name: segment.name,
      select_key: selectKey,
      type: variableType,
    });
  }

  const selectId = Number(readResourceAttribute(segment.placeholder, "variableId"));
  if (!Number.isFinite(selectId)) {
    return null;
  }

  if (variableType === "custom_field") {
    return buildSkillVariableResourceItem({
      name: segment.name,
      select_id: selectId,
      type: "custom_field",
    });
  }

  return buildSkillVariableResourceItem({
    name: segment.name,
    select_id: selectId,
    select_sub_ids: [],
    type: variableType,
  });
}

export function parseSkillContentSegments(content: string): SkillContentSegment[] {
  const source = content ?? "";
  if (!source.trim()) {
    return [{ type: "text", value: "" }];
  }

  const segments: SkillContentSegment[] = [];
  let lastIndex = 0;
  skillResourceTagPattern.lastIndex = 0;

  for (const match of source.matchAll(skillResourceTagPattern)) {
    const placeholder = match[0] ?? "";
    const matchIndex = match.index ?? 0;

    if (matchIndex > lastIndex) {
      segments.push({
        type: "text",
        value: source.slice(lastIndex, matchIndex),
      });
    }

    const type = readResourceAttribute(placeholder, "type");
    const name = readResourceAttribute(placeholder, "name") || "资源";
    let kind: SkillContentResourceKind = "variable";
    let id = placeholder;

    if (type === "tool") {
      kind = "tool";
      id = readResourceAttribute(placeholder, "toolId") || placeholder;
    } else if (type === "knowledge_base") {
      kind = "knowledge_base";
      id = `kb:${readResourceAttribute(placeholder, "kbId") || placeholder}`;
    } else {
      const variableType = readResourceAttribute(placeholder, "variableType");
      const variableKey = readResourceAttribute(placeholder, "variableKey");
      const variableId = readResourceAttribute(placeholder, "variableId");
      id = variableKey
        ? `${variableType}:${variableKey}`
        : `${variableType}:${variableId}`;
    }

    segments.push({
      id,
      kind,
      name,
      placeholder,
      type: "resource",
    });
    lastIndex = matchIndex + placeholder.length;
  }

  if (lastIndex < source.length) {
    segments.push({
      type: "text",
      value: source.slice(lastIndex),
    });
  }

  return normalizeSkillContentSegments(segments);
}

export function escapeResourceAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function buildVariablePlaceholder(
  variable: SkillVariableConfig,
  displayName = getSkillVariableDisplayName(variable),
) {
  const name = escapeResourceAttribute(displayName);

  if (variable.type === "system_variable" || variable.type === "auto_tag") {
    return `<resource type="variable" variableType="${variable.type}" variableKey="${escapeResourceAttribute(
      variable.select_key,
    )}" name="${name}" />`;
  }

  return `<resource type="variable" variableType="${variable.type}" variableId="${variable.select_id}" name="${name}" />`;
}

export function buildToolPlaceholder(toolId: string, name: string) {
  return `<resource type="tool" toolId="${escapeResourceAttribute(
    toolId,
  )}" name="${escapeResourceAttribute(name)}" />`;
}

export function buildKnowledgeBasePlaceholder(kbId: number | string, name: string) {
  return `<resource type="knowledge_base" kbId="${escapeResourceAttribute(
    String(kbId),
  )}" name="${escapeResourceAttribute(name)}" />`;
}

export function skillVariableStorageId(variable: SkillVariableConfig) {
  if (variable.type === "system_variable" || variable.type === "auto_tag") {
    return `${variable.type}:${variable.select_key}`;
  }

  if (variable.type === "work_tag" || variable.type === "mall_tag") {
    return `${variable.type}:${variable.select_id}:${[...variable.select_sub_ids]
      .sort((left, right) => left - right)
      .join(",")}`;
  }

  return `${variable.type}:${variable.select_id}`;
}

export function buildSkillVariableResourceItem(
  variable: SkillVariableConfig,
  displayName = getSkillVariableDisplayName(variable),
): SkillResourceItem {
  return {
    description:
      variable.type === "custom_field"
        ? "查询聊天客户的自定义属性后，插入到指定位置"
        : variable.type === "system_variable"
          ? "查询系统运行时变量，然后插入到指定位置"
          : "查询您指定的客户标签，然后插入到指定位置",
    id: skillVariableStorageId(variable),
    placeholder: buildVariablePlaceholder(variable, displayName),
    title: displayName,
    variable,
  };
}
