import {
  WORKFLOW_AI_COLLECT_FIELD_MAX_COUNT,
  WORKFLOW_AI_COLLECT_FIELD_MIN_COUNT,
  WORKFLOW_AI_COLLECT_FIELD_NAME_MAX_LENGTH,
  WORKFLOW_AI_COLLECT_INSTRUCTION_MAX_LENGTH,
  WORKFLOW_AI_COLLECT_MAX_FOLLOW_UP_COUNT,
  WORKFLOW_AI_COLLECT_OPENING_MESSAGE_MAX_LENGTH,
  WORKFLOW_AI_COLLECT_TIMEOUT_MIN_BY_UNIT,
  WORKFLOW_AI_COLLECT_TIMEOUT_MAX_BY_UNIT,
} from "@chatai/contracts";
import type {
  AiCollectNodeData,
  WorkflowAiCollectField,
  WorkflowAiCollectFieldType,
  WorkflowAiCollectTimeout,
  WorkflowNodeOutputDefinition,
  WorkflowNodeStatus,
  WorkflowVariableSelector,
} from "../../types";

export const AI_COLLECT_FIELD_MIN_COUNT = WORKFLOW_AI_COLLECT_FIELD_MIN_COUNT;
export const AI_COLLECT_FIELD_MAX_COUNT = WORKFLOW_AI_COLLECT_FIELD_MAX_COUNT;
export const AI_COLLECT_FIELD_NAME_MAX_LENGTH = WORKFLOW_AI_COLLECT_FIELD_NAME_MAX_LENGTH;
export const AI_COLLECT_INSTRUCTION_MAX_LENGTH = WORKFLOW_AI_COLLECT_INSTRUCTION_MAX_LENGTH;
export const AI_COLLECT_MAX_FOLLOW_UP_COUNT = WORKFLOW_AI_COLLECT_MAX_FOLLOW_UP_COUNT;
export const AI_COLLECT_OPENING_MESSAGE_MAX_LENGTH = WORKFLOW_AI_COLLECT_OPENING_MESSAGE_MAX_LENGTH;
export const AI_COLLECT_TIMEOUT_MAX_BY_UNIT = WORKFLOW_AI_COLLECT_TIMEOUT_MAX_BY_UNIT;
export const AI_COLLECT_TIMEOUT_MIN_BY_UNIT = WORKFLOW_AI_COLLECT_TIMEOUT_MIN_BY_UNIT;
export const AI_COLLECT_COMPLETED_HANDLE_ID = "completed";
export const AI_COLLECT_INCOMPLETE_HANDLE_ID = "incomplete";

export const aiCollectFieldTypeLabels: Record<WorkflowAiCollectFieldType, string> = {
  boolean: "是/否",
  date: "日期",
  number: "数字",
  text: "文本",
  time: "时间",
};

export type AiCollectFieldTemplate = {
  instruction: string;
  name: string;
  type: WorkflowAiCollectFieldType;
};

export const aiCollectFieldTemplates: AiCollectFieldTemplate[] = [
  {
    instruction: "提取客户明确提供的完整订单号或交易单号。去除“订单号是”、“NO.”等前后缀，只保留纯编号；“刚才那个”、“上次买的”等模糊代词或编号不完整时视为无效。",
    name: "订单号",
    type: "text",
  },
  {
    instruction: "提取 11 位中国大陆手机号。自动去除空格、短横线及国家代码（+86），输出 11 位纯数字；号码位数不足、格式错误或包含猜测时视为无效。",
    name: "手机号",
    type: "text",
  },
  {
    instruction: "提取可用于发货或派送的详细收货地址。需包含省/市/区县及街道门牌或具体地点；仅提供“北京”、“公司地址”、“老地方”等模糊或不完整信息时视为无效。",
    name: "收货地址",
    type: "text",
  },
  {
    instruction: "提取标准格式的电子邮箱地址。必须包含用户名、@ 及有效域名后缀（如 .com、.cn）；去除多余空格与标点，格式不合规或未写全时视为无效。",
    name: "邮箱",
    type: "text",
  },
];

let aiCollectFieldIdSequence = 0;

export function createAiCollectField(
  fields: WorkflowAiCollectField[] = [],
  template?: AiCollectFieldTemplate,
): WorkflowAiCollectField {
  return {
    id: createUniqueFieldId(fields),
    instruction: template?.instruction ?? "",
    name: template?.name ?? "",
    type: template?.type ?? "text",
  };
}

export function normalizeAiCollectMaxFollowUpCount(value: unknown) {
  return Number.isInteger(value)
    ? Math.min(AI_COLLECT_MAX_FOLLOW_UP_COUNT, Math.max(0, value as number))
    : 3;
}

export function normalizeAiCollectInputSelector(value: unknown): WorkflowVariableSelector | undefined {
  if (!Array.isArray(value) || !value.length) return undefined;
  return value.every(part => typeof part === "string" && part.trim())
    ? [...value]
    : undefined;
}

