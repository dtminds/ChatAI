import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  GroupChatReceptionSettingsDialog,
  type GroupChatReceptionDialogState,
} from "@/pages/chat/settings/pages/group-chat-reception-settings-dialog";

const availableManagedAccounts = Array.from({ length: 6 }, (_, index) => ({
  avatarUrl: "",
  id: String(index + 1),
  name: `企微号${index + 1}`,
}));

const dialogState: GroupChatReceptionDialogState = {
  availableManagedAccounts,
  groupChats: [
    {
      avatarUrl: "",
      id: "501",
      name: "护肤交流群",
      openingManagedAccount: {
        avatarUrl: "",
        id: "101",
        name: "德瑞可",
      },
      receptionManagedAccounts: [],
      receptionSeatCount: 0,
      selectableReceptionManagedAccounts: [
        {
          avatarUrl: "",
          id: "102",
          name: "念都堂",
        },
      ],
      thirdGroupId: "group-501",
    },
  ],
};

describe("GroupChatReceptionSettingsDialog", () => {
  it("limits selectable managed accounts to five per group", async () => {
    const user = userEvent.setup();

    render(
      <GroupChatReceptionSettingsDialog
        onOpenChange={vi.fn()}
        open
        state={dialogState}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "群聊接待设置" });
    expect(within(dialog).getByText("每个群聊最多选择 5 个")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "选择可接待企微号" }));

    for (let index = 1; index <= 5; index += 1) {
      await user.click(await screen.findByRole("checkbox", { name: `企微号${index}` }));
    }

    expect(within(dialog).getByRole("button", { name: "选择可接待企微号" })).toHaveTextContent(
      "企微号1，企微号2，企微号3，企微号4，企微号5",
    );
    expect(screen.getByRole("checkbox", { name: "企微号6" })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: "企微号6" }));
    expect(within(dialog).getByRole("button", { name: "选择可接待企微号" })).toHaveTextContent(
      "企微号1，企微号2，企微号3，企微号4，企微号5",
    );
  });
});
