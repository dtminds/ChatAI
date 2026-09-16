import { Type, type Static } from "@sinclair/typebox";
import type { WorkbenchOutgoingMessageSegment } from "./dto.js";

export const AgentTurnMockScenarioSchema = Type.Union([
  Type.Literal("knowledge_reply"),
  Type.Literal("order_reply"),
  Type.Literal("after_sales_approval"),
  Type.Literal("operator_clarification"),
  Type.Literal("tool_failure"),
  Type.Literal("no_reply"),
]);

export type AgentTurnMockScenario = Static<typeof AgentTurnMockScenarioSchema>;

export const StartAgentTurnRequestSchema = Type.Object({
  conversationId: Type.String({ minLength: 1 }),
  mock: Type.Optional(
    Type.Object({
      scenario: Type.Optional(AgentTurnMockScenarioSchema),
      stepDelayMs: Type.Optional(Type.Integer({ maximum: 5_000, minimum: 0 })),
    }),
  ),
  trigger: Type.Union([
    Type.Object({
      messageId: Type.String({ minLength: 1 }),
      type: Type.Literal("customer_message"),
    }),
    Type.Object({
      instruction: Type.Optional(Type.String({ maxLength: 1_000, minLength: 1 })),
      messageId: Type.Optional(Type.String({ minLength: 1 })),
      type: Type.Literal("agent_request"),
    }),
  ]),
});

export type StartAgentTurnRequest = Static<typeof StartAgentTurnRequestSchema>;

export const StartAgentTurnResponseSchema = Type.Object({
  turnId: Type.String({ minLength: 1 }),
});

export type StartAgentTurnResponse = Static<typeof StartAgentTurnResponseSchema>;

export const ResolveAgentTurnDecisionRequestSchema = Type.Object({
  action: Type.Union([Type.Literal("approve"), Type.Literal("reject")]),
});

export type ResolveAgentTurnDecisionRequest = Static<
  typeof ResolveAgentTurnDecisionRequestSchema
>;

export const AgentTurnKfClarificationSuggestionSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  instruction: Type.String({ minLength: 1 }),
  label: Type.String({ minLength: 1 }),
});

export const AgentTurnKfClarificationInputSchema = Type.Object({
  question: Type.String({ minLength: 1 }),
  suggestions: Type.Optional(
    Type.Array(AgentTurnKfClarificationSuggestionSchema, { maxItems: 5 }),
  ),
});

export type AgentTurnKfClarificationInput = Static<
  typeof AgentTurnKfClarificationInputSchema
>;

export const ResolveAgentTurnKfClarificationRequestSchema = Type.Union([
  Type.Object({
    suggestionId: Type.String({ minLength: 1 }),
    type: Type.Literal("suggestion"),
  }),
  Type.Object({
    basedOnSuggestionId: Type.Optional(Type.String({ minLength: 1 })),
    instruction: Type.String({ maxLength: 2_000, minLength: 1 }),
    type: Type.Literal("instruction"),
  }),
]);

export type ResolveAgentTurnKfClarificationRequest = Static<
  typeof ResolveAgentTurnKfClarificationRequestSchema
>;

export type AgentTurnTrigger = StartAgentTurnRequest["trigger"];
export type AgentTurnToolCategory = "business" | "control";
export type AgentTurnApprovalMode = "auto" | "human";

export type AgentTurnFinishInput =
  | {
      outcome: "reply";
      reply: {
        segments: WorkbenchOutgoingMessageSegment[];
      };
      summary: string;
    }
  | {
      outcome: "no_reply";
      reason: string;
      summary: string;
    };

export type AgentTurnEvent =
  | {
      trigger: AgentTurnTrigger;
      type: "turn.started";
    }
  | {
      activity: {
        id: string;
        kind: "thinking";
        status: "running" | "succeeded";
        summary: string;
      };
      type: "activity.updated";
    }
  | {
      approvalMode: AgentTurnApprovalMode;
      callId: string;
      category: AgentTurnToolCategory;
      input: unknown;
      name: string;
      summary?: string;
      type: "tool_call";
    }
  | {
      actions: readonly [
        { id: "reject"; label: string; tone: "quiet" },
        { id: "approve"; label: string; tone: "primary" },
      ];
      callId: string;
      decisionId: string;
      type: "decision.requested";
    }
  | {
      action: "approve" | "reject";
      callId: string;
      decisionId: string;
      type: "decision.resolved";
    }
  | {
      callId: string;
      error?: unknown;
      output?: unknown;
      status: "succeeded" | "failed" | "cancelled";
      type: "tool_result";
    }
  | {
      finishCallId: string;
      outcome: AgentTurnFinishInput["outcome"];
      type: "turn.completed";
    }
  | {
      error: {
        code: string;
        message: string;
      };
      type: "turn.failed";
    }
  | {
      reason: "operator_terminated";
      type: "turn.cancelled";
    };

export type AgentTurnEventEnvelope = {
  event: AgentTurnEvent;
  eventId: string;
  occurredAt: string;
  sequence: number;
  turnId: string;
};
