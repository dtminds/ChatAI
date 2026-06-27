import type { ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatAgentHostingStatusBar } from "@/pages/chat/components/chat-agent-hosting-status-bar";

vi.mock("border-beam", () => ({
  BorderBeam: ({
    active,
    borderRadius,
    children,
    className,
    size,
  }: {
    active?: boolean;
    borderRadius?: number;
    children: ReactNode;
    className?: string;
    size?: string;
  }) => (
    <div
      className={className}
      data-active={active ? "true" : "false"}
      data-border-beam="true"
      data-border-radius={borderRadius}
      data-size={size}
      data-testid="agent-hosting-border-beam"
    >
      {children}
    </div>
  ),
}));

describe("ChatAgentHostingStatusBar", () => {
  it("renders active full agent mode status with cancel action", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(<ChatAgentHostingStatusBar onCancel={onCancel} status="active" />);

    expect(screen.getByTestId("agent-hosting-border-beam")).toHaveAttribute(
      "data-border-beam",
      "true",
    );
    expect(screen.getByTestId("agent-hosting-border-beam")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByTestId("agent-hosting-border-beam")).toHaveAttribute(
      "data-border-radius",
      "999",
    );
    expect(screen.getByTestId("agent-hosting-border-beam")).toHaveAttribute(
      "data-size",
      "line",
    );
    expect(screen.getByTestId("agent-hosting-border-beam")).toHaveClass("rounded-full");
    expect(screen.getByTestId("chat-agent-hosting-status-bar")).toHaveClass("rounded-full");
    expect(screen.getByTestId("chat-agent-hosting-status-bar")).toHaveClass(
      "border",
    );
    expect(screen.getByTestId("chat-agent-hosting-status-bar")).not.toHaveClass(
      "bg-background/85",
    );
    expect(screen.getByTestId("chat-agent-hosting-status-bar-surface")).toHaveClass(
      "absolute",
      "inset-0",
      "rounded-full",
    );
    expect(screen.getByTestId("chat-agent-hosting-status-bar-content")).toHaveClass(
      "relative",
      "z-10",
    );
    expect(screen.getByTestId("chat-agent-hosting-status-bar")).toBeInTheDocument();
    const statusText = screen.getByLabelText("Agent 已就绪，正在等待用户消息");
    expect(statusText).toHaveAttribute("data-slot", "animated-text-switch");
    expect(statusText).toHaveClass("text-xs", "text-muted-foreground");
    expect(statusText.querySelector("[data-phase='enter']")).toHaveClass("shiny-text");
    expect(screen.getByTestId("dot-matrix-loader")).toHaveAttribute(
      "data-loader-type",
      "circular-8",
    );
    expect(activeLoaderMatrixWidth()).toBeLessThanOrEqual(activeLoaderSize());
    expect(screen.getByRole("button", { name: "取消托管" })).toHaveClass(
      "bg-neutral-strong",
      "text-neutral-strong-foreground",
      "hover:bg-neutral-strong/90",
    );
    expect(screen.getByRole("button", { name: "取消托管" })).not.toHaveClass(
      "bg-primary",
    );

    await user.click(screen.getByRole("button", { name: "取消托管" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders in-progress agent hosting status labels", () => {
    vi.useFakeTimers();
    const { rerender } = render(<ChatAgentHostingStatusBar status="retrying" />);

    let statusText = screen.getByLabelText("出了点小问题，我正在重试");
    expect(statusText).toHaveAttribute("data-slot", "animated-text-switch");
    expect(statusText.querySelector("[data-phase='enter']")).toHaveClass("shiny-text");
    expect(screen.getByTestId("dot-matrix-loader")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消托管" })).toHaveClass(
      "bg-neutral-strong",
      "text-neutral-strong-foreground",
    );
    expect(screen.getByRole("button", { name: "取消托管" })).not.toHaveClass(
      "bg-primary",
    );
    expect(screen.getByTestId("agent-hosting-border-beam")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByTestId("agent-hosting-border-beam")).toHaveAttribute(
      "data-size",
      "pulse-inner",
    );

    rerender(<ChatAgentHostingStatusBar status="thinking" />);

    expect(screen.getByLabelText("Agent 正在查看消息")).toBeInTheDocument();
    expect(
      screen
        .getByLabelText("Agent 正在查看消息")
        .querySelector("[data-phase='enter']"),
    ).toBeNull();
    act(() => {
      vi.advanceTimersByTime(130);
    });
    statusText = screen.getByLabelText("Agent 正在查看消息");
    expect(statusText.querySelector("[data-phase='enter']")).not.toHaveClass("shiny-text");
    expect(
      statusText.querySelectorAll("[data-slot='animated-text-switch-char']").length,
    ).toBeGreaterThan(0);
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(statusText.querySelector("[data-phase='enter']")).toHaveClass("shiny-text");
    expect(screen.getByTestId("dot-matrix-loader")).toBeInTheDocument();
    expect(screen.getByTestId("agent-hosting-border-beam")).toHaveAttribute(
      "data-active",
      "true",
    );
    vi.useRealTimers();
  });

  it("hides exited status", () => {
    render(<ChatAgentHostingStatusBar status="exited" />);

    expect(screen.queryByTestId("chat-agent-hosting-status-bar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("agent-hosting-border-beam")).not.toBeInTheDocument();
  });
});

function activeLoaderSize() {
  return Number.parseFloat(screen.getByLabelText("AI托管中").style.width);
}

function activeLoaderMatrixWidth() {
  const loader = screen.getByLabelText("AI托管中");
  const grid = loader.querySelector(".dmx-grid");
  const dot = grid?.querySelector(".dmx-dot");

  if (!(grid instanceof HTMLElement) || !(dot instanceof HTMLElement)) {
    throw new Error("Expected active dot matrix loader structure");
  }

  return Number.parseFloat(dot.style.width) * 5
    + Number.parseFloat(grid.style.gap) * 4;
}
