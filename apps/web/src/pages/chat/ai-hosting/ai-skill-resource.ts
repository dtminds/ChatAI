/** AI 技能资源：与需求文档 variables / tools / kbs / 占位符约定对齐 */

import type {
  AiHostingAgentResourceInvalidReason,
  AiHostingAgentResourceStatus,
} from "@chatai/contracts";

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
  /** CDP 标签标识 tag（单选） */
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
  invalidReason?: AiHostingAgentResourceInvalidReason;
  placeholder: string;
  status: AiHostingAgentResourceStatus;
  title: string;
  kbId?: number;
  toolKey?: string;
  variable?: SkillVariableConfig;
};

export type SkillContentResourceKind = "variable" | "tool" | "knowledge_base";

export type SkillContentResourceSegment = {
  id: string;
  invalid?: boolean;
  invalidReason?: AiHostingAgentResourceInvalidReason;
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

function isSkillVariableType(value: string): value is SkillVariableType {
  return (
    value === "custom_field" ||
    value === "work_tag" ||
    value === "mall_tag" ||
    value === "auto_tag" ||
    value === "system_variable"
  );
}

function getSkillVariableTypeLabel(variableType: SkillVariableType) {
  if (variableType === "custom_field") {
    return "自定义属性";
  }

  if (variableType === "system_variable") {
    return "系统变量";
  }

  if (variableType === "work_tag") {
    return "企微标签";
  }

  if (variableType === "mall_tag") {
    return "小店标签";
  }

  return "自动化标签";
}

/** 变量在资源池 / 引用菜单 / 描述块中的完整展示名 */
export function getSkillVariableDisplayName(variable: SkillVariableConfig) {
  return normalizeSkillVariableDisplayName(variable.name, variable.type);
}

function normalizeSkillVariableDisplayName(
  displayName: string,
  variableType: SkillVariableType,
) {
  if (variableType === "work_tag" || variableType === "mall_tag") {
    return formatSkillTagVariableDisplayName(variableType, displayName);
  }

  const typeLabel = getSkillVariableTypeLabel(variableType);
  const valueName = getSkillVariableValueName(displayName, variableType);

  return valueName === typeLabel ? typeLabel : `${typeLabel} · ${valueName}`;
}

/** 标签变量：`企微标签 · 渠道 | 淘宝、抖音、快手` */
function formatSkillTagVariableDisplayName(
  variableType: "work_tag" | "mall_tag",
  storedName: string,
) {
  const typeLabel = getSkillVariableTypeLabel(variableType);
  const rest = normalizeSkillTagVariableStoredName(
    stripSkillTagVariableNamePrefixes(storedName, typeLabel),
  );
  // 未绑定/仅类型名时不要重复拼接类型名
  if (!rest || rest === typeLabel) {
    return typeLabel;
  }

  const pipeIndex = rest.indexOf(" | ");
  if (pipeIndex === -1) {
    return `${typeLabel} · ${rest}`;
  }

  const groupName = rest.slice(0, pipeIndex).trim();
  const tagsPart = rest.slice(pipeIndex + 3).trim();
  if (!groupName) {
    return tagsPart ? `${typeLabel} | ${tagsPart}` : typeLabel;
  }

  return tagsPart
    ? `${typeLabel} · ${groupName} | ${tagsPart}`
    : `${typeLabel} · ${groupName}`;
}

function stripSkillTagVariableNamePrefixes(displayName: string, typeLabel: string) {
  let rest = displayName.trim();
  let changed = true;

  while (changed && rest) {
    changed = false;
    for (const prefix of [`客户标签 · `, `${typeLabel} · `, `${typeLabel}-`]) {
      if (rest.startsWith(prefix)) {
        rest = rest.slice(prefix.length).trim();
        changed = true;
      }
    }
  }

  return rest;
}

/** 旧数据 `分组 · 标签` 归一成 `分组 | 标签` */
function normalizeSkillTagVariableStoredName(storedName: string) {
  const rest = storedName.trim();
  if (!rest || rest.includes(" | ") || !rest.includes(" · ")) {
    return rest;
  }

  const parts = rest
    .split(" · ")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) {
    return rest;
  }

  return `${parts[0]} | ${parts.slice(1).join("、")}`;
}

function getSkillVariableValueName(
  displayName: string,
  variableType: SkillVariableType,
) {
  const typeLabel = getSkillVariableTypeLabel(variableType);

  if (variableType === "work_tag" || variableType === "mall_tag") {
    return normalizeSkillTagVariableStoredName(
      stripSkillTagVariableNamePrefixes(displayName, typeLabel),
    );
  }

  const parts = displayName
    .split(" · ")
    .map((part) => part.trim())
    .filter(Boolean);
  while (parts[0] === "客户标签" || parts[0] === typeLabel) {
    parts.shift();
  }

  return parts.length > 0 ? parts.join(" · ") : displayName.trim();
}

