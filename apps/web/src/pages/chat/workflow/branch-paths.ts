import type {
  BranchNodeData,
  WorkflowBranchCondition,
  WorkflowBranchConditionValue,
  WorkflowBranchLogic,
  WorkflowBranchOperator,
  WorkflowBranchPath,
  WorkflowVariableDefinition,
  WorkflowVariableValueType,
} from "./types";
import {
  getWorkflowVariableDisplayLabel,
  getWorkflowVariableSelectorKey,
} from "./workflow-variable-selector";

export const WORKFLOW_BRANCH_PATH_MIN = 1;
export const WORKFLOW_BRANCH_PATH_MAX = 10;
export const WORKFLOW_BRANCH_CONDITION_MIN = 1;
export const WORKFLOW_BRANCH_CONDITION_MAX = 10;
export const WORKFLOW_BRANCH_FIRST_HANDLE_TOP = 62;
export const WORKFLOW_BRANCH_HANDLE_ROW_GAP = 42;
export const WORKFLOW_BRANCH_NODE_BASE_HEIGHT = 62;

let workflowBranchPathIdSequence = 0;
let workflowBranchConditionIdSequence = 0;

export const branchOperatorOptionsByType: Record<
  Exclude<WorkflowVariableValueType, "object">,
  Array<{ label: string; value: WorkflowBranchOperator }>
> = {
  boolean: [
    { label: "为真", value: "is-true" },
    { label: "为假", value: "is-false" },
    { label: "为空", value: "is-empty" },
    { label: "不为空", value: "is-not-empty" },
  ],
  datetime: [
    { label: "早于", value: "datetime-before" },
    { label: "早于或等于", value: "datetime-before-or-equal" },
    { label: "晚于", value: "datetime-after" },
    { label: "晚于或等于", value: "datetime-after-or-equal" },
    { label: "等于", value: "equals" },
    { label: "介于", value: "datetime-between" },
    { label: "为空", value: "is-empty" },
    { label: "不为空", value: "is-not-empty" },
  ],
  "message-id-list": [
    { label: "为空", value: "is-empty" },
    { label: "不为空", value: "is-not-empty" },
  ],
  number: [
    { label: "等于", value: "equals" },
    { label: "不等于", value: "not-equals" },
    { label: "大于", value: "greater-than" },
    { label: "大于等于", value: "greater-than-or-equal" },
    { label: "小于", value: "less-than" },
    { label: "小于等于", value: "less-than-or-equal" },
    { label: "为空", value: "is-empty" },
    { label: "不为空", value: "is-not-empty" },
  ],
  string: [
    { label: "等于", value: "equals" },
    { label: "不等于", value: "not-equals" },
    { label: "包含", value: "contains" },
    { label: "不包含", value: "not-contains" },
    { label: "为空", value: "is-empty" },
    { label: "不为空", value: "is-not-empty" },
    { label: "开头为", value: "starts-with" },
    { label: "结尾为", value: "ends-with" },
  ],
};

export function createDefaultBranchPaths(): WorkflowBranchPath[] {
  return [
    {
      conditions: [{ id: "condition-1", operator: "equals", value: "" }],
      id: "branch-high",
      label: "如果",
      logic: "all",
    },
    {
      conditions: [],
      id: "branch-default",
      isDefault: true,
      label: "否则",
      logic: "all",
    },
  ];
}

export function createWorkflowBranchPathId(paths: WorkflowBranchPath[] = []) {
  const existingIds = new Set(paths.map((path) => path.id));
  let candidate = "";

  do {
    workflowBranchPathIdSequence += 1;
    candidate = `branch-${workflowBranchPathIdSequence.toString(36)}`;
  } while (existingIds.has(candidate));

  return candidate;
}

export function createWorkflowBranchConditionId(conditions: WorkflowBranchCondition[] = []) {
  const existingIds = new Set(conditions.map((condition) => condition.id));
  let candidate = "";

  do {
    workflowBranchConditionIdSequence += 1;
    candidate = `condition-${workflowBranchConditionIdSequence.toString(36)}`;
  } while (existingIds.has(candidate));

  return candidate;
}

