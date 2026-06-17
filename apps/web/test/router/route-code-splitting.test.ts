import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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
  it("loads route page modules through dynamic imports", async () => {
    const routerSource = await readFile(routerSourcePath, "utf8");

    for (const modulePath of routePageModules) {
      expect(routerSource).not.toContain(`from "${modulePath}"`);
      expect(routerSource).not.toContain(`from '${modulePath}'`);
      expect(routerSource).toContain(`import("${modulePath}")`);
    }
  });
});
