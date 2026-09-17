// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { AgentTurnEvent } from "@chatai/contracts";
import {
  reduceAgentTurnMockEnvelope,
  reduceAgentTurnMockState,
  type AgentTurnMockState,
} from "@/pages/chat/components/use-agent-turn-mock";

const initialState: AgentTurnMockState = {
  events: [],
  phase: "running",
  turnId: "turn-1",
};

describe("agent turn mock reducer", () => {
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

    const afterToolCall = reduceAgentTurnMockEnvelope(initialState, {
      event: toolCall,
      eventId: "turn-1:1",
      occurredAt: "2026-09-17T00:00:00.000Z",
      sequence: 1,
      turnId: "turn-1",
    });
    const result = reduceAgentTurnMockEnvelope(afterToolCall, {
      event: decision,
      eventId: "turn-1:2",
      occurredAt: "2026-09-17T00:00:01.000Z",
      sequence: 2,
      turnId: "turn-1",
    });

    expect(result).toMatchObject({
      label: "申请退款",
      pendingDecision: {
        callId: "call-1",
        decisionId: "decision-call-1",
      },
      phase: "awaiting_decision",
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
