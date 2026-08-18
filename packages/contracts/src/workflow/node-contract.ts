import { Type, type Static, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
  QUICK_REPLY_ATTACHMENT_MAX_COUNT,
  QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH,
  validateQuickReplyAttachment,
  type WorkbenchQuickReplyAttachment,
} from "../chat/quick-reply-content.js";
import { WorkflowBranchConfigSchema } from "./branch.js";
import type { WorkflowNodeKind } from "./dto.js";
import { WORKFLOW_HANDOFF_MESSAGE_MAX_LENGTH } from "./handoff.js";
import { isValidWorkflowLocalDate, isValidWorkflowLocalDateTime } from "./local-date-time.js";
import {
  getWorkflowCapabilityProfile,
  getWorkflowGuaranteedVariableCatalog,
  type WorkflowType,
} from "./policy.js";
import {
  WorkflowStartDraftConfigSchema,
  WorkflowStartConfigSchema,
  WorkflowWaitConfigSchema,
  WorkflowWaitEventConfigSchema,
  WorkflowWaitEventDraftConfigSchema,
  isWorkflowMessageSendingWindowValid,
  type WorkflowStartTrigger,
} from "./trigger.js";

export const WorkflowNodeMaturitySchema = Type.Union([
  Type.Literal("placeholder"),
  Type.Literal("draft-ready"),
  Type.Literal("runtime-ready"),
]);

export type WorkflowNodeMaturity = Static<typeof WorkflowNodeMaturitySchema>;

export const WorkflowCapabilityKindSchema = Type.Union([
  Type.Literal("action"),
  Type.Literal("inference"),
  Type.Literal("query"),
]);

export type WorkflowCapabilityKind = Static<typeof WorkflowCapabilityKindSchema>;

export const WorkflowNodeExecutionClassSchema = Type.Union([
  Type.Literal("action"),
  Type.Literal("composite"),
  Type.Literal("core"),
  Type.Literal("inference"),
  Type.Literal("query"),
]);

export type WorkflowNodeExecutionClass = Static<typeof WorkflowNodeExecutionClassSchema>;

export const WorkflowVariableSelectorSchema = Type.Array(
  Type.String({ minLength: 1, maxLength: 128 }),
  { minItems: 2, maxItems: 4 },
);

export const WorkflowOutputValueTypeSchema = Type.Union([
  Type.Object({ kind: Type.Literal("boolean") }, { additionalProperties: false }),
  Type.Object({ kind: Type.Literal("datetime") }, { additionalProperties: false }),
  Type.Object({ kind: Type.Literal("number") }, { additionalProperties: false }),
  Type.Object({ kind: Type.Literal("string") }, { additionalProperties: false }),
  Type.Object({
    kind: Type.Literal("reference"),
    semantic: Type.Union([
      Type.Literal("customer"),
      Type.Literal("message"),
      Type.Literal("order"),
      Type.Literal("tag"),
    ]),
  }, { additionalProperties: false }),
  Type.Object({
    itemType: Type.Union([
      Type.Literal("bigint"),
      Type.Literal("number"),
      Type.Literal("string"),
    ]),
    kind: Type.Literal("array"),
    semantic: Type.Optional(Type.Union([
      Type.Literal("message"),
      Type.Literal("order"),
      Type.Literal("tag"),
    ])),
  }, { additionalProperties: false }),
  Type.Object({
    kind: Type.Literal("object"),
    schemaRef: Type.String({ minLength: 1, maxLength: 256 }),
  }, { additionalProperties: false }),
]);

export const WorkflowVariableContentSegmentSchema = Type.Union([
  Type.Object({
    type: Type.Literal("text"),
    value: Type.String({ maxLength: 10_000 }),
  }, { additionalProperties: false }),
  Type.Object({
    selector: WorkflowVariableSelectorSchema,
    type: Type.Literal("variable"),
  }, { additionalProperties: false }),
]);

const WorkflowVariableContentSchema = Type.Array(WorkflowVariableContentSegmentSchema, {
  maxItems: 500,
});

const WorkflowQuickReplyAttachmentSchema = Type.Object({
  content: Type.Record(Type.String(), Type.Unknown()),
  materialCollectionId: Type.Optional(Type.String({ maxLength: 128 })),
  msgInfoId: Type.Optional(Type.String({ maxLength: 128 })),
  msgid: Type.Optional(Type.String({ maxLength: 128 })),
  type: Type.Union([
    Type.Literal("image"),
    Type.Literal("file"),
    Type.Literal("h5"),
    Type.Literal("weapp"),
    Type.Literal("sphfeed"),
  ]),
}, { additionalProperties: false });

const WorkflowMessageAttachmentsSchema = Type.Array(WorkflowQuickReplyAttachmentSchema, {
  maxItems: QUICK_REPLY_ATTACHMENT_MAX_COUNT,
});

