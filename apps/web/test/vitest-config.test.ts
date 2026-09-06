import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createWebTestViteConfig } from "../vitest.config";

function pluginNames(plugins: unknown): string[] {
  return (Array.isArray(plugins) ? plugins : [])
    .flat()
    .flatMap((plugin) => (Array.isArray(plugin) ? plugin : [plugin]))
    .flatMap((plugin) => {
      if (plugin && typeof plugin === "object" && "name" in plugin) {
        const name = plugin.name;
        return typeof name === "string" ? [name] : [];
      }

      return [];
    });
}

describe("vitest runtime config", () => {
  it("keeps the test Vite pipeline free of Tailwind, COS proxy, and CSS compilation", () => {
    const config = createWebTestViteConfig();
    const names = pluginNames(config.plugins);

    expect(config.test?.css).toBe(false);
    expect(names.some((name) => name.includes("tailwind"))).toBe(false);
    expect(names).not.toContain("cos-dev-proxy");
    expect(config.resolve?.alias).toMatchObject({
      "@chatai/contracts": resolve(
        import.meta.dirname,
        "../../../packages/contracts/src/index.ts",
      ),
    });
  });

  it("runs *.test.ts in node and *.test.tsx in jsdom, excluding workbench integration files from unit", () => {
    const config = createWebTestViteConfig({ testGroup: "unit" });
    const projects = config.test?.projects ?? [];

    expect(projects).toEqual([
      expect.objectContaining({
        test: expect.objectContaining({
          environment: "node",
          include: ["test/**/*.test.ts"],
          name: "node",
        }),
      }),
      expect.objectContaining({
        test: expect.objectContaining({
          environment: "jsdom",
          exclude: ["test/pages/chat/**/*.int.test.tsx"],
          include: ["test/**/*.test.tsx"],
          name: "jsdom",
        }),
      }),
    ]);
  });

  it("limits the integration group to workbench jsdom files", () => {
    const config = createWebTestViteConfig({ testGroup: "integration" });
    const projects = config.test?.projects ?? [];

    expect(projects).toHaveLength(1);
    expect(projects[0]).toEqual(
      expect.objectContaining({
        test: expect.objectContaining({
          environment: "jsdom",
          include: ["test/pages/chat/**/*.int.test.tsx"],
          name: "jsdom",
        }),
      }),
    );
    expect(config.test?.testTimeout).toBe(20_000);
  });
});
