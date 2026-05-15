import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  encryptTuseFswFromThirdExternalUserId,
  encryptTuseRdFromThirdUserId,
  encryptTuseTsFromUnixSeconds,
} from "@/lib/tuse-crypto";
import type { SettingsSidebarBindType } from "@chatai/contracts";
import { CustomerSidePanel } from "@/pages/chat/components/customer-side-panel";

vi.mock("@/pages/chat/api/sidebar-tuse-crypto", () => {
  const appId = "embed-app-001";
  const secret = "03A2056448BF1-BD0B89DE-10E2-4732-96E0-1D85B30731BF";
  const ivParameter = "03A2056448BF2-06C002FB-1688-4A2F-B25A-F20AD4C89CB2";

  return {
    fetchWorkbenchSidebarTuseCrypto: vi.fn(async () => ({ appId, ivParameter, secret })),
  };
});

const tuseKey = "03A2056448BF1-BD0B89DE-10E2-4732-96E0-1D85B30731BF";
const tuseIv = "03A2056448BF2-06C002FB-1688-4A2F-B25A-F20AD4C89CB2";

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

  it("appends third-party user ids to custom iframe src", async () => {
    const user = userEvent.setup();
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_735_689_600_123);

    try {
      const rd = await encryptTuseRdFromThirdUserId(tuseKey, tuseIv, "third-42");
      const fsw = await encryptTuseFswFromThirdExternalUserId(tuseKey, tuseIv, "ext-42");
      const ts = await encryptTuseTsFromUnixSeconds(tuseKey, tuseIv, 1_735_689_600);

      render(
        <CustomerSidePanel
          {...defaultProps}
          sidebarIframeThirdExternalUserId="ext-42"
          sidebarIframeThirdUserId="third-42"
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
        expect(parsed.searchParams.get("rd")).toBe(rd);
        expect(parsed.searchParams.get("fsw")).toBe(fsw);
        expect(parsed.searchParams.get("ts")).toBe(ts);
        expect(parsed.searchParams.get("tos")).toBe("1");
      });
    } finally {
      nowSpy.mockRestore();
    }
  });
});