export function createWorkflowBranchCondition(
  conditions: WorkflowBranchCondition[] = [],
): WorkflowBranchCondition {
  return {
    id: createWorkflowBranchConditionId(conditions),
    operator: "equals",
    value: "",
  };
}

export function getWorkflowBranchPaths(
  data?: Pick<BranchNodeData, "branchPaths">,
) {
  return normalizeWorkflowBranchPaths(data?.branchPaths);
}

export function normalizeWorkflowBranchPaths(value: unknown): WorkflowBranchPath[] {
  const rawPaths = Array.isArray(value) ? value : [];
  const seenIds = new Set<string>();
  const nonDefaultPaths: WorkflowBranchPath[] = [];
  let defaultPath: WorkflowBranchPath | undefined;

  for (const [index, rawPath] of rawPaths.entries()) {
    if (!isRecord(rawPath)) continue;
    const rawId = typeof rawPath.id === "string" ? rawPath.id.trim() : "";
    const id = rawId && !seenIds.has(rawId)
      ? rawId
      : createNormalizedPathId(index, seenIds);
    seenIds.add(id);
    const normalizedPath: WorkflowBranchPath = {
      conditions: normalizeWorkflowBranchConditions(rawPath.conditions),
      id,
      isDefault: rawPath.isDefault === true ? true : undefined,
      label: "",
      logic: normalizeWorkflowBranchLogic(rawPath.logic),
    };
    if (normalizedPath.isDefault && !defaultPath) {
      defaultPath = { ...normalizedPath, conditions: [], logic: "all" };
    }
    else if (
      !normalizedPath.isDefault
      && nonDefaultPaths.length < WORKFLOW_BRANCH_PATH_MAX
    ) {
      nonDefaultPaths.push(normalizedPath);
    }
  }

  if (!nonDefaultPaths.length) {
    nonDefaultPaths.push({
      conditions: [createNormalizedCondition(0)],
      id: createAvailableId("branch-high", seenIds),
      label: "",
      logic: "all",
    });
  }

  const normalizedDefault = defaultPath ?? {
    conditions: [],
    id: createAvailableId("branch-default", seenIds),
    isDefault: true,
    label: "否则",
    logic: "all",
  };

  return [
    ...nonDefaultPaths.map((path, index) => ({
      ...path,
      isDefault: undefined,
      label: index === 0 ? "如果" : "否则如果",
    })),
    {
      ...normalizedDefault,
      conditions: [],
      isDefault: true,
      label: "否则",
      logic: "all",
    },
  ];
}

export function normalizeWorkflowBranchConditions(value: unknown): WorkflowBranchCondition[] {
  if (!Array.isArray(value)) return [createNormalizedCondition(0)];
  const normalized: WorkflowBranchCondition[] = [];
  const seenIds = new Set<string>();

  for (const [index, item] of value.entries()) {
    if (!isRecord(item) || normalized.length >= WORKFLOW_BRANCH_CONDITION_MAX) continue;
    const rawId = typeof item.id === "string" ? item.id.trim() : "";
    const id = rawId && !seenIds.has(rawId) ? rawId : createNormalizedConditionId(index, seenIds);
    seenIds.add(id);
    normalized.push({
      id,
      operator: isWorkflowBranchOperator(item.operator) ? item.operator : "equals",
      selector: normalizeSelector(item.selector),
      value: normalizeConditionValue(item.value),
    });
  }

  return normalized.length ? normalized : [createNormalizedCondition(0)];
}

export function addWorkflowBranchPath(paths: WorkflowBranchPath[] | undefined) {
  const normalized = normalizeWorkflowBranchPaths(paths);
  const nonDefault = normalized.filter((path) => !path.isDefault);
  if (nonDefault.length >= WORKFLOW_BRANCH_PATH_MAX) return normalized;
  const fallback = normalized.find((path) => path.isDefault)!;
  return normalizeWorkflowBranchPaths([
    ...nonDefault,
    {
      conditions: [createWorkflowBranchCondition()],
      id: createWorkflowBranchPathId(normalized),
      label: "",
      logic: "all",
    },
    fallback,
  ]);
}

