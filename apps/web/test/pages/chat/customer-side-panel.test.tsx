import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    window.localStorage.clear();
  });

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

  it("collapses custom tabs to the first row and expands them on demand", async () => {
    const user = userEvent.setup();

    render(
      <CustomerSidePanel
        {...defaultProps}
        sidebarItems={Array.from({ length: 5 }, (_, index) => ({
          id: String(index + 1),
          name: `页面${index + 1}`,
          sort: index + 1,
          status: "active",
          url: `https://example.com/page-${index + 1}`,
        }))}
      />,
    );

    const sidePanel = screen.getByRole("complementary", { name: "客户信息栏" });

    expect(within(sidePanel).getByRole("tab", { name: "基础信息" })).toBeInTheDocument();
    expect(within(sidePanel).getByRole("tab", { name: "页面1" })).toBeInTheDocument();
    expect(within(sidePanel).getByRole("tab", { name: "页面2" })).toBeInTheDocument();
    expect(within(sidePanel).getByRole("tab", { name: "页面3" })).toBeInTheDocument();
    expect(within(sidePanel).queryByRole("tab", { name: "页面4" })).not.toBeInTheDocument();
    expect(within(sidePanel).getByRole("button", { name: "展开" })).toBeInTheDocument();

    await user.click(within(sidePanel).getByRole("button", { name: "展开" }));

    expect(within(sidePanel).getByRole("tab", { name: "页面4" })).toBeInTheDocument();
    expect(within(sidePanel).getByRole("tab", { name: "页面5" })).toBeInTheDocument();
    expect(within(sidePanel).getByRole("button", { name: "收起" })).toBeInTheDocument();
  });

  it("keeps the custom tab expansion preference across remounts", async () => {
    const user = userEvent.setup();
    const sidebarItems = Array.from({ length: 5 }, (_, index) => ({
      id: String(index + 1),
      name: `页面${index + 1}`,
      sort: index + 1,
      status: "active" as const,
      url: `https://example.com/page-${index + 1}`,
    }));

    const { unmount } = render(
      <CustomerSidePanel
        {...defaultProps}
        sidebarItems={sidebarItems}
      />,
    );

    await user.click(screen.getByRole("button", { name: "展开" }));
    unmount();

    render(
      <CustomerSidePanel
        {...defaultProps}
        sidebarItems={sidebarItems}
      />,
    );

    expect(screen.getByRole("tab", { name: "页面5" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起" })).toBeInTheDocument();
  });

  it("renders custom sidebar iframes with sandbox and referrer policy", async () => {
    const user = userEvent.setup();

    render(
      <CustomerSidePanel
        {...defaultProps}
        sidebarItems={[
          {
            id: "1",
            name: "素材中心",
            sort: 1,
            status: "active",
            url: "https://example.com/assets",
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "素材中心" }));

    expect(screen.getByTitle("素材中心扩展页")).toHaveAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-forms",
    );
    expect(screen.getByTitle("素材中心扩展页")).toHaveAttribute(
      "referrerpolicy",
      "no-referrer-when-downgrade",
    );
  });
});
