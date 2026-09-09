import react from "@vitejs/plugin-react";
import { defineConfig, type ViteUserConfig } from "vitest/config";
import { getRepoRoot, getWebViteResolveConfig } from "./vite.shared.ts";

const nodeTestInclude = ["test/**/*.test.ts"];
const jsdomTestInclude = ["test/**/*.test.tsx"];

export function createWebTestViteConfig({
  isCi = process.env.CI === "true",
}: {
  isCi?: boolean;
} = {}): ViteUserConfig {
  return {
    envDir: getRepoRoot(),
    plugins: [react()],
    resolve: getWebViteResolveConfig(),
    test: {
      clearMocks: true,
      css: false,
      maxWorkers: isCi ? 4 : undefined,
      projects: [createNodeProject(), createJsdomProject()],
      setupFiles: ["./test/setup.ts"],
      testTimeout: isCi ? 10_000 : 5_000,
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

function createJsdomProject() {
  return {
    extends: true as const,
    test: {
      environment: "jsdom" as const,
      include: jsdomTestInclude,
      name: "jsdom",
    },
  };
}

export default defineConfig(createWebTestViteConfig());
