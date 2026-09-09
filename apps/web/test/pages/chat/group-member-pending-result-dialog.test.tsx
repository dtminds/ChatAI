import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GroupMemberPendingResultDialog } from "@/pages/chat/components/group-member-pending-result-dialog";

describe("GroupMemberPendingResultDialog", () => {
  it("keeps kick copy while closing even if kind falls back to pull", () => {
    const { rerender } = render(
      <GroupMemberPendingResultDialog kind="kick" onOpenChange={vi.fn()} open />,
    );

    expect(
      screen.getByRole("alertdialog", { name: /已发起移出群聊请求/ }),
    ).toBeInTheDocument();

    rerender(
      <GroupMemberPendingResultDialog kind="pull" onOpenChange={vi.fn()} open={false} />,
    );

    expect(screen.queryByText(/已发出入群邀请/)).not.toBeInTheDocument();
    const closingDialog = screen.queryByRole("alertdialog");
    if (closingDialog) {
      expect(closingDialog).toHaveAccessibleName(/已发起移出群聊请求/);
    }
  });

  it("keeps pull copy while closing", () => {
    const { rerender } = render(
      <GroupMemberPendingResultDialog kind="pull" onOpenChange={vi.fn()} open />,
    );

    expect(
      screen.getByRole("alertdialog", { name: /已发出入群邀请/ }),
    ).toBeInTheDocument();

    rerender(
      <GroupMemberPendingResultDialog kind="pull" onOpenChange={vi.fn()} open={false} />,
    );

    expect(screen.queryByText(/已发起移出群聊请求/)).not.toBeInTheDocument();
    const closingDialog = screen.queryByRole("alertdialog");
    if (closingDialog) {
      expect(closingDialog).toHaveAccessibleName(/已发出入群邀请/);
    }
  });

  it("shows matching copy when opened again with the other kind", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <GroupMemberPendingResultDialog kind="kick" onOpenChange={onOpenChange} open />,
    );

    await user.click(screen.getByRole("button", { name: "我知道了" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    rerender(
      <GroupMemberPendingResultDialog kind="kick" onOpenChange={onOpenChange} open={false} />,
    );
    rerender(
      <GroupMemberPendingResultDialog kind="pull" onOpenChange={onOpenChange} open />,
    );

    expect(
      screen.getByRole("alertdialog", { name: /已发出入群邀请/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/已发起移出群聊请求/)).not.toBeInTheDocument();
  });
});
