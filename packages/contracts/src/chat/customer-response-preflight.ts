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
    reasoningSummary: Type.String({ maxLength: 80, minLength: 1 }),
  }),
  Type.Object({
    direction: CustomerResponseDirectionSchema,
    reasoningSummary: Type.String({ maxLength: 80, minLength: 1 }),
    outcome: Type.Literal("response_needed"),
  }),
]);

export type CustomerResponseAssessment = Static<
  typeof CustomerResponseAssessmentSchema
>;

export const CustomerResponsePreflightNextActionSchema = Type.Union([
  Type.Literal("wait"),
  Type.Literal("confirm"),
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
