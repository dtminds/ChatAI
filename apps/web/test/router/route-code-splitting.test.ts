import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const routePageModules = [
  "@/pages/auth/login-page",
  "@/pages/not-found-page",
  "@/pages/chat/chat-workbench-page",
  "@/pages/chat/settings/chat-settings-page",
  "@/pages/chat/ai-hosting/agent-management-page",
  "@/pages/chat/ai-hosting/agent-hosting-settings-page",
  "@/pages/chat/ai-hosting/agent-subscription-page",
  "@/pages/chat/ai-hosting/ai-skills-page",
  "@/pages/chat/ai-hosting/ai-skill-settings-page",
  "@/pages/chat/ai-hosting/kb-list-page",
  "@/pages/chat/ai-hosting/kb-detail-page",
  "@/pages/chat/insights/insights-overview-page",
  "@/pages/chat/insights/insights-quality-page",
  "@/pages/chat/insights/insights-follow-ups-page",
  "@/pages/chat/insights/insights-business-page",
  "@/pages/chat/insights/insights-settings-page",
] as const;

const routerSourcePath = join(process.cwd(), "src/router/index.tsx");

describe("route code splitting", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/pages/auth/login-page");
    vi.restoreAllMocks();
  });

  it("loads route page modules through dynamic imports", async () => {
    const routerSource = await readFile(routerSourcePath, "utf8");

    for (const modulePath of routePageModules) {
      expect(routerSource).not.toContain(`from "${modulePath}"`);
      expect(routerSource).not.toContain(`from '${modulePath}'`);
      expect(routerSource).toContain(`import("${modulePath}")`);
    }
  });

  it("shows an accessible route loading state while a lazy page chunk is pending", async () => {
    vi.doMock("@/pages/auth/login-page", () => new Promise(() => undefined));

    const { routerConfig } = await import("@/router");
    const router = createMemoryRouter(routerConfig, {
      initialEntries: ["/login"],
    });

    render(createElement(RouterProvider, { router }));

    expect(
      screen.getByRole("status", { name: "正在加载页面" }),
    ).toBeInTheDocument();
  });

  it("shows an accessible route error state when a lazy page chunk fails", async () => {
    vi.doMock("@/pages/auth/login-page", () =>
      Promise.reject(new Error("Failed to fetch dynamically imported module")),
    );

    const { routerConfig } = await import("@/router");
    const router = createMemoryRouter(routerConfig, {
      initialEntries: ["/login"],
    });

    render(createElement(RouterProvider, { router }));

    expect(
      await screen.findByRole("alert", { name: "页面加载失败" }),
    ).toBeInTheDocument();
    expect(screen.getByText("请刷新页面后重试")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "刷新页面" }),
    ).toBeInTheDocument();
  });

  it("reloads the page when the route error refresh button is clicked", async () => {
    const reloadMock = vi.fn();
    const locationSpy = vi
      .spyOn(window, "location", "get")
      .mockReturnValue({
        ...window.location,
        reload: reloadMock,
      });
    vi.doMock("@/pages/auth/login-page", () =>
      Promise.reject(new Error("Failed to fetch dynamically imported module")),
    );

    const { routerConfig } = await import("@/router");
    const router = createMemoryRouter(routerConfig, {
      initialEntries: ["/login"],
    });

    render(createElement(RouterProvider, { router }));

    fireEvent.click(await screen.findByRole("button", { name: "刷新页面" }));

    expect(reloadMock).toHaveBeenCalledTimes(1);
    locationSpy.mockRestore();
  });

  it("logs lazy page chunk failures for observability", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const chunkError = new Error("Failed to fetch dynamically imported module");
    vi.doMock("@/pages/auth/login-page", () => Promise.reject(chunkError));

    const { routerConfig } = await import("@/router");
    const router = createMemoryRouter(routerConfig, {
      initialEntries: ["/login"],
    });

    render(createElement(RouterProvider, { router }));

    await screen.findByRole("alert", { name: "页面加载失败" });
    const routeErrorCalls = consoleErrorSpy.mock.calls.filter(
      ([message]) => message === "Route error captured:",
    );
    expect(routeErrorCalls).toHaveLength(1);
    const loggedError = routeErrorCalls[0]?.[1];
    const loggedMessages = [
      loggedError instanceof Error ? loggedError.message : "",
      loggedError instanceof Error && loggedError.cause instanceof Error
        ? loggedError.cause.message
        : "",
    ];

    expect(loggedMessages).toContain(chunkError.message);
  });
});
