import MockAdapter from "axios-mock-adapter";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { toast } from "sonner";
import { routerConfig } from "@/router";
import { resetWorkbenchService } from "@/pages/chat/api/workbench-service";
import { useWorkbenchStore } from "@/store/workbench-store";
import { useAuthStore } from "@/store/auth-store";
import { requestInstance } from "@/lib/request";

vi.mock("sonner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sonner")>();

  return {
    ...actual,
    toast: {
      ...actual.toast,
      error: vi.fn(),
      success: vi.fn(),
    },
  };
});

const mock = new MockAdapter(requestInstance);
const groupChatReceptionUpdateGates = new Map<string, Promise<void>>();
const groupChatReceptionUpdateStatuses = new Map<string, number>();

function createDomRect(rect: Partial<DOMRect>): DOMRect {
  return {
    bottom: rect.bottom ?? 0,
    height: rect.height ?? Math.max((rect.bottom ?? 0) - (rect.top ?? 0), 0),
    left: rect.left ?? 0,
    right: rect.right ?? 0,
    toJSON: () => ({}),
    top: rect.top ?? 0,
    width: rect.width ?? Math.max((rect.right ?? 0) - (rect.left ?? 0), 0),
    x: rect.x ?? rect.left ?? 0,
    y: rect.y ?? rect.top ?? 0,
  };
}

function renderRoute(initialEntry = "/chat") {
  const router = createMemoryRouter(routerConfig, {
    initialEntries: [initialEntry],
  });

  render(<RouterProvider router={router} />);

  return router;
}

function mockAuthenticatedSession(role = "admin") {
  mock.onGet("/auth/session").reply(200, {
    data: {
      subUser: {
        displayName: "客服一号",
        permissions:
          role === "admin"
            ? [
                "chat.access",
                "chat.send",
                "chat.takeover",
                "settings.access",
                "settings.subAccounts.manage",
                "settings.managedAccounts.manage",
                "settings.sidebar.manage",
              ]
            : ["chat.access", "chat.send", "chat.takeover"],
        role,
        subUserId: "101",
      },
    },
    success: true,
  });
}

