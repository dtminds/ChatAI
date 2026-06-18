import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatCustodyStatusBar } from "@/pages/chat/components/chat-custody-status-bar";

describe("ChatCustodyStatusBar", () => {
  it("renders active full custody status with cancel action", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(<ChatCustodyStatusBar onCancel={onCancel} status="active" />);

    expect(screen.getByTestId("chat-custody-status-bar")).toBeInTheDocument();
    expect(screen.getByText("当前为全托管模式")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消托管" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "取消托管" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders retrying and thinking status labels", () => {
    const { rerender } = render(<ChatCustodyStatusBar status="retrying" />);

    expect(screen.getByText("出了点小问题，我正在重试...")).toBeInTheDocument();

    rerender(<ChatCustodyStatusBar status="thinking" />);

    expect(screen.getByText("思考中...")).toBeInTheDocument();
  });

  it("renders exited status with enable custody action", async () => {
    const user = userEvent.setup();
    const onEnable = vi.fn();

    render(<ChatCustodyStatusBar onEnable={onEnable} status="exited" />);

    expect(screen.getByText("当前已退出全托管模式")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开启托管" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "取消托管" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "开启托管" }));

    expect(onEnable).toHaveBeenCalledTimes(1);
  });
});
