import { render, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import MockAdapter from "axios-mock-adapter";
import { afterEach, describe, expect, it } from "vitest";
import { notifyAuthSessionChanged } from "@/pages/auth/auth-tokens";
import { requestInstance } from "@/lib/request";
import { routerConfig } from "@/router";

const mock = new MockAdapter(requestInstance);

describe("auth routes", () => {
  afterEach(() => {
    mock.reset();
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
        subUser: {
          displayName: "客服一号",
          subUserId: "101",
        },
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
  });

  it("redirects an active private route when the auth session is cleared", async () => {
    mock.onGet("/auth/session").replyOnce(200, {
      data: {
        subUser: {
          displayName: "客服一号",
          subUserId: "101",
        },
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
});
