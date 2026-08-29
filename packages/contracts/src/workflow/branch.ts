import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { isValidWorkflowLocalDateTime } from "./local-date-time.js";

export const WorkflowBranchValueTypeSchema = Type.Union([
  Type.Literal("boolean"),
  Type.Literal("datetime"),
  Type.Literal("message-id-list"),
  Type.Literal("number"),
  Type.Literal("string"),
]);

export const WorkflowBranchSelectorSchema = Type.Array(
  Type.String({ minLength: 1, maxLength: 128 }),
  { minItems: 2, maxItems: 4 },
);

export const WorkflowBranchOperatorSchema = Type.Union([
  Type.Literal("contains"),
  Type.Literal("datetime-after"),
  Type.Literal("datetime-after-or-equal"),
  Type.Literal("datetime-before"),
  Type.Literal("datetime-before-or-equal"),
  Type.Literal("datetime-between"),
  Type.Literal("ends-with"),
  Type.Literal("equals"),
  Type.Literal("greater-than"),
  Type.Literal("greater-than-or-equal"),
  Type.Literal("is-empty"),
  Type.Literal("is-false"),
  Type.Literal("is-not-empty"),
  Type.Literal("is-true"),
  Type.Literal("less-than"),
  Type.Literal("less-than-or-equal"),
  Type.Literal("not-contains"),
  Type.Literal("not-equals"),
  Type.Literal("starts-with"),
]);

const WorkflowBranchConditionValueSchema = Type.Union([
  Type.Boolean(),
  Type.Number({ maximum: Number.MAX_SAFE_INTEGER, minimum: Number.MIN_SAFE_INTEGER }),
  Type.String({ maxLength: 2_000 }),
  Type.Tuple([
    Type.String({ maxLength: 64 }),
    Type.String({ maxLength: 64 }),
  ]),
]);

export const WorkflowBranchConditionSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 128 }),
  operator: WorkflowBranchOperatorSchema,
  selector: Type.Optional(WorkflowBranchSelectorSchema),
  value: Type.Optional(WorkflowBranchConditionValueSchema),
  valueType: Type.Optional(WorkflowBranchValueTypeSchema),
}, { additionalProperties: false });

export const WorkflowBranchPathSchema = Type.Object({
  conditions: Type.Array(WorkflowBranchConditionSchema, { minItems: 1, maxItems: 10 }),
  id: Type.String({ minLength: 1, maxLength: 128 }),
  isDefault: Type.Optional(Type.Boolean()),
  label: Type.String({ maxLength: 32 }),
  logic: Type.Union([Type.Literal("all"), Type.Literal("any")]),
}, { additionalProperties: false });

export const WorkflowDefaultBranchPathSchema = Type.Object({
  conditions: Type.Array(WorkflowBranchConditionSchema, { maxItems: 0 }),
  id: Type.String({ minLength: 1, maxLength: 128 }),
  isDefault: Type.Literal(true),
  label: Type.String({ maxLength: 32 }),
  logic: Type.Literal("all"),
}, { additionalProperties: false });

export const WorkflowBranchConfigSchema = Type.Object({
  branchPaths: Type.Array(
    Type.Union([WorkflowBranchPathSchema, WorkflowDefaultBranchPathSchema]),
    { minItems: 2, maxItems: 11 },
  ),
}, { additionalProperties: false });

export type WorkflowBranchValueType = Static<typeof WorkflowBranchValueTypeSchema>;
export type WorkflowBranchSelector = Static<typeof WorkflowBranchSelectorSchema>;
export type WorkflowBranchOperator = Static<typeof WorkflowBranchOperatorSchema>;
export type WorkflowBranchConditionValue = Static<typeof WorkflowBranchConditionValueSchema>;
export type WorkflowBranchCondition = Static<typeof WorkflowBranchConditionSchema>;
export type WorkflowBranchLogic = "all" | "any";
export type WorkflowBranchPath = Static<typeof WorkflowBranchPathSchema> | Static<typeof WorkflowDefaultBranchPathSchema>;
export type WorkflowBranchConfig = Static<typeof WorkflowBranchConfigSchema>;

