import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatCustodyStatusBar } from "@/pages/chat/components/chat-custody-status-bar";

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
      data-border-radius={borderRadius}
      data-size={size}
      data-testid="custody-border-beam"
    >
      {children}
    </div>
  ),
}));

describe("ChatCustodyStatusBar", () => {
  it("renders active full custody status with cancel action", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(<ChatCustodyStatusBar onCancel={onCancel} status="active" />);

    expect(screen.getByTestId("custody-border-beam")).toHaveAttribute(
      "data-border-radius",
      "999",
    );
    expect(screen.getByTestId("custody-border-beam")).toHaveAttribute(
      "data-size",
      "line",
    );
    expect(screen.getByTestId("custody-border-beam")).toHaveClass("rounded-full");
    expect(screen.getByTestId("chat-custody-status-bar")).toHaveClass("rounded-full");
    expect(screen.getByTestId("chat-custody-status-bar")).not.toHaveClass(
      "bg-background/85",
    );
    expect(screen.getByTestId("chat-custody-status-bar-surface")).toHaveClass(
      "absolute",
      "inset-0",
      "rounded-full",
    );
    expect(screen.getByTestId("chat-custody-status-bar-content")).toHaveClass(
      "relative",
      "z-10",
    );
    expect(screen.getByTestId("chat-custody-status-bar")).toBeInTheDocument();
    expect(screen.getByText("已就绪，正在等待用户消息")).toBeInTheDocument();
    expect(screen.getByText("已就绪，正在等待用户消息")).not.toHaveClass("text-transparent");
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

  it("renders retrying and thinking status labels", () => {
    const { rerender } = render(<ChatCustodyStatusBar status="retrying" />);

    expect(screen.getByText("出了点小问题，我正在重试")).toBeInTheDocument();
    expect(screen.getByText("出了点小问题，我正在重试")).toHaveClass("shiny-text");
    expect(screen.getByTestId("dot-matrix-loader")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消托管" })).toHaveClass(
      "bg-neutral-strong",
      "text-neutral-strong-foreground",
    );
    expect(screen.getByRole("button", { name: "取消托管" })).not.toHaveClass(
      "bg-primary",
    );
    expect(screen.getByTestId("custody-border-beam")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByTestId("custody-border-beam")).toHaveAttribute(
      "data-size",
      "pulse-inner",
    );

    rerender(<ChatCustodyStatusBar status="thinking" />);

    expect(screen.getByText("正在思考")).toBeInTheDocument();
    expect(screen.getByText("正在思考")).toHaveClass("shiny-text");
    expect(screen.getByTestId("dot-matrix-loader")).toBeInTheDocument();
    expect(screen.getByTestId("custody-border-beam")).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  it("hides exited status", () => {
    render(<ChatCustodyStatusBar status="exited" />);

    expect(screen.queryByTestId("chat-custody-status-bar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("custody-border-beam")).not.toBeInTheDocument();
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
