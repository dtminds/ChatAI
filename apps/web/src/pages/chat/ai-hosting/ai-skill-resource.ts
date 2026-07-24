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
  select_id: number;
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

export function getSkillResourceChipName(item: SkillResourceItem) {
  if (item.variable?.name) {
    return item.variable.name;
  }

  return item.title;
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

export function escapeResourceAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function buildVariablePlaceholder(variable: SkillVariableConfig) {
  const name = escapeResourceAttribute(variable.name);

  if (variable.type === "system_variable") {
    return `<resource type="variable" variableType="system_variable" variableKey="${escapeResourceAttribute(
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
  if (variable.type === "system_variable") {
    return `system_variable:${variable.select_key}`;
  }

  if (variable.type === "work_tag" || variable.type === "mall_tag") {
    return `${variable.type}:${variable.select_id}:${[...variable.select_sub_ids]
      .sort((left, right) => left - right)
      .join(",")}`;
  }

  return `${variable.type}:${variable.select_id}`;
}
