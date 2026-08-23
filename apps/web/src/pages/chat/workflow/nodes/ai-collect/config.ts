import {
  WORKFLOW_AI_COLLECT_FIELD_MAX_COUNT,
  WORKFLOW_AI_COLLECT_FIELD_MIN_COUNT,
  WORKFLOW_AI_COLLECT_FIELD_NAME_MAX_LENGTH,
  WORKFLOW_AI_COLLECT_INSTRUCTION_MAX_LENGTH,
  WORKFLOW_AI_COLLECT_OPENING_MESSAGE_MAX_LENGTH,
  WORKFLOW_AI_COLLECT_TIMEOUT_MAX_BY_UNIT,
} from "@chatai/contracts";
import type {
  AiCollectNodeData,
  WorkflowAiCollectField,
  WorkflowAiCollectFieldType,
  WorkflowAiCollectMode,
  WorkflowAiCollectTimeout,
  WorkflowNodeOutputDefinition,
  WorkflowNodeStatus,
  WorkflowVariableSelector,
} from "../../types";

export const AI_COLLECT_FIELD_MIN_COUNT = WORKFLOW_AI_COLLECT_FIELD_MIN_COUNT;
export const AI_COLLECT_FIELD_MAX_COUNT = WORKFLOW_AI_COLLECT_FIELD_MAX_COUNT;
export const AI_COLLECT_FIELD_NAME_MAX_LENGTH = WORKFLOW_AI_COLLECT_FIELD_NAME_MAX_LENGTH;
export const AI_COLLECT_INSTRUCTION_MAX_LENGTH = WORKFLOW_AI_COLLECT_INSTRUCTION_MAX_LENGTH;
export const AI_COLLECT_OPENING_MESSAGE_MAX_LENGTH = WORKFLOW_AI_COLLECT_OPENING_MESSAGE_MAX_LENGTH;
export const AI_COLLECT_TIMEOUT_MAX_BY_UNIT = WORKFLOW_AI_COLLECT_TIMEOUT_MAX_BY_UNIT;
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
    instruction: "提取客户明确提供的完整订单编号。不要把“那个订单”“上次的订单”等模糊指代当作订单号；编号不完整或存在多个候选时继续确认。",
    name: "订单号",
    type: "text",
  },
  {
    instruction: "提取客户明确提供的 11 位中国大陆手机号。允许包含空格或短横线并在提取时移除；位数不正确或不是客户确认的号码时继续确认。",
    name: "手机号",
    type: "text",
  },
  {
    instruction: "提取可用于配送的完整收货地址，至少包含省市区和详细街道、门牌等信息。仅有城市、公司、家里或“原来的地址”等模糊描述时继续确认。",
    name: "收货地址",
    type: "text",
  },
  {
    instruction: "提取客户明确提供的完整邮箱地址。地址需要包含有效的用户名、@ 和域名；信息不完整或存在多个候选时继续确认。",
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

export function normalizeAiCollectMode(value: unknown): WorkflowAiCollectMode {
  return value === "extract-once" ? value : "agent-assisted";
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
  const unit = timeout.unit === "minute" ? "minute" : "hour";
  const parsedDuration = Math.trunc(Number(timeout.duration));
  const duration = Number.isFinite(parsedDuration)
    ? Math.min(AI_COLLECT_TIMEOUT_MAX_BY_UNIT[unit], Math.max(1, parsedDuration))
    : unit === "hour" ? 24 : 1;
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

export function getAiCollectMetric(data: Pick<AiCollectNodeData, "fields" | "mode">) {
  const modeLabel = normalizeAiCollectMode(data.mode) === "extract-once" ? "单次提取" : "智能收集";
  return `${modeLabel} · ${normalizeAiCollectFields(data.fields).length} 个字段`;
}

export function getAiCollectStatus(data: Pick<
  AiCollectNodeData,
  "fields" | "inputSelector" | "mode"
>): WorkflowNodeStatus {
  const mode = normalizeAiCollectMode(data.mode);
  const fields = normalizeAiCollectFields(data.fields);
  const names = fields.map(field => field.name.trim());
  const complete = fields.length >= AI_COLLECT_FIELD_MIN_COUNT
    && fields.length <= AI_COLLECT_FIELD_MAX_COUNT
    && fields.every(field => field.name.trim() && field.instruction.trim())
    && new Set(names).size === names.length
    && (mode === "agent-assisted" || Boolean(normalizeAiCollectInputSelector(data.inputSelector)));
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
