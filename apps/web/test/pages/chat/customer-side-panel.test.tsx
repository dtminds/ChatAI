import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SettingsSidebarBindType } from "@chatai/contracts";
import { CustomerSidePanel } from "@/pages/chat/components/customer-side-panel";

const sidebarIframeParamsFixture = {
  fsw: "fsw-cipher",
  mid: "embed-app-001",
  rd: "rd-cipher",
  ts: "ts-cipher",
};

vi.mock("@/pages/chat/api/sidebar-iframe-params", () => ({
  fetchWorkbenchSidebarIframeParams: vi.fn(async () => sidebarIframeParamsFixture),
}));

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
    vi.clearAllMocks();
  });

  it("shows only sidebar items matching the conversation mode", () => {
    render(
      <CustomerSidePanel
        {...defaultProps}
        conversationMode="group"
        sidebarItems={[
          {
            bindTypes: ["1"],
            id: "1",
            name: "仅单聊",
            sort: 1,
            status: "active",
            url: "https://example.com/single",
          },
          {
            bindTypes: ["2"],
            id: "2",
            name: "仅群聊",
            sort: 2,
            status: "active",
            url: "https://example.com/group",
          },
        ]}
      />,
    );

    const sidePanel = screen.getByRole("complementary", { name: "群成员信息栏" });

    expect(within(sidePanel).queryByRole("tab", { name: "仅单聊" })).not.toBeInTheDocument();
    expect(within(sidePanel).getByRole("tab", { name: "仅群聊" })).toBeInTheDocument();
  });

  it("shows an empty state for single conversations without custom sidebar items", () => {
    render(
      <CustomerSidePanel
        {...defaultProps}
        conversationMode="single"
        sidebarItems={undefined}
      />,
    );

    const sidePanel = screen.getByRole("complementary", { name: "客户信息栏" });

    expect(within(sidePanel).queryByRole("tab", { name: "基础信息" })).not.toBeInTheDocument();
    expect(within(sidePanel).queryByRole("tab")).not.toBeInTheDocument();
    expect(
      within(sidePanel).getByRole("status", { name: "暂未配置侧边栏" }),
    ).toBeInTheDocument();
    expect(sidePanel.querySelector("img")).toHaveAttribute(
      "src",
      "https://b5.bokr.com.cn/dist/no_result.png",
    );
  });

  it("keeps the basic info tab for group conversations without custom sidebar items", () => {
    render(
      <CustomerSidePanel
        {...defaultProps}
        conversationMode="group"
        sidebarItems={undefined}
      />,
    );

    const sidePanel = screen.getByRole("complementary", { name: "群成员信息栏" });

    expect(within(sidePanel).getByRole("tab", { name: "基础信息" })).toBeInTheDocument();
    expect(within(sidePanel).getAllByRole("tab")).toHaveLength(1);
    expect(within(sidePanel).queryByRole("status", { name: "暂未配置侧边栏" })).not.toBeInTheDocument();
  });

  it("collapses custom tabs to the first row and expands them on demand", async () => {
    const user = userEvent.setup();

    render(
      <CustomerSidePanel
        {...defaultProps}
        conversationMode="single"
        sidebarItems={Array.from({ length: 5 }, (_, index) => ({
          bindTypes: ["1", "2"],
          id: String(index + 1),
          name: `页面${index + 1}`,
          sort: index + 1,
          status: "active",
          url: `https://example.com/page-${index + 1}`,
        }))}
      />,
    );

    const sidePanel = screen.getByRole("complementary", { name: "客户信息栏" });

    expect(within(sidePanel).getByRole("tab", { name: "页面1" })).toBeInTheDocument();
    expect(within(sidePanel).getByRole("tab", { name: "页面2" })).toBeInTheDocument();
    expect(within(sidePanel).getByRole("tab", { name: "页面3" })).toBeInTheDocument();
    expect(within(sidePanel).getByRole("tab", { name: "页面4" })).toBeInTheDocument();
    expect(within(sidePanel).queryByRole("tab", { name: "页面5" })).not.toBeInTheDocument();
    expect(within(sidePanel).getByRole("button", { name: "展开" })).toBeInTheDocument();

    await user.click(within(sidePanel).getByRole("button", { name: "展开" }));

    expect(within(sidePanel).getByRole("tab", { name: "页面5" })).toBeInTheDocument();
    expect(within(sidePanel).getByRole("button", { name: "收起" })).toBeInTheDocument();
  });

  it("keeps the custom tab expansion preference across remounts", async () => {
    const user = userEvent.setup();
    const sidebarItems = Array.from({ length: 5 }, (_, index) => ({
      bindTypes: ["1", "2"] as SettingsSidebarBindType[],
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
        sidebarIframeConversationId="conv-1"
        sidebarIframeSeatId="seat-1"
        sidebarItems={[
          {
            bindTypes: ["1", "2"],
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

  it("shows a loading indicator until the custom sidebar iframe finishes loading", async () => {
    const user = userEvent.setup();

    render(
      <CustomerSidePanel
        {...defaultProps}
        sidebarIframeConversationId="conv-1"
        sidebarIframeSeatId="seat-1"
        sidebarItems={[
          {
            bindTypes: ["1", "2"],
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

    expect(screen.getByTestId("dot-matrix-loader")).toBeInTheDocument();

    const iframe = screen.getByTitle("素材中心扩展页");

    fireEvent.load(iframe);

    expect(screen.queryByTestId("dot-matrix-loader")).not.toBeInTheDocument();
  });

  it("uses about:blank until iframe params match the current seat and conversation", async () => {
    const user = userEvent.setup();
    const { fetchWorkbenchSidebarIframeParams } = await import(
      "@/pages/chat/api/sidebar-iframe-params"
    );
    const sidebarItems = [
      {
        bindTypes: ["1", "2"] as SettingsSidebarBindType[],
        id: "1",
        name: "素材中心",
        sort: 1,
        status: "active" as const,
        url: "https://example.com/assets",
      },
    ];

    vi.mocked(fetchWorkbenchSidebarIframeParams)
      .mockResolvedValueOnce({
        ...sidebarIframeParamsFixture,
        rd: "rd-first",
      })
      .mockResolvedValueOnce({
        ...sidebarIframeParamsFixture,
        rd: "rd-second",
      });

    const { rerender } = render(
      <CustomerSidePanel
        {...defaultProps}
        sidebarIframeConversationId="conv-1"
        sidebarIframeSeatId="seat-1"
        sidebarItems={sidebarItems}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "素材中心" }));

    await waitFor(() => {
      expect(new URL(screen.getByTitle("素材中心扩展页").getAttribute("src") ?? "").searchParams.get("rd")).toBe(
        "rd-first",
      );
    });

    rerender(
      <CustomerSidePanel
        {...defaultProps}
        sidebarIframeConversationId="conv-2"
        sidebarIframeSeatId="seat-1"
        sidebarItems={sidebarItems}
      />,
    );

    expect(screen.getByTitle("素材中心扩展页")).toHaveAttribute("src", "about:blank");

    await waitFor(() => {
      const parsed = new URL(screen.getByTitle("素材中心扩展页").getAttribute("src") ?? "");

      expect(parsed.searchParams.get("rd")).toBe("rd-second");
      expect(parsed.searchParams.get("rd")).not.toBe("rd-first");
    });

    expect(fetchWorkbenchSidebarIframeParams).toHaveBeenLastCalledWith({
      conversationId: "conv-2",
      seatId: "seat-1",
    });
  });

  it("appends server-issued iframe params to custom iframe src", async () => {
    const user = userEvent.setup();
    const { fetchWorkbenchSidebarIframeParams } = await import(
      "@/pages/chat/api/sidebar-iframe-params"
    );

    render(
      <CustomerSidePanel
        {...defaultProps}
        sidebarIframeConversationId="conv-42"
        sidebarIframeSeatId="seat-42"
        sidebarIframeTos="1"
        sidebarItems={[
          {
            bindTypes: ["1", "2"],
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

    await waitFor(() => {
      const iframe = screen.getByTitle("素材中心扩展页");
      const parsed = new URL(iframe.getAttribute("src") ?? "");

      expect(parsed.searchParams.get("mid")).toBe("embed-app-001");
      expect(parsed.searchParams.get("rd")).toBe("rd-cipher");
      expect(parsed.searchParams.get("fsw")).toBe("fsw-cipher");
      expect(parsed.searchParams.get("ts")).toBe("ts-cipher");
      expect(parsed.searchParams.get("tos")).toBe("1");
    });

    expect(fetchWorkbenchSidebarIframeParams).toHaveBeenCalledWith({
      conversationId: "conv-42",
      seatId: "seat-42",
    });
  });
});
