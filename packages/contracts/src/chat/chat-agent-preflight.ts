import { Type, type Static } from "@sinclair/typebox";

export const ChatAgentDirectionSchema = Type.Union([
  Type.Literal("provide_response"),
  Type.Literal("request_information"),
  Type.Literal("handle_request"),
]);

export type ChatAgentDirection = Static<
  typeof ChatAgentDirectionSchema
>;

export const ChatAgentAssessmentSchema = Type.Union([
  Type.Object({
    outcome: Type.Literal("no_response_needed"),
    reasoningSummary: Type.String({ maxLength: 80, minLength: 1 }),
  }),
  Type.Object({
    direction: ChatAgentDirectionSchema,
    reasoningSummary: Type.String({ maxLength: 80, minLength: 1 }),
    outcome: Type.Literal("response_needed"),
  }),
]);

export type ChatAgentAssessment = Static<
  typeof ChatAgentAssessmentSchema
>;

export const ChatAgentPreflightRequestSchema = Type.Object({
  conversationId: Type.String({ minLength: 1 }),
  triggerMessageId: Type.String({ pattern: "^[0-9]+$" }),
});

export type ChatAgentPreflightRequest = Static<
  typeof ChatAgentPreflightRequestSchema
>;

export const ChatAgentPreflightResponseSchema = Type.Object({
  assessment: ChatAgentAssessmentSchema,
  evaluatedThroughMessageId: Type.String({ pattern: "^[0-9]+$" }),
  source: Type.Union([Type.Literal("model"), Type.Literal("fallback")]),
});

export type ChatAgentPreflightResponse = Static<
  typeof ChatAgentPreflightResponseSchema
>;
