import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AgentTurnEventEnvelope } from "@chatai/contracts";
import { ChatAgentTurnTimeline } from "@/pages/chat/components/chat-agent-turn-timeline";

function envelope(
  sequence: number,
  event: AgentTurnEventEnvelope["event"],
): AgentTurnEventEnvelope {
  return {
    event,
    eventId: `turn-1:${sequence}`,
    occurredAt: `2026-09-16T10:00:0${sequence}.000Z`,
    sequence,
    turnId: "turn-1",
  };
}

describe("ChatAgentTurnTimeline", () => {
  it("appears only after the first real activity arrives", () => {
    const started = envelope(1, {
      trigger: { type: "agent_request" },
      type: "turn.started",
    });
    const { rerender } = render(<ChatAgentTurnTimeline events={[started]} />);

    expect(
      screen.queryByTestId("chat-agent-turn-timeline"),
    ).not.toBeInTheDocument();

    rerender(
      <ChatAgentTurnTimeline
        events={[
          started,
          envelope(2, {
            activity: {
              id: "thinking-1",
              kind: "thinking",
              status: "succeeded",
              summary: "正在核对订单信息",
            },
            type: "activity.updated",
          }),
        ]}
      />,
    );

    expect(screen.getByTestId("chat-agent-turn-timeline")).toHaveClass(
      "chat-agent-turn-timeline-enter",
    );
    expect(screen.getByLabelText("思考")).toBeInTheDocument();
    expect(screen.queryByText("已完成")).not.toBeInTheDocument();
  });

  it("uses shiny text only while an activity is running", () => {
    const started = envelope(1, {
      trigger: { type: "agent_request" },
      type: "turn.started",
    });
    const { rerender } = render(
      <ChatAgentTurnTimeline
        events={[
          started,
          envelope(2, {
            activity: {
              id: "thinking-1",
              kind: "thinking",
              status: "running",
              summary: "正在核对订单信息",
            },
            type: "activity.updated",
          }),
        ]}
      />,
    );

    expect(screen.getByText("正在核对订单信息")).toHaveAttribute(
      "data-slot",
      "shiny-text",
    );

    rerender(
      <ChatAgentTurnTimeline
        events={[
          started,
          envelope(2, {
            activity: {
              id: "thinking-1",
              kind: "thinking",
              status: "succeeded",
              summary: "正在核对订单信息",
            },
            type: "activity.updated",
          }),
        ]}
      />,
    );

    expect(screen.getByText("正在核对订单信息")).not.toHaveAttribute(
      "data-slot",
    );
  });

  it("keeps tool data collapsed until the activity is expanded", async () => {
    const user = userEvent.setup();

    render(
      <ChatAgentTurnTimeline
        events={[
          envelope(1, {
            trigger: { type: "agent_request" },
            type: "turn.started",
          }),
          envelope(2, {
            approvalMode: "human",
            callId: "call-1",
            category: "business",
            input: { orderId: "20984239842348" },
            name: "order.bind",
            summary: "正在绑定客户订单",
            type: "tool_call",
          }),
          envelope(3, {
            actions: [
              { id: "redirect", label: "拒绝并告知其他方式", tone: "quiet" },
              { id: "reject", label: "拒绝", tone: "quiet" },
              { id: "approve", label: "继续", tone: "primary" },
            ],
            callId: "call-1",
            decisionId: "decision-call-1",
            type: "decision.requested",
          }),
          envelope(4, {
            action: "approve",
            callId: "call-1",
            decisionId: "decision-call-1",
            type: "decision.resolved",
          }),
          envelope(5, {
            callId: "call-1",
            output: { bound: true },
            status: "succeeded",
            type: "tool_result",
          }),
        ]}
      />,
    );

    expect(screen.getByText("正在绑定客户订单")).toBeInTheDocument();
    expect(screen.queryByText("绑定订单")).not.toBeInTheDocument();
    expect(screen.queryByText("客服已允许执行")).not.toBeInTheDocument();
    expect(screen.getByLabelText("工具调用")).toBeInTheDocument();
    expect(screen.queryByText("已完成")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("绑定订单原始数据")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "展开绑定订单原始数据" }),
    );

    expect(screen.getByLabelText("绑定订单原始数据")).toHaveTextContent(
      '"orderId": "20984239842348"',
    );
    expect(screen.getByLabelText("绑定订单原始数据")).toHaveTextContent(
      '"bound": true',
    );
  });

  it("shows the finish summary without repeating the drafted reply", () => {
    render(
      <ChatAgentTurnTimeline
        events={[
          envelope(1, {
            trigger: { type: "agent_request" },
            type: "turn.started",
          }),
          envelope(2, {
            approvalMode: "auto",
            callId: "call-finish",
            category: "control",
            input: {
              outcome: "reply",
              reply: {
                segments: [
                  {
                    text: "订单已经完成绑定，可以继续处理后续业务。",
                    type: "text",
                  },
                ],
              },
              summary: "已起草回复",
            },
            name: "turn.finish",
            summary: "已起草回复",
            type: "tool_call",
          }),
          envelope(3, {
            callId: "call-finish",
            output: { outcome: "reply" },
            status: "succeeded",
            type: "tool_result",
          }),
          envelope(4, {
            finishCallId: "call-finish",
            outcome: "reply",
            type: "turn.completed",
          }),
        ]}
      />,
    );

    expect(screen.getByText("已起草回复")).toBeInTheDocument();
    expect(screen.queryByText("生成回复")).not.toBeInTheDocument();
    expect(
      screen.queryByText("订单已经完成绑定，可以继续处理后续业务。"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "展开生成回复原始数据" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the process view read-only", () => {
    render(
      <ChatAgentTurnTimeline
        events={[
          envelope(1, {
            trigger: { type: "agent_request" },
            type: "turn.started",
          }),
          envelope(2, {
            approvalMode: "auto",
            callId: "call-clarification",
            category: "control",
            input: { question: "请选择处理方式" },
            name: "request_kf_clarification",
            summary: "需要客服确认处理方式",
            type: "tool_call",
          }),
        ]}
      />,
    );

    expect(screen.getByLabelText("工具调用")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "继续" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the activity viewport pinned to the latest event", () => {
    const started = envelope(1, {
      trigger: { type: "agent_request" },
      type: "turn.started",
    });
    const thinking = envelope(2, {
      activity: {
        id: "thinking-1",
        kind: "thinking",
        status: "running",
        summary: "正在理解客户的问题",
      },
      type: "activity.updated",
    });
    const { rerender } = render(
      <ChatAgentTurnTimeline events={[started, thinking]} />,
    );
    const viewport = screen.getByTestId("chat-agent-turn-timeline-scroll");
    Object.defineProperty(viewport, "scrollHeight", {
      configurable: true,
      value: 240,
    });

    rerender(
      <ChatAgentTurnTimeline
        events={[
          started,
          thinking,
          envelope(3, {
            approvalMode: "auto",
            callId: "call-1",
            category: "business",
            input: { query: "退款规则" },
            name: "knowledge.search",
            summary: "正在查询知识库",
            type: "tool_call",
          }),
        ]}
      />,
    );

    expect(viewport.scrollTop).toBe(240);
  });

  it("uses a separate panel control to collapse terminal history", async () => {
    const user = userEvent.setup();
    const onCollapse = vi.fn();
    const events = [
      envelope(1, {
        trigger: { type: "agent_request" },
        type: "turn.started",
      }),
      envelope(2, {
        activity: {
          id: "thinking-1",
          kind: "thinking",
          status: "succeeded",
          summary: "正在核对订单信息",
        },
        type: "activity.updated",
      }),
    ];
    render(
      <ChatAgentTurnTimeline events={events} onCollapse={onCollapse} />,
    );

    await user.click(screen.getByRole("button", { name: "收起思考过程" }));
    expect(onCollapse).toHaveBeenCalledOnce();
  });
});
