import { Type, type Static } from "@sinclair/typebox";
import { AgentTurnTriggerSchema } from "./agent-turn.js";

export const AgentTurnMockScenarioSchema = Type.Union([
  Type.Literal("knowledge_reply"),
  Type.Literal("order_reply"),
  Type.Literal("order_binding_approval"),
  Type.Literal("after_sales_approval"),
  Type.Literal("operator_clarification"),
  Type.Literal("tool_failure"),
  Type.Literal("no_reply"),
]);

export type AgentTurnMockScenario = Static<typeof AgentTurnMockScenarioSchema>;

export const StartAgentTurnMockRequestSchema = Type.Object({
  conversationId: Type.String({ minLength: 1 }),
  scenario: AgentTurnMockScenarioSchema,
  stepDelayMs: Type.Optional(Type.Integer({ maximum: 5_000, minimum: 0 })),
  trigger: AgentTurnTriggerSchema,
});

export type StartAgentTurnMockRequest = Static<
  typeof StartAgentTurnMockRequestSchema
>;