export const WorkflowMessageDraftConfigSchema = Type.Object({
  attachments: WorkflowMessageAttachmentsSchema,
  content: WorkflowVariableContentSchema,
  contentMode: Type.Union([Type.Literal("custom"), Type.Literal("node-output")]),
  outputSelector: Type.Optional(WorkflowVariableSelectorSchema),
}, { additionalProperties: false });

export const WorkflowMessageExecutionConfigSchema = Type.Union([
  Type.Object({
    attachments: WorkflowMessageAttachmentsSchema,
    content: WorkflowVariableContentSchema,
    contentMode: Type.Literal("custom"),
  }, { additionalProperties: false }),
  Type.Object({
    attachments: WorkflowMessageAttachmentsSchema,
    contentMode: Type.Literal("node-output"),
    outputSelector: Type.Optional(WorkflowVariableSelectorSchema),
  }, { additionalProperties: false }),
]);

export const WorkflowTimeRangeSchema = Type.Union([
  Type.Object({
    endAt: Type.String({ maxLength: 32 }),
    mode: Type.Literal("fixed"),
    startAt: Type.String({ maxLength: 32 }),
  }, { additionalProperties: false }),
  Type.Object({
    end: WorkflowVariableSelectorSchema,
    mode: Type.Literal("dynamic"),
    start: WorkflowVariableSelectorSchema,
  }, { additionalProperties: false }),
]);

export const WorkflowMessageQueryConfigSchema = Type.Object({
  limit: Type.Integer({ minimum: 1, maximum: 50 }),
  take: Type.Union([Type.Literal("earliest"), Type.Literal("latest")]),
  timeRange: WorkflowTimeRangeSchema,
}, { additionalProperties: false });

export const WorkflowHandoffDraftConfigSchema = Type.Object({
  customerMessage: Type.Optional(WorkflowVariableContentSchema),
  operatorMessage: Type.Optional(WorkflowVariableContentSchema),
}, { additionalProperties: false });

export const WorkflowHandoffExecutionConfigSchema = Type.Object({
  customerMessage: WorkflowVariableContentSchema,
  operatorMessage: WorkflowVariableContentSchema,
}, { additionalProperties: false });

export const WORKFLOW_TAG_MAX_COUNT = 5;

export const WorkflowTagOperationSchema = Type.Union([
  Type.Literal("add"),
  Type.Literal("remove"),
]);

const WorkflowTagIdsSchema = Type.Array(
  Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
  { maxItems: WORKFLOW_TAG_MAX_COUNT, uniqueItems: true },
);

export const WorkflowTagDraftConfigSchema = Type.Object({
  operation: WorkflowTagOperationSchema,
  tagIds: WorkflowTagIdsSchema,
}, { additionalProperties: false });

export const WorkflowTagExecutionConfigSchema = Type.Object({
  operation: WorkflowTagOperationSchema,
  tagIds: Type.Array(
    Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
    { maxItems: WORKFLOW_TAG_MAX_COUNT, minItems: 1, uniqueItems: true },
  ),
}, { additionalProperties: false });

export const WORKFLOW_CUSTOMER_UPDATE_MAX_FIELD_COUNT = 10;

export const WorkflowCustomerFieldTypeSchema = Type.Union([
  Type.Literal(1),
  Type.Literal(4),
  Type.Literal(5),
  Type.Literal(6),
  Type.Literal(11),
  Type.Literal(12),
]);

export const WorkflowCustomerUpdateValueSchema = Type.Union([
  Type.Object({
    kind: Type.Literal("literal"),
    value: Type.String({ maxLength: 10_000 }),
  }, { additionalProperties: false }),
  Type.Object({
    kind: Type.Literal("variable"),
    selector: WorkflowVariableSelectorSchema,
    valueType: WorkflowOutputValueTypeSchema,
  }, { additionalProperties: false }),
]);

export const WorkflowCustomerFieldSnapshotSchema = Type.Object({
  id: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
  key: Type.String({ maxLength: 128 }),
  title: Type.String({ maxLength: 256 }),
  type: WorkflowCustomerFieldTypeSchema,
}, { additionalProperties: false });

export const WorkflowCustomerUpdateDraftFieldSchema = Type.Object({
  field: Type.Optional(WorkflowCustomerFieldSnapshotSchema),
  id: Type.String({ minLength: 1, maxLength: 128 }),
  value: WorkflowCustomerUpdateValueSchema,
}, { additionalProperties: false });

export const WorkflowCustomerUpdateExecutionFieldSchema = Type.Object({
  fieldId: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
  fieldType: WorkflowCustomerFieldTypeSchema,
  value: WorkflowCustomerUpdateValueSchema,
}, { additionalProperties: false });

export const WorkflowCustomerUpdateDraftConfigSchema = Type.Object({
  fields: Type.Array(WorkflowCustomerUpdateDraftFieldSchema, {
    maxItems: WORKFLOW_CUSTOMER_UPDATE_MAX_FIELD_COUNT,
    minItems: 1,
  }),
}, { additionalProperties: false });

