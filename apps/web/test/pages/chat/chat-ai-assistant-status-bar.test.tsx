import type { ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatAIAssistantStatusBar } from "@/pages/chat/components/chat-ai-assistant-status-bar";
import { useAppearanceStore } from "@/store/appearance-store";

vi.mock("border-beam", () => ({
  BorderBeam: ({
    active,
    borderRadius,
    children,
    size,
    theme,
  }: {
    active?: boolean;
    borderRadius?: number;
    children: ReactNode;
    size?: string;
    theme?: string;
  }) => {
    return (
      <div
        data-active={active ? "true" : "false"}
        data-border-radius={borderRadius}
        data-size={size}
        data-theme={theme}
        data-testid="ai-assistant-border-beam"
      >
        {children}
      </div>
    );
  },
}));

vi.mock("@/components/ui/agent-thinking-orb", () => ({
  AgentThinkingOrb: ({
    speed,
    state,
  }: {
    speed?: number;
    state?: string;
  }) => (
    <span
      aria-hidden="true"
      data-orb-speed={speed}
      data-orb-state={state}
      data-slot="agent-thinking-orb"
    />
  ),
}));

describe("ChatAIAssistantStatusBar", () => {
  beforeEach(() => {
    useAppearanceStore.setState({
      isSystemDarkMode: false,
      themePreference: "light",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for the named customer without rendering a border beam", () => {
    render(
      <ChatAIAssistantStatusBar customerName="客户甲" status="waiting" />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "正在等待 客户甲 的消息",
    );
    expect(screen.getByText("客户甲").tagName).toBe("STRONG");
    expect(
      screen.queryByTestId("ai-assistant-border-beam"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("chat-ai-assistant-status-bar")).toHaveAttribute(
      "data-mode",
      "wait",
    );
  });

  it("shows skipped reasons in a hover tooltip while waiting for the customer", async () => {
    const user = userEvent.setup();

    render(
      <ChatAIAssistantStatusBar
        customerName="客户甲"
        label="已跳过话术推荐"
        reason="客户提及营销计划，会话上下文信息不足"
        status="waiting"
        waitingForCustomer
      />,
    );

    expect(screen.getByText(/已跳过话术推荐/)).toBeInTheDocument();
    expect(screen.getByText("查看原因")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "正在等待 客户甲 的消息",
    );

    await user.hover(screen.getByText("查看原因"));

    expect(
      await screen.findByText("客户提及营销计划，会话上下文信息不足"),
    ).toBeInTheDocument();
  });

  it("uses a pulsing border beam while thinking", () => {
    render(<ChatAIAssistantStatusBar status="thinking" />);

    expect(screen.getByText("AI 正在思考")).toBeInTheDocument();
    expect(screen.getByTestId("ai-assistant-border-beam")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByTestId("ai-assistant-border-beam")).toHaveAttribute(
      "data-size",
      "pulse-inner",
    );
    expect(screen.getByTestId("ai-assistant-border-beam")).toHaveAttribute(
      "data-theme",
      "light",
    );
    expect(screen.getByTestId("chat-ai-assistant-status-bar")).toHaveAttribute(
      "data-mode",
      "on",
    );
    expect(screen.getByLabelText("AI 正在思考")).toHaveAttribute(
      "data-slot",
      "animated-text-switch",
    );
    expect(
      document.querySelector('[data-slot="agent-thinking-orb"]'),
    ).toHaveAttribute("data-orb-state", "connecting");
    expect(screen.getByText("0.0s")).toHaveAttribute(
      "data-slot",
      "elapsed-time",
    );
  });

  it("tracks thinking time without resetting when its description changes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T10:00:00+08:00"));
    const { rerender } = render(
      <ChatAIAssistantStatusBar label="正在查询订单信息" status="thinking" />,
    );

    expect(screen.getByText("0.0s")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1_230);
    });
    expect(screen.getByText("1.2s")).toBeInTheDocument();

    rerender(
      <ChatAIAssistantStatusBar
        label="正在核对退款条件"
        status="thinking"
      />,
    );
    act(() => {
      vi.advanceTimersByTime(61_100);
    });
    expect(screen.getByText("1m 2.3s")).toBeInTheDocument();
  });

  it("switches externally supplied thinking descriptions with animated text", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <ChatAIAssistantStatusBar label="正在查询订单信息" status="thinking" />,
    );

    rerender(
      <ChatAIAssistantStatusBar
        label="正在核对退款条件"
        status="thinking"
      />,
    );

    expect(screen.getByLabelText("正在核对退款条件")).toHaveAttribute(
      "data-slot",
      "animated-text-switch",
    );
    expect(
      screen
        .getByLabelText("正在核对退款条件")
        .querySelector("[data-phase='exit']"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("chat-ai-assistant-status-outgoing-layer"),
    ).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(130);
    });

    expect(
      screen
        .getByLabelText("正在核对退款条件")
        .querySelector("[data-phase='enter']"),
    ).toBeInTheDocument();
  });

  it("renders structured actions while thinking", async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();

    render(
      <ChatAIAssistantStatusBar
        actions={[
          {
            id: "stop",
            label: "停止",
            onSelect: onStop,
            tone: "quiet",
          },
        ]}
        status="thinking"
      />,
    );

    await user.click(screen.getByRole("button", { name: "停止" }));

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(screen.getByText("0.0s")).toBeInTheDocument();
  });

  it("uses the dark beam preset when the page theme is dark", () => {
    useAppearanceStore.setState({ themePreference: "dark" });

    render(<ChatAIAssistantStatusBar status="thinking" />);

    expect(screen.getByTestId("ai-assistant-border-beam")).toHaveAttribute(
      "data-theme",
      "dark",
    );
  });

  it("renders idle loader and confirmation actions", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const onIgnore = vi.fn();

    render(
      <ChatAIAssistantStatusBar
        actions={[
          {
            id: "ignore",
            label: "忽略",
            onSelect: onIgnore,
            tone: "quiet",
          },
          {
            id: "approve",
            label: "批准",
            onSelect: onApprove,
            tone: "primary",
          },
        ]}
        label="确认退款 100 元"
        status="confirmation"
      />,
    );

    expect(screen.getByText("确认退款 100 元")).toBeInTheDocument();
    expect(screen.getByTestId("ai-assistant-border-beam")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByTestId("ai-assistant-border-beam")).toHaveAttribute(
      "data-size",
      "line",
    );
    expect(
      document.querySelector('[data-slot="agent-thinking-orb"]'),
    ).toHaveAttribute("data-orb-state", "breathing");

    await user.click(screen.getByRole("button", { name: "忽略" }));
    await user.click(screen.getByRole("button", { name: "批准" }));

    expect(onIgnore).toHaveBeenCalledTimes(1);
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("slides out and replaces the bar when thinking becomes confirmation", () => {
    const { rerender } = render(
      <ChatAIAssistantStatusBar
        label="正在核对退款条件"
        status="thinking"
      />,
    );

    rerender(
      <ChatAIAssistantStatusBar
        label="确认退款 100 元"
        status="confirmation"
      />,
    );

    expect(
      screen.getByTestId("chat-ai-assistant-status-outgoing-layer"),
    ).toHaveTextContent("正在核对退款条件");
    const incomingLayer = screen.getByTestId(
      "chat-ai-assistant-status-motion-layer",
    );
    expect(incomingLayer).toHaveTextContent("确认退款 100 元");
    expect(incomingLayer).toHaveClass(
      "chat-ai-assistant-status-layer--entering",
    );
    const beams = screen.getAllByTestId("ai-assistant-border-beam");
    expect(beams[0]).toHaveAttribute("data-active", "true");
    expect(beams[0]).toHaveAttribute("data-size", "pulse-inner");
    expect(beams[1]).toHaveAttribute("data-active", "true");
    expect(beams[1]).toHaveAttribute("data-size", "line");
  });

  it("mounts the incoming tone hidden before its delayed entrance", () => {
    const { rerender } = render(
      <ChatAIAssistantStatusBar customerName="客户甲" status="waiting" />,
    );

    rerender(<ChatAIAssistantStatusBar status="thinking" />);

    expect(
      screen.getByTestId("chat-ai-assistant-status-outgoing-layer"),
    ).toHaveTextContent("等待 客户甲 消息");
    const incomingLayer = screen.getByTestId(
      "chat-ai-assistant-status-motion-layer",
    );
    expect(incomingLayer).toHaveTextContent("AI 正在思考");
    expect(incomingLayer).toHaveStyle({
      opacity: "0",
      transform: "translate3d(0, calc(100% + 8px), 0)",
    });
    expect(incomingLayer).toHaveClass(
      "chat-ai-assistant-status-layer--entering",
    );
  });
});