/** 组装企微 / 小店变量存储名：分组 | 标签1、标签2 */
export function buildSkillTagVariableStoredName(
  groupName: string,
  tagNames: readonly string[],
) {
  const normalizedGroup = groupName.trim();
  const normalizedTags = tagNames.map((name) => name.trim()).filter(Boolean);
  if (normalizedTags.length === 0) {
    return normalizedGroup;
  }

  return `${normalizedGroup} | ${normalizedTags.join("、")}`;
}

/** 解析企微 / 小店变量存储名 */
export function parseSkillTagVariableStoredName(storedName: string): {
  groupName: string;
  tagNames: string[];
} {
  const rest = storedName.trim();
  const pipeIndex = rest.indexOf(" | ");
  if (pipeIndex === -1) {
    return { groupName: rest, tagNames: [] };
  }

  return {
    groupName: rest.slice(0, pipeIndex).trim(),
    tagNames: rest
      .slice(pipeIndex + 3)
      .split("、")
      .map((part) => part.trim())
      .filter(Boolean),
  };
}

export function getSkillResourceChipName(item: SkillResourceItem) {
  if (
    item.variable?.type === "work_tag" ||
    item.variable?.type === "mall_tag"
  ) {
    const { groupName } = parseSkillTagVariableStoredName(item.variable.name);
    const groupDisplayName = getSkillVariableDisplayName({
      ...item.variable,
      name: groupName,
    });
    if (item.variable.select_sub_ids.length === 0) {
      return item.title?.trim() || groupDisplayName;
    }

    return `${groupDisplayName} · ${item.variable.select_sub_ids.length}个标签`;
  }

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

export function getSkillResourceReferenceKey(item: SkillResourceItem) {
  if (item.variable) {
    if (item.variable.type === "system_variable" || item.variable.type === "auto_tag") {
      return `variable:${item.variable.type}:${item.variable.select_key}`;
    }

    return `variable:${item.variable.type}:${item.variable.select_id}`;
  }

  if (item.toolKey) {
    return `tool:${item.toolKey}`;
  }

  return `knowledge_base:${item.kbId ?? item.id.replace(/^kb:/u, "")}`;
}

export function getSkillContentResourceReferenceKey(
  segment: SkillContentResourceSegment,
) {
  if (segment.kind === "tool") {
    return `tool:${getSkillResourceAttribute(segment.placeholder, "toolId")}`;
  }

  if (segment.kind === "knowledge_base") {
    return `knowledge_base:${getSkillResourceAttribute(segment.placeholder, "kbId")}`;
  }

  const variableType = getSkillResourceAttribute(
    segment.placeholder,
    "variableType",
  );
  const variableKey = getSkillResourceAttribute(
    segment.placeholder,
    "variableKey",
  );
  const variableId = getSkillResourceAttribute(
    segment.placeholder,
    "variableId",
  );

  return `variable:${variableType}:${variableKey || variableId}`;
}

export function getSkillResourceInvalidReasonLabel(
  reason: AiHostingAgentResourceInvalidReason | undefined,
  resourceType = "资源",
) {
  if (reason === "deleted") {
    return `${resourceType}已被删除`;
  }
  if (reason === "disabled") {
    return `${resourceType}已停用`;
  }
  if (reason === "unavailable") {
    return `${resourceType}当前不可用`;
  }
  return "资源已失效";
}

export function toSkillContentResourceSegment(
  item: SkillResourceItem,
): SkillContentResourceSegment {
  const name = getSkillResourceChipName(item);

  return {
    id: item.id,
    ...(item.status === "invalid"
      ? { invalid: true, invalidReason: item.invalidReason }
      : {}),
    kind: getSkillResourceKind(item),
    name,
    placeholder: replaceResourceNameAttribute(item.placeholder, name),
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
  const referenceKey = getSkillResourcePlaceholderReferenceKey(
    resource.placeholder,
  );

  return normalizeSkillContentSegments(
    segments.filter(
      (segment) =>
        !(
          segment.type === "resource" &&
          (segment.id === resource.id ||
            segment.placeholder === resource.placeholder ||
            (referenceKey != null &&
              getSkillContentResourceReferenceKey(segment) === referenceKey))
        ),
    ),
  );
}

/** 用新资源块替换技能描述里已引用的旧资源 */
export function replaceResourceInSkillContent(
  segments: SkillContentSegment[],
  previous: Pick<SkillContentResourceSegment, "id" | "placeholder">,
  next: SkillContentResourceSegment,
): SkillContentSegment[] {
  const previousReferenceKey = getSkillResourcePlaceholderReferenceKey(
    previous.placeholder,
  );

  return normalizeSkillContentSegments(
    segments.map((segment) => {
      if (segment.type !== "resource") {
        return segment;
      }

      if (
        segment.id === previous.id ||
        segment.placeholder === previous.placeholder ||
        (previousReferenceKey != null &&
          getSkillContentResourceReferenceKey(segment) === previousReferenceKey)
      ) {
        return next;
      }

      return segment;
    }),
  );
}

function getSkillResourcePlaceholderReferenceKey(placeholder: string) {
  const type = readResourceAttribute(placeholder, "type");

  if (type === "tool") {
    const toolId = readResourceAttribute(placeholder, "toolId");
    return toolId ? `tool:${toolId}` : null;
  }

  if (type === "knowledge_base") {
    const kbId = readResourceAttribute(placeholder, "kbId");
    return kbId ? `knowledge_base:${kbId}` : null;
  }

  const variableType = readResourceAttribute(placeholder, "variableType");
  const variableKey = readResourceAttribute(placeholder, "variableKey");
  const variableId = readResourceAttribute(placeholder, "variableId");
  const identifier = variableKey || variableId;

  return variableType && identifier
    ? `variable:${variableType}:${identifier}`
    : null;
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
  const normalizedLeft = normalizeSkillContentSegments(left);
  const normalizedRight = normalizeSkillContentSegments(right);

  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }

  return normalizedLeft.every((leftSegment, index) => {
    const rightSegment = normalizedRight[index];

    if (!rightSegment || leftSegment.type !== rightSegment.type) {
      return false;
    }

    if (leftSegment.type === "text") {
      return rightSegment.type === "text" && leftSegment.value === rightSegment.value;
    }

    return (
      rightSegment.type === "resource" &&
      leftSegment.id === rightSegment.id &&
      leftSegment.invalid === rightSegment.invalid &&
      leftSegment.invalidReason === rightSegment.invalidReason &&
      leftSegment.kind === rightSegment.kind &&
      leftSegment.name === rightSegment.name &&
      leftSegment.placeholder === rightSegment.placeholder
    );
  });
}

export function getSkillContentCharacterCount(segments: SkillContentSegment[]) {
  return normalizeSkillContentSegments(segments).reduce((count, segment) => {
    return count + (segment.type === "text" ? segment.value.length : segment.name.length);
  }, 0);
}

export function trimSkillContentSegmentsToMaxLength(
  segments: SkillContentSegment[],
  maxLength: number,
) {
  const trimmed: SkillContentSegment[] = [];
  let remaining = Math.max(0, maxLength);

  for (const segment of normalizeSkillContentSegments(segments)) {
    if (segment.type === "text") {
      const value = segment.value.slice(0, remaining);
      if (value) {
        trimmed.push({ type: "text", value });
        remaining -= value.length;
      }
      if (value.length < segment.value.length) {
        break;
      }
      continue;
    }

    if (segment.name.length > remaining) {
      break;
    }

    trimmed.push(segment);
    remaining -= segment.name.length;
  }

  return normalizeSkillContentSegments(trimmed);
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

function replaceResourceNameAttribute(tag: string, name: string) {
  return tag.replace(
    /(\bname\s*=\s*")[^"]*(")/i,
    `$1${escapeResourceAttribute(name)}$2`,
  );
}

export function getSkillResourceAttribute(
  placeholder: string,
  attributeName: string,
) {
  return readResourceAttribute(placeholder, attributeName);
}

/** 模版里未绑定具体资源的蓝色区块（如 kbId="" / toolId=""） */
export function isIncompleteSkillResource(
  segment: SkillContentResourceSegment,
): boolean {
  // type="tool"：校验 toolId
  if (segment.kind === "tool") {
    return !readResourceAttribute(segment.placeholder, "toolId").trim();
  }

  if (segment.kind === "knowledge_base") {
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
  const variableKey = readResourceAttribute(segment.placeholder, "variableKey").trim();

  // work_tag / mall_tag / custom_field：校验 variableId
  if (
    variableType === "work_tag"
    || variableType === "mall_tag"
    || variableType === "custom_field"
  ) {
    return !variableId;
  }

  // auto_tag：校验 variableKey
  if (variableType === "auto_tag") {
    return !variableKey;
  }

  // variableType 缺失或未知：仍视为未绑定，进入编辑资源弹窗
  return true;
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

export type SkillRecommendBinding = {
  description: string;
  title: string;
  type: SkillContentResourceKind;
  variableType?: SkillVariableType;
};

/** 未绑定蓝色块优先配对同类型推荐；无对应推荐时仍可按区块自身类型正常选择 */
export function matchIncompleteResourcesToRecommendations(
  incompleteResources: readonly SkillContentResourceSegment[],
  recommendations: readonly SkillRecommendBinding[],
): Array<{
  fieldLabel: string;
  recommend: SkillRecommendBinding | null;
  segment: SkillContentResourceSegment;
  variableType: SkillVariableType | null;
}> {
  const usedRecommendIndexes = new Set<number>();
  const matched: Array<{
    fieldLabel: string;
    recommend: SkillRecommendBinding | null;
    segment: SkillContentResourceSegment;
    variableType: SkillVariableType | null;
  }> = [];

  for (const segment of incompleteResources) {
    const segmentVariableType =
      segment.kind === "variable" ? resolveTemplateVariableType(segment) : null;

    const recommendIndex = recommendations.findIndex((recommend, index) => {
      if (usedRecommendIndexes.has(index)) {
        return false;
      }

      if (recommend.type !== segment.kind) {
        return false;
      }

      if (segment.kind !== "variable") {
        return true;
      }

      if (!recommend.variableType) {
        return true;
      }

      if (!segmentVariableType) {
        return true;
      }

      return recommend.variableType === segmentVariableType;
    });

    if (recommendIndex < 0) {
      matched.push({
        fieldLabel: segment.name,
        recommend: null,
        segment,
        variableType: segmentVariableType,
      });
      continue;
    }

    const recommend = recommendations[recommendIndex]!;
    usedRecommendIndexes.add(recommendIndex);

    const variableType =
      segment.kind === "variable"
        ? (recommend.variableType ?? segmentVariableType)
        : null;

    matched.push({
      fieldLabel: recommend.title || segment.name,
      recommend,
      segment,
      variableType,
    });
  }

  return matched;
}

export function resolveTemplateVariableType(
  segment: SkillContentResourceSegment,
): SkillVariableType | null {
  if (segment.kind !== "variable") {
    return null;
  }

  const variableType = readResourceAttribute(segment.placeholder, "variableType");
  if (isSkillVariableType(variableType)) {
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

export function mergeSkillResourceItems(
  ...groups: ReadonlyArray<readonly SkillResourceItem[]>
) {
  const merged = new Map<string, SkillResourceItem>();

  for (const item of groups.flat()) {
    merged.set(item.id, item);
  }

  return [...merged.values()];
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
      status: "available",
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
      status: "available",
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
      name: getSkillVariableValueName(segment.name, variableType),
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
      name: getSkillVariableValueName(segment.name, variableType),
      select_id: selectId,
      type: "custom_field",
    });
  }

  const resource = buildSkillVariableResourceItem({
    name: getSkillVariableValueName(segment.name, variableType),
    select_id: selectId,
    select_sub_ids: [],
    type: variableType,
  });

  return {
    ...resource,
    placeholder: segment.placeholder,
    title: segment.name,
  };
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
    const matchedPlaceholder = match[0] ?? "";
    let placeholder = matchedPlaceholder;
    const matchIndex = match.index ?? 0;

    if (matchIndex > lastIndex) {
      segments.push({
        type: "text",
        value: source.slice(lastIndex, matchIndex),
      });
    }

    const type = readResourceAttribute(placeholder, "type");
    let name = readResourceAttribute(placeholder, "name") || "资源";
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
      if (isSkillVariableType(variableType)) {
        name = normalizeSkillVariableDisplayName(name, variableType);
        placeholder = replaceResourceNameAttribute(placeholder, name);
      }
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
    lastIndex = matchIndex + matchedPlaceholder.length;
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

  return `${variable.type}:${variable.select_id}`;
}

export function buildSkillVariableResourceItem(
  variable: SkillVariableConfig,
  displayName = getSkillVariableDisplayName(variable),
): SkillResourceItem {
  const normalizedVariable = {
    ...variable,
    name: getSkillVariableValueName(variable.name, variable.type),
  } as SkillVariableConfig;
  const normalizedDisplayName = normalizeSkillVariableDisplayName(
    displayName,
    variable.type,
  );

  return {
    description:
      normalizedVariable.type === "custom_field"
        ? "查询聊天客户的自定义属性后，插入到指定位置"
        : normalizedVariable.type === "system_variable"
          ? "查询系统运行时变量，然后插入到指定位置"
          : "查询您指定的客户标签，然后插入到指定位置",
    id: skillVariableStorageId(normalizedVariable),
    placeholder: buildVariablePlaceholder(
      normalizedVariable,
      normalizedDisplayName,
    ),
    status: "available",
    title: normalizedDisplayName,
    variable: normalizedVariable,
  };
}
