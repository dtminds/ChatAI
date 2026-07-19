import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RootLayout } from "@/app/root-layout";
import { notifyAuthSessionChanged } from "@/pages/auth/auth-tokens";
import { requestInstance } from "@/lib/request";
import { routerConfig } from "@/router";
import { useAuthStore } from "@/store/auth-store";
import { useWorkbenchStore } from "@/store/workbench-store";
import type { AuthSubUser } from "@chatai/contracts";

const mock = new MockAdapter(requestInstance);
const operatorSubUser: AuthSubUser = {
  accountType: "sub",
  displayName: "客服一号",
  permissions: ["chat.access", "chat.send", "chat.takeover"],
  role: "operator",
  subUserId: "101",
  uid: 101,
};

describe("auth routes", () => {
  beforeEach(() => {
    setSecureContext(true);
    document.documentElement.classList.remove("dark");
    window.localStorage.clear();
  });

  afterEach(() => {
    mock.reset();
    document.documentElement.classList.remove("dark");
    window.localStorage.clear();
    vi.restoreAllMocks();
    useAuthStore.setState(useAuthStore.getInitialState(), true);
    useWorkbenchStore.setState(useWorkbenchStore.getInitialState(), true);
  });

  it("redirects /chat to /login when the session is missing", async () => {
    mock.onGet("/auth/session").reply(401, {
      error: {
        code: "UNAUTHORIZED",
        message: "登录已失效",
      },
      success: false,
    });
    useWorkbenchStore.setState({
      activeAccountId: "drc",
      bootstrapStatus: "ready",
    });
    const router = createMemoryRouter(routerConfig, {
      initialEntries: ["/chat"],
    });

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/login");
    });
    expect(router.state.location.search).toBe("?redirect=%2Fchat");
    expect(useWorkbenchStore.getState()).toMatchObject({
      activeAccountId: "",
      bootstrapStatus: "idle",
    });
  });

  it("clears workbench state when entering the login page", async () => {
    useWorkbenchStore.setState({
      activeAccountId: "drc",
      bootstrapStatus: "ready",
      messagesByConversationId: {
        "conv-001": [],
      },
    });
    const router = createMemoryRouter(routerConfig, {
      initialEntries: ["/login"],
    });

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(useWorkbenchStore.getState()).toMatchObject({
        activeAccountId: "",
        bootstrapStatus: "idle",
        messagesByConversationId: {},
      });
    });
  });

  it("allows /chat when the session cookie is valid", async () => {
    mock.onGet("/auth/session").reply(200, {
      data: {
        subUser: operatorSubUser,
      },
      success: true,
    });
    const router = createMemoryRouter(routerConfig, {
      initialEntries: ["/chat"],
    });

    render(<RouterProvider router={router} />);

    expect(screen.getByRole("status", { name: "正在验证登录状态" })).toBeInTheDocument();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/chat");
    });
  });

  it("shows a not-found page for an unknown route and returns to the workbench", async () => {
    const user = userEvent.setup();
    mock.onGet("/auth/session").reply(200, {
      data: {
        subUser: operatorSubUser,
      },
      success: true,
    });
    const router = createMemoryRouter(routerConfig, {
      initialEntries: ["/missing-page"],
    });

    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole("heading", { name: "页面不存在" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("alert", { name: "页面加载失败" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "返回首页" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/chat");
    });
  });

  it("keeps following the system theme without the account rail mounted", async () => {
    const mediaQuery = setSystemColorScheme(true);
    window.localStorage.setItem("chat-ai-theme", "system");
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: <RootLayout />,
          children: [
            {
              path: "login",
              element: <div>登录页占位</div>,
            },
          ],
        },
      ],
      {
        initialEntries: ["/login"],
      },
    );

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
    });

    mediaQuery.setMatches(false);

    await waitFor(() => {
      expect(document.documentElement).not.toHaveClass("dark");
    });
  });

  it("checks the session again after a private route redirects to login then login succeeds", async () => {
    mock.onGet("/auth/session").replyOnce(401, {
      error: {
        code: "UNAUTHORIZED",
        message: "登录已失效",
      },
      success: false,
    });
    mock.onGet("/auth/session").reply(200, {
      data: {
        subUser: operatorSubUser,
      },
      success: true,
    });
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: <RootLayout />,
          children: [
            {
              path: "login",
              element: <div>登录页占位</div>,
            },
            {
              path: "chat",
              element: <div>聊天页占位</div>,
            },
          ],
        },
      ],
      {
        initialEntries: ["/chat"],
      },
    );

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/login");
    });
    expect(await screen.findByText("登录页占位")).toBeInTheDocument();

    await router.navigate("/chat");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/chat");
    });
    expect(await screen.findByText("聊天页占位")).toBeInTheDocument();
    expect(mock.history.get.filter((request) => request.url === "/auth/session")).toHaveLength(2);
  });

  it("redirects an active private route when the auth session is cleared", async () => {
    mock.onGet("/auth/session").replyOnce(200, {
      data: {
        subUser: operatorSubUser,
      },
      success: true,
    });
    useWorkbenchStore.setState({
      activeAccountId: "drc",
      bootstrapStatus: "ready",
      messagesByConversationId: {
        "conv-001": [],
      },
      takeoverStatusByAccountId: {
        drc: "taking-over",
      },
    });
    const router = createMemoryRouter(routerConfig, {
      initialEntries: ["/chat"],
    });

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/chat");
    });

    mock.onGet("/auth/session").reply(401, {
      error: {
        code: "UNAUTHORIZED",
        message: "登录已失效",
      },
      success: false,
    });
    notifyAuthSessionChanged();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/login");
    });
    expect(router.state.location.search).toBe("?redirect=%2Fchat");
    expect(useWorkbenchStore.getState()).toMatchObject({
      activeAccountId: "",
      bootstrapStatus: "idle",
      messagesByConversationId: {},
      takeoverStatusByAccountId: {},
    });
  });

  it("preserves a deep private route when the active session expires", async () => {
    mock.onGet("/auth/session").replyOnce(200, {
      data: {
        subUser: operatorSubUser,
      },
      success: true,
    });
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: <RootLayout />,
          children: [
            {
              path: "login",
              element: <div>登录页占位</div>,
            },
            {
              path: "chat/settings/roles",
              element: <div>权限角色页占位</div>,
            },
          ],
        },
      ],
      {
        initialEntries: ["/chat/settings/roles?tab=permissions#matrix"],
      },
    );

    render(<RouterProvider router={router} />);

    expect(await screen.findByText("权限角色页占位")).toBeInTheDocument();

    mock.onGet("/auth/session").reply(401, {
      error: {
        code: "UNAUTHORIZED",
        message: "登录已失效",
      },
      success: false,
    });
    notifyAuthSessionChanged();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/login");
    });
    expect(router.state.location.search).toBe(
      "?redirect=%2Fchat%2Fsettings%2Froles%3Ftab%3Dpermissions%23matrix",
    );
  });

  it("does not recheck an authenticated session on private-route navigation", async () => {
    mock.onGet("/auth/session").reply(200, {
      data: {
        subUser: operatorSubUser,
      },
      success: true,
    });
    const router = createMemoryRouter(routerConfig, {
      initialEntries: ["/chat"],
    });

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/chat");
    });

    await router.navigate("/chat/settings");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/chat/settings");
    });
    expect(mock.history.get.filter((request) => request.url === "/auth/session")).toHaveLength(1);

    notifyAuthSessionChanged();

    await waitFor(() => {
      expect(mock.history.get.filter((request) => request.url === "/auth/session")).toHaveLength(2);
    });
  });

  it("clears user-scoped workbench state when the authenticated sub user changes", async () => {
    mock.onGet("/auth/session").replyOnce(200, {
      data: {
        subUser: operatorSubUser,
      },
      success: true,
    });
    mock.onGet("/auth/session").reply(200, {
      data: {
        subUser: {
          ...operatorSubUser,
          displayName: "客服二号",
          subUserId: "202",
        },
      },
      success: true,
    });
    useWorkbenchStore.setState({
      activeAccountId: "drc",
      bootstrapStatus: "ready",
      messagesByConversationId: {
        "conv-001": [],
      },
      takeoverStatusByAccountId: {
        drc: "taking-over",
      },
    });
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: <RootLayout />,
          children: [
            {
              path: "login",
              element: <div>登录页占位</div>,
            },
            {
              path: "chat",
              element: <div>聊天页占位</div>,
            },
          ],
        },
      ],
      {
        initialEntries: ["/chat"],
      },
    );

    render(<RouterProvider router={router} />);

    expect(await screen.findByText("聊天页占位")).toBeInTheDocument();
    expect(useWorkbenchStore.getState().bootstrapStatus).toBe("ready");

    notifyAuthSessionChanged();

    await waitFor(() => {
      expect(useAuthStore.getState().subUser?.subUserId).toBe("202");
    });

    expect(useWorkbenchStore.getState()).toMatchObject({
      activeAccountId: "",
      bootstrapStatus: "idle",
      messagesByConversationId: {},
      takeoverStatusByAccountId: {},
    });
  });

  it("clears workbench state when auth store already holds a previous user before session sync", async () => {
    useAuthStore.getState().setSession(operatorSubUser);
    useWorkbenchStore.setState({
      activeAccountId: "drc",
      bootstrapStatus: "ready",
      messagesByConversationId: {
        "conv-001": [],
      },
      takeoverStatusByAccountId: {
        drc: "taking-over",
      },
    });
    mock.onGet("/auth/session").reply(200, {
      data: {
        subUser: {
          ...operatorSubUser,
          displayName: "客服二号",
          subUserId: "202",
        },
      },
      success: true,
    });
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: <RootLayout />,
          children: [
            {
              path: "login",
              element: <div>登录页占位</div>,
            },
            {
              path: "chat",
              element: <div>聊天页占位</div>,
            },
          ],
        },
      ],
      {
        initialEntries: ["/chat"],
      },
    );

    render(<RouterProvider router={router} />);

    expect(await screen.findByText("聊天页占位")).toBeInTheDocument();
    notifyAuthSessionChanged();

    await waitFor(() => {
      expect(useAuthStore.getState().subUser?.subUserId).toBe("202");
    });

    expect(useWorkbenchStore.getState()).toMatchObject({
      activeAccountId: "",
      bootstrapStatus: "idle",
      messagesByConversationId: {},
      takeoverStatusByAccountId: {},
    });
  });
});

function setSecureContext(value: boolean) {
  Object.defineProperty(globalThis, "isSecureContext", {
    configurable: true,
    value,
  });

  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value,
  });
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
    addEventListener: vi.fn(
      (event: string, listener: (event: MediaQueryListEvent) => void) => {
        if (event === "change") {
          listeners.add(listener);
        }
      },
    ),
    removeEventListener: vi.fn(
      (event: string, listener: (event: MediaQueryListEvent) => void) => {
        if (event === "change") {
          listeners.delete(listener);
        }
      },
    ),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    setMatches(nextMatches: boolean) {
      currentMatches = nextMatches;
      listeners.forEach((listener) => {
        listener({ matches: nextMatches } as MediaQueryListEvent);
      });
    },
  };

  vi.spyOn(window, "matchMedia").mockReturnValue(
    mediaQuery as unknown as MediaQueryList,
  );

  return mediaQuery;
}