export const WorkflowCustomerUpdateExecutionConfigSchema = Type.Object({
  fields: Type.Array(WorkflowCustomerUpdateExecutionFieldSchema, {
    maxItems: WORKFLOW_CUSTOMER_UPDATE_MAX_FIELD_COUNT,
    minItems: 1,
  }),
}, { additionalProperties: false });

export const WorkflowLlmInputValueSchema = Type.Union([
  Type.Object({
    kind: Type.Literal("literal"),
    value: Type.String({ maxLength: 10_000 }),
  }, { additionalProperties: false }),
  Type.Object({
    kind: Type.Literal("variable"),
    selector: WorkflowVariableSelectorSchema,
    valueType: WorkflowOutputValueTypeSchema,
  }, { additionalProperties: false }),
]);

export const WorkflowLlmInputParameterSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 128 }),
  name: Type.String({ maxLength: 15 }),
  value: WorkflowLlmInputValueSchema,
}, { additionalProperties: false });

export const WorkflowLlmOutputFieldTypeSchema = Type.Union([
  Type.Literal("boolean"),
  Type.Literal("number"),
  Type.Literal("string"),
]);

export const WorkflowLlmOutputFieldSchema = Type.Object({
  description: Type.String({ maxLength: 200 }),
  id: Type.String({ minLength: 1, maxLength: 128 }),
  name: Type.String({ maxLength: 15 }),
  type: WorkflowLlmOutputFieldTypeSchema,
}, { additionalProperties: false });

export const WorkflowLlmOutputConfigSchema = Type.Union([
  Type.Object({
    field: WorkflowLlmOutputFieldSchema,
    format: Type.Union([Type.Literal("markdown"), Type.Literal("text")]),
  }, { additionalProperties: false }),
  Type.Object({
    fields: Type.Array(WorkflowLlmOutputFieldSchema, { maxItems: 10, minItems: 1 }),
    format: Type.Literal("json"),
  }, { additionalProperties: false }),
]);

export const WorkflowLlmDraftConfigSchema = Type.Object({
  inputs: Type.Array(WorkflowLlmInputParameterSchema, { maxItems: 10 }),
  modelId: Type.String({ maxLength: 128 }),
  modelLabel: Type.Optional(Type.String({ maxLength: 256 })),
  modelName: Type.Optional(Type.String({ maxLength: 256 })),
  output: WorkflowLlmOutputConfigSchema,
  systemPrompt: WorkflowVariableContentSchema,
  userPrompt: WorkflowVariableContentSchema,
}, { additionalProperties: false });

export const WorkflowLlmExecutionConfigSchema = Type.Object({
  inputs: Type.Array(WorkflowLlmInputParameterSchema, { maxItems: 10 }),
  modelId: Type.String({ maxLength: 128 }),
  output: WorkflowLlmOutputConfigSchema,
  systemPrompt: WorkflowVariableContentSchema,
  userPrompt: WorkflowVariableContentSchema,
}, { additionalProperties: false });

export const WorkflowIntentOptionSchema = Type.Object({
  description: Type.String({ maxLength: 200 }),
  id: Type.String({ minLength: 1, maxLength: 128 }),
}, { additionalProperties: false });

export const WorkflowAiIntentDraftConfigSchema = Type.Object({
  advancedEnabled: Type.Boolean(),
  inputSelector: Type.Optional(WorkflowVariableSelectorSchema),
  intents: Type.Array(WorkflowIntentOptionSchema, { maxItems: 10, minItems: 1 }),
  prompt: Type.String({ maxLength: 2_000 }),
}, { additionalProperties: false });

export const WorkflowAiIntentExecutionConfigSchema = Type.Object({
  fallback: Type.Object({ id: Type.Literal("fallback") }, { additionalProperties: false }),
  inputSelector: Type.Optional(WorkflowVariableSelectorSchema),
  intents: Type.Array(Type.Composite([
    WorkflowIntentOptionSchema,
    Type.Object({ modelCode: Type.String({ pattern: "^I(?:[1-9]|10)$" }) }),
  ], { additionalProperties: false }), { maxItems: 10, minItems: 1 }),
  prompt: Type.Optional(Type.String({ maxLength: 2_000 })),
}, { additionalProperties: false });

export const WorkflowEmptyNodeConfigSchema = Type.Object({}, { additionalProperties: false });

export type WorkflowVariableSelector = Static<typeof WorkflowVariableSelectorSchema>;
export type WorkflowOutputValueType = Static<typeof WorkflowOutputValueTypeSchema>;
export type WorkflowNodeOutputUsage =
  | "intent-input"
  | "message-content"
  | "time-reference"
  | "variable";
