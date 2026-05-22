import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RootLayout } from "@/app/root-layout";
import { notifyAuthSessionChanged } from "@/pages/auth/auth-tokens";
import { requestInstance } from "@/lib/request";
import { routerConfig } from "@/router";
import { useAuthStore } from "@/store/auth-store";

const mock = new MockAdapter(requestInstance);
const operatorSubUser = {
  accountType: "sub" as const,
  displayName: "客服一号",
  permissions: ["chat.access", "chat.send", "chat.takeover"] as const,
  role: "operator" as const,
  subUserId: "101",
};

describe("auth routes", () => {
  beforeEach(() => {
    setSecureContext(true);
  });

  afterEach(() => {
    mock.reset();
    useAuthStore.setState(useAuthStore.getInitialState(), true);
  });

  it("redirects /chat to /login when the session is missing", async () => {
    mock.onGet("/auth/session").reply(401, {
      error: {
        code: "UNAUTHORIZED",
        message: "登录已失效",
      },
      success: false,
    });
    const router = createMemoryRouter(routerConfig, {
      initialEntries: ["/chat"],
    });

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/login");
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
    expect(screen.getByText("登录页占位")).toBeInTheDocument();

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
