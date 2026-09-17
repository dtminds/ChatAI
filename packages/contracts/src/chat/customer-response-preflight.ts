import { Type, type Static } from "@sinclair/typebox";

export const CustomerResponseDirectionSchema = Type.Union([
  Type.Literal("provide_response"),
  Type.Literal("request_information"),
  Type.Literal("handle_request"),
]);

export type CustomerResponseDirection = Static<
  typeof CustomerResponseDirectionSchema
>;

export const CustomerResponseAssessmentSchema = Type.Union([
  Type.Object({
    outcome: Type.Literal("no_response_needed"),
    reasonSummary: Type.String({ maxLength: 80, minLength: 1 }),
  }),
  Type.Object({
    direction: CustomerResponseDirectionSchema,
    intentSummary: Type.String({ maxLength: 80, minLength: 1 }),
    outcome: Type.Literal("response_needed"),
  }),
]);

export type CustomerResponseAssessment = Static<
  typeof CustomerResponseAssessmentSchema
>;

export const CustomerResponsePreflightNextActionSchema = Type.Union([
  Type.Literal("wait"),
  Type.Literal("confirm"),
  Type.Literal("start_agent_turn"),
]);

export type CustomerResponsePreflightNextAction = Static<
  typeof CustomerResponsePreflightNextActionSchema
>;

export const CustomerResponsePreflightRequestSchema = Type.Object({
  conversationId: Type.String({ minLength: 1 }),
  triggerMessageId: Type.String({ pattern: "^[0-9]+$" }),
});

export type CustomerResponsePreflightRequest = Static<
  typeof CustomerResponsePreflightRequestSchema
>;

export const CustomerResponseAssistanceActionSchema = Type.Union([
  Type.Literal("activate"),
  Type.Literal("deactivate"),
]);

export const CustomerResponseAssistanceMutationRequestSchema = Type.Object({
  action: CustomerResponseAssistanceActionSchema,
  conversationId: Type.String({ minLength: 1 }),
});

export type CustomerResponseAssistanceMutationRequest = Static<
  typeof CustomerResponseAssistanceMutationRequestSchema
>;

export const CustomerResponseAssistanceMutationResponseSchema = Type.Object({
  active: Type.Boolean(),
  conversationId: Type.String({ minLength: 1 }),
});

export type CustomerResponseAssistanceMutationResponse = Static<
  typeof CustomerResponseAssistanceMutationResponseSchema
>;

export const CustomerResponseAssistanceStateSchema = Type.Object({
  activatedAt: Type.String({ minLength: 1 }),
  activatedByEmployeeId: Type.String({ minLength: 1 }),
  conversationId: Type.String({ minLength: 1 }),
  expiresAt: Type.String({ minLength: 1 }),
  lastActivityAt: Type.String({ minLength: 1 }),
});

export type CustomerResponseAssistanceState = Static<
  typeof CustomerResponseAssistanceStateSchema
>;

export const CustomerResponsePreflightResponseSchema = Type.Object({
  assessment: CustomerResponseAssessmentSchema,
  conversationId: Type.String({ minLength: 1 }),
  evaluatedThroughMessageId: Type.String({ pattern: "^[0-9]+$" }),
  nextAction: CustomerResponsePreflightNextActionSchema,
  source: Type.Union([Type.Literal("model"), Type.Literal("fallback")]),
});

export type CustomerResponsePreflightResponse = Static<
  typeof CustomerResponsePreflightResponseSchema
>;