export type WorkflowNodeOutputContract = {
  availableOnSourceOutlets?: readonly string[];
  key: string;
  usages: readonly WorkflowNodeOutputUsage[];
  valueType: WorkflowOutputValueType;
};
export type WorkflowVariableContentSegment = Static<typeof WorkflowVariableContentSegmentSchema>;
export type WorkflowMessageDraftConfig = Static<typeof WorkflowMessageDraftConfigSchema>;
export type WorkflowMessageExecutionConfig = Static<typeof WorkflowMessageExecutionConfigSchema>;
export type WorkflowTimeRange = Static<typeof WorkflowTimeRangeSchema>;
export type WorkflowMessageQueryConfig = Static<typeof WorkflowMessageQueryConfigSchema>;
export type WorkflowHandoffDraftConfig = Static<typeof WorkflowHandoffDraftConfigSchema>;
export type WorkflowHandoffExecutionConfig = Static<typeof WorkflowHandoffExecutionConfigSchema>;
export type WorkflowTagOperation = Static<typeof WorkflowTagOperationSchema>;
export type WorkflowTagDraftConfig = Static<typeof WorkflowTagDraftConfigSchema>;
export type WorkflowTagExecutionConfig = Static<typeof WorkflowTagExecutionConfigSchema>;
export type WorkflowCustomerFieldType = Static<typeof WorkflowCustomerFieldTypeSchema>;
export type WorkflowCustomerUpdateValue = Static<typeof WorkflowCustomerUpdateValueSchema>;
export type WorkflowCustomerFieldSnapshot = Static<typeof WorkflowCustomerFieldSnapshotSchema>;
export type WorkflowCustomerUpdateDraftField = Static<typeof WorkflowCustomerUpdateDraftFieldSchema>;
export type WorkflowCustomerUpdateExecutionField = Static<typeof WorkflowCustomerUpdateExecutionFieldSchema>;
export type WorkflowCustomerUpdateDraftConfig = Static<typeof WorkflowCustomerUpdateDraftConfigSchema>;
export type WorkflowCustomerUpdateExecutionConfig = Static<typeof WorkflowCustomerUpdateExecutionConfigSchema>;
export type WorkflowLlmInputValue = Static<typeof WorkflowLlmInputValueSchema>;
export type WorkflowLlmInputParameter = Static<typeof WorkflowLlmInputParameterSchema>;
export type WorkflowLlmOutputFieldType = Static<typeof WorkflowLlmOutputFieldTypeSchema>;
export type WorkflowLlmOutputField = Static<typeof WorkflowLlmOutputFieldSchema>;
export type WorkflowLlmOutputConfig = Static<typeof WorkflowLlmOutputConfigSchema>;
export type WorkflowLlmDraftConfig = Static<typeof WorkflowLlmDraftConfigSchema>;
export type WorkflowLlmExecutionConfig = Static<typeof WorkflowLlmExecutionConfigSchema>;
export type WorkflowIntentOption = Static<typeof WorkflowIntentOptionSchema>;
export type WorkflowAiIntentDraftConfig = Static<typeof WorkflowAiIntentDraftConfigSchema>;
export type WorkflowAiIntentExecutionConfig = Static<typeof WorkflowAiIntentExecutionConfigSchema>;

const WORKFLOW_LLM_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const WORKFLOW_LLM_PROMPT_MAX_LENGTH = 10_000;

export const WORKFLOW_DRAFT_NODE_BASE_KEYS = [
  "kind",
  "label",
  "metric",
  "schemaVersion",
  "status",
  "title",
] as const;

type WorkflowNodeContractDefinition<
  TMaturity extends WorkflowNodeMaturity = WorkflowNodeMaturity,
  TExecutionClass extends WorkflowNodeExecutionClass = WorkflowNodeExecutionClass,
> = {
  currentDraftSchemaVersion: number;
  draftConfigKeys: readonly string[];
  draftConfigSchema: TSchema;
  executionClass: TExecutionClass;
  executionConfigSchema: TSchema | null;
  maturity: TMaturity;
};

