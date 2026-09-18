import { Type, type Static } from "@sinclair/typebox";
import type { WorkbenchOutgoingMessageSegment } from "./dto.js";

export const AgentTurnTriggerSchema = Type.Union([
  Type.Object({
    messageId: Type.String({ minLength: 1 }),
    type: Type.Literal("customer_message"),
  }),
  Type.Object({
    instruction: Type.Optional(Type.String({ maxLength: 1_000, minLength: 1 })),
    messageId: Type.Optional(Type.String({ minLength: 1 })),
    type: Type.Literal("agent_request"),
  }),
]);

export type AgentTurnTrigger = Static<typeof AgentTurnTriggerSchema>;

export const StartAgentTurnResponseSchema = Type.Object({
  turnId: Type.String({ minLength: 1 }),
});

export type StartAgentTurnResponse = Static<typeof StartAgentTurnResponseSchema>;

export const ResolveAgentTurnDecisionRequestSchema = Type.Union([
  Type.Object({
    action: Type.Literal("approve"),
  }),
  Type.Object({
    action: Type.Literal("reject"),
  }),
  Type.Object({
    action: Type.Literal("redirect"),
    instruction: Type.String({ maxLength: 2_000, minLength: 1 }),
  }),
]);

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
        { id: "redirect"; label: string; tone: "quiet" },
        { id: "reject"; label: string; tone: "quiet" },
        { id: "approve"; label: string; tone: "primary" },
      ];
      callId: string;
      decisionId: string;
      type: "decision.requested";
    }
  | {
      action: "approve" | "redirect" | "reject";
      callId: string;
      decisionId: string;
      instruction?: string;
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

export type AgentTurnSnapshotStatus =
  | "running"
  | "waiting_for_human"
  | "completed"
  | "cancelled"
  | "failed";

export type LatestAgentTurnResponse = {
  events: AgentTurnEventEnvelope[];
  status: AgentTurnSnapshotStatus;
  turnId: string;
} | null;
