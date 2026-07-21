import { render, within } from "@testing-library/react";
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
});
