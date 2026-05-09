import { render, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { clearAuthTokens } from "@/pages/auth/auth-tokens";
import { routerConfig } from "@/router";

describe("auth routes", () => {
  it("redirects /chat to /login when no auth token is stored", async () => {
    const router = createMemoryRouter(routerConfig, {
      initialEntries: ["/chat"],
    });

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/login");
    });
  });

  it("allows /chat when a refresh token is stored", async () => {
    window.localStorage.setItem("chatai.refreshToken", "refresh-token-001");
    const router = createMemoryRouter(routerConfig, {
      initialEntries: ["/chat"],
    });

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/chat");
    });
  });

  it("redirects an active private route when auth tokens are cleared", async () => {
    window.localStorage.setItem("chatai.refreshToken", "refresh-token-001");
    const router = createMemoryRouter(routerConfig, {
      initialEntries: ["/chat"],
    });

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/chat");
    });

    clearAuthTokens();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/login");
    });
  });
});
