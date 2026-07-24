import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GROUP_MEMBER_TYPE } from "@chatai/contracts";
import { describe, expect, it, vi } from "vitest";
import { GroupMembersSidePanel } from "@/pages/chat/components/group-members-side-panel";

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
});