export function normalizeAiCollectFields(value: unknown): WorkflowAiCollectField[] {
  if (!Array.isArray(value)) return [createAiCollectField()];
  const fields: WorkflowAiCollectField[] = [];
  const seenIds = new Set<string>();
  for (const [index, rawField] of value.entries()) {
    if (!isRecord(rawField) || fields.length >= AI_COLLECT_FIELD_MAX_COUNT) continue;
    const id = normalizeStableFieldId(rawField.id, index, seenIds);
    seenIds.add(id);
    fields.push({
      id,
      instruction: normalizeText(rawField.instruction, AI_COLLECT_INSTRUCTION_MAX_LENGTH),
      name: normalizeText(rawField.name, AI_COLLECT_FIELD_NAME_MAX_LENGTH),
      type: normalizeAiCollectFieldType(rawField.type),
    });
  }
  return fields.length ? fields : [createAiCollectField()];
}

export function normalizeAiCollectOpeningMessage(value: unknown) {
  return normalizeText(value, AI_COLLECT_OPENING_MESSAGE_MAX_LENGTH);
}

export function normalizeAiCollectTimeout(value: unknown): WorkflowAiCollectTimeout {
  const timeout = isRecord(value) ? value : {};
  const hasValidUnit = timeout.unit === "hour" || timeout.unit === "minute";
  const unit = timeout.unit === "hour" ? "hour" : "minute";
  const parsedDuration = Math.trunc(Number(timeout.duration));
  const duration = hasValidUnit && Number.isFinite(parsedDuration)
    ? Math.min(AI_COLLECT_TIMEOUT_MAX_BY_UNIT[unit], Math.max(
      AI_COLLECT_TIMEOUT_MIN_BY_UNIT[unit],
      parsedDuration,
    ))
    : unit === "hour" ? 1 : 30;
  return { duration, unit };
}

export function getAiCollectOutputDefinitions(
  fields: WorkflowAiCollectField[],
): WorkflowNodeOutputDefinition[] {
  return normalizeAiCollectFields(fields).map((field, index) => ({
    availableOnSourceHandles: [AI_COLLECT_COMPLETED_HANDLE_ID],
    description: field.instruction.trim() || undefined,
    key: field.id,
    label: field.name.trim() || `未命名字段 ${index + 1}`,
    usages: field.type === "text" || field.type === "date" || field.type === "time"
      ? ["variable", "message-content"]
      : ["variable"],
    valueType: field.type === "number"
      ? { kind: "number" }
      : field.type === "boolean"
        ? { kind: "boolean" }
        : { kind: "string" },
  }));
}

export function getAiCollectMetric(data: Pick<
  AiCollectNodeData,
  "fields" | "maxFollowUpCount"
>) {
  const maxFollowUpCount = normalizeAiCollectMaxFollowUpCount(data.maxFollowUpCount);
  const assistanceLabel = maxFollowUpCount === 0 ? "智能体辅助关闭" : `智能体辅助 ${maxFollowUpCount} 轮`;
  return `${assistanceLabel} · ${normalizeAiCollectFields(data.fields).length} 个字段`;
}

export function getAiCollectStatus(data: Pick<
  AiCollectNodeData,
  "fields" | "inputSelector" | "maxFollowUpCount"
>): WorkflowNodeStatus {
  const maxFollowUpCount = normalizeAiCollectMaxFollowUpCount(data.maxFollowUpCount);
  const fields = normalizeAiCollectFields(data.fields);
  const names = fields.map(field => field.name.trim());
  const complete = fields.length >= AI_COLLECT_FIELD_MIN_COUNT
    && fields.length <= AI_COLLECT_FIELD_MAX_COUNT
    && fields.every(field => field.name.trim() && field.instruction.trim())
    && new Set(names).size === names.length
    && (maxFollowUpCount > 0 || Boolean(normalizeAiCollectInputSelector(data.inputSelector)));
  return complete ? "ready" : "warning";
}

function normalizeAiCollectFieldType(value: unknown): WorkflowAiCollectFieldType {
  return value === "number" || value === "date" || value === "time" || value === "boolean"
    ? value
    : "text";
}

function createUniqueFieldId(fields: WorkflowAiCollectField[]) {
  const existingIds = new Set(fields.map(field => field.id));
  let candidate = "";
  do {
    aiCollectFieldIdSequence += 1;
    candidate = `field-${aiCollectFieldIdSequence}`;
  } while (existingIds.has(candidate));
  return candidate;
}

function normalizeStableFieldId(value: unknown, index: number, seenIds: Set<string>) {
  const rawId = typeof value === "string" ? value.trim() : "";
  if (rawId && /^[A-Za-z][A-Za-z0-9_-]*$/.test(rawId) && !seenIds.has(rawId)) {
    return rawId;
  }
  const base = `field-${index + 1}`;
  let candidate = base;
  let suffix = 1;
  while (seenIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function normalizeText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
