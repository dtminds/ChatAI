// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { AgentTurnEvent, AgentTurnEventEnvelope } from "@chatai/contracts";
import {
  reduceAgentTurnMockEnvelope,
  reduceAgentTurnMockState,
  type AgentTurnMockState,
} from "@/pages/chat/components/use-agent-turn-mock";

const initialState: AgentTurnMockState = {
  events: [],
  phase: "running",
  stepStartedAt: 0,
  toolCalls: {},
  toolSummaries: {},
  turnId: "turn-1",
};

describe("agent turn mock reducer", () => {
  it("restarts the current-step timer for new work and human-decision resumes", () => {
    const reduceEnvelope = (
      state: AgentTurnMockState,
      sequence: number,
      occurredAt: string,
      event: AgentTurnEvent,
    ) =>
      reduceAgentTurnMockEnvelope(state, {
        event,
        eventId: `turn-1:${sequence}`,
        occurredAt,
        sequence,
        turnId: "turn-1",
      } satisfies AgentTurnEventEnvelope);

    const thinking = reduceEnvelope(
      initialState,
      1,
      "2026-09-16T10:00:01.000Z",
      {
        activity: {
          id: "thinking-1",
          kind: "thinking",
          status: "running",
          summary: "正在核对订单",
        },
        type: "activity.updated",
      },
    );
    expect(thinking.stepStartedAt).toBe(
      Date.parse("2026-09-16T10:00:01.000Z"),
    );

    const updatedThinking = reduceEnvelope(
      thinking,
      2,
      "2026-09-16T10:00:03.000Z",
      {
        activity: {
          id: "thinking-1",
          kind: "thinking",
          status: "running",
          summary: "正在进一步核对订单",
        },
        type: "activity.updated",
      },
    );
    expect(updatedThinking.stepStartedAt).toBe(thinking.stepStartedAt);

    const waiting = reduceEnvelope(
      {
        ...updatedThinking,
        pendingDecision: { callId: "call-1", decisionId: "decision-1" },
        phase: "awaiting_decision",
      },
      3,
      "2026-09-16T10:00:04.000Z",
      {
        action: "approve",
        callId: "call-1",
        decisionId: "decision-1",
        type: "decision.resolved",
      },
    );
    expect(waiting.stepStartedAt).toBe(
      Date.parse("2026-09-16T10:00:04.000Z"),
    );
  });

  it("projects a human-approved tool call into confirmation", () => {
    const toolCall: AgentTurnEvent = {
      approvalMode: "human",
      callId: "call-1",
      category: "business",
      input: { amount: 99 },
      name: "after_sales.apply",
      summary: "申请退款",
      type: "tool_call",
    };
    const decision: AgentTurnEvent = {
      actions: [
        { id: "redirect", label: "拒绝并告知其他方式", tone: "quiet" },
        { id: "reject", label: "拒绝", tone: "quiet" },
        { id: "approve", label: "继续", tone: "primary" },
      ],
      callId: "call-1",
      decisionId: "decision-call-1",
      type: "decision.requested",
    };

    const afterToolCall = reduceAgentTurnMockState(initialState, toolCall);
    const result = reduceAgentTurnMockState(afterToolCall, decision);

    expect(result).toMatchObject({
      label: "申请退款",
      pendingDecision: {
        callId: "call-1",
        decisionId: "decision-call-1",
      },
      phase: "awaiting_decision",
      toolCalls: {
        "call-1": toolCall,
      },
    });
  });

  it("keeps the finish reply until the turn becomes reply-ready", () => {
    const finishCall: AgentTurnEvent = {
      approvalMode: "auto",
      callId: "call-2",
      category: "control",
      input: {
        outcome: "reply",
        reply: {
          segments: [{ text: "退款申请已经提交", type: "text" }],
        },
        summary: "已起草回复",
      },
      name: "turn.finish",
      summary: "已起草回复",
      type: "tool_call",
    };
    const completed: AgentTurnEvent = {
      finishCallId: "call-2",
      outcome: "reply",
      type: "turn.completed",
    };

    const afterFinishCall = reduceAgentTurnMockState(initialState, finishCall);
    const result = reduceAgentTurnMockState(afterFinishCall, completed);

    expect(result).toMatchObject({
      finishCall: {
        callId: "call-2",
        input: {
          outcome: "reply",
          reply: {
            segments: [{ text: "退款申请已经提交", type: "text" }],
          },
        },
      },
      label: "已起草回复",
      phase: "reply_ready",
    });
  });

  it("keeps clarification separate from tool approval and resumes on its result", () => {
    const clarificationCall: AgentTurnEvent = {
      approvalMode: "auto",
      callId: "call-clarification",
      category: "control",
      input: {
        question: "请选择处理方式",
        suggestions: [
          {
            id: "REFUND",
            instruction: "办理仅退款",
            label: "办理仅退款",
          },
        ],
      },
      name: "request_kf_clarification",
      summary: "需要你确认处理方式",
      type: "tool_call",
    };

    const waiting = reduceAgentTurnMockState(initialState, clarificationCall);
    expect(waiting).toMatchObject({
      clarification: {
        callId: "call-clarification",
        input: { question: "请选择处理方式" },
      },
      phase: "awaiting_clarification",
    });
    expect(waiting.pendingDecision).toBeUndefined();

    const resumed = reduceAgentTurnMockState(waiting, {
      callId: "call-clarification",
      output: { instruction: "先联系物流核实" },
      status: "succeeded",
      type: "tool_result",
    });
    expect(resumed).toMatchObject({
      clarification: undefined,
      phase: "running",
    });

    expect(
      reduceAgentTurnMockState(waiting, {
        reason: "operator_terminated",
        type: "turn.cancelled",
      }),
    ).toMatchObject({ phase: "idle" });
  });
});
