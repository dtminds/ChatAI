import type { AgentTurnEventEnvelope } from "@chatai/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentTurnMockService } from "../../../src/modules/chat/agent-turn-mock.service";

describe("AgentTurnMockService", () => {
  let service: AgentTurnMockService | undefined;

  afterEach(() => {
    service?.dispose();
    service = undefined;
    vi.useRealTimers();
  });

  it("streams a deterministic tool loop and finishes with a reply tool call", async () => {
    vi.useFakeTimers();
    service = new AgentTurnMockService();
    const { turnId } = service.start("101", {
      conversationId: "144",
      mock: { scenario: "knowledge_reply", stepDelayMs: 100 },
      trigger: { messageId: "7003", type: "customer_message" },
    });
    const received: AgentTurnEventEnvelope[] = [];
    const subscription = service.subscribe(turnId, "101", 0, (event) => {
      received.push(event);
    });
    received.push(...subscription.events);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(received.map((item) => item.sequence)).toEqual(
      received.map((_, index) => index + 1),
    );
    expect(received.map((item) => item.event.type)).toEqual([
      "turn.started",
      "tool_call",
      "tool_result",
      "tool_call",
      "tool_result",
      "turn.completed",
    ]);
    expect(
      received.some((item) => item.event.type === "activity.updated"),
    ).toBe(false);

    const finishCall = received.find(
      (item) => item.event.type === "tool_call" && item.event.name === "turn.finish",
    );
    expect(finishCall?.event).toMatchObject({
      category: "control",
      input: {
        outcome: "reply",
        reply: {
          segments: [{ type: "text" }],
        },
      },
      type: "tool_call",
    });

  });

  it("pauses a human-approved tool call and resumes the same turn after approval", async () => {
    vi.useFakeTimers();
    service = new AgentTurnMockService();
    const { turnId } = service.start("101", {
      conversationId: "144",
      mock: { scenario: "after_sales_approval", stepDelayMs: 100 },
      trigger: { type: "agent_request" },
    });
    const received: AgentTurnEventEnvelope[] = [];
    const subscription = service.subscribe(turnId, "101", 0, (event) => {
      received.push(event);
    });
    received.push(...subscription.events);

    await vi.advanceTimersByTimeAsync(350);

    const decision = received.find((item) => item.event.type === "decision.requested");
    expect(decision?.event).toMatchObject({
      callId: "call-2",
      decisionId: "decision-call-2",
      type: "decision.requested",
    });
    expect(received.some((item) => item.event.type === "turn.completed")).toBe(false);

    service.resolveDecision(turnId, "101", "decision-call-2", {
      action: "approve",
    });
    await vi.advanceTimersByTimeAsync(500);

    expect(received).toContainEqual(expect.objectContaining({
      event: expect.objectContaining({
        action: "approve",
        decisionId: "decision-call-2",
        type: "decision.resolved",
      }),
    }));
    expect(received.at(-1)?.event).toMatchObject({
      outcome: "reply",
      type: "turn.completed",
    });

  });

  it("cancels an order binding call and replans from the operator instruction", async () => {
    vi.useFakeTimers();
    service = new AgentTurnMockService();
    const { turnId } = service.start("101", {
      conversationId: "144",
      mock: { scenario: "order_binding_approval", stepDelayMs: 100 },
      trigger: { type: "agent_request" },
    });
    const received: AgentTurnEventEnvelope[] = [];
    const subscription = service.subscribe(turnId, "101", 0, (event) => {
      received.push(event);
    });
    received.push(...subscription.events);

    await vi.advanceTimersByTimeAsync(250);

    expect(received).toContainEqual(expect.objectContaining({
      event: expect.objectContaining({
        approvalMode: "human",
        input: { orderId: "20984239842348" },
        name: "order.bind",
        type: "tool_call",
      }),
    }));

    service.resolveDecision(turnId, "101", "decision-call-1", {
      action: "redirect",
      instruction: "先核对客户身份再绑定",
    });

    expect(received.slice(-2).map((item) => item.event)).toEqual([
      expect.objectContaining({
        action: "redirect",
        instruction: "先核对客户身份再绑定",
        type: "decision.resolved",
      }),
      expect.objectContaining({
        callId: "call-1",
        output: {
          instruction: "先核对客户身份再绑定",
          reason: "operator_redirected",
        },
        status: "cancelled",
        type: "tool_result",
      }),
    ]);

    await vi.advanceTimersByTimeAsync(500);

    expect(received).toContainEqual(expect.objectContaining({
      event: expect.objectContaining({
        input: expect.objectContaining({
          outcome: "reply",
          summary: "已根据客服指令重新规划",
        }),
        name: "turn.finish",
        type: "tool_call",
      }),
    }));
    expect(received.at(-1)?.event).toMatchObject({
      outcome: "reply",
      type: "turn.completed",
    });
  });

  it("resumes a clarification tool with the operator's full instruction", async () => {
    vi.useFakeTimers();
    service = new AgentTurnMockService();
    const { turnId } = service.start("101", {
      conversationId: "144",
      mock: { scenario: "operator_clarification", stepDelayMs: 100 },
      trigger: { type: "agent_request" },
    });
    const received: AgentTurnEventEnvelope[] = [];
    const subscription = service.subscribe(turnId, "101", 0, (event) => {
      received.push(event);
    });
    received.push(...subscription.events);

    await vi.advanceTimersByTimeAsync(250);

    const clarificationCall = received.find(
      (item) =>
        item.event.type === "tool_call" &&
        item.event.name === "request_kf_clarification",
    );
    expect(clarificationCall?.event).toMatchObject({
      approvalMode: "auto",
      category: "control",
      type: "tool_call",
    });
    expect(
      received.some((item) => item.event.type === "decision.requested"),
    ).toBe(false);

    service.resolveClarification(turnId, "101", "call-1", {
      instruction: "不要退款，先联系物流确认包裹位置",
      type: "instruction",
    });

    expect(received.at(-1)?.event).toMatchObject({
      callId: "call-1",
      output: {
        instruction: "不要退款，先联系物流确认包裹位置",
        provenance: { type: "free_text" },
      },
      status: "succeeded",
      type: "tool_result",
    });

    await vi.advanceTimersByTimeAsync(500);

    expect(received.at(-1)?.event).toMatchObject({
      outcome: "reply",
      type: "turn.completed",
    });
  });

  it("terminates a turn while clarification is pending", async () => {
    vi.useFakeTimers();
    service = new AgentTurnMockService();
    const { turnId } = service.start("101", {
      conversationId: "144",
      mock: { scenario: "operator_clarification", stepDelayMs: 100 },
      trigger: { type: "agent_request" },
    });
    const received: AgentTurnEventEnvelope[] = [];
    const subscription = service.subscribe(turnId, "101", 0, (event) => {
      received.push(event);
    });
    received.push(...subscription.events);

    await vi.advanceTimersByTimeAsync(250);
    service.cancel(turnId, "101");

    expect(received.slice(-2).map((item) => item.event)).toEqual([
      expect.objectContaining({
        callId: "call-1",
        status: "cancelled",
        type: "tool_result",
      }),
      {
        reason: "operator_terminated",
        type: "turn.cancelled",
      },
    ]);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(received.at(-1)?.event.type).toBe("turn.cancelled");
  });

  it("does not complete a turn after it has been cancelled", async () => {
    vi.useFakeTimers();
    service = new AgentTurnMockService();
    const { turnId } = service.start("101", {
      conversationId: "144",
      mock: { scenario: "no_reply", stepDelayMs: 10 },
      trigger: { type: "agent_request" },
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(service.getLatest("101", "144")).toMatchObject({
      status: "running",
      turnId,
    });

    service.cancel(turnId, "101");
    const cancelledEventCount = service.getLatest(
      "101",
      "144",
    )?.events.length;

    await vi.advanceTimersByTimeAsync(20);

    expect(service.getLatest("101", "144")).toMatchObject({
      status: "cancelled",
      turnId,
    });
    expect(service.getLatest("101", "144")?.events).toHaveLength(
      cancelledEventCount ?? 0,
    );
  });

  it("terminates and releases the previous turn when the conversation starts a new one", async () => {
    vi.useFakeTimers();
    service = new AgentTurnMockService();
    const first = service.start("101", {
      conversationId: "144",
      mock: { scenario: "order_reply", stepDelayMs: 10 },
      trigger: { type: "agent_request" },
    });
    const firstEvents: string[] = [];
    service.subscribe(first.turnId, "101", 1, (envelope) => {
      firstEvents.push(envelope.event.type);
    });

    const second = service.start("101", {
      conversationId: "144",
      mock: { scenario: "knowledge_reply", stepDelayMs: 10 },
      trigger: { type: "agent_request" },
    });

    expect(firstEvents).toEqual(["turn.cancelled"]);
    expect(service.getLatest("101", "144")?.turnId).toBe(second.turnId);
    expect(() => service?.subscribe(first.turnId, "101", 0, () => {})).toThrow(
      "Agent Turn 不存在",
    );

    await vi.advanceTimersByTimeAsync(100);
    expect(firstEvents).toEqual(["turn.cancelled"]);
  });
});
