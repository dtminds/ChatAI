import { getNodeDefinitionCore } from "./node-definition-core";
import type {
  WorkflowNode,
  WorkflowNodeOutputDefinition,
  WorkflowNodeOutputUsage,
  WorkflowOutputValueType,
  WorkflowVariableValueType,
} from "./types";

const outputKeyPattern = /^[A-Za-z][A-Za-z0-9_-]*$/;

export function getWorkflowNodeOutputDefinitions(
  node: WorkflowNode,
): WorkflowNodeOutputDefinition[] {
  const definition = getNodeDefinitionCore(node.data.kind);
  const outputs = definition.getOutputVariables?.(node) ?? [];
  const issues = validateWorkflowNodeOutputDefinitions(node, outputs);

  if (issues.length) {
    throw new Error(`Invalid ${node.data.kind} output definitions: ${issues.join("; ")}`);
  }

  return outputs;
}

export function getWorkflowOutputTypeLabel(valueType: WorkflowOutputValueType) {
  if (valueType.kind === "string") return "文本";
  if (valueType.kind === "number") return "数字";
  if (valueType.kind === "boolean") return "是/否";
  if (valueType.kind === "datetime") return "日期时间";
  if (valueType.kind === "reference") {
    return referenceTypeLabels[valueType.semantic];
  }
  if (valueType.kind === "array") {
    return valueType.semantic ? arrayTypeLabels[valueType.semantic] : "多项内容";
  }
  return "结构化内容";
}

export function getWorkflowVariableValueType(
  valueType: WorkflowOutputValueType,
): WorkflowVariableValueType {
  if (
    valueType.kind === "string"
    || valueType.kind === "number"
    || valueType.kind === "boolean"
    || valueType.kind === "datetime"
  ) {
    return valueType.kind;
  }
  if (valueType.kind === "array" && valueType.semantic === "message") {
    return "message-id-list";
  }
  if (valueType.kind === "reference") {
    return "string";
  }
  return "object";
}

export function isWorkflowOutputValueTypeEqual(
  left: WorkflowOutputValueType,
  right: WorkflowOutputValueType,
) {
  if (left.kind !== right.kind) return false;

  if (left.kind === "reference") {
    return right.kind === "reference" && left.semantic === right.semantic;
  }
  if (left.kind === "array") {
    return right.kind === "array"
      && left.itemType === right.itemType
      && left.semantic === right.semantic;
  }
  if (left.kind === "object") {
    return right.kind === "object" && left.schemaRef === right.schemaRef;
  }
  return true;
}

export function validateWorkflowNodeOutputDefinitions(
  node: WorkflowNode,
  outputs: WorkflowNodeOutputDefinition[],
) {
  const issues: string[] = [];
  const keys = new Set<string>();
  const sourceHandleIds = new Set(
    getNodeDefinitionCore(node.data.kind)
      .getSourceHandles(node.data)
      .map((handle) => handle.id),
  );

  outputs.forEach((output, index) => {
    const path = `output[${index}]`;
    if (!outputKeyPattern.test(output.key)) {
      issues.push(`${path}.key must be a stable identifier`);
    }
    if (keys.has(output.key)) {
      issues.push(`${path}.key duplicates ${output.key}`);
    }
    keys.add(output.key);

    if (!output.label.trim()) {
      issues.push(`${path}.label is required`);
    }
    output.usages.forEach((usage) => {
      if (!isOutputUsageCompatible(output.valueType, usage)) {
        issues.push(`${path}.valueType is incompatible with ${usage}`);
      }
    });
    output.availableOnSourceHandles?.forEach((handleId) => {
      if (!sourceHandleIds.has(handleId)) {
        issues.push(`${path}.availableOnSourceHandles references ${handleId}`);
      }
    });
  });

  return issues;
}

function isOutputUsageCompatible(
  valueType: WorkflowOutputValueType,
  usage: WorkflowNodeOutputUsage,
) {
  if (usage === "message-content") {
    return valueType.kind === "string";
  }
  if (usage === "time-reference") {
    return valueType.kind === "datetime";
  }
  if (usage === "intent-input") {
    return valueType.kind === "string"
      || (valueType.kind === "array" && valueType.semantic === "message");
  }
  return valueType.kind !== "array" && valueType.kind !== "object";
}

const referenceTypeLabels: Record<
  Extract<WorkflowOutputValueType, { kind: "reference" }>["semantic"],
  string
> = {
  customer: "客户",
  message: "消息",
  order: "订单",
  tag: "标签",
};

const arrayTypeLabels: Record<
  NonNullable<Extract<WorkflowOutputValueType, { kind: "array" }>["semantic"]>,
  string
> = {
  message: "多条消息",
  order: "多个订单",
  tag: "多个标签",
};
