import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const routePageModules = [
  "@/pages/auth/login-page",
  "@/pages/chat/chat-workbench-page",
  "@/pages/chat/settings/chat-settings-page",
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
  });
});
