import { Type, type Static } from "@sinclair/typebox";

export const WorkflowInferenceContentPartSchema = Type.Union([
  Type.Object({
    text: Type.String({ maxLength: 20_000 }),
    type: Type.Literal("text"),
  }, { additionalProperties: false }),
  Type.Object({
    type: Type.Literal("image"),
    url: Type.String({ maxLength: 2_048, minLength: 1 }),
  }, { additionalProperties: false }),
  Type.Object({
    type: Type.Literal("video"),
    url: Type.String({ maxLength: 2_048, minLength: 1 }),
  }, { additionalProperties: false }),
]);

export const WorkflowInferenceMessageListRequestSchema = Type.Object({
  kind: Type.Literal("message-list"),
  messageList: Type.Array(Type.Object({
    content: Type.Array(WorkflowInferenceContentPartSchema, { maxItems: 1_000, minItems: 1 }),
    role: Type.Union([Type.Literal("system"), Type.Literal("user")]),
  }, { additionalProperties: false }), { minItems: 1, maxItems: 2 }),
  modelTarget: Type.Union([
    Type.Object({
      kind: Type.Literal("catalog-model"),
      modelId: Type.String({ minLength: 1, maxLength: 128 }),
    }, { additionalProperties: false }),
    Type.Object({
      endpointId: Type.String({ minLength: 1, maxLength: 128 }),
      kind: Type.Literal("endpoint"),
    }, { additionalProperties: false }),
  ]),
  reasoningEffort: Type.Union([
    Type.Literal("minimal"),
    Type.Literal("low"),
    Type.Literal("medium"),
    Type.Literal("high"),
  ]),
  responseFormat: Type.Union([
    Type.Object({ type: Type.Literal("text") }, { additionalProperties: false }),
    Type.Object({ type: Type.Literal("markdown") }, { additionalProperties: false }),
    Type.Object({
      fields: Type.Array(Type.Object({
        description: Type.String({ maxLength: 200 }),
        name: Type.String({ minLength: 1, maxLength: 15 }),
        type: Type.Union([
          Type.Literal("boolean"),
          Type.Literal("number"),
          Type.Literal("string"),
        ]),
      }, { additionalProperties: false }), { minItems: 1, maxItems: 10 }),
      type: Type.Literal("json"),
    }, { additionalProperties: false }),
  ]),
}, { additionalProperties: false });

export const WorkflowInferenceRequestSchema = WorkflowInferenceMessageListRequestSchema;

export const WorkflowInferenceMessageListResultSchema = Type.Union([
  Type.Object({
    content: Type.String(),
    type: Type.Literal("text"),
  }, { additionalProperties: false }),
  Type.Object({
    type: Type.Literal("json"),
    value: Type.Record(Type.String(), Type.Union([
      Type.Boolean(),
      Type.Number(),
      Type.String(),
    ])),
  }, { additionalProperties: false }),
]);

export const WorkflowAiIntentCompletionValueSchema = Type.Object({
  matchedCode: Type.String({ pattern: "^(?:I(?:[1-9]|10)|fallback)$" }),
  reason: Type.String({ maxLength: 2_000 }),
}, { additionalProperties: false });

export const WorkflowInferenceResultSchema = WorkflowInferenceMessageListResultSchema;

export type WorkflowInferenceMessageListRequest = Static<
  typeof WorkflowInferenceMessageListRequestSchema
>;
export type WorkflowInferenceContentPart = Static<typeof WorkflowInferenceContentPartSchema>;
export type WorkflowInferenceRequest = Static<typeof WorkflowInferenceRequestSchema>;
export type WorkflowInferenceMessageListResult = Static<
  typeof WorkflowInferenceMessageListResultSchema
>;
export type WorkflowAiIntentCompletionValue = Static<
  typeof WorkflowAiIntentCompletionValueSchema
>;
export type WorkflowInferenceResult = Static<typeof WorkflowInferenceResultSchema>;
