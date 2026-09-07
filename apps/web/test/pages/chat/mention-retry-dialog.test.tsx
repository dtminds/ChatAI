import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MentionRetryDialog } from "@/pages/chat/components/mention-retry-dialog";

describe("MentionRetryDialog", () => {
  it("retries from the initial missing-member copy", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const onCancel = vi.fn();

    render(
      <MentionRetryDialog
        isRefreshing={false}
        onCancel={onCancel}
        onRetry={onRetry}
        state={{
          conversationId: "conv-004",
          displayName: "缪勇飞 群昵称111",
          groupMemberId: "member-006",
          refreshedOnce: false,
        }}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "该成员已退群或群成员数据未更新" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "刷新群成员并重试" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows the still-missing copy after a failed refresh", () => {
    render(
      <MentionRetryDialog
        isRefreshing
        onCancel={vi.fn()}
        onRetry={vi.fn()}
        state={{
          conversationId: "conv-004",
          displayName: "缪勇飞 群昵称111",
          groupMemberId: "member-006",
          refreshedOnce: true,
        }}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "刷新后仍未找到该成员" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新中" })).toBeDisabled();
  });
});
