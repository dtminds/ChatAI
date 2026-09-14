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

  it("waits for the named customer without activating the border beam", () => {
    render(
      <ChatAIAssistantStatusBar customerName="客户甲" status="waiting" />,
    );

    expect(screen.getByText("等待 客户甲 消息")).toBeInTheDocument();
    expect(screen.getByTestId("ai-assistant-border-beam")).toHaveAttribute(
      "data-active",
      "false",
    );
    expect(screen.getByTestId("ai-assistant-border-beam")).toHaveAttribute(
      "data-border-radius",
      "999",
    );
    expect(screen.getByTestId("chat-ai-assistant-status-bar")).toHaveAttribute(
      "data-mode",
      "wait",
    );
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
    ).toHaveAttribute("data-orb-state", "solving");
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

  it("renders an optional action area while thinking", () => {
    render(
      <ChatAIAssistantStatusBar
        status="thinking"
        thinkingActions={<button type="button">停止</button>}
      />,
    );

    expect(screen.getByRole("button", { name: "停止" })).toBeInTheDocument();
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
        label="确认退款 100 元"
        onApprove={onApprove}
        onIgnore={onIgnore}
        status="confirmation"
      />,
    );

    expect(screen.getByLabelText("确认退款 100 元")).toHaveAttribute(
      "data-slot",
      "animated-text-switch",
    );
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
    ).toHaveAttribute("data-orb-state", "searching");

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