export function removeWorkflowBranchPath(paths: WorkflowBranchPath[] | undefined, pathId: string) {
  const normalized = normalizeWorkflowBranchPaths(paths);
  const target = normalized.find((path) => path.id === pathId);
  const nonDefaultCount = normalized.filter((path) => !path.isDefault).length;
  if (!target || target.isDefault || nonDefaultCount <= WORKFLOW_BRANCH_PATH_MIN) return normalized;
  return normalizeWorkflowBranchPaths(normalized.filter((path) => path.id !== pathId));
}

export function moveWorkflowBranchPath(
  paths: WorkflowBranchPath[] | undefined,
  pathId: string,
  direction: "down" | "up",
) {
  const normalized = normalizeWorkflowBranchPaths(paths);
  const nonDefault = normalized.filter((path) => !path.isDefault);
  const fallback = normalized.find((path) => path.isDefault)!;
  const index = nonDefault.findIndex((path) => path.id === pathId);
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || nextIndex < 0 || nextIndex >= nonDefault.length) return normalized;
  const next = [...nonDefault];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return normalizeWorkflowBranchPaths([...next, fallback]);
}

export function addWorkflowBranchCondition(path: WorkflowBranchPath) {
  if (path.isDefault || path.conditions.length >= WORKFLOW_BRANCH_CONDITION_MAX) return path;
  return {
    ...path,
    conditions: [...path.conditions, createWorkflowBranchCondition(path.conditions)],
  };
}

export function removeWorkflowBranchCondition(path: WorkflowBranchPath, conditionId: string) {
  if (path.isDefault || path.conditions.length <= WORKFLOW_BRANCH_CONDITION_MIN) return path;
  return { ...path, conditions: path.conditions.filter((condition) => condition.id !== conditionId) };
}

export function updateWorkflowBranchCondition(
  path: WorkflowBranchPath,
  conditionId: string,
  patch: Partial<WorkflowBranchCondition>,
) {
  return {
    ...path,
    conditions: path.conditions.map((condition) => condition.id === conditionId
      ? { ...condition, ...patch, id: condition.id }
      : condition),
  };
}

export function updateWorkflowBranchLogic(path: WorkflowBranchPath, logic: WorkflowBranchLogic) {
  return path.isDefault ? path : { ...path, logic: normalizeWorkflowBranchLogic(logic) };
}

export function getBranchPathLabel(
  data: Pick<BranchNodeData, "branchPaths"> | undefined,
  sourceHandle?: string | null,
) {
  return getWorkflowBranchPaths(data).find((path) => path.id === sourceHandle)?.label;
}

export function getDefaultBranchPathId(data?: Pick<BranchNodeData, "branchPaths">) {
  return getWorkflowBranchPaths(data)[0]?.id;
}

export function getBranchPathTop(
  data: Pick<BranchNodeData, "branchPaths"> | undefined,
  sourceHandle?: string,
) {
  const index = getWorkflowBranchPaths(data).findIndex((path) => path.id === sourceHandle);
  return WORKFLOW_BRANCH_FIRST_HANDLE_TOP
    + Math.max(0, index) * WORKFLOW_BRANCH_HANDLE_ROW_GAP;
}

export function getWorkflowBranchEstimatedHeight(data: Pick<BranchNodeData, "branchPaths">) {
  return WORKFLOW_BRANCH_NODE_BASE_HEIGHT
    + getWorkflowBranchPaths(data).length * WORKFLOW_BRANCH_HANDLE_ROW_GAP;
}

export function getBranchOperatorOptions(type: WorkflowVariableValueType | undefined) {
  return type && type !== "object" ? branchOperatorOptionsByType[type] : [];
}

export function getDefaultBranchOperator(type: WorkflowVariableValueType) {
  return getBranchOperatorOptions(type)[0]?.value ?? "equals";
}

export function branchOperatorNeedsValue(operator: WorkflowBranchOperator) {
  return !["is-empty", "is-false", "is-not-empty", "is-true"].includes(operator);
}

