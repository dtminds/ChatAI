import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CustomerSidePanel } from "@/pages/chat/components/customer-side-panel";

const defaultProps = {
  groupMembers: [],
  isGroupMembersLoading: false,
  isResizing: false,
  onRefreshGroupMembers: vi.fn(),
  onResizeStart: vi.fn(),
  panelWidth: 375,
};

describe("CustomerSidePanel", () => {
  it("falls back to the permanent basic info tab when sidebar items are missing", () => {
    render(
      <CustomerSidePanel
        {...defaultProps}
        sidebarItems={undefined}
      />,
    );

    const sidePanel = screen.getByRole("complementary", { name: "客户信息栏" });

    expect(within(sidePanel).getByRole("tab", { name: "基础信息" })).toBeInTheDocument();
    expect(within(sidePanel).getAllByRole("tab")).toHaveLength(1);
  });
});