const operatorsByValueType: Record<WorkflowBranchValueType, readonly WorkflowBranchOperator[]> = {
  boolean: ["is-true", "is-false", "is-empty", "is-not-empty"],
  datetime: [
    "datetime-before", "datetime-before-or-equal", "datetime-after",
    "datetime-after-or-equal", "equals", "datetime-between", "is-empty", "is-not-empty",
  ],
  "message-id-list": ["is-empty", "is-not-empty"],
  number: [
    "equals", "not-equals", "greater-than", "greater-than-or-equal",
    "less-than", "less-than-or-equal", "is-empty", "is-not-empty",
  ],
  string: [
    "equals", "not-equals", "contains", "not-contains", "is-empty", "is-not-empty",
    "starts-with", "ends-with",
  ],
};

export const WORKFLOW_BRANCH_OPERATORS_BY_VALUE_TYPE = operatorsByValueType;

export function workflowBranchOperatorNeedsValue(operator: WorkflowBranchOperator) {
  return !["is-empty", "is-false", "is-not-empty", "is-true"].includes(operator);
}

export function isWorkflowBranchConditionValueComplete(
  condition: Pick<WorkflowBranchCondition, "operator" | "value" | "valueType">,
) {
  if (!condition.valueType) return false;
  if (!operatorsByValueType[condition.valueType]?.includes(condition.operator)) return false;
  if (!workflowBranchOperatorNeedsValue(condition.operator)) return true;
  if (condition.operator === "datetime-between") {
    return Array.isArray(condition.value)
      && condition.value.length === 2
      && condition.value.every(isValidWorkflowLocalDateTime)
      && condition.value[0] <= condition.value[1];
  }
  if (condition.valueType === "number") return typeof condition.value === "number" && Number.isFinite(condition.value);
  if (condition.valueType === "datetime") {
    return typeof condition.value === "string" && isValidWorkflowLocalDateTime(condition.value);
  }
  if (condition.valueType === "boolean") return typeof condition.value === "boolean";
  if (condition.valueType === "message-id-list") return false;
  return typeof condition.value === "string" && condition.value.trim().length > 0;
}

export function isWorkflowBranchConfigComplete(value: unknown): value is WorkflowBranchConfig {
  if (!Value.Check(WorkflowBranchConfigSchema, value)
    || !isRecord(value) || !Array.isArray(value.branchPaths)) return false;
  const paths = value.branchPaths;
  const defaultPaths = paths.filter((path) => isRecord(path) && path.isDefault === true);
  if (defaultPaths.length !== 1 || paths[paths.length - 1] !== defaultPaths[0]) return false;
  const nonDefaultPaths = paths.filter((path) => isRecord(path) && path.isDefault !== true);
  if (nonDefaultPaths.length < 1 || nonDefaultPaths.length > 10) return false;
  const pathIds = new Set<string>();
  for (const path of paths) {
    if (!isRecord(path) || typeof path.id !== "string" || pathIds.has(path.id)) return false;
    pathIds.add(path.id);
    if (path.isDefault === true) {
      if (!Array.isArray(path.conditions) || path.conditions.length !== 0 || path.logic !== "all") return false;
      continue;
    }
    if (!Array.isArray(path.conditions) || path.conditions.length < 1 || path.conditions.length > 10) return false;
    const conditionIds = new Set<string>();
    for (const condition of path.conditions) {
      if (!isRecord(condition) || typeof condition.id !== "string" || conditionIds.has(condition.id)) return false;
      conditionIds.add(condition.id);
      if (!Array.isArray(condition.selector) || condition.selector.length < 2) return false;
      if (!isWorkflowBranchConditionValueComplete(condition as WorkflowBranchCondition)) return false;
    }
  }
  return true;
}

