import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GROUP_MEMBER_TYPE } from "@chatai/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMockWorkbenchService,
  resetWorkbenchService,
  setWorkbenchService,
} from "@/pages/chat/api/workbench-service";
import { GroupMembersSidePanel } from "@/pages/chat/components/group-members-side-panel";
import type { Account } from "@/pages/chat/chat-types";

afterEach(() => {
  resetWorkbenchService();
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

  it("waits 400ms before loading a member's friend relations", async () => {
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
    expect(getCustomerSeatRelations).toHaveBeenCalledWith("external-customer-003");
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
});