export function getBranchConditionSummary(
  path: WorkflowBranchPath,
  variables: WorkflowVariableDefinition[],
) {
  if (path.isDefault) return "不满足以上条件";
  const summaries = path.conditions.map((condition) => {
    const variable = resolveBranchVariable(variables, condition.selector);
    if (!variable) return "未配置条件";
    const operator = getBranchOperatorOptions(variable.type)
      .find((item) => item.value === condition.operator)?.label ?? "未配置判断";
    const value = getBranchConditionValueLabel(condition.value, condition.operator);
    return [getWorkflowVariableDisplayLabel(variable), operator, value].filter(Boolean).join(" ");
  });
  return summaries.join(path.logic === "all" ? " 且 " : " 或 ");
}

export function isWorkflowBranchConditionComplete(
  condition: WorkflowBranchCondition,
  variables: WorkflowVariableDefinition[],
) {
  const variable = resolveBranchVariable(variables, condition.selector);
  if (!variable || variable.type === "object") return false;
  const operators = getBranchOperatorOptions(variable.type).map((item) => item.value);
  if (!operators.includes(condition.operator)) return false;
  if (!branchOperatorNeedsValue(condition.operator)) return true;
  if (condition.operator === "datetime-between") {
    return Array.isArray(condition.value)
      && condition.value.length === 2
      && condition.value.every(isValidDateTimeValue)
      && condition.value[0] <= condition.value[1];
  }
  if (variable.type === "number") {
    return typeof condition.value === "number" && Number.isFinite(condition.value);
  }
  if (variable.type === "datetime") {
    return typeof condition.value === "string" && isValidDateTimeValue(condition.value);
  }
  return variable.type === "string"
    && typeof condition.value === "string"
    && condition.value.trim().length > 0;
}

function getBranchConditionValueLabel(
  value: WorkflowBranchConditionValue | undefined,
  operator: WorkflowBranchOperator,
) {
  if (!branchOperatorNeedsValue(operator)) return "";
  if (Array.isArray(value)) return `${formatDateTime(value[0])} 至 ${formatDateTime(value[1])}`;
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "number") return String(value);
  return typeof value === "string" && value ? formatDateTime(value) : "未配置值";
}

function resolveBranchVariable(
  variables: WorkflowVariableDefinition[],
  selector: WorkflowBranchCondition["selector"],
) {
  if (!selector) return undefined;
  const selectorKey = getWorkflowVariableSelectorKey(selector);
  return variables.find((variable) =>
    getWorkflowVariableSelectorKey(variable.selector) === selectorKey);
}

function formatDateTime(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? value.replace("T", " ") : value;
}

function isValidDateTimeValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T((?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
}

function normalizeWorkflowBranchLogic(value: unknown): WorkflowBranchLogic {
  return value === "any" ? "any" : "all";
}

function normalizeSelector(value: unknown) {
  return Array.isArray(value) && value.every((part) => typeof part === "string" && part.length > 0)
    ? [...value]
    : undefined;
}

function normalizeConditionValue(value: unknown): WorkflowBranchConditionValue | undefined {
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") return value;
  if (Array.isArray(value) && value.length === 2 && value.every((item) => typeof item === "string")) {
    return [value[0], value[1]];
  }
  return undefined;
}

function createNormalizedConditionId(index: number, seenIds: Set<string>) {
  return createAvailableId(`condition-${index + 1}`, seenIds);
}

function createNormalizedCondition(index: number): WorkflowBranchCondition {
  return {
    id: `condition-${index + 1}`,
    operator: "equals",
    value: "",
  };
}

function createNormalizedPathId(index: number, seenIds: Set<string>) {
  return createAvailableId(`branch-${index + 1}`, seenIds);
}

function createAvailableId(base: string, seenIds: Set<string>) {
  let candidate = base;
  let suffix = 1;
  while (seenIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function isWorkflowBranchOperator(value: unknown): value is WorkflowBranchOperator {
  return typeof value === "string" && Object.values(branchOperatorOptionsByType)
    .some((options) => options.some((option) => option.value === value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