export const workflowNodeContractRegistry = {
  agent: placeholderContract("action"),
  "ai-collect": placeholderContract("composite"),
  "ai-intent": draftReadyContract(
    "inference",
    1,
    WorkflowAiIntentDraftConfigSchema,
    WorkflowAiIntentExecutionConfigSchema,
  ),
  branch: runtimeReadyContract(
    "core",
    1,
    WorkflowBranchConfigSchema,
    WorkflowBranchConfigSchema,
  ),
  coupon: placeholderContract("action"),
  "customer-update": draftReadyContract(
    "action",
    1,
    WorkflowCustomerUpdateDraftConfigSchema,
    WorkflowCustomerUpdateExecutionConfigSchema,
  ),
  end: runtimeReadyContract("core", 1, WorkflowEmptyNodeConfigSchema, WorkflowEmptyNodeConfigSchema),
  handoff: draftReadyContract(
    "action",
    1,
    WorkflowHandoffDraftConfigSchema,
    WorkflowHandoffExecutionConfigSchema,
  ),
  llm: draftReadyContract(
    "inference",
    1,
    WorkflowLlmDraftConfigSchema,
    WorkflowLlmExecutionConfigSchema,
  ),
  message: draftReadyContract(
    "action",
    2,
    WorkflowMessageDraftConfigSchema,
    WorkflowMessageExecutionConfigSchema,
  ),
  "message-query": runtimeReadyContract(
    "query",
    1,
    WorkflowMessageQueryConfigSchema,
    WorkflowMessageQueryConfigSchema,
  ),
  "order-query": placeholderContract("query"),
  start: runtimeReadyContract(
    "core",
    1,
    WorkflowStartDraftConfigSchema,
    WorkflowStartConfigSchema,
  ),
  tag: draftReadyContract(
    "action",
    1,
    WorkflowTagDraftConfigSchema,
    WorkflowTagExecutionConfigSchema,
  ),
  "tag-query": placeholderContract("query"),
  wait: runtimeReadyContract(
    "core",
    1,
    WorkflowWaitConfigSchema,
    WorkflowWaitConfigSchema,
  ),
  "wait-event": runtimeReadyContract(
    "core",
    1,
    WorkflowWaitEventDraftConfigSchema,
    WorkflowWaitEventConfigSchema,
  ),
} satisfies Record<WorkflowNodeKind, WorkflowNodeContractDefinition>;

export type WorkflowNodeExecutionClassFor<TKind extends WorkflowNodeKind> =
  (typeof workflowNodeContractRegistry)[TKind]["executionClass"];

export type WorkflowCapabilityNodeKind = {
  [TKind in WorkflowNodeKind]: WorkflowNodeExecutionClassFor<TKind> extends WorkflowCapabilityKind
    ? TKind
    : never;
}[WorkflowNodeKind];

export function getWorkflowNodeContract<TKind extends WorkflowNodeKind>(kind: TKind) {
  return workflowNodeContractRegistry[kind];
}

export function extractWorkflowNodeDraftConfig(
  kind: WorkflowNodeKind,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const keys = getWorkflowNodeContract(kind).draftConfigKeys;
  return Object.fromEntries(keys.flatMap((key) =>
    data[key] === undefined ? [] : [[key, structuredClone(data[key])]],
  ));
}

export function isWorkflowNodeDraftConfig(
  kind: WorkflowNodeKind,
  value: unknown,
) {
  return Value.Check(getWorkflowNodeContract(kind).draftConfigSchema, value);
}

export function getUnknownWorkflowNodeDraftDataKeys(
  kind: WorkflowNodeKind,
  data: Record<string, unknown>,
) {
  const allowedKeys = new Set<string>([
    ...WORKFLOW_DRAFT_NODE_BASE_KEYS,
    ...getWorkflowNodeContract(kind).draftConfigKeys,
  ]);
  return Object.keys(data).filter(key => !allowedKeys.has(key));
}

export function isWorkflowNodeExecutionConfig(
  kind: WorkflowNodeKind,
  value: unknown,
) {
  if (kind === "message") return isWorkflowMessageExecutionConfigComplete(value);
  if (kind === "handoff") return isWorkflowHandoffExecutionConfigComplete(value);
  if (kind === "llm") return isWorkflowLlmExecutionConfigComplete(value);
  if (kind === "ai-intent") return isWorkflowAiIntentExecutionConfigComplete(value);
  if (kind === "message-query") return isWorkflowMessageQueryExecutionConfigComplete(value);
  if (kind === "customer-update") return isWorkflowCustomerUpdateExecutionConfigComplete(value);
  const schema = getWorkflowNodeContract(kind).executionConfigSchema;
  return schema !== null
    && Value.Check(schema, value)
    && (kind !== "start" || isWorkflowStartMessageSendingWindowValid(value));
}

export function isWorkflowCustomerUpdateExecutionConfigComplete(
  value: unknown,
): value is WorkflowCustomerUpdateExecutionConfig {
  if (!Value.Check(WorkflowCustomerUpdateExecutionConfigSchema, value)) return false;
  const fieldIds = value.fields.map(field => field.fieldId);
  return new Set(fieldIds).size === fieldIds.length
    && value.fields.every(field => isWorkflowCustomerUpdateFieldValueComplete(
      field.fieldType,
      field.value,
    ));
}

export function isWorkflowCustomerFieldTypeSupported(
  value: number,
): value is WorkflowCustomerFieldType {
  return value === 1
    || value === 4
    || value === 5
    || value === 6
    || value === 11
    || value === 12;
}

