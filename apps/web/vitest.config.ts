import react from "@vitejs/plugin-react";
import { defineConfig, type ViteUserConfig } from "vitest/config";
import { getRepoRoot, getWebViteResolveConfig } from "./vite.shared.ts";

const nodeTestInclude = ["test/**/*.test.ts"];
const jsdomTestInclude = ["test/**/*.test.tsx"];
const integrationTestInclude = ["test/pages/chat/**/*.int.test.tsx"];

export function createWebTestViteConfig({
  isCi = process.env.CI === "true",
  testGroup = process.env.VITEST_TEST_GROUP,
}: {
  isCi?: boolean;
  testGroup?: string;
} = {}): ViteUserConfig {
  const testTimeout =
    testGroup === "integration" ? 20_000 : isCi ? 10_000 : 5_000;
  const jsdomInclude =
    testGroup === "integration" ? integrationTestInclude : jsdomTestInclude;
  const jsdomExclude = testGroup === "unit" ? integrationTestInclude : [];
  const projects =
    testGroup === "integration"
      ? [createJsdomProject(jsdomInclude, jsdomExclude)]
      : [createNodeProject(), createJsdomProject(jsdomInclude, jsdomExclude)];

  return {
    envDir: getRepoRoot(),
    plugins: [react()],
    resolve: getWebViteResolveConfig(),
    test: {
      clearMocks: true,
      css: false,
      maxWorkers: isCi ? 4 : undefined,
      passWithNoTests: testGroup === "integration",
      projects,
      setupFiles: ["./test/setup.ts"],
      testTimeout,
    },
  };
}

function createNodeProject() {
  return {
    extends: true as const,
    test: {
      environment: "node" as const,
      include: nodeTestInclude,
      name: "node",
    },
  };
}

function createJsdomProject(include: string[], exclude: string[]) {
  return {
    extends: true as const,
    test: {
      environment: "jsdom" as const,
      exclude,
      include,
      name: "jsdom",
    },
  };
}

export default defineConfig(createWebTestViteConfig());