export function evaluateWorkflowBranchCondition(
  condition: WorkflowBranchCondition,
  resolve: (selector: WorkflowBranchSelector) => { available: boolean; value: unknown },
) {
  if (!condition.selector || !condition.valueType) return false;
  const resolved = resolve(condition.selector);
  if (!resolved.available) return false;
  const actual = resolved.value;
  const empty = actual === null || actual === undefined || actual === "" || (Array.isArray(actual) && actual.length === 0);
  switch (condition.operator) {
    case "is-empty": return empty;
    case "is-not-empty": return !empty;
    case "is-true": return actual === true;
    case "is-false": return actual === false;
    case "equals": return condition.valueType === "datetime"
      ? compareDateTime(actual, condition.value) === 0
      : isComparableValue(actual, condition.value) && compareBranchValue(actual, condition.value) === 0;
    case "not-equals": return isComparableValue(actual, condition.value)
      && compareBranchValue(actual, condition.value) !== 0;
    case "contains": return typeof actual === "string" && typeof condition.value === "string" && actual.includes(condition.value);
    case "not-contains": return typeof actual === "string" && typeof condition.value === "string" && !actual.includes(condition.value);
    case "starts-with": return typeof actual === "string" && typeof condition.value === "string" && actual.startsWith(condition.value);
    case "ends-with": return typeof actual === "string" && typeof condition.value === "string" && actual.endsWith(condition.value);
    case "greater-than": return isComparableValue(actual, condition.value) && compareBranchValue(actual, condition.value) > 0;
    case "greater-than-or-equal": return isComparableValue(actual, condition.value) && compareBranchValue(actual, condition.value) >= 0;
    case "less-than": return isComparableValue(actual, condition.value) && compareBranchValue(actual, condition.value) < 0;
    case "less-than-or-equal": return isComparableValue(actual, condition.value) && compareBranchValue(actual, condition.value) <= 0;
    case "datetime-before": return compareDateTime(actual, condition.value) < 0;
    case "datetime-before-or-equal": return compareDateTime(actual, condition.value) <= 0;
    case "datetime-after": return compareDateTime(actual, condition.value) > 0;
    case "datetime-after-or-equal": return compareDateTime(actual, condition.value) >= 0;
    case "datetime-between": return Array.isArray(condition.value)
      && compareDateTime(actual, condition.value[0]) >= 0
      && compareDateTime(actual, condition.value[1]) <= 0;
  }
}

function isComparableValue(actual: unknown, expected: unknown) {
  return typeof actual === typeof expected
    && (typeof actual === "string" || typeof actual === "number" || typeof actual === "boolean")
    && (typeof actual !== "number" || Number.isFinite(actual));
}

export function evaluateWorkflowBranchPath(
  path: Pick<WorkflowBranchPath, "conditions" | "logic" | "isDefault">,
  resolve: (selector: WorkflowBranchSelector) => { available: boolean; value: unknown },
) {
  if (path.isDefault) return false;
  const results = path.conditions.map((condition) => evaluateWorkflowBranchCondition(condition, resolve));
  return path.logic === "any" ? results.some(Boolean) : results.every(Boolean);
}

function compareBranchValue(actual: unknown, expected: unknown) {
  if (typeof actual === "number" && typeof expected === "number" && Number.isFinite(actual) && Number.isFinite(expected)) {
    return actual === expected ? 0 : actual < expected ? -1 : 1;
  }
  if (typeof actual === "boolean" && typeof expected === "boolean") return actual === expected ? 0 : actual ? 1 : -1;
  if (typeof actual === "string" && typeof expected === "string") return actual === expected ? 0 : actual < expected ? -1 : 1;
  return NaN;
}

function compareDateTime(actual: unknown, expected: unknown) {
  if (typeof actual !== "string" || typeof expected !== "string") return NaN;
  const left = parseDateTime(actual);
  const right = parseDateTime(expected);
  if (left === null || right === null) return NaN;
  return left === right ? 0 : left < right ? -1 : 1;
}

function parseDateTime(value: string) {
  if (/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return Date.parse(`${value}:00+08:00`);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
