import { afterEach, describe, expect, it, vi } from "vitest";

describe("route code splitting", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/pages/auth/login-page");
    vi.doUnmock("@/pages/chat/chat-workbench-page");
    vi.doUnmock("@/pages/chat/settings/chat-settings-page");
    vi.doUnmock("@/pages/chat/insights/insights-overview-page");
  });

  it("does not import page modules while loading the route configuration", async () => {
    const loadedModules: string[] = [];
    const trackModule = (moduleName: string, exportName: string) => {
      loadedModules.push(moduleName);

      return {
        [exportName]: () => null,
      };
    };

    vi.doMock("@/pages/auth/login-page", () =>
      trackModule("login", "LoginPage"),
    );
    vi.doMock("@/pages/chat/chat-workbench-page", () =>
      trackModule("chat", "ChatWorkbenchRoutePage"),
    );
    vi.doMock("@/pages/chat/settings/chat-settings-page", () =>
      trackModule("settings", "ChatSettingsPage"),
    );
    vi.doMock("@/pages/chat/insights/insights-overview-page", () =>
      trackModule("insights-overview", "InsightsOverviewPage"),
    );
    vi.doMock("@/pages/chat/insights/insights-quality-page", () =>
      trackModule("insights-quality", "InsightsQualityPage"),
    );
    vi.doMock("@/pages/chat/insights/insights-follow-ups-page", () =>
      trackModule("insights-follow-ups", "InsightsFollowUpsPage"),
    );
    vi.doMock("@/pages/chat/insights/insights-business-page", () =>
      trackModule("insights-business", "InsightsBusinessPage"),
    );
    vi.doMock("@/pages/chat/insights/insights-settings-page", () =>
      trackModule("insights-settings", "InsightsSettingsPage"),
    );

    await import("@/router");

    expect(loadedModules).toEqual([]);
  });
});
