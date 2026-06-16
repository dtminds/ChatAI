import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  QUICK_REPLY_SCOPE_TYPE,
  type SettingsSidebarBindType,
} from "@chatai/contracts";
import { createMockWorkbenchService, setWorkbenchService } from "@/pages/chat/api/workbench-service";
import {
  installChatWorkbenchTestEnvironment,
  renderChatWorkbenchPage,
  resetChatWorkbenchTestState,
} from "./workbench-test-utils";

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

describe("ChatWorkbenchPage sidebar flows", () => {
  beforeEach(() => {
    vi.useRealTimers();
    resetChatWorkbenchTestState();
    installChatWorkbenchTestEnvironment();
  });

  it("loads custom sidebar items during workbench bootstrap and reuses them across conversations", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const getSidebarItems = vi.fn(async () => ({
      items: [
        {
          bindTypes: ["1", "2"] as SettingsSidebarBindType[],
          id: "sidebar-2",
          name: "客户详情",
          sort: 2,
          status: "active" as const,
          url: "https://example.com/customer",
        },
        {
          bindTypes: ["1", "2"] as SettingsSidebarBindType[],
          id: "sidebar-1",
          name: "快捷回复",
          sort: 1,
          status: "active" as const,
          url: "https://example.com/replies",
        },
        {
          bindTypes: ["1", "2"] as SettingsSidebarBindType[],
          id: "sidebar-3",
          name: "隐藏页面",
          sort: 3,
          status: "disabled" as const,
          url: "https://example.com/hidden",
        },
      ],
    }));

    setWorkbenchService({
      ...baseService,
      getSidebarItems,
    });

    renderChatWorkbenchPage();

    const sidePanel = await screen.findByRole("complementary", {
      name: "客户信息栏",
    });

    expect(within(sidePanel).queryByRole("tab", { name: "基础信息" })).not.toBeInTheDocument();
    expect(within(sidePanel).getByRole("tab", { name: "快捷回复" })).toBeInTheDocument();
    expect(within(sidePanel).getByRole("tab", { name: "客户详情" })).toBeInTheDocument();
    expect(within(sidePanel).queryByRole("tab", { name: "隐藏页面" })).not.toBeInTheDocument();
    expect(getSidebarItems).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("tab", { name: "群聊" }));

    await waitFor(() => {
      expect(screen.getByTestId("message-content")).toBeInTheDocument();
    });
    expect(
      within(screen.getByRole("complementary", { name: "群成员信息栏" })).getByRole("tab", {
        name: "基础信息",
        selected: true,
      }),
    ).toBeInTheDocument();
    expect(getSidebarItems).toHaveBeenCalledTimes(1);
  });

  it("refreshes cached group members from the sidebar button", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    let requestCount = 0;

    setWorkbenchService({
      ...baseService,
      async getGroupMembers(conversationId) {
        requestCount += 1;
        const response = await baseService.getGroupMembers(conversationId);

        return {
          ...response,
          items:
            requestCount === 2
              ? response.items.map((member) =>
                  member.displayName === "小林"
                    ? { ...member, displayName: "小林（刷新）" }
                    : member,
                )
              : response.items,
        };
      },
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("tab", { name: "群聊" }));

    const sidePanel = await screen.findByRole("complementary", {
      name: "群成员信息栏",
    });

    await waitFor(() => {
      expect(within(sidePanel).getByText("小林")).toBeInTheDocument();
    });

    await user.click(within(sidePanel).getByRole("button", { name: "刷新群成员" }));

    await waitFor(() => {
      expect(within(sidePanel).getByText("小林（刷新）")).toBeInTheDocument();
    });

    expect(requestCount).toBe(2);
  });

  it("keeps showing loading while switching to a group conversation", async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<Awaited<ReturnType<ReturnType<typeof createMockWorkbenchService>["getGroupMembers"]>>>();
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getGroupMembers(conversationId) {
        expect(conversationId).toBe("conv-004");
        return deferred.promise;
      },
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("tab", { name: "群聊" }));

    const sidePanel = await screen.findByRole("complementary", {
      name: "群成员信息栏",
    });

    expect(within(sidePanel).getByTestId("dot-matrix-loader")).toBeInTheDocument();
    expect(within(sidePanel).queryByText("暂无群成员")).not.toBeInTheDocument();

    deferred.resolve(await baseService.getGroupMembers("conv-004"));

    await waitFor(() => {
      expect(within(sidePanel).queryByTestId("dot-matrix-loader")).not.toBeInTheDocument();
    });
  });

  it("keeps quick reply form open when saving fails", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      createQuickReply: vi.fn().mockRejectedValue(new Error("保存失败")),
      listQuickReplyCategories: vi.fn().mockResolvedValue({
        categories: [
          {
            id: "quick-reply-category-1",
            parentId: 0,
            scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
            sort: 100,
            title: "售前",
          },
          {
            id: "quick-reply-category-2",
            parentId: "quick-reply-category-1",
            scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
            sort: 90,
            title: "报价",
          },
        ],
      }),
      listQuickReplyCategoryContent: vi.fn().mockResolvedValue({
        categories: [
          {
            id: "quick-reply-category-2",
            parentId: "quick-reply-category-1",
            scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
            sort: 90,
            title: "报价",
          },
        ],
        limits: {
          categories: 500,
          quickReplies: 10_000,
        },
        quickRepliesByCategoryId: {
          "quick-reply-category-2": [],
        },
        truncated: {
          categories: false,
          quickReplies: false,
        },
      }),
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(await screen.findByRole("tab", { name: "快捷话术" }));
    fireEvent.contextMenu(await screen.findByRole("button", { name: "报价" }));
    await user.click(await screen.findByRole("menuitem", { name: "新建话术" }));
    await user.type(screen.getByPlaceholderText("请输入话术内容"), "您好");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("保存失败")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("请输入话术内容")).toHaveValue("您好");
  });
});
