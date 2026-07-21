import { render, screen, waitFor, within } from "@testing-library/react";
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
      thirdGroupId: "group-501",
    },
  ],
  isLoadingOptions: false,
  optionsError: "",
};

describe("GroupChatReceptionSettingsDialog", () => {
  it("limits selectable managed accounts to five per group", async () => {
    const user = userEvent.setup();

    render(
      <GroupChatReceptionSettingsDialog
        onOpenChange={vi.fn()}
        onSave={vi.fn()}
        open
        state={dialogState}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "群聊接待设置" });
    expect(within(dialog).getByLabelText("群聊 护肤交流群")).toBeInTheDocument();
    expect(within(dialog).getByText("护肤交流群")).toBeInTheDocument();
    expect(
      within(dialog).getByText("选中的企微号可在对应群聊收发消息"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("0/5")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("textbox", { name: "搜索并选择接待账号" }));

    for (let index = 1; index <= 5; index += 1) {
      await user.click(await screen.findByRole("checkbox", { name: `企微号${index}` }));
    }

    expect(within(dialog).getByText("5/5")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "移除 企微号1" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "企微号6" })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: "企微号6" }));
    expect(within(dialog).getByText("5/5")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "移除 企微号1" }));
    expect(within(dialog).getByText("4/5")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("textbox", { name: "搜索并选择接待账号" }));
    expect(screen.getByRole("checkbox", { name: "企微号6" })).toBeEnabled();
  });

  it("shows existing reception accounts and allows removing them", async () => {
    const user = userEvent.setup();
    const state: GroupChatReceptionDialogState = {
      ...dialogState,
      groupChats: [
        {
          ...dialogState.groupChats[0],
          receptionManagedAccounts: [
            { avatarUrl: "", id: "legacy-seat", name: "已配置账号" },
          ],
          receptionSeatCount: 1,
        },
      ],
    };

    render(
      <GroupChatReceptionSettingsDialog
        onOpenChange={vi.fn()}
        onSave={vi.fn()}
        open
        state={state}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "群聊接待设置" });
    expect(within(dialog).getByText("1/5")).toBeInTheDocument();
    expect(within(dialog).getByText("已配置账号")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "移除 已配置账号" }));

    expect(within(dialog).getByText("0/5")).toBeInTheDocument();
    expect(within(dialog).getByText("暂无已选择账号")).toBeInTheDocument();
  });

  it("disables selection changes while reception options are loading", async () => {
    const state: GroupChatReceptionDialogState = {
      ...dialogState,
      groupChats: [
        {
          ...dialogState.groupChats[0],
          receptionManagedAccounts: [
            { avatarUrl: "", id: "legacy-seat", name: "已配置账号" },
          ],
          receptionSeatCount: 1,
        },
      ],
      isLoadingOptions: true,
    };

    render(
      <GroupChatReceptionSettingsDialog
        onOpenChange={vi.fn()}
        onSave={vi.fn()}
        open
        state={state}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "群聊接待设置" });
    expect(
      within(dialog).getByRole("textbox", { name: "搜索并选择接待账号" }),
    ).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "移除 已配置账号" })).toBeDisabled();
    expect(within(dialog).getByText("1/5")).toBeInTheDocument();
  });

  it("saves selected reception seats for the current group chats", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <GroupChatReceptionSettingsDialog
        onOpenChange={onOpenChange}
        onSave={onSave}
        open
        state={dialogState}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "群聊接待设置" });
    await user.click(within(dialog).getByRole("textbox", { name: "搜索并选择接待账号" }));
    await user.click(await screen.findByRole("checkbox", { name: "企微号1" }));
    await user.click(within(dialog).getByRole("button", { name: "确认提交" }));

    expect(onSave).toHaveBeenCalledWith(["501"], ["1"], expect.any(Function));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows single-group save progress with the standard button spinner", async () => {
    const user = userEvent.setup();
    let releaseSave = () => {};
    const onSave = vi.fn(
      () => new Promise<void>((resolve) => {
        releaseSave = resolve;
      }),
    );

    render(
      <GroupChatReceptionSettingsDialog
        onOpenChange={vi.fn()}
        onSave={onSave}
        open
        state={dialogState}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "群聊接待设置" });
    await user.click(within(dialog).getByRole("button", { name: "确认提交" }));

    expect(within(dialog).getByText("0/1")).toBeInTheDocument();
    expect(within(dialog).getByRole("progressbar", { name: "设置进度" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    expect(within(dialog).getByRole("button", { name: "保存中" })).toBeDisabled();

    releaseSave();
    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: "确认提交" })).toBeEnabled();
    });
  });
});