describe("Chat settings pages", () => {
  beforeAll(async () => {
    installLoadedImageMock();
    await Promise.all([
      import("@/pages/chat/chat-workbench-page"),
      import("@/pages/chat/settings/chat-settings-page"),
    ]);
  });

  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
    groupChatReceptionUpdateGates.clear();
    groupChatReceptionUpdateStatuses.clear();
    resetWorkbenchService();
    useAuthStore.setState(useAuthStore.getInitialState(), true);
    mock.reset();
    mockAuthenticatedSession();
    mock.onGet("/server/settings/sub-accounts").reply(200, {
      data: {
        seats: [
          {
            avatarUrl: "https://example.com/drc.png",
            name: "德瑞可",
            seatId: "101",
          },
          {
            avatarUrl: "https://example.com/ndt.png",
            name: "念都堂",
            seatId: "102",
          },
          {
            avatarUrl: "https://example.com/mid.png",
            name: "中台号",
            seatId: "103",
          },
          {
            avatarUrl: "https://example.com/after-sale.png",
            name: "售后号",
            seatId: "104",
          },
        ],
        subAccounts: [
          {
            account: "owner",
            id: "1",
            name: "主账号",
            role: "owner",
            seats: [],
            status: "active",
            type: 1,
          },
          {
            account: "agent001",
            id: "11",
            name: "客服一号",
            role: "admin",
            seats: [
              {
                avatarUrl: "https://example.com/drc.png",
                name: "德瑞可",
                seatId: "101",
              },
              {
                avatarUrl: "https://example.com/ndt.png",
                name: "念都堂",
                seatId: "102",
              },
              {
                avatarUrl: "https://example.com/mid.png",
                name: "中台号",
                seatId: "103",
              },
              {
                avatarUrl: "https://example.com/after-sale.png",
                name: "售后号",
                seatId: "104",
              },
            ],
            status: "active",
            type: 0,
          },
          {
            account: "agent002",
            id: "12",
            name: "客服二号",
            role: "operator",
            seats: [],
            status: "disabled",
            type: 0,
          },
        ],
      },
      success: true,
    });
    mock.onGet("/server/settings/managed-accounts").reply(200, {
      data: {
        managedAccounts: [
          {
            avatarUrl: "https://example.com/drc.png",
            groupChatCount: 3,
            id: "101",
            name: "德瑞可",
            onlineStatus: "offline",
            subAccounts: [
            {
              account: "owner",
              id: "1",
              isTakingOver: false,
              name: "主账号",
              role: "owner",
              status: "active",
              type: 1,
            },
            {
              account: "agent001",
              id: "11",
              isTakingOver: true,
              name: "客服一号",
              role: "admin",
              status: "active",
              type: 0,
            },
            {
              account: "agent002",
              id: "12",
              isTakingOver: false,
              name: "客服二号",
              role: "operator",
              status: "active",
              type: 0,
            },
            {
              account: "agent003",
              id: "13",
              isTakingOver: false,
              name: "客服三号",
              role: "operator",
              status: "active",
              type: 0,
            },
            {
              account: "agent004",
              id: "14",
              isTakingOver: false,
              name: "客服四号",
              role: "operator",
              status: "disabled",
              type: 0,
            },
            ],
          },
          {
            avatarUrl: "https://example.com/ndt.png",
            groupChatCount: 5,
            id: "102",
            name: "念都堂",
            onlineStatus: "online",
            subAccounts: [],
          },
        ],
        subAccounts: [
          {
            account: "owner",
            id: "1",
            isTakingOver: false,
            name: "主账号",
            role: "owner",
            status: "active",
            type: 1,
          },
          {
            account: "agent001",
            id: "11",
            isTakingOver: false,
            name: "客服一号",
            role: "admin",
            status: "active",
            type: 0,
          },
          {
            account: "agent002",
            id: "12",
            isTakingOver: false,
            name: "客服二号",
            role: "operator",
            status: "active",
            type: 0,
          },
          {
            account: "agent003",
            id: "13",
            isTakingOver: false,
            name: "客服三号",
            role: "operator",
            status: "active",
            type: 0,
          },
          {
            account: "agent004",
            id: "14",
            isTakingOver: false,
            name: "客服四号",
            role: "operator",
            status: "disabled",
            type: 0,
          },
        ],
      },
      success: true,
    });
    mock.onPut("/server/settings/group-chats/reception").reply(async (config) => {
      const { groupChatId } = JSON.parse(config.data ?? "{}") as { groupChatId?: string };
      const gate = groupChatId ? groupChatReceptionUpdateGates.get(groupChatId) : undefined;

      if (gate) {
        await gate;
      }

      const status = groupChatId ? groupChatReceptionUpdateStatuses.get(groupChatId) ?? 200 : 400;

      return status === 200
        ? [200, { data: { updated: true }, success: true }]
        : [status, { error: { message: "设置失败" }, success: false }];
    });
    mock.onPost("/server/settings/group-chats/reception-options").reply((config) => {
      const groupChatIds = (JSON.parse(config.data ?? "{}") as { groupChatIds?: string[] })
        .groupChatIds ?? [];
      const availableManagedAccounts = groupChatIds.length === 1 && groupChatIds[0] === "501"
        ? [{ avatarUrl: "https://example.com/ndt.png", id: "102", name: "念都堂" }]
        : groupChatIds.length === 1 && groupChatIds[0] === "502"
          ? [{ avatarUrl: "https://example.com/drc.png", id: "101", name: "德瑞可" }]
          : [];

      return [200, { data: { availableManagedAccounts }, success: true }];
    });
    mock.onGet("/server/settings/group-chats").reply((config) => {
      const keyword = config.params?.keyword as string | undefined;
      const managedAccountId = config.params?.managedAccountId as string | undefined;
      const page = Number(config.params?.page ?? 1);
      const pageSize = Number(config.params?.pageSize ?? 10);
      const filteredGroupChats = [
        {
          avatarUrl: "https://example.com/group-1.png",
          id: "501",
          name: "护肤交流群",
          openingManagedAccount: {
            avatarUrl: "https://example.com/drc.png",
            id: "101",
            name: "德瑞可",
          },
          receptionManagedAccounts: [
            {
              avatarUrl: "https://example.com/reception-1.png",
              id: "201",
              name: "小明",
            },
            {
              avatarUrl: "https://example.com/reception-2.png",
              id: "202",
              name: "小红",
            },
            {
              avatarUrl: "https://example.com/reception-3.png",
              id: "203",
              name: "小刚",
            },
          ],
          receptionSeatCount: 3,
          thirdGroupId: "29F71A2ED8125854B6A1",
        },
        {
          avatarUrl: "",
          id: "502",
          name: "售后答疑群",
          openingManagedAccount: {
            avatarUrl: "https://example.com/ndt.png",
            id: "102",
            name: "念都堂",
          },
          receptionManagedAccounts: [],
          receptionSeatCount: 0,
          thirdGroupId: "8C2D4F1A9B7765432100",
        },
        ...Array.from({ length: 9 }, (_, index) => ({
          avatarUrl: "",
          id: String(503 + index),
          name: `测试群聊${index + 3}`,
          openingManagedAccount: {
            avatarUrl: "https://example.com/drc.png",
            id: "101",
            name: "德瑞可",
          },
          receptionManagedAccounts: [],
          receptionSeatCount: 0,
          thirdGroupId: `GROUP-${index + 3}`,
        })),
      ].filter((groupChat) => {
        const matchesKeyword =
          !keyword ||
          groupChat.name.includes(keyword) ||
          groupChat.thirdGroupId.includes(keyword);
        const matchesManagedAccount =
          !managedAccountId || groupChat.openingManagedAccount.id === managedAccountId;

        return matchesKeyword && matchesManagedAccount;
      });
      const total = filteredGroupChats.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const activePage = Math.min(page, totalPages);
      const groupChats = filteredGroupChats.slice(
        (activePage - 1) * pageSize,
        activePage * pageSize,
      );

      return [
        200,
        {
          data: {
            filterManagedAccounts: [
              { id: "101", name: "德瑞可" },
              { id: "102", name: "念都堂" },
            ],
            groupChats,
            page: activePage,
            pageSize,
            total,
            totalPages,
          },
          success: true,
        },
      ];
    });
    mock.onGet("/server/settings/sidebar-items").reply(200, {
      data: {
        items: [
          {
            bindTypes: ["1", "2"],
            id: "201",
            name: "企业名片",
            sort: 1,
            status: "active",
            url: "https://example.com/card",
          },
          {
            bindTypes: ["1", "2"],
            id: "202",
            name: "发起收款",
            sort: 2,
            status: "active",
            url: "https://example.com/pay",
          },
          {
            bindTypes: ["1", "2"],
            id: "203",
            name: "客户详情",
            sort: 3,
            status: "disabled",
            url: "https://example.com/customer",
          },
          {
            bindTypes: ["1", "2"],
            id: "204",
            name: "快捷回复",
            sort: 4,
            status: "active",
            url: "https://example.com/replies",
          },
        ],
      },
      success: true,
    });
    useWorkbenchStore.setState(useWorkbenchStore.getInitialState(), true);
    document.documentElement.classList.remove("dark");
    setSystemColorScheme(false);
  });

  it("opens settings from the account menu and returns to /chat", async () => {
    const user = userEvent.setup();
    const router = renderRoute("/chat");

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: "打开账号菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "设置" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/chat/settings");
    });
    expect(
      await screen.findByRole("navigation", { name: "设置菜单" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "德仁堂 接管中" })).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "托管账号" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "返回工作台" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/chat");
    });
  });

  it("shows enabled group chats in the managed-account settings tab", async () => {
    const user = userEvent.setup();
    renderRoute("/chat/settings");

    await user.click(await screen.findByRole("tab", { name: "开通群聊" }));

    expect(await screen.findByRole("table", { name: "开通群聊列表" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "群ID" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "开通企微号" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "可接待企微号" })).toBeInTheDocument();
    expect(await screen.findByText("护肤交流群")).toBeInTheDocument();
    expect(screen.queryByText("29F71A2ED8125854B6A1")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "查看可接待企微号 3 个" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("row", { name: /售后答疑群/ })).getByText("-"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "打开 护肤交流群 操作菜单" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "批量设置" })).toBeDisabled();
  });

  it("reloads group chats from the server when page size changes", async () => {
    const user = userEvent.setup();
    renderRoute("/chat/settings");

    await user.click(await screen.findByRole("tab", { name: "开通群聊" }));
    await screen.findByRole("table", { name: "开通群聊列表" });

    expect(
      mock.history.get.filter((request) => request.url === "/server/settings/group-chats").at(-1)
        ?.params,
    ).toMatchObject({ page: 1, pageSize: 10 });

    await user.click(screen.getByRole("combobox", { name: "每页条数" }));
    await user.click(await screen.findByRole("option", { name: "20" }));

    await waitFor(() => {
      expect(
        mock.history.get.filter((request) => request.url === "/server/settings/group-chats").at(-1)
          ?.params,
      ).toMatchObject({ page: 1, pageSize: 20 });
    });
  });

  it("debounces group chat keyword searches and resets the result page", async () => {
    const user = userEvent.setup();
    renderRoute("/chat/settings");

    await user.click(await screen.findByRole("tab", { name: "开通群聊" }));
    await user.click(await screen.findByRole("button", { name: "下一页" }));
    expect(await screen.findByText("测试群聊11")).toBeInTheDocument();

    const groupChatRequests = () =>
      mock.history.get.filter((request) => request.url === "/server/settings/group-chats");
    const requestCountBeforeSearch = groupChatRequests().length;
    const searchInput = screen.getByRole("textbox", { name: "搜索群聊" });

    fireEvent.change(searchInput, { target: { value: "护" } });
    fireEvent.change(searchInput, { target: { value: "护肤" } });

    expect(groupChatRequests()).toHaveLength(requestCountBeforeSearch);

    await waitFor(() => {
      expect(groupChatRequests()).toHaveLength(requestCountBeforeSearch + 1);
    });
    expect(groupChatRequests().at(-1)?.params).toMatchObject({
      keyword: "护肤",
      page: 1,
      pageSize: 10,
    });
    expect(await screen.findByText("护肤交流群")).toBeInTheDocument();
  });

  it("clears selected group chats when changing pages", async () => {
    const user = userEvent.setup();
    renderRoute("/chat/settings");

    await user.click(await screen.findByRole("tab", { name: "开通群聊" }));
    await user.click(await screen.findByRole("checkbox", { name: "选择 护肤交流群" }));
    expect(screen.getByRole("button", { name: "批量设置" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(await screen.findByText("测试群聊11")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "批量设置" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "上一页" }));
    expect(await screen.findByRole("checkbox", { name: "选择 护肤交流群" })).not.toBeChecked();
  });

  it("opens single and batch group chat reception dialogs from the same component", async () => {
    const user = userEvent.setup();
    renderRoute("/chat/settings");

    await user.click(await screen.findByRole("tab", { name: "开通群聊" }));
    expect(
      mock.history.post.filter(
        (request) => request.url === "/server/settings/group-chats/reception-options",
      ),
    ).toHaveLength(0);
    await user.click(await screen.findByRole("button", { name: "打开 护肤交流群 操作菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "接待账号设置" }));

    const singleDialog = await screen.findByRole("dialog", { name: "群聊接待设置" });
    expect(within(singleDialog).getByText("护肤交流群")).toBeInTheDocument();
    expect(within(singleDialog).getByLabelText("群聊 护肤交流群")).toBeInTheDocument();
    expect(
      within(singleDialog).getByText("选中的企微号可在对应群聊收发消息"),
    ).toBeInTheDocument();
    expect(
      mock.history.post.filter(
        (request) => request.url === "/server/settings/group-chats/reception-options",
      ),
    ).toHaveLength(1);
    expect(within(singleDialog).getByText("3/5")).toBeInTheDocument();
    expect(within(singleDialog).getByText("小明")).toBeInTheDocument();
    expect(within(singleDialog).getByText("小红")).toBeInTheDocument();
    expect(within(singleDialog).getByText("小刚")).toBeInTheDocument();

    await user.click(within(singleDialog).getByRole("textbox", { name: "搜索并选择接待账号" }));
    await user.click(await within(document.body).findByRole("checkbox", { name: "念都堂" }));
    expect(within(singleDialog).getByText("4/5")).toBeInTheDocument();
    expect(within(singleDialog).getByRole("button", { name: "移除 念都堂" })).toBeInTheDocument();

    await user.click(within(singleDialog).getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog", { name: "群聊接待设置" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "选择 护肤交流群" }));
    await user.click(screen.getByRole("checkbox", { name: "选择 售后答疑群" }));
    await user.click(screen.getByRole("button", { name: "批量设置" }));

    const batchDialog = await screen.findByRole("dialog", { name: "已选中 2 个群聊" });
    expect(
      within(batchDialog).getByRole("alert", {
        name: "注意事项：请确保设置的企微号已加入每一个所选的群聊中",
      }),
    ).toBeInTheDocument();
    expect(within(batchDialog).queryByText("护肤交流群")).not.toBeInTheDocument();
    expect(within(batchDialog).getByText("0/5")).toBeInTheDocument();
    expect(within(batchDialog).getByText("暂无已选择账号")).toBeInTheDocument();
  });

  it("updates selected group chats sequentially and shows progress", async () => {
    const user = userEvent.setup();
    let releaseFirstRequest = () => {};
    let releaseSecondRequest = () => {};
    groupChatReceptionUpdateGates.set(
      "501",
      new Promise<void>((resolve) => {
        releaseFirstRequest = resolve;
      }),
    );
    groupChatReceptionUpdateGates.set(
      "502",
      new Promise<void>((resolve) => {
        releaseSecondRequest = resolve;
      }),
    );
    renderRoute("/chat/settings");

    await user.click(await screen.findByRole("tab", { name: "开通群聊" }));
    await user.click(screen.getByRole("checkbox", { name: "选择 护肤交流群" }));
    await user.click(screen.getByRole("checkbox", { name: "选择 售后答疑群" }));
    await user.click(screen.getByRole("button", { name: "批量设置" }));

    const dialog = await screen.findByRole("dialog", { name: "已选中 2 个群聊" });
    const submitButton = within(dialog).getByRole("button", { name: "确认提交" });
    await waitFor(() => expect(submitButton).toBeEnabled());
    await user.click(submitButton);

    await waitFor(() => {
      expect(
        mock.history.put.filter(
          (request) => request.url === "/server/settings/group-chats/reception",
        ),
      ).toHaveLength(1);
    });
    expect(within(dialog).getByText("0/2")).toBeInTheDocument();

    releaseFirstRequest();
    await waitFor(() => {
      expect(
        mock.history.put.filter(
          (request) => request.url === "/server/settings/group-chats/reception",
        ),
      ).toHaveLength(2);
    });
    expect(within(dialog).getByText("1/2")).toBeInTheDocument();
    expect(within(dialog).getByRole("progressbar", { name: "设置进度" })).toHaveAttribute(
      "aria-valuenow",
      "50",
    );

    releaseSecondRequest();
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "已选中 2 个群聊" })).not.toBeInTheDocument();
    });

    expect(
      mock.history.put
        .filter((request) => request.url === "/server/settings/group-chats/reception")
        .map((request) => JSON.parse(request.data ?? "{}")),
    ).toEqual([
      { groupChatId: "501", hostUserSeatIds: [] },
      { groupChatId: "502", hostUserSeatIds: [] },
    ]);
  });

  it("stops batch updates after a failure and reports completed progress", async () => {
    const user = userEvent.setup();
    groupChatReceptionUpdateStatuses.set("502", 500);
    renderRoute("/chat/settings");

    await user.click(await screen.findByRole("tab", { name: "开通群聊" }));
    await user.click(screen.getByRole("checkbox", { name: "选择 护肤交流群" }));
    await user.click(screen.getByRole("checkbox", { name: "选择 售后答疑群" }));
    await user.click(screen.getByRole("button", { name: "批量设置" }));

    const dialog = await screen.findByRole("dialog", { name: "已选中 2 个群聊" });
    const submitButton = within(dialog).getByRole("button", { name: "确认提交" });
    await waitFor(() => expect(submitButton).toBeEnabled());
    await user.click(submitButton);

    expect(await within(dialog).findByText(/已完成 1\/2 个群聊/)).toBeInTheDocument();
    expect(within(dialog).getByText("1/2")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "重试" })).toBeEnabled();
    expect(
      mock.history.put.filter(
        (request) => request.url === "/server/settings/group-chats/reception",
      ),
    ).toHaveLength(2);
  });

  it("copies the group chat id from the row action menu", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderRoute("/chat/settings");

    await user.click(await screen.findByRole("tab", { name: "开通群聊" }));
    await user.click(await screen.findByRole("button", { name: "打开 护肤交流群 操作菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "复制群聊ID" }));

    expect(writeText).toHaveBeenCalledWith("29F71A2ED8125854B6A1");
    expect(toast.success).toHaveBeenCalledWith("已复制群聊ID");
  });

  it("shows real managed-account and form reference pages inside the settings shell", async () => {
    const user = userEvent.setup();
    renderRoute("/chat/settings");

    expect(await screen.findByRole("heading", { name: "托管账号" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "企微账号" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "开通群聊" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "托管账号列表" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "在线状态" })).toBeInTheDocument();
    expect(await screen.findByText("德瑞可")).toBeInTheDocument();
    expect(screen.getByText("离线")).toBeInTheDocument();
    expect(screen.getByText("念都堂")).toBeInTheDocument();
    expect(screen.getByText("在线")).toBeInTheDocument();
    expect(
      screen.getByText("客服一号（接管中），主账号，客服二号等5人"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开 德瑞可 操作菜单" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开 念都堂 操作菜单" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "新增账号" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "子账号管理" }));

    expect(screen.getByRole("heading", { name: "子账号管理" })).toBeInTheDocument();
    expect(await screen.findByRole("table", { name: "子账号列表" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "账号类型" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "角色" })).toBeInTheDocument();
    expect(screen.getByLabelText("角色：主账号")).toBeInTheDocument();
    expect(screen.getByLabelText("角色：管理员")).toBeInTheDocument();
    expect(screen.getByLabelText("角色：客服")).toBeInTheDocument();
    expect(screen.getByText("客服一号")).toBeInTheDocument();
    expect(screen.getByText("agent001")).toBeInTheDocument();
    expect(screen.getByLabelText("关联托管账号 德瑞可")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开 主账号 操作菜单" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开 客服一号 操作菜单" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开 客服二号 操作菜单" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "权限角色" }));

    expect(screen.getByRole("heading", { name: "权限角色" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "角色权限矩阵" })).toBeInTheDocument();
    expect(screen.getByText("主账号")).toBeInTheDocument();
    expect(screen.getByText("管理员")).toBeInTheDocument();
    expect(screen.getByText("客服")).toBeInTheDocument();
    expect(screen.getByText("客服（只读）")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "权限集" })).toBeInTheDocument();
    expect(screen.queryByText("chat.access")).not.toBeInTheDocument();
    await user.hover(screen.getByRole("button", { name: "查看 客服（只读） 权限明细" }));
    expect(screen.getByText("会话查看")).toBeInTheDocument();
    expect(screen.getByText("不可接管账号或发送消息")).toBeInTheDocument();
    expect(screen.queryByText("组长")).not.toBeInTheDocument();
  });

  it("keeps settings lists visible for operator sessions while disabling write actions", async () => {
    const user = userEvent.setup();
    mock.reset();
    mockAuthenticatedSession("operator");
    mock.onGet("/server/settings/sub-accounts").reply(200, {
      data: {
        seats: [],
        subAccounts: [
          {
            account: "agent002",
            id: "12",
            name: "客服二号",
            role: "operator",
            seats: [],
            status: "active",
            type: 0,
          },
        ],
      },
      success: true,
    });
    mock.onGet("/server/settings/managed-accounts").reply(200, {
      data: {
        managedAccounts: [
          {
            groupChatCount: 0,
            id: "seat-1",
            name: "德瑞可",
            onlineStatus: "online",
            subAccounts: [],
          },
        ],
        subAccounts: [],
      },
      success: true,
    });
    mock.onGet("/server/settings/sidebar-items").reply(200, {
      data: {
        items: [
          {
            id: "sidebar-1",
            name: "客户详情",
            sort: 1,
            status: "active",
            url: "https://example.com/customer",
          },
        ],
      },
      success: true,
    });
    renderRoute("/chat/settings");

    expect(await screen.findByText("德瑞可")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开 德瑞可 操作菜单" })).toBeDisabled();

    await user.click(screen.getByRole("link", { name: "子账号管理" }));

    expect(await screen.findByText("客服二号")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增子账号" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "打开 客服二号 操作菜单" })).toBeDisabled();

    await user.click(screen.getByRole("link", { name: "侧边栏" }));

    expect(
      await screen.findByRole("button", { name: "打开 客户详情 操作菜单" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "新增页面" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "停用 客户详情" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "拖动 客户详情 调整排序" }),
    ).not.toBeInTheDocument();
  });

  it("manages sidebar items and previews active item ordering", async () => {
    const user = userEvent.setup();
    mock.onPost("/server/settings/sidebar-items").reply((config) => [
      200,
      {
        data: {
          id: "205",
          sort: 5,
          status: "active",
          ...JSON.parse(config.data ?? "{}"),
        },
        success: true,
      },
    ]);
    mock.onPut("/server/settings/sidebar-items/201").reply((config) => [
      200,
      {
        data: {
          id: "201",
          sort: 1,
          status: "active",
          ...JSON.parse(config.data ?? "{}"),
        },
        success: true,
      },
    ]);
    mock.onPatch("/server/settings/sidebar-items/201/status").reply(200, {
      data: {
        bindTypes: ["1", "2"],
        id: "201",
        name: "名片新版",
        sort: 1,
        status: "disabled",
        url: "https://example.com/card",
      },
      success: true,
    });
    mock.onPut("/server/settings/sidebar-items/sort").reply(200, {
      data: {
        items: [
          {
            bindTypes: ["1", "2"],
            id: "202",
            name: "发起收款",
            sort: 1,
            status: "active",
            url: "https://example.com/pay",
          },
          {
            bindTypes: ["1", "2"],
            id: "201",
            name: "企业名片",
            sort: 2,
            status: "active",
            url: "https://example.com/card",
          },
          {
            bindTypes: ["1", "2"],
            id: "203",
            name: "客户详情",
            sort: 3,
            status: "disabled",
            url: "https://example.com/customer",
          },
          {
            bindTypes: ["1", "2"],
            id: "204",
            name: "快捷回复",
            sort: 4,
            status: "active",
            url: "https://example.com/replies",
          },
        ],
      },
      success: true,
    });
    mock.onDelete("/server/settings/sidebar-items/203").reply(200, {
      data: { deleted: true },
      success: true,
    });
    renderRoute("/chat/settings/sidebar");

    expect(await screen.findByRole("heading", { name: "侧边栏" })).toBeInTheDocument();
    const sidebarTable = screen.getByRole("table", { name: "侧边栏菜单列表" });

    expect(sidebarTable).toBeInTheDocument();
    expect(
      within(sidebarTable)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["页面", "显示", "会话类型", "操作"]);
    expect(
      within(sidebarTable).queryByRole("columnheader", { name: "页面地址" }),
    ).not.toBeInTheDocument();
    expect(within(sidebarTable).queryByRole("columnheader", { name: "状态" })).not.toBeInTheDocument();
    const cardMenuButton = await screen.findByRole("button", { name: "打开 企业名片 操作菜单" });
    const cardRow = cardMenuButton.closest("tr");

    expect(cardRow).not.toBeNull();
    if (!cardRow) {
      throw new Error("Expected sidebar row for 企业名片");
    }

    const cardRowCells = within(cardRow).getAllByRole(
      "cell",
    );
    expect(cardRowCells[0]).toHaveTextContent("企业名片");
    expect(cardRowCells[0]).not.toHaveTextContent("单聊");
    expect(within(cardRowCells[1]).getByRole("switch", { name: "停用 企业名片" })).toBeInTheDocument();
    expect(cardRowCells[2]).toHaveTextContent("单聊 · 群聊");
    const sidebarPreview = screen.getByRole("complementary", { name: "聊天工具栏示意图" });
    expect(sidebarPreview).toBeInTheDocument();
    expect(within(sidebarPreview).getByTestId("sidebar-preview-note-icon")).toHaveAttribute(
      "data-icon-name",
      "alert-circle",
    );
    expect(within(sidebarPreview).queryByText("基础信息")).not.toBeInTheDocument();
    expect(within(sidebarPreview).queryByText("单聊")).not.toBeInTheDocument();
    expect(within(sidebarPreview).queryByText("群聊")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "拖动 发起收款 调整排序" })).toBeInTheDocument();
    expect(within(sidebarTable).queryByText("https://example.com/card")).not.toBeInTheDocument();
    expect(within(sidebarTable).queryByText("启用")).not.toBeInTheDocument();
    expect(within(sidebarTable).queryByText("停用")).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("complementary", { name: "聊天工具栏示意图" })).queryByText(
        "客户详情",
      ),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "新增页面" }));
    expect(screen.getByRole("dialog", { name: "新增侧边栏页面" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("页面名称"), "素材中心");
    await user.type(screen.getByLabelText("页面地址"), "https://example.com/assets");
    await user.click(screen.getByRole("button", { name: "确认提交" }));

    await waitFor(() => {
      expect(mock.history.post).toHaveLength(1);
    });
    expect(JSON.parse(mock.history.post[0]?.data ?? "{}")).toEqual({
      bindTypes: ["1", "2"],
      name: "素材中心",
      url: "https://example.com/assets",
    });
    await waitFor(() => {
      expect(useWorkbenchStore.getState().sidebarItems.map((item) => item.name)).toEqual([
        "企业名片",
        "发起收款",
        "客户详情",
        "快捷回复",
        "素材中心",
      ]);
    });

    await user.click(screen.getByRole("button", { name: "打开 企业名片 操作菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "编辑" }));
    expect(screen.getByLabelText("页面地址")).toHaveValue("https://example.com/card");
    await user.clear(screen.getByLabelText("页面名称"));
    await user.type(screen.getByLabelText("页面名称"), "名片新版");
    await user.click(screen.getByRole("button", { name: "确认提交" }));

    await waitFor(() => {
      expect(mock.history.put.some((request) => request.url === "/server/settings/sidebar-items/201")).toBe(
        true,
      );
    });

    await user.click(screen.getByRole("switch", { name: "停用 名片新版" }));
    await waitFor(() => {
      expect(mock.history.patch[0]?.url).toBe("/server/settings/sidebar-items/201/status");
    });
    expect(JSON.parse(mock.history.patch[0]?.data ?? "{}")).toEqual({
      status: "disabled",
    });
    expect(useWorkbenchStore.getState().sidebarItems.find((item) => item.id === "201")).toMatchObject({
      name: "名片新版",
      status: "disabled",
    });

    const paymentDragHandle = screen.getByRole("button", { name: "拖动 发起收款 调整排序" });
    const updatedCardRow = screen.getByRole("row", { name: /名片新版/ });
    const rowRects = [
      [updatedCardRow, { bottom: 40, right: 720, top: 0 }],
      [screen.getByRole("row", { name: /客户详情/ }), { bottom: 80, right: 720, top: 40 }],
      [screen.getByRole("row", { name: /发起收款/ }), { bottom: 120, right: 720, top: 80 }],
      [screen.getByRole("row", { name: /快捷回复/ }), { bottom: 160, right: 720, top: 120 }],
      [screen.getByRole("row", { name: /素材中心/ }), { bottom: 200, right: 720, top: 160 }],
    ] as const;
    const rectSpies = rowRects.map(([row, rect]) =>
      vi.spyOn(row, "getBoundingClientRect").mockReturnValue(createDomRect(rect)),
    );

    fireEvent.mouseDown(paymentDragHandle, {
      clientY: 100,
    });
    fireEvent.mouseMove(document, {
      clientY: 20,
    });
    fireEvent.mouseUp(document, {
      clientY: 20,
    });
    rectSpies.forEach((spy) => spy.mockRestore());
    await waitFor(() => {
      expect(mock.history.put.some((request) => request.url === "/server/settings/sidebar-items/sort")).toBe(
        true,
      );
    });
    const sortRequest = mock.history.put.find(
      (request) => request.url === "/server/settings/sidebar-items/sort",
    );
    expect(JSON.parse(sortRequest?.data ?? "{}")).toEqual({
      itemIds: ["202", "201", "203", "204", "205"],
    });

    await user.click(screen.getByRole("button", { name: "打开 客户详情 操作菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "删除" }));
    expect(screen.getByRole("alertdialog", { name: "删除侧边栏页面" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() => {
      expect(mock.history.delete[0]?.url).toBe("/server/settings/sidebar-items/203");
    });
    expect(useWorkbenchStore.getState().sidebarItems.some((item) => item.id === "203")).toBe(false);
  });

  it("shows API error message when updating a sidebar item fails", async () => {
    const user = userEvent.setup();

    mock.resetHandlers();
    mockAuthenticatedSession();
    mock.onGet("/server/settings/sidebar-items").reply(200, {
      data: {
        items: [
          {
            bindTypes: ["1", "2"],
            id: "201",
            name: "企业名片",
            sort: 1,
            status: "active",
            url: "https://example.com/card",
          },
        ],
      },
      success: true,
    });
    mock.onPut("/server/settings/sidebar-items/201").reply(400, {
      error: {
        code: "INVALID_SIDEBAR_URL",
        message: "页面地址必须使用 HTTPS 协议",
      },
      success: false,
    });
    renderRoute("/chat/settings/sidebar");

    await user.click(await screen.findByRole("button", { name: "打开 企业名片 操作菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "编辑" }));
    await user.clear(screen.getByLabelText("页面地址"));
    await user.type(screen.getByLabelText("页面地址"), "http://example.com/card");
    await user.click(screen.getByRole("button", { name: "确认提交" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("页面地址必须使用 HTTPS 协议");
    });
  });

  it("keeps sidebar preview fallback ordering aligned with numeric database ids", async () => {
    mock.resetHandlers();
    mockAuthenticatedSession();
    mock.onGet("/server/settings/sidebar-items").reply(200, {
      data: {
        items: [
          {
            bindTypes: ["1", "2"],
            id: "10",
            name: "十号页面",
            sort: 9,
            status: "active",
            url: "https://example.com/ten",
          },
          {
            bindTypes: ["1", "2"],
            id: "2",
            name: "二号页面",
            sort: 9,
            status: "active",
            url: "https://example.com/two",
          },
        ],
      },
      success: true,
    });
    renderRoute("/chat/settings/sidebar");

    const sidebarPreview = within(
      await screen.findByRole("complementary", { name: "聊天工具栏示意图" }),
    );
    const fallbackPreviewItems = await sidebarPreview.findAllByText(/号页面/);

    expect(fallbackPreviewItems.map((item) => item.textContent)).toEqual([
      "二号页面",
      "十号页面",
    ]);
  });

  it("limits sidebar item creation by count and name length", async () => {
    const user = userEvent.setup();
    mock.resetHandlers();
    mockAuthenticatedSession();
    mock.onGet("/server/settings/sidebar-items").reply(200, {
      data: {
        items: Array.from({ length: 10 }, (_, index) => ({
          bindTypes: ["1", "2"],
          id: String(index + 1),
          name: `页面${index + 1}`,
          sort: index + 1,
          status: "active",
          url: `https://example.com/page-${index + 1}`,
        })),
      },
      success: true,
    });
    renderRoute("/chat/settings/sidebar");

    expect(await screen.findByRole("button", { name: "打开 页面10 操作菜单" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增页面" })).toBeDisabled();

    cleanup();
    mock.resetHandlers();
    mockAuthenticatedSession();
    mock.onGet("/server/settings/sidebar-items").reply(200, {
      data: {
        items: Array.from({ length: 9 }, (_, index) => ({
          bindTypes: ["1", "2"],
          id: String(index + 1),
          name: `页面${index + 1}`,
          sort: index + 1,
          status: "active",
          url: `https://example.com/page-${index + 1}`,
        })),
      },
      success: true,
    });
    renderRoute("/chat/settings/sidebar");

    expect(await screen.findByRole("button", { name: "打开 页面9 操作菜单" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增页面" })).toBeEnabled();

    cleanup();
    mock.resetHandlers();
    mockAuthenticatedSession();
    mock.onGet("/server/settings/sidebar-items").reply(200, {
      data: {
        items: [],
      },
      success: true,
    });
    mock.onPost("/server/settings/sidebar-items").reply(200, {
      data: {
        bindTypes: ["1", "2"],
        id: "1",
        name: "TooLongName",
        sort: 1,
        status: "active",
        url: "https://example.com/too-long",
      },
      success: true,
    });
    renderRoute("/chat/settings/sidebar");

    await user.click(await screen.findByRole("button", { name: "新增页面" }));
    await user.type(screen.getByLabelText("页面名称"), "超过四字了");
    await user.type(screen.getByLabelText("页面地址"), "https://example.com/too-long");
    await user.click(screen.getByRole("button", { name: "确认提交" }));

    expect(screen.getByText("页面名称最多 8 个字符")).toBeInTheDocument();
    expect(mock.history.post).toHaveLength(0);
  });

  it("shows sidebar item api error messages returned by success false envelopes", async () => {
    const user = userEvent.setup();
    mock.resetHandlers();
    mockAuthenticatedSession();
    mock.onGet("/server/settings/sidebar-items").reply(200, {
      data: {
        items: [],
      },
      success: true,
    });
    mock.onPost("/server/settings/sidebar-items").reply(200, {
      error: {
        code: "INVALID_SIDEBAR_URL",
        message: "请输入有效的页面地址",
      },
      success: false,
    });

    renderRoute("/chat/settings/sidebar");

    await user.click(await screen.findByRole("button", { name: "新增页面" }));
    await user.type(screen.getByLabelText("页面名称"), "素材中心");
    await user.type(screen.getByLabelText("页面地址"), "not-a-url");
    await user.click(screen.getByRole("button", { name: "确认提交" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("请输入有效的页面地址");
    });
    expect(screen.queryByText("操作失败，请稍后重试")).not.toBeInTheDocument();
  });

  it("creates, edits, toggles, and deletes sub-accounts from settings", async () => {
    const user = userEvent.setup();
    mock.onPost("/server/settings/sub-accounts").reply((config) => [
      200,
      {
        data: {
          ...JSON.parse(config.data ?? "{}"),
          id: "13",
          seats: [
            {
              avatarUrl: "https://example.com/drc.png",
              name: "德瑞可",
              seatId: "101",
            },
          ],
          status: "active",
          type: 0,
        },
        success: true,
      },
    ]);
    mock.onPut("/server/settings/sub-accounts/11").reply((config) => [
      200,
      {
        data: {
          account: "agent001",
          id: "11",
          ...JSON.parse(config.data ?? "{}"),
          seats: [],
          status: "active",
          type: 0,
        },
        success: true,
      },
    ]);
    mock.onPatch("/server/settings/sub-accounts/11/status").reply(200, {
      data: {
        account: "agent001",
        id: "11",
        name: "客服一号",
        role: "admin",
        seats: [],
        status: "disabled",
        type: 0,
      },
      success: true,
    });
    mock.onDelete("/server/settings/sub-accounts/12").reply(200, {
      data: { deleted: true },
      success: true,
    });
    renderRoute("/chat/settings/sub-accounts");

    await user.click(await screen.findByRole("button", { name: "新增子账号" }));
    const createDialog = screen.getByRole("dialog", { name: "添加子账号" });
    expect(createDialog).toBeInTheDocument();
    expect(within(createDialog).queryByRole("heading", { name: "登录信息" })).not.toBeInTheDocument();
    expect(within(createDialog).queryByRole("heading", { name: "权限范围" })).not.toBeInTheDocument();
    expect(
      within(within(createDialog).getByRole("group", { name: "账号信息" })).getByRole(
        "combobox",
        { name: "角色" },
      ),
    ).toBeInTheDocument();
    expect(
      within(within(createDialog).getByRole("group", { name: "分配托管账号" })).getByRole(
        "textbox",
        { name: "搜索并选择托管账号" },
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("已选择 0 个")).toBeInTheDocument();
    expect(screen.getByText("暂无已分配账号")).toBeInTheDocument();
    await user.click(screen.getByRole("textbox", { name: "搜索并选择托管账号" }));
    await user.type(screen.getByRole("textbox", { name: "搜索并选择托管账号" }), "念都");
    expect(screen.getByText("念都堂")).toBeInTheDocument();
    expect(createDialog).toContainElement(screen.getByText("念都堂"));
    expect(screen.queryByText("德瑞可")).not.toBeInTheDocument();
    await user.clear(screen.getByRole("textbox", { name: "搜索并选择托管账号" }));
    await user.type(screen.getByLabelText("登录用户名"), "agent003");
    await user.type(screen.getByLabelText("密码"), "Strong1!");
    await user.type(screen.getByLabelText("姓名"), "客服三号");
    await user.click(screen.getByRole("combobox", { name: "角色" }));
    expect(screen.getByRole("option", { name: "客服（只读）" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "客服" }));
    await user.click(screen.getByRole("textbox", { name: "搜索并选择托管账号" }));
    await user.click(screen.getByRole("checkbox", { name: "德瑞可" }));
    expect(screen.getByText("已选择 1 个")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认提交" }));

    await waitFor(() => {
      expect(mock.history.post).toHaveLength(1);
    });
    expect(JSON.parse(mock.history.post[0]?.data ?? "{}")).toEqual({
      account: "agent003",
      name: "客服三号",
      password: "Strong1!",
      role: "operator",
      seatIds: ["101"],
    });

    await user.click(screen.getByRole("button", { name: "打开 客服一号 操作菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "编辑" }));
    expect(screen.getByRole("dialog", { name: "编辑子账号" })).toBeInTheDocument();
    expect(screen.getByLabelText("登录用户名")).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "角色" })).toHaveTextContent("管理员");
    await user.clear(screen.getByLabelText("姓名"));
    await user.type(screen.getByLabelText("姓名"), "客服一号改");
    await user.click(screen.getByRole("combobox", { name: "角色" }));
    await user.keyboard("{ArrowDown}{Enter}");
    await user.click(screen.getByRole("button", { name: "确认提交" }));

    await waitFor(() => {
      expect(mock.history.put).toHaveLength(1);
    });
    expect(JSON.parse(mock.history.put[0]?.data ?? "{}")).toMatchObject({
      name: "客服一号改",
      password: "",
      role: "operator",
    });

    await user.click(screen.getByRole("button", { name: "打开 客服一号改 操作菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "停用" }));
    await waitFor(() => {
      expect(mock.history.patch).toHaveLength(1);
    });
    expect(JSON.parse(mock.history.patch[0]?.data ?? "{}")).toEqual({
      status: "disabled",
    });

    await user.click(screen.getByRole("button", { name: "打开 客服二号 操作菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "删除" }));
    expect(screen.getByRole("alertdialog", { name: "删除子账号" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() => {
      expect(mock.history.delete[0]?.url).toBe("/server/settings/sub-accounts/12");
    });
  });

  it("validates sub-account password complexity before submitting", async () => {
    const user = userEvent.setup();
    renderRoute("/chat/settings/sub-accounts");

    await user.click(await screen.findByRole("button", { name: "新增子账号" }));
    await user.type(screen.getByLabelText("登录用户名"), "agent003");
    await user.type(screen.getByLabelText("密码"), "weak");
    await user.type(screen.getByLabelText("姓名"), "客服三号");
    await user.click(screen.getByRole("button", { name: "确认提交" }));

    expect(
      screen.getAllByText("密码必须包含大写字母、小写字母、数字、符号").some((element) =>
        element.classList.contains("text-destructive"),
      ),
    ).toBe(true);
    expect(mock.history.post).toHaveLength(0);

    await user.clear(screen.getByLabelText("密码"));
    await user.type(screen.getByLabelText("密码"), "Strong1!");
    await user.click(screen.getByRole("button", { name: "确认提交" }));

    await waitFor(() => {
      expect(mock.history.post).toHaveLength(1);
    });
  });

  it("validates optional password changes when editing sub-accounts", async () => {
    const user = userEvent.setup();
    renderRoute("/chat/settings/sub-accounts");

    await user.click(await screen.findByRole("button", { name: "打开 客服一号 操作菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "编辑" }));
    await user.type(screen.getByLabelText("密码"), "weak");
    await user.click(screen.getByRole("button", { name: "确认提交" }));

    expect(
      screen.getAllByText("密码必须包含大写字母、小写字母、数字、符号").some((element) =>
        element.classList.contains("text-destructive"),
      ),
    ).toBe(true);
    expect(mock.history.put).toHaveLength(0);
  });

  it("shows related sub-account summaries and updates managed-account relations", async () => {
    const user = userEvent.setup();
    mock.onPut("/server/settings/managed-accounts/101/sub-accounts").reply((config) => [
      200,
      {
        data: {
          avatarUrl: "https://example.com/drc.png",
          groupChatCount: 3,
          id: "101",
          name: "德瑞可",
          onlineStatus: "offline",
          subAccounts: [
            {
              account: "agent002",
              id: "12",
              isTakingOver: false,
              name: "客服二号",
              status: "active",
              type: 0,
            },
            {
              account: "agent003",
              id: "13",
              isTakingOver: false,
              name: "客服三号",
              status: "active",
              type: 0,
            },
            {
              account: "agent004",
              id: "14",
              isTakingOver: false,
              name: "客服四号",
              status: "disabled",
              type: 0,
            },
          ],
        },
        success: true,
      },
    ]);
    renderRoute("/chat/settings");

    expect(await screen.findByRole("table", { name: "托管账号列表" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "开通群聊数" })).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(
      await screen.findByText("客服一号（接管中），主账号，客服二号等5人"),
    ).toBeInTheDocument();
    expect(screen.getByText("未关联")).toBeInTheDocument();

    await user.hover(screen.getByRole("button", { name: "查看 德瑞可 的全部关联子账号" }));

    expect(screen.getByText("关联子账号 · 5")).toBeInTheDocument();
    const relatedSubAccountsPopover = screen.getByText("关联子账号 · 5").closest("[role='dialog']");

    expect(relatedSubAccountsPopover).toBeInTheDocument();
    expect(screen.getAllByText("客服四号")).not.toHaveLength(0);
    expect(screen.queryByRole("textbox", { name: "搜索关联子账号" })).not.toBeInTheDocument();
    expect(
      within(relatedSubAccountsPopover as HTMLElement).getAllByLabelText("账号类型：主账号")
        .length,
    ).toBeGreaterThan(0);
    expect(
      within(relatedSubAccountsPopover as HTMLElement).getAllByLabelText("账号类型：子账号")
        .length,
    ).toBeGreaterThan(0);
    expect(
      within(relatedSubAccountsPopover as HTMLElement).getAllByText("已停用").length,
    ).toBeGreaterThan(0);
    expect(
      within(relatedSubAccountsPopover as HTMLElement).queryByLabelText("关联子账号 客服一号"),
    ).not.toBeInTheDocument();

    await user.unhover(screen.getByRole("button", { name: "查看 德瑞可 的全部关联子账号" }));
    await user.click(screen.getByRole("button", { name: "打开 德瑞可 操作菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "关联子账号" }));
    const dialog = screen.getByRole("dialog", { name: "关联子账号" });

    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "搜索并选择子账号" })).not.toHaveFocus();
    expect(screen.getByText("已选择 5 个")).toBeInTheDocument();
    expect(within(dialog).getAllByLabelText("账号类型：主账号").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByLabelText("账号类型：子账号").length).toBeGreaterThan(0);
    expect(within(dialog).queryByText("已启用")).not.toBeInTheDocument();
    expect(within(dialog).getAllByText("已停用").length).toBeGreaterThan(0);
    expect(within(dialog).queryByText("owner")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("agent001")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("关联子账号 客服一号")).not.toBeInTheDocument();

    await user.click(screen.getByRole("textbox", { name: "搜索并选择子账号" }));
    expect(screen.getByRole("checkbox", { name: "主账号" })).toBeInTheDocument();
    expect(dialog).toContainElement(screen.getByRole("checkbox", { name: "主账号" }));
    await user.type(screen.getByRole("textbox", { name: "搜索并选择子账号" }), "二号");
    expect(screen.getByRole("checkbox", { name: "客服二号" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "客服三号" })).not.toBeInTheDocument();
    await user.clear(screen.getByRole("textbox", { name: "搜索并选择子账号" }));
    await user.click(screen.getByRole("checkbox", { name: "客服一号" }));
    expect(screen.getByText("已选择 4 个")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认提交" }));

    await waitFor(() => {
      expect(mock.history.put).toHaveLength(1);
    });
    expect(JSON.parse(mock.history.put[0]?.data ?? "{}")).toEqual({
      subAccountIds: ["1", "12", "13", "14"],
    });
  });

  it("syncs seat groups from the managed accounts table", async () => {
    const user = userEvent.setup();
    mock.onPost("/server/settings/managed-accounts/102/sync-seat-groups").reply(200, {
      data: { synced: true },
      success: true,
    });

    renderRoute("/chat/settings");

    await screen.findByRole("table", { name: "托管账号列表" });
    await user.click(screen.getByRole("button", { name: "打开 念都堂 操作菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "同步群" }));

    await waitFor(() => {
      expect(mock.history.post).toHaveLength(1);
    });
    expect(mock.history.post[0]?.url).toBe(
      "/server/settings/managed-accounts/102/sync-seat-groups",
    );
    expect(JSON.parse(mock.history.post[0]?.data ?? "{}")).toEqual({
      syncMembers: true,
    });
    expect(toast.success).toHaveBeenCalledWith("群聊同步已触发");
  });

  it("marks the main account and disables destructive row actions", async () => {
    const user = userEvent.setup();
    renderRoute("/chat/settings/sub-accounts");

    expect(await screen.findByLabelText("角色：主账号")).toBeInTheDocument();
    expect(screen.getByLabelText("角色：管理员")).toBeInTheDocument();
    expect(screen.getByLabelText("角色：客服")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "打开 主账号 操作菜单" }));

    expect(screen.getByRole("menuitem", { name: "编辑" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "停用" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: "删除" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("closes the managed account picker when clicking outside it", async () => {
    const user = userEvent.setup();
    renderRoute("/chat/settings/sub-accounts");

    await user.click(await screen.findByRole("button", { name: "新增子账号" }));
    await user.click(screen.getByRole("textbox", { name: "搜索并选择托管账号" }));

    expect(screen.getByRole("checkbox", { name: "德瑞可" })).toBeInTheDocument();

    await user.click(screen.getByRole("dialog", { name: "添加子账号" }));

    await waitFor(() => {
      expect(screen.queryByRole("checkbox", { name: "德瑞可" })).not.toBeInTheDocument();
    });
  });

  it("summarizes many related WeCom seats with avatars and shows a display-only popover", async () => {
    const user = userEvent.setup();
    renderRoute("/chat/settings/sub-accounts");

    expect(await screen.findByRole("table", { name: "子账号列表" })).toBeInTheDocument();
    expect(await screen.findByLabelText("关联托管账号 德瑞可")).toBeInTheDocument();
    expect(screen.getByLabelText("关联托管账号 念都堂")).toBeInTheDocument();
    expect(screen.getByLabelText("关联托管账号 中台号")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.queryByText("共 4 个")).not.toBeInTheDocument();
    expect(screen.queryByText("售后号")).not.toBeInTheDocument();

    await user.hover(
      screen.getByRole("button", { name: "查看 客服一号 的全部关联托管账号" }),
    );

    expect(screen.getByText("关联托管账号 · 4")).toBeInTheDocument();
    expect(screen.getByText("中台号")).toBeInTheDocument();
    expect(screen.getByText("售后号")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "搜索关联托管账号" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: "德瑞可" })[0]).toHaveAttribute(
      "src",
      "https://example.com/drc.png",
    );

    await user.unhover(
      screen.getByRole("button", { name: "查看 客服一号 的全部关联托管账号" }),
    );

    await waitFor(() => {
      expect(screen.queryByText("关联托管账号 · 4")).not.toBeInTheDocument();
    });
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    expect(screen.queryByText("关联托管账号 · 4")).not.toBeInTheDocument();
  });

  it("shows a single related WeCom seat as one avatar without a total count", async () => {
    const user = userEvent.setup();
    mock.resetHandlers();
    mockAuthenticatedSession();
    mock.onGet("/server/settings/sub-accounts").reply(200, {
      data: {
        seats: [
          {
            avatarUrl: "https://example.com/drc.png",
            name: "德瑞可",
            seatId: "101",
          },
        ],
        subAccounts: [
          {
            account: "agent001",
            id: "11",
            name: "客服一号",
            role: "operator",
            seats: [
              {
                avatarUrl: "https://example.com/drc.png",
                name: "德瑞可",
                seatId: "101",
              },
            ],
            status: "active",
            type: 0,
          },
        ],
      },
      success: true,
    });
    renderRoute("/chat/settings/sub-accounts");

    expect(await screen.findByLabelText("关联托管账号 德瑞可")).toBeInTheDocument();
    expect(screen.queryByText("共 1 个")).not.toBeInTheDocument();
    await user.hover(
      screen.getByRole("button", { name: "查看 客服一号 的全部关联托管账号" }),
    );
    expect(screen.getByText("关联托管账号 · 1")).toBeInTheDocument();
  });

  it("paginates sub-accounts locally with 10 rows per page", async () => {
    const user = userEvent.setup();
    mock.resetHandlers();
    mockAuthenticatedSession();
    mock.onGet("/server/settings/sub-accounts").reply(200, {
      data: {
        seats: [],
        subAccounts: Array.from({ length: 11 }, (_, index) => ({
          account: `agent${String(index + 1).padStart(3, "0")}`,
          id: String(index + 1),
          name: `客服${index + 1}`,
          role: "operator",
          seats: [],
          status: "active",
          type: 0,
        })),
      },
      success: true,
    });

    renderRoute("/chat/settings/sub-accounts");

    expect(await screen.findByText("客服1")).toBeInTheDocument();
    expect(screen.getByText("客服10")).toBeInTheDocument();
    expect(screen.queryByText("客服11")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下一页" }));

    expect(screen.getByText("客服11")).toBeInTheDocument();
    expect(screen.queryByText("客服1")).not.toBeInTheDocument();
    expect(
      mock.history.get.filter((request) => request.url === "/server/settings/sub-accounts"),
    ).toHaveLength(1);

    await user.type(screen.getByRole("textbox", { name: "搜索子账号" }), "agent001");

    expect(screen.getByText("客服1")).toBeInTheDocument();
    expect(screen.queryByText("客服11")).not.toBeInTheDocument();
  });

  it("returns to the first sub-account page after creating a new account", async () => {
    const user = userEvent.setup();
    mock.resetHandlers();
    mockAuthenticatedSession();
    mock.onGet("/server/settings/sub-accounts").reply(200, {
      data: {
        seats: [],
        subAccounts: Array.from({ length: 11 }, (_, index) => ({
          account: `agent${String(index + 1).padStart(3, "0")}`,
          id: String(index + 1),
          name: `客服${index + 1}`,
          role: "operator",
          seats: [],
          status: "active",
          type: 0,
        })),
      },
      success: true,
    });
    mock.onPost("/server/settings/sub-accounts").reply((config) => [
      200,
      {
        data: {
          ...JSON.parse(config.data ?? "{}"),
          id: "12",
          seats: [],
          status: "active",
          type: 0,
        },
        success: true,
      },
    ]);

    renderRoute("/chat/settings/sub-accounts");

    await user.click(await screen.findByRole("button", { name: "下一页" }));
    expect(screen.getByText("客服11")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "新增子账号" }));
    await user.type(screen.getByLabelText("登录用户名"), "agent012");
    await user.type(screen.getByLabelText("密码"), "Strong1!");
    await user.type(screen.getByLabelText("姓名"), "客服十二号");
    await user.click(screen.getByRole("button", { name: "确认提交" }));

    expect(await screen.findByText("客服十二号")).toBeInTheDocument();
    expect(screen.queryByText("客服11")).not.toBeInTheDocument();
  });

  it("paginates managed accounts locally with 10 rows per page", async () => {
    const user = userEvent.setup();
    mock.resetHandlers();
    mockAuthenticatedSession();
    mock.onGet("/server/settings/managed-accounts").reply(200, {
      data: {
        managedAccounts: Array.from({ length: 11 }, (_, index) => ({
          avatarUrl: "",
          groupChatCount: 0,
          id: String(index + 1),
          name: `托管${index + 1}`,
          onlineStatus: "offline",
          subAccounts: [],
        })),
        subAccounts: [],
      },
      success: true,
    });

    renderRoute("/chat/settings");

    expect(await screen.findByText("托管1")).toBeInTheDocument();
    expect(screen.getByText("托管10")).toBeInTheDocument();
    expect(screen.queryByText("托管11")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下一页" }));

    expect(screen.getByText("托管11")).toBeInTheDocument();
    expect(screen.queryByText("托管1")).not.toBeInTheDocument();
    expect(
      mock.history.get.filter((request) => request.url === "/server/settings/managed-accounts"),
    ).toHaveLength(1);

    await user.type(screen.getByRole("textbox", { name: "搜索托管账号" }), "托管1");

    expect(screen.getByText("托管1")).toBeInTheDocument();
    expect(screen.getByText("托管10")).toBeInTheDocument();
    expect(screen.queryByText("托管2")).not.toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "下一页" })).not.toBeInTheDocument();
    expect(
      mock.history.get.filter((request) => request.url === "/server/settings/managed-accounts"),
    ).toHaveLength(1);
  });

  it("centers the sub-account loading state with the shared loader", async () => {
    mock.resetHandlers();
    mockAuthenticatedSession();
    mock.onGet("/server/settings/sub-accounts").reply(
      () => new Promise(() => undefined),
    );

    renderRoute("/chat/settings/sub-accounts");

    const loadingText = await screen.findByText("正在加载子账号");
    const loadingStatus = screen.getByRole("status", { name: "正在加载子账号" });

    expect(loadingStatus).toContainElement(loadingText);
    expect(screen.getByLabelText("正在加载")).toBeInTheDocument();
  });

  it("switches and persists appearance themes from the appearance settings page", async () => {
    const user = userEvent.setup();
    renderRoute("/chat/settings/appearance");

    expect(await screen.findByRole("heading", { name: "外观" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "现代简约 更轻、更克制的 SaaS 风格。" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "默认 当前蓝色主色和 neutral 基线。" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Green 绿色主色，适合健康和增长类语境。" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Claude 暖色 Claude 风格。" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Caffeine 咖啡色调，弱光下更温暖。" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Orange 暖橙主色，适合更有活力的工作台。" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rose 玫瑰红主色，整体更柔和醒目。" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Slack Slack 风格的协作配色。" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Supabase Supabase 风格的开发者绿色。" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sunset 日落暖色，界面氛围更强。" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nature 自然绿和大地色，观感更有机。" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Claude 暖色 Claude 风格。" }));

    expect(document.documentElement).toHaveAttribute("data-appearance-theme", "claude");
    expect(window.localStorage.getItem("chat-ai-appearance-theme")).toBe("claude");
    expect(screen.getByRole("button", { name: "Claude 暖色 Claude 风格。" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("switches and persists light and dark mode from the appearance settings page", async () => {
    const user = userEvent.setup();
    renderRoute("/chat/settings/appearance");

    expect(await screen.findByRole("heading", { name: "外观模式" })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "深色模式" }));

    expect(document.documentElement).toHaveClass("dark");
    expect(window.localStorage.getItem("chat-ai-theme")).toBe("dark");

    await user.click(screen.getByRole("radio", { name: "浅色模式" }));

    expect(document.documentElement).not.toHaveClass("dark");
    expect(window.localStorage.getItem("chat-ai-theme")).toBe("light");
  });

  it("follows system mode from the appearance settings page", async () => {
    const user = userEvent.setup();
    const mediaQuery = setSystemColorScheme(true);
    window.localStorage.setItem("chat-ai-theme", "light");

    renderRoute("/chat/settings/appearance");

    await user.click(await screen.findByRole("radio", { name: "跟随系统模式" }));

    expect(document.documentElement).toHaveClass("dark");
    expect(window.localStorage.getItem("chat-ai-theme")).toBe("system");

    mediaQuery.setMatches(false);
    await waitFor(() => {
      expect(document.documentElement).not.toHaveClass("dark");
    });
  });

  it("shows basic UI component demos for settings development references", async () => {
    const user = userEvent.setup();
    renderRoute("/chat/settings");

    await user.click(await screen.findByRole("link", { name: "组件示例" }));

    expect(screen.getByRole("heading", { name: "组件示例" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "分配策略" })).toBeInTheDocument();
    expect(screen.getByLabelText("排班日期")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "打开编辑弹窗" }));

    expect(screen.getByRole("dialog", { name: "编辑接待策略" })).toBeInTheDocument();
    expect(screen.getByLabelText("策略名称")).toHaveValue("接待策略");

    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(
      screen.queryByRole("dialog", { name: "编辑接待策略" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "打开停用确认" }));

    expect(screen.getByRole("alertdialog", { name: "停用接待策略" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认停用" })).toBeInTheDocument();
  });

  it("shows extended UI component demos for common B2B settings patterns", async () => {
    const user = userEvent.setup();
    renderRoute("/chat/settings/ui-kit");

    expect(await screen.findByRole("heading", { name: "组件示例" })).toBeInTheDocument();
    expect(screen.getByText("同步失败：企微素材库暂时不可用")).toBeInTheDocument();
    expect(screen.getByText("导入进度")).toBeInTheDocument();
    expect(screen.getByText("加载占位")).toBeInTheDocument();
    expect(screen.getByText("文字切换")).toBeInTheDocument();
    expect(screen.getByLabelText("文字切换示例")).toHaveTextContent(
      "Agent 正在查看消息",
    );
    expect(screen.getByRole("navigation", { name: "设置路径" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "分页" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "质检抽样比例" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "媒体比例预览" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "打开右侧抽屉" }));

    expect(screen.getByRole("dialog", { name: "编辑账号详情" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "高级分配规则" }));

    expect(screen.getByText("启用后会优先沿用最近一次服务关系。")).toBeInTheDocument();
  });
});

function installLoadedImageMock() {
  class LoadedImageMock extends EventTarget {
    crossOrigin: string | null = null;
    referrerPolicy = "";
    src = "";

    get complete() {
      return true;
    }

    get naturalWidth() {
      return 1;
    }
  }

  vi.stubGlobal("Image", LoadedImageMock);
}

function setSystemColorScheme(matches: boolean) {
  let currentMatches = matches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQuery = {
    get matches() {
      return currentMatches;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: vi.fn((event: string, listener: (event: MediaQueryListEvent) => void) => {
      if (event === "change") {
        listeners.add(listener);
      }
    }),
    removeEventListener: vi.fn((event: string, listener: (event: MediaQueryListEvent) => void) => {
      if (event === "change") {
        listeners.delete(listener);
      }
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    setMatches(nextMatches: boolean) {
      currentMatches = nextMatches;
      const event = { matches: nextMatches } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };

  vi.spyOn(window, "matchMedia").mockReturnValue(mediaQuery as unknown as MediaQueryList);

  return mediaQuery;
}
