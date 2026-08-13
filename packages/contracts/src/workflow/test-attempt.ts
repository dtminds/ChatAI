import { Type, type Static } from "@sinclair/typebox";
import { WorkflowJsonObjectSchema } from "./entry-event.js";

export const WORKFLOW_LLM_TEST_INPUT_MAX_BYTES = 32 * 1024;

export const WorkflowLlmTestAttemptStatusSchema = Type.Union([
  Type.Literal("running"),
  Type.Literal("succeeded"),
  Type.Literal("failed"),
  Type.Literal("timed_out"),
  Type.Literal("cancelled"),
]);

export const WorkflowLlmTestAttemptCreateRequestSchema = Type.Object({
  expectedDraftVersion: Type.Integer({ minimum: 1 }),
  inputValues: WorkflowJsonObjectSchema,
}, { additionalProperties: false });

export const WorkflowLlmTestAttemptSchema = Type.Object({
  attemptId: Type.String({ pattern: "^[1-9][0-9]*$" }),
  completedAt: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
  errorMessage: Type.Union([Type.String(), Type.Null()]),
  executionMode: Type.Literal("mock"),
  expiresAt: Type.String(),
  inputValues: WorkflowJsonObjectSchema,
  nodeId: Type.String({ minLength: 1, maxLength: 128 }),
  output: Type.Union([WorkflowJsonObjectSchema, Type.Null()]),
  status: WorkflowLlmTestAttemptStatusSchema,
  workflowId: Type.String({ pattern: "^[1-9][0-9]*$" }),
}, { additionalProperties: false });

export type WorkflowLlmTestAttemptStatus = Static<
  typeof WorkflowLlmTestAttemptStatusSchema
>;
export type WorkflowLlmTestAttemptCreateRequest = Static<
  typeof WorkflowLlmTestAttemptCreateRequestSchema
>;
export type WorkflowLlmTestAttempt = Static<typeof WorkflowLlmTestAttemptSchema>;
