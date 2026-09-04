import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GROUP_MEMBER_TYPE } from "@chatai/contracts";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMockWorkbenchService,
  resetWorkbenchService,
  setWorkbenchService,
} from "@/pages/chat/api/workbench-service";
import { GroupMembersSidePanel } from "@/pages/chat/components/group-members-side-panel";
import type { Account } from "@/pages/chat/chat-types";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

afterEach(() => {
  resetWorkbenchService();
  vi.mocked(toast.error).mockReset();
  vi.mocked(toast.success).mockReset();
  vi.useRealTimers();
});

describe("GroupMembersSidePanel", () => {
  it("shows shadow group account identities beside the matching members", () => {
    render(
      <GroupMembersSidePanel
        groupMembers={[
          {
            avatarUrl: "",
            displayName: "群主兼开通成员",
            id: "opening-seat-001",
            isOpeningAccount: true,
            type: GROUP_MEMBER_TYPE.OWNER,
          },
          {
            avatarUrl: "",
            displayName: "接待成员",
            id: "reception-seat-001",
            isReceptionAccount: true,
            type: GROUP_MEMBER_TYPE.NORMAL,
          },
          {
            avatarUrl: "",
            displayName: "普通成员",
            id: "member-001",
            type: GROUP_MEMBER_TYPE.NORMAL,
          },
        ]}
        isLoading={false}
        onRefresh={vi.fn()}
      />,
    );

    const openingMemberRow = document.querySelector(
      '[data-group-member-id="opening-seat-001"]',
    );
    const receptionMemberRow = document.querySelector(
      '[data-group-member-id="reception-seat-001"]',
    );
    const regularMemberRow = document.querySelector(
      '[data-group-member-id="member-001"]',
    );

    expect(openingMemberRow).not.toBeNull();
    expect(within(openingMemberRow as HTMLElement).getByText("群主")).toBeInTheDocument();
    expect(within(openingMemberRow as HTMLElement).getByText("开通号")).toBeInTheDocument();
    expect(
      within(openingMemberRow as HTMLElement).queryByText("接待号"),
    ).not.toBeInTheDocument();

    expect(receptionMemberRow).not.toBeNull();
    expect(
      within(receptionMemberRow as HTMLElement).getByText("接待号"),
    ).toBeInTheDocument();
    expect(
      within(receptionMemberRow as HTMLElement).queryByText("开通号"),
    ).not.toBeInTheDocument();

    expect(regularMemberRow).not.toBeNull();
    expect(
      within(regularMemberRow as HTMLElement).queryByText("开通号"),
    ).not.toBeInTheDocument();
    expect(
      within(regularMemberRow as HTMLElement).queryByText("接待号"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "查看 群主兼开通成员 的好友关系",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "查看 接待成员 的好友关系",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "查看 普通成员 的好友关系" }),
    ).toBeInTheDocument();
  });

  it("filters members while search is open and restores the full list when closed", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();

    render(
      <GroupMembersSidePanel
        groupMembers={[
          {
            avatarUrl: "",
            displayName: "群主花花",
            id: "owner-001",
            type: GROUP_MEMBER_TYPE.OWNER,
          },
          {
            avatarUrl: "",
            displayName: "饭饭",
            id: "member-001",
            type: GROUP_MEMBER_TYPE.NORMAL,
          },
          {
            avatarUrl: "",
            displayName: "小林",
            id: "member-002",
            type: GROUP_MEMBER_TYPE.NORMAL,
          },
        ]}
        isLoading={false}
        onRefresh={onRefresh}
      />,
    );

    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "搜索群成员" }));

    const searchInput = screen.getByRole("textbox", { name: "搜索群成员" });
    expect(searchInput).toHaveFocus();
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新群成员" })).toBeInTheDocument();

    await user.type(searchInput, "饭");

    expect(
      document.querySelector('[data-group-member-id="member-001"]'),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-group-member-id="owner-001"]'),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-group-member-id="member-002"]'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "关闭搜索" }));

    expect(screen.queryByRole("textbox", { name: "搜索群成员" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
    expect(
      document.querySelector('[data-group-member-id="owner-001"]'),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-group-member-id="member-001"]'),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-group-member-id="member-002"]'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "搜索群成员" }));
    expect(screen.getByRole("textbox", { name: "搜索群成员" })).toHaveValue("");
  });

  it("loads visible-seat friend relations on hover and starts a conversation", async () => {
    const user = userEvent.setup();
    const getCustomerSeatRelations = vi.fn().mockResolvedValue({
      items: [
        {
          bindId: "bind-001",
          bindStatus: 1,
          bindType: 1,
          lastMessageTime: 1_779_600_000_000,
          seatAvatar: "",
          seatId: "seat-001",
          seatName: "销售一号",
          thirdUserId: "seat-user-001",
        },
      ],
    });
    setWorkbenchService({
      ...createMockWorkbenchService(),
      getCustomerSeatRelations,
    });
    const onStartChat = vi.fn();

    render(
      <GroupMembersSidePanel
        accounts={[
          {
            id: "seat-001",
            loginStatus: "online",
            name: "销售一号",
            takenOverEmployeeId: "employee-001",
          } as Account,
        ]}
        currentEmployeeId="employee-001"
        groupMembers={[
          {
            avatarUrl: "https://example.com/customer.png",
            displayName: "客户甲",
            id: "external-customer-001",
            type: GROUP_MEMBER_TYPE.NORMAL,
          },
        ]}
        isLoading={false}
        onRefresh={vi.fn()}
        onStartChat={onStartChat}
      />,
    );

    const memberTrigger = screen.getByRole("button", {
      name: "查看 客户甲 的好友关系",
    });
    expect(getCustomerSeatRelations).not.toHaveBeenCalled();

    await user.hover(memberTrigger);

    const continueButton = await screen.findByRole("button", {
      name: "向 销售一号 继续会话",
    });
    expect(getCustomerSeatRelations).toHaveBeenCalledWith("external-customer-001");
    expect(screen.queryByText(/已是好友/)).not.toBeInTheDocument();
    expect(screen.getAllByText("客户甲")).toHaveLength(2);

    await user.click(continueButton);

    expect(onStartChat).toHaveBeenCalledWith({
      customerAvatar: "https://example.com/customer.png",
      customerName: "客户甲",
      realName: "",
      seatId: "seat-001",
      thirdExternalUserId: "external-customer-001",
    });
  });

  it("allows viewing an existing conversation without taking over the seat", async () => {
    const user = userEvent.setup();
    const getCustomerSeatRelations = vi.fn().mockResolvedValue({
      items: [
        {
          bindId: "bind-existing",
          bindStatus: 1,
          bindType: 1,
          lastMessageTime: 1_779_600_000_000,
          seatAvatar: "",
          seatId: "seat-existing",
          seatName: "销售一号",
          thirdUserId: "seat-user-existing",
        },
        {
          bindId: "bind-new",
          bindStatus: 1,
          bindType: 1,
          seatAvatar: "",
          seatId: "seat-new",
          seatName: "销售二号",
          thirdUserId: "seat-user-new",
        },
      ],
    });
    setWorkbenchService({
      ...createMockWorkbenchService(),
      getCustomerSeatRelations,
    });
    const onStartChat = vi.fn();

    render(
      <GroupMembersSidePanel
        accounts={[
          {
            id: "seat-existing",
            loginStatus: "online",
            name: "销售一号",
          } as Account,
          {
            id: "seat-new",
            loginStatus: "online",
            name: "销售二号",
          } as Account,
        ]}
        currentEmployeeId="employee-001"
        groupMembers={[
          {
            avatarUrl: "",
            displayName: "客户乙",
            id: "external-customer-002",
            type: GROUP_MEMBER_TYPE.NORMAL,
          },
        ]}
        isLoading={false}
        onRefresh={vi.fn()}
        onStartChat={onStartChat}
      />,
    );

    await user.hover(
      screen.getByRole("button", { name: "查看 客户乙 的好友关系" }),
    );

    const continueButton = await screen.findByRole("button", {
      name: "向 销售一号 继续会话",
    });
    expect(continueButton).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "销售二号 不可发起会话" }),
    ).toBeDisabled();

    await user.click(continueButton);

    expect(onStartChat).toHaveBeenCalledWith({
      customerAvatar: "",
      customerName: "客户乙",
      realName: "",
      seatId: "seat-existing",
      thirdExternalUserId: "external-customer-002",
    });
  });

  it("opens after 400ms and waits another 250ms before requesting relations", async () => {
    vi.useFakeTimers();
    const getCustomerSeatRelations = vi.fn().mockResolvedValue({ items: [] });
    setWorkbenchService({
      ...createMockWorkbenchService(),
      getCustomerSeatRelations,
    });

    render(
      <GroupMembersSidePanel
        groupMembers={[
          {
            avatarUrl: "",
            displayName: "客户丙",
            id: "external-customer-003",
            type: GROUP_MEMBER_TYPE.NORMAL,
          },
        ]}
        isLoading={false}
        onRefresh={vi.fn()}
      />,
    );

    fireEvent.pointerEnter(
      screen.getByRole("button", { name: "查看 客户丙 的好友关系" }),
      { pointerType: "mouse" },
    );

    await act(async () => {
      vi.advanceTimersByTime(399);
    });
    expect(getCustomerSeatRelations).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(getCustomerSeatRelations).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(249);
    });
    expect(getCustomerSeatRelations).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(getCustomerSeatRelations).toHaveBeenCalledWith("external-customer-003");
  });

  it("opens member actions from the keyboard and activates the chat action", async () => {
    const user = userEvent.setup();
    const getCustomerSeatRelations = vi.fn().mockResolvedValue({
      items: [
        {
          bindId: "bind-keyboard",
          bindStatus: 1,
          bindType: 1,
          seatAvatar: "",
          seatId: "seat-001",
          seatName: "销售一号",
          thirdUserId: "seat-user-001",
        },
      ],
    });
    setWorkbenchService({
      ...createMockWorkbenchService(),
      getCustomerSeatRelations,
    });
    const onStartChat = vi.fn();

    render(
      <GroupMembersSidePanel
        accounts={[
          {
            id: "seat-001",
            loginStatus: "online",
            name: "销售一号",
            takenOverEmployeeId: "employee-001",
          } as Account,
        ]}
        currentEmployeeId="employee-001"
        groupMembers={[
          {
            avatarUrl: "",
            displayName: "键盘客户",
            id: "external-keyboard-customer",
            type: GROUP_MEMBER_TYPE.NORMAL,
          },
        ]}
        isLoading={false}
        onRefresh={vi.fn()}
        onStartChat={onStartChat}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "查看 键盘客户 的好友关系",
    });
    trigger.focus();
    await user.keyboard("{Enter}");

    const startChatButton = await screen.findByRole("button", {
      name: "向 销售一号 发起会话",
    });
    expect(getCustomerSeatRelations).toHaveBeenCalledWith(
      "external-keyboard-customer",
    );

    startChatButton.focus();
    await user.keyboard("{Enter}");

    expect(onStartChat).toHaveBeenCalledWith(
      expect.objectContaining({
        seatId: "seat-001",
        thirdExternalUserId: "external-keyboard-customer",
      }),
    );
  });

  it("opens member actions from a touch pointer", async () => {
    const user = userEvent.setup();
    const getCustomerSeatRelations = vi.fn().mockResolvedValue({ items: [] });
    setWorkbenchService({
      ...createMockWorkbenchService(),
      getCustomerSeatRelations,
    });

    render(
      <GroupMembersSidePanel
        groupMembers={[
          {
            avatarUrl: "",
            displayName: "触屏客户",
            id: "external-touch-customer",
            type: GROUP_MEMBER_TYPE.NORMAL,
          },
        ]}
        isLoading={false}
        onRefresh={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "查看 触屏客户 的好友关系",
    });
    await user.pointer([
      { keys: "[TouchA>]", target: trigger },
      { keys: "[/TouchA]", target: trigger },
    ]);

    expect(await screen.findByText("暂未添加为好友")).toBeInTheDocument();
    expect(getCustomerSeatRelations).toHaveBeenCalledWith(
      "external-touch-customer",
    );
  });

  it("shows the same not-added state when no visible seat has a friend relation", async () => {
    const user = userEvent.setup();
    const getCustomerSeatRelations = vi.fn().mockResolvedValue({ items: [] });
    setWorkbenchService({
      ...createMockWorkbenchService(),
      getCustomerSeatRelations,
    });

    render(
      <GroupMembersSidePanel
        groupMembers={[
          {
            avatarUrl: "",
            displayName: "客户乙",
            id: "external-customer-002",
            type: GROUP_MEMBER_TYPE.NORMAL,
          },
        ]}
        isLoading={false}
        onRefresh={vi.fn()}
      />,
    );

    await user.hover(
      screen.getByRole("button", { name: "查看 客户乙 的好友关系" }),
    );

    expect(await screen.findByText("暂未添加为好友")).toBeInTheDocument();
    expect(getCustomerSeatRelations).toHaveBeenCalledWith("external-customer-002");
  });

  it("opens the add-members dialog before search and refresh", async () => {
    const user = userEvent.setup();
    const getSeatFriends = vi.fn().mockResolvedValue({
      items: [
        createSeatFriend("external-xiaoming", "小明"),
        createSeatFriend("member-001", "已在群里"),
        createSeatFriend("external-wang", "王二"),
      ],
    });
    const pullGroupMembers = vi.fn().mockResolvedValue({ conversationId: "conv-004" });
    const onRefresh = vi.fn();
    setWorkbenchService({
      ...createMockWorkbenchService(),
      getSeatFriends,
      pullGroupMembers,
    });

    render(
      <GroupMembersSidePanel
        conversationId="conv-004"
        groupMembers={[
          {
            avatarUrl: "",
            displayName: "普通成员",
            id: "member-001",
            type: GROUP_MEMBER_TYPE.NORMAL,
          },
        ]}
        isLoading={false}
        onRefresh={onRefresh}
        seatId="seat-001"
      />,
    );

    const actions = screen.getByRole("button", { name: "添加群成员" }).parentElement;
    expect(actions).not.toBeNull();
    const actionButtons = within(actions as HTMLElement).getAllByRole("button");
    expect(actionButtons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "添加群成员",
      "搜索群成员",
      "刷新群成员",
    ]);

    await user.click(screen.getByRole("button", { name: "添加群成员" }));

    expect(await screen.findByRole("heading", { name: "添加群成员" })).toBeInTheDocument();
    expect(getSeatFriends).toHaveBeenCalledWith("seat-001");
    expect(await screen.findByRole("checkbox", { name: "选择 小明" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "选择 王二" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "选择 已在群里" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认" })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: "选择 小明" }));

    expect(screen.getByRole("region", { name: "已选成员" })).toHaveTextContent("小明");
    expect(screen.getByRole("button", { name: "确认" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "移除 小明" }));
    expect(screen.getByRole("region", { name: "已选成员" })).not.toHaveTextContent("小明");
    expect(screen.getByRole("button", { name: "确认" })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: "选择 王二" }));
    await user.click(screen.getByRole("button", { name: "确认" }));

    await waitFor(() => {
      expect(pullGroupMembers).toHaveBeenCalledWith("conv-004", {
        contactThirdUserIds: ["external-wang"],
      });
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("已添加");
    expect(screen.queryByRole("heading", { name: "添加群成员" })).not.toBeInTheDocument();
  });

  it("keeps the add-members dialog open when inviting members fails", async () => {
    const user = userEvent.setup();
    const getSeatFriends = vi.fn().mockResolvedValue({
      items: [createSeatFriend("external-wang", "王二")],
    });
    const pullGroupMembers = vi.fn().mockRejectedValue(new Error("该客户不是好友"));
    const onRefresh = vi.fn();
    setWorkbenchService({
      ...createMockWorkbenchService(),
      getSeatFriends,
      pullGroupMembers,
    });

    render(
      <GroupMembersSidePanel
        conversationId="conv-004"
        groupMembers={[]}
        isLoading={false}
        onRefresh={onRefresh}
        seatId="seat-001"
      />,
    );

    await user.click(screen.getByRole("button", { name: "添加群成员" }));
    await user.click(await screen.findByRole("checkbox", { name: "选择 王二" }));
    await user.click(screen.getByRole("button", { name: "确认" }));

    await waitFor(() => {
      expect(pullGroupMembers).toHaveBeenCalledWith("conv-004", {
        contactThirdUserIds: ["external-wang"],
      });
    });
    expect(onRefresh).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("该客户不是好友");
    expect(screen.getByRole("heading", { name: "添加群成员" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认" })).toBeEnabled();
  });

  it("searches add-member candidates from the current seat", async () => {
    const user = userEvent.setup();
    const getSeatFriends = vi.fn().mockResolvedValue({
      items: [
        createSeatFriend("external-xiaoming", "小明"),
        createSeatFriend("external-wang", "王二"),
      ],
    });
    const getEnterpriseMembers = vi.fn().mockResolvedValue({
      items: [
        {
          avatarUrl: "",
          displayName: "王五",
          thirdUserId: "seat-user-wang",
        },
      ],
    });
    setWorkbenchService({
      ...createMockWorkbenchService(),
      getSeatFriends,
      getEnterpriseMembers,
    });

    render(
      <GroupMembersSidePanel
        groupMembers={[]}
        isLoading={false}
        onRefresh={vi.fn()}
        seatId="seat-001"
      />,
    );

    await user.click(screen.getByRole("button", { name: "添加群成员" }));
    expect(await screen.findByRole("checkbox", { name: "选择 小明" })).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "搜索" }), "王");

    expect(await screen.findByRole("checkbox", { name: "选择 王二" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "选择 小明" })).not.toBeInTheDocument();
    expect(getSeatFriends).toHaveBeenCalledOnce();
    expect(getSeatFriends).toHaveBeenCalledWith("seat-001");
    expect(getEnterpriseMembers).toHaveBeenCalledOnce();
    expect(screen.getByRole("checkbox", { name: "选择 王五" })).toBeInTheDocument();
  });

  it("lets owners remove regular members from the detail card", async () => {
    const user = userEvent.setup();

    render(
      <GroupMembersSidePanel
        currentSeatThirdUserId="seat-owner"
        groupMembers={[
          {
            avatarUrl: "",
            displayName: "群主席位",
            id: "seat-owner",
            isReceptionAccount: true,
            type: GROUP_MEMBER_TYPE.OWNER,
          },
          {
            avatarUrl: "https://example.com/xiaoming.png",
            displayName: "小明",
            id: "member-xiaoming",
            type: GROUP_MEMBER_TYPE.NORMAL,
          },
        ]}
        isLoading={false}
        onRefresh={vi.fn()}
      />,
    );

    await user.hover(
      screen.getByRole("button", { name: "查看 小明 的好友关系" }),
    );

    await user.click(
      await screen.findByRole("button", { name: "将 小明 移出群聊" }),
    );

    expect(screen.getByRole("alertdialog")).toHaveTextContent("小明");
    expect(screen.getByText("该操作无法撤回，请谨慎操作")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("kicks the selected group member and refreshes the list", async () => {
    const user = userEvent.setup();
    const kickGroupMember = vi.fn().mockResolvedValue({ conversationId: "conv-004" });
    const onRefresh = vi.fn();
    setWorkbenchService({
      ...createMockWorkbenchService(),
      kickGroupMember,
    });

    render(
      <GroupMembersSidePanel
        conversationId="conv-004"
        currentSeatThirdUserId="seat-owner"
        groupMembers={[
          {
            avatarUrl: "",
            displayName: "群主席位",
            id: "seat-owner",
            isReceptionAccount: true,
            type: GROUP_MEMBER_TYPE.OWNER,
          },
          {
            avatarUrl: "",
            displayName: "小明",
            id: "member-xiaoming",
            type: GROUP_MEMBER_TYPE.NORMAL,
          },
        ]}
        isLoading={false}
        onRefresh={onRefresh}
      />,
    );

    await user.hover(screen.getByRole("button", { name: "查看 小明 的好友关系" }));
    await user.click(await screen.findByRole("button", { name: "将 小明 移出群聊" }));
    await user.click(screen.getByRole("button", { name: "确定" }));

    await waitFor(() => {
      expect(kickGroupMember).toHaveBeenCalledWith("conv-004", {
        kickOutThirdUserId: "member-xiaoming",
      });
    });
    expect(toast.success).toHaveBeenCalled();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("keeps the remove dialog open when kicking a member fails", async () => {
    const user = userEvent.setup();
    const kickGroupMember = vi.fn().mockRejectedValue(new Error("操作过于频繁，请稍后再试~"));
    const onRefresh = vi.fn();
    setWorkbenchService({
      ...createMockWorkbenchService(),
      kickGroupMember,
    });

    render(
      <GroupMembersSidePanel
        conversationId="conv-004"
        currentSeatThirdUserId="seat-owner"
        groupMembers={[
          {
            avatarUrl: "",
            displayName: "群主席位",
            id: "seat-owner",
            isReceptionAccount: true,
            type: GROUP_MEMBER_TYPE.OWNER,
          },
          {
            avatarUrl: "",
            displayName: "小明",
            id: "member-xiaoming",
            type: GROUP_MEMBER_TYPE.NORMAL,
          },
        ]}
        isLoading={false}
        onRefresh={onRefresh}
      />,
    );

    await user.hover(screen.getByRole("button", { name: "查看 小明 的好友关系" }));
    await user.click(await screen.findByRole("button", { name: "将 小明 移出群聊" }));
    await user.click(screen.getByRole("button", { name: "确定" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("操作过于频繁，请稍后再试~");
    });
    expect(onRefresh).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("hides remove when the current seat is not an owner or admin", async () => {
    const user = userEvent.setup();

    render(
      <GroupMembersSidePanel
        currentSeatThirdUserId="seat-normal"
        groupMembers={[
          {
            avatarUrl: "",
            displayName: "接待席位",
            id: "seat-normal",
            isReceptionAccount: true,
            type: GROUP_MEMBER_TYPE.NORMAL,
          },
          {
            avatarUrl: "",
            displayName: "小明",
            id: "member-xiaoming",
            type: GROUP_MEMBER_TYPE.NORMAL,
          },
        ]}
        isLoading={false}
        onRefresh={vi.fn()}
      />,
    );

    await user.hover(
      screen.getByRole("button", { name: "查看 小明 的好友关系" }),
    );

    expect(await screen.findByText("暂未添加为好友")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "将 小明 移出群聊" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer remove for admins even when the current seat can kick", async () => {
    const user = userEvent.setup();

    render(
      <GroupMembersSidePanel
        currentSeatThirdUserId="seat-owner"
        groupMembers={[
          {
            avatarUrl: "",
            displayName: "群主席位",
            id: "seat-owner",
            isReceptionAccount: true,
            type: GROUP_MEMBER_TYPE.OWNER,
          },
          {
            avatarUrl: "",
            displayName: "管理员甲",
            id: "member-admin",
            type: GROUP_MEMBER_TYPE.ADMIN,
          },
        ]}
        isLoading={false}
        onRefresh={vi.fn()}
      />,
    );

    await user.hover(
      screen.getByRole("button", { name: "查看 管理员甲 的好友关系" }),
    );

    expect(await screen.findByText("暂未添加为好友")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "将 管理员甲 移出群聊" }),
    ).not.toBeInTheDocument();
  });

  it("groups add-member candidates into employees and members without tabs", async () => {
    const user = userEvent.setup();
    const getSeatFriends = vi.fn().mockResolvedValue({
      items: [createSeatFriend("external-xiaoming", "小明")],
    });
    const getEnterpriseMembers = vi.fn().mockResolvedValue({
      items: [
        {
          avatarUrl: "",
          displayName: "花花",
          thirdUserId: "seat-user-hua",
        },
        {
          avatarUrl: "",
          displayName: "饭饭",
          thirdUserId: "seat-user-fan",
        },
        {
          avatarUrl: "",
          displayName: "当前席位",
          thirdUserId: "seat-user-current",
        },
      ],
    });
    setWorkbenchService({
      ...createMockWorkbenchService(),
      getSeatFriends,
      getEnterpriseMembers,
    });

    render(
      <GroupMembersSidePanel
        conversationId="conv-004"
        currentSeatThirdUserId="seat-user-current"
        groupMembers={[
          {
            avatarUrl: "",
            displayName: "饭饭",
            id: "seat-user-fan",
            type: GROUP_MEMBER_TYPE.NORMAL,
          },
        ]}
        isLoading={false}
        onRefresh={vi.fn()}
        seatId="seat-001"
      />,
    );

    await user.click(screen.getByRole("button", { name: "添加群成员" }));

    expect(await screen.findByRole("button", { name: "展开成员" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起客户" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "选择 小明" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "选择 花花" })).not.toBeInTheDocument();
    expect(getEnterpriseMembers).toHaveBeenCalledOnce();
    expect(getSeatFriends).toHaveBeenCalledWith("seat-001");

    await user.click(screen.getByRole("button", { name: "展开成员" }));

    expect(screen.getByRole("checkbox", { name: "选择 花花" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "选择 饭饭" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "选择 当前席位" })).not.toBeInTheDocument();
  });
});

function createSeatFriend(thirdExternalUserId: string, displayName: string) {
  return {
    avatarUrl: "",
    displayName,
    thirdExternalUserId,
  };
}
