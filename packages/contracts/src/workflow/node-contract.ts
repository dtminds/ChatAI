import { Type, type Static, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { QUICK_REPLY_ATTACHMENT_MAX_COUNT } from "../chat/quick-reply-content.js";
import { WorkflowBranchConfigSchema } from "./branch.js";
import type { WorkflowNodeKind } from "./dto.js";
import {
  WorkflowStartDraftConfigSchema,
  WorkflowStartConfigSchema,
  WorkflowWaitConfigSchema,
  WorkflowWaitEventConfigSchema,
  WorkflowWaitEventDraftConfigSchema,
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

export const WorkflowDynamicTimeReferenceSchema = Type.Union([
  Type.Object({
    field: Type.Literal("occurredAt"),
    kind: Type.Literal("workflow-trigger"),
  }, { additionalProperties: false }),
  Type.Object({
    field: Type.Literal("enteredAt"),
    kind: Type.Literal("current-node-lifecycle"),
  }, { additionalProperties: false }),
  Type.Object({
    field: Type.Union([Type.Literal("enteredAt"), Type.Literal("exitedAt")]),
    kind: Type.Literal("node-lifecycle"),
    nodeId: Type.String({ minLength: 1, maxLength: 128 }),
  }, { additionalProperties: false }),
  Type.Object({
    kind: Type.Literal("node-output"),
    selector: WorkflowVariableSelectorSchema,
  }, { additionalProperties: false }),
]);

export const WorkflowTimeRangeSchema = Type.Union([
  Type.Object({
    endAt: Type.String({ maxLength: 32 }),
    mode: Type.Literal("fixed"),
    startAt: Type.String({ maxLength: 32 }),
  }, { additionalProperties: false }),
  Type.Object({
    end: WorkflowDynamicTimeReferenceSchema,
    mode: Type.Literal("dynamic"),
    start: WorkflowDynamicTimeReferenceSchema,
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
export type WorkflowVariableContentSegment = Static<typeof WorkflowVariableContentSegmentSchema>;
export type WorkflowMessageDraftConfig = Static<typeof WorkflowMessageDraftConfigSchema>;
export type WorkflowMessageExecutionConfig = Static<typeof WorkflowMessageExecutionConfigSchema>;
export type WorkflowDynamicTimeReference = Static<typeof WorkflowDynamicTimeReferenceSchema>;
export type WorkflowTimeRange = Static<typeof WorkflowTimeRangeSchema>;
export type WorkflowMessageQueryConfig = Static<typeof WorkflowMessageQueryConfigSchema>;
export type WorkflowHandoffDraftConfig = Static<typeof WorkflowHandoffDraftConfigSchema>;
export type WorkflowHandoffExecutionConfig = Static<typeof WorkflowHandoffExecutionConfigSchema>;
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
  "ai-intent": runtimeReadyContract(
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
  "customer-update": placeholderContract("action"),
  end: runtimeReadyContract("core", 1, WorkflowEmptyNodeConfigSchema, WorkflowEmptyNodeConfigSchema),
  handoff: draftReadyContract(
    "action",
    1,
    WorkflowHandoffDraftConfigSchema,
    WorkflowHandoffExecutionConfigSchema,
  ),
  llm: runtimeReadyContract(
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
  "message-query": draftReadyContract(
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
  tag: placeholderContract("action"),
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
  if (kind === "llm") return isWorkflowLlmExecutionConfigComplete(value);
  if (kind === "ai-intent") return isWorkflowAiIntentExecutionConfigComplete(value);
  const schema = getWorkflowNodeContract(kind).executionConfigSchema;
  return schema !== null && Value.Check(schema, value);
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