export function isWorkflowCustomerFieldValueTypeCompatible(
  fieldType: WorkflowCustomerFieldType,
  valueType: WorkflowOutputValueType,
) {
  if (fieldType === 11) return valueType.kind === "number";
  if (fieldType === 4 || fieldType === 12) {
    return valueType.kind === "datetime" || valueType.kind === "string";
  }
  return valueType.kind === "string";
}

function isWorkflowCustomerUpdateFieldValueComplete(
  fieldType: WorkflowCustomerFieldType,
  value: WorkflowCustomerUpdateValue,
) {
  if (value.kind === "variable") {
    return isWorkflowCustomerFieldValueTypeCompatible(fieldType, value.valueType);
  }
  const literal = value.value.trim();
  if (!literal) return false;
  if (fieldType === 11) return Number.isFinite(Number(literal));
  if (fieldType === 4 || fieldType === 12) return isValidWorkflowLocalDate(literal);
  return true;
}

export function isWorkflowHandoffExecutionConfigComplete(
  value: unknown,
): value is WorkflowHandoffExecutionConfig {
  if (!Value.Check(WorkflowHandoffExecutionConfigSchema, value)) return false;
  return isWorkflowVariableContentWithinLimit(
    value.operatorMessage,
    WORKFLOW_HANDOFF_MESSAGE_MAX_LENGTH,
    true,
  ) && isWorkflowVariableContentWithinLimit(
    value.customerMessage,
    WORKFLOW_HANDOFF_MESSAGE_MAX_LENGTH,
    false,
  );
}

export function isWorkflowMessageExecutionConfigComplete(
  value: unknown,
): value is WorkflowMessageExecutionConfig {
  if (!Value.Check(WorkflowMessageExecutionConfigSchema, value)) return false;
  const config = value as WorkflowMessageExecutionConfig;
  if (!config.attachments.every(attachment =>
    Boolean(attachment.materialCollectionId)
    && Boolean(attachment.msgInfoId)
    && validateQuickReplyAttachment(attachment as WorkbenchQuickReplyAttachment).ok)) {
    return false;
  }
  if (config.contentMode === "node-output") return Boolean(config.outputSelector);
  const literalLength = config.content.reduce((length, segment) =>
    length + (segment.type === "text" ? segment.value.length : 0), 0);
  const hasContent = config.content.some(segment =>
    segment.type === "variable" || Boolean(segment.value.trim()));
  return literalLength <= QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH
    && (hasContent || config.attachments.length > 0);
}

export function isWorkflowMessageQueryExecutionConfigComplete(
  value: unknown,
): value is WorkflowMessageQueryConfig {
  if (!Value.Check(WorkflowMessageQueryConfigSchema, value)) return false;
  if (value.timeRange.mode === "fixed") {
    return isValidWorkflowLocalDateTime(value.timeRange.startAt)
      && isValidWorkflowLocalDateTime(value.timeRange.endAt)
      && value.timeRange.startAt <= value.timeRange.endAt;
  }
  return !isWorkflowDynamicTimeRangeProvablyInvalid(
    value.timeRange.start,
    value.timeRange.end,
  );
}

export function areWorkflowVariableSelectorsEqual(
  left: WorkflowVariableSelector,
  right: WorkflowVariableSelector,
) {
  return left.length === right.length
    && left.every((part, index) => part === right[index]);
}

export function isWorkflowDynamicTimeRangeProvablyInvalid(
  start: WorkflowVariableSelector,
  end: WorkflowVariableSelector,
) {
  if (areWorkflowVariableSelectorsEqual(start, end)) return true;
  const [startScope, startNodeId, startField] = start;
  const [endScope, endNodeId, endField] = end;
  if (startScope === "current-node-lifecycle") {
    return endScope === "trigger" || endScope === "node-lifecycle";
  }
  if (startScope !== "node-lifecycle") return false;
  if (endScope === "trigger") return true;
  return endScope === "node-lifecycle"
    && startNodeId === endNodeId
    && startField === "exitedAt"
    && endField === "enteredAt";
}

function isWorkflowStartMessageSendingWindowValid(value: unknown) {
  const config = value as { messageSendingWindow?: unknown; seatIds?: unknown };
  return config.seatIds === undefined
    || config.messageSendingWindow === undefined
    || isWorkflowMessageSendingWindowValid(config.messageSendingWindow);
}

