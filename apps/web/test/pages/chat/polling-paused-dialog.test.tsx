import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PollingPausedDialog } from "@/pages/chat/components/polling-paused-dialog";

describe("PollingPausedDialog", () => {
  it("shows other-tab pause copy and the refresh action", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();

    render(<PollingPausedDialog onRefresh={onRefresh} reason="other-tab" />);

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("实时同步已被其他页面占用")).toBeInTheDocument();
    expect(screen.getByTestId("polling-paused-illustration")).toHaveAttribute(
      "src",
      "https://b5.bokr.com.cn/dist/pause_poll.png",
    );

    await user.click(screen.getByRole("button", { name: "刷新页面" }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows cursor-invalidation copy when the pause reason is a sync gap", () => {
    render(<PollingPausedDialog onRefresh={vi.fn()} reason="sync-gap" />);

    expect(screen.getByText("消息同步已暂停")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新页面" })).toBeInTheDocument();
  });
});