export function getWorkflowNodeOutputContracts(
  kind: WorkflowNodeKind,
  config: Record<string, unknown>,
): readonly WorkflowNodeOutputContract[] | null {
  if (kind === "llm" && Value.Check(WorkflowLlmOutputConfigSchema, config.output)) {
    const output = config.output as WorkflowLlmOutputConfig;
    const fields = output.format === "json" ? output.fields : [output.field];
    return fields.map(field => ({
      key: field.id,
      usages: field.type === "string"
        ? ["variable", "message-content"]
        : ["variable"],
      valueType: { kind: field.type },
    }));
  }
  if (kind === "ai-intent") {
    return [
      {
        key: "matchedIntentDescription",
        usages: ["variable"],
        valueType: { kind: "string" },
      },
      {
        key: "reason",
        usages: ["variable"],
        valueType: { kind: "string" },
      },
    ];
  }
  if (kind === "wait-event") {
    return [
      {
        availableOnSourceOutlets: ["triggered"],
        key: "messageIds",
        usages: ["intent-input"],
        valueType: { itemType: "bigint", kind: "array", semantic: "message" },
      },
      {
        availableOnSourceOutlets: ["triggered"],
        key: "textContent",
        usages: ["intent-input", "message-content", "variable"],
        valueType: { kind: "string" },
      },
      {
        availableOnSourceOutlets: ["triggered"],
        key: "messageCount",
        usages: ["variable"],
        valueType: { kind: "number" },
      },
      {
        availableOnSourceOutlets: ["triggered"],
        key: "lastMessageAt",
        usages: ["time-reference", "variable"],
        valueType: { kind: "datetime" },
      },
    ];
  }
  if (kind === "message-query") {
    return [
      {
        key: "messageIds",
        usages: ["intent-input"],
        valueType: { itemType: "bigint", kind: "array", semantic: "message" },
      },
      {
        key: "textContent",
        usages: ["intent-input", "message-content", "variable"],
        valueType: { kind: "string" },
      },
      {
        key: "messageCount",
        usages: ["variable"],
        valueType: { kind: "number" },
      },
      {
        key: "rangeStart",
        usages: ["time-reference", "variable"],
        valueType: { kind: "datetime" },
      },
      {
        key: "rangeEnd",
        usages: ["time-reference", "variable"],
        valueType: { kind: "datetime" },
      },
    ];
  }
  return null;
}

function isWorkflowVariableContentWithinLimit(
  segments: WorkflowVariableContentSegment[],
  maximumLength: number,
  required: boolean,
) {
  const literalLength = segments.reduce((length, segment) =>
    length + (segment.type === "text" ? segment.value.length : 0), 0);
  const hasContent = segments.some(segment =>
    segment.type === "variable" || Boolean(segment.value.trim()));
  return literalLength <= maximumLength && (!required || hasContent);
}

export function getWorkflowContextVariableValueType(
  selector: WorkflowVariableSelector,
  workflowType?: WorkflowType,
  entryEventTypes?: readonly WorkflowStartTrigger["type"][],
): WorkflowOutputValueType | null {
  const key = selector.join(".");
  const variableCatalog = workflowType && entryEventTypes
    ? getWorkflowGuaranteedVariableCatalog(workflowType, entryEventTypes)
    : workflowType
      ? getWorkflowCapabilityProfile(workflowType).variableCatalog
      : null;
  if (variableCatalog && !variableCatalog.includes(key)) {
    return null;
  }
  if (key === "subject.id") return { kind: "string" };
  if (key === "trigger.occurredAt") return { kind: "datetime" };
  if (key === "trigger.projection.workUserId"
    || key === "trigger.projection.seatId") {
    return { kind: "number" };
  }
  if (key === "trigger.projection.externalUserId") {
    return { kind: "string" };
  }
  return null;
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

export function isWorkflowLlmExecutionConfigComplete(
  value: unknown,
): value is WorkflowLlmExecutionConfig {
  if (!Value.Check(WorkflowLlmExecutionConfigSchema, value)) return false;
  const config = value as WorkflowLlmExecutionConfig;
  const inputIds = config.inputs.map(input => input.id);
  const inputNames = config.inputs.map(input => input.name.trim());
  const inputNameById = new Map(config.inputs.map(input => [input.id, input.name.trim()]));
  if (
    !config.modelId.trim()
    || !areUniqueNonBlankValues(inputIds)
    || !areUniqueWorkflowIdentifiers(inputNames)
    || config.inputs.some(input =>
      input.value.kind === "literal"
        ? !input.value.value.trim()
        : !isWorkflowInferenceSelectorResolvable(input.value.selector))
    || !isWorkflowPromptComplete(config.systemPrompt, inputNameById, true)
    || !isWorkflowPromptComplete(config.userPrompt, inputNameById, false)
  ) {
    return false;
  }

  const fields = config.output.format === "json"
    ? config.output.fields
    : [config.output.field];
  const fieldIds = fields.map(field => field.id);
  const fieldNames = fields.map(field => field.name.trim());
  return areUniqueNonBlankValues(fieldIds)
    && areUniqueWorkflowIdentifiers(fieldNames)
    && (config.output.format === "json" || config.output.field.type === "string");
}

export function isWorkflowAiIntentExecutionConfigComplete(
  value: unknown,
): value is WorkflowAiIntentExecutionConfig {
  if (!Value.Check(WorkflowAiIntentExecutionConfigSchema, value)) return false;
  const config = value as WorkflowAiIntentExecutionConfig;
  const selector = config.inputSelector;
  const intentIds = config.intents.map(intent => intent.id);
  const descriptions = config.intents.map(intent => intent.description.trim());
  return Boolean(selector && isWorkflowInferenceSelectorResolvable(selector))
    && areUniqueNonBlankValues(intentIds)
    && descriptions.every(Boolean)
    && new Set(descriptions).size === descriptions.length
    && config.intents.every((intent, index) => intent.modelCode === `I${index + 1}`);
}

function areUniqueWorkflowIdentifiers(values: string[]) {
  return values.every(value =>
    Boolean(value) && WORKFLOW_LLM_IDENTIFIER_PATTERN.test(value))
    && new Set(values).size === values.length;
}

function areUniqueNonBlankValues(values: string[]) {
  return values.every(value => Boolean(value.trim()))
    && new Set(values).size === values.length;
}

function isWorkflowInferenceSelectorResolvable(selector: WorkflowVariableSelector) {
  const [scope, key, ...path] = selector;
  if (!scope || !key) return false;
  if (scope === "subject") return key === "id" && path.length === 0;
  if (scope === "trigger" || scope === "node") return true;
  if (scope === "current-node-lifecycle") {
    return key === "enteredAt" && path.length === 0;
  }
  return scope === "node-lifecycle"
    && path.length === 1
    && (path[0] === "enteredAt" || path[0] === "exitedAt");
}

function isWorkflowPromptComplete(
  segments: WorkflowVariableContentSegment[],
  inputNameById: Map<string, string>,
  required: boolean,
) {
  let displayLength = 0;
  let hasContent = false;
  for (const segment of segments) {
    if (segment.type === "text") {
      displayLength += segment.value.length;
      hasContent ||= Boolean(segment.value.trim());
      continue;
    }
    const [scope, inputId] = segment.selector;
    const inputName = inputId ? inputNameById.get(inputId) : undefined;
    if (
      segment.selector.length !== 2
      || scope !== "input"
      || !inputName
    ) {
      return false;
    }
    displayLength += inputName.length + 2;
    hasContent = true;
  }
  return displayLength <= WORKFLOW_LLM_PROMPT_MAX_LENGTH
    && (!required || hasContent);
}

function placeholderContract<TExecutionClass extends WorkflowNodeExecutionClass>(
  executionClass: TExecutionClass,
): WorkflowNodeContractDefinition<"placeholder", TExecutionClass> {
  return {
    currentDraftSchemaVersion: 1,
    draftConfigSchema: WorkflowEmptyNodeConfigSchema,
    draftConfigKeys: getTopLevelSchemaPropertyKeys(WorkflowEmptyNodeConfigSchema),
    executionClass,
    executionConfigSchema: null,
    maturity: "placeholder",
  };
}

function draftReadyContract<TExecutionClass extends WorkflowNodeExecutionClass>(
  executionClass: TExecutionClass,
  currentDraftSchemaVersion: number,
  draftConfigSchema: TSchema,
  executionConfigSchema: TSchema,
): WorkflowNodeContractDefinition<"draft-ready", TExecutionClass> {
  return {
    currentDraftSchemaVersion,
    draftConfigSchema,
    draftConfigKeys: getTopLevelSchemaPropertyKeys(draftConfigSchema),
    executionClass,
    executionConfigSchema,
    maturity: "draft-ready",
  };
}

function runtimeReadyContract<TExecutionClass extends WorkflowNodeExecutionClass>(
  executionClass: TExecutionClass,
  currentDraftSchemaVersion: number,
  draftConfigSchema: TSchema,
  executionConfigSchema: TSchema,
): WorkflowNodeContractDefinition<"runtime-ready", TExecutionClass> {
  return {
    currentDraftSchemaVersion,
    draftConfigSchema,
    draftConfigKeys: getTopLevelSchemaPropertyKeys(draftConfigSchema),
    executionClass,
    executionConfigSchema,
    maturity: "runtime-ready",
  };
}

function getTopLevelSchemaPropertyKeys(schema: TSchema): readonly string[] {
  const keys = new Set<string>();
  collectTopLevelSchemaPropertyKeys(schema, keys);
  return [...keys].sort();
}

function collectTopLevelSchemaPropertyKeys(schema: TSchema, keys: Set<string>) {
  const schemaRecord = schema as TSchema & Record<string, unknown>;
  const properties = schemaRecord.properties;
  if (properties && typeof properties === "object" && !Array.isArray(properties)) {
    Object.keys(properties).forEach(key => keys.add(key));
  }

  for (const keyword of ["allOf", "anyOf", "oneOf"] as const) {
    const branches = schemaRecord[keyword];
    if (!Array.isArray(branches)) continue;
    branches.forEach((branch) => {
      if (branch && typeof branch === "object" && !Array.isArray(branch)) {
        collectTopLevelSchemaPropertyKeys(branch as TSchema, keys);
      }
    });
  }
}
