import { defineConfig, mergeConfig } from "vitest/config";
import { createViteConfig } from "./vite.config";

const isCi = process.env.CI === "true";

export default mergeConfig(
  createViteConfig("test"),
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./test/setup.ts"],
      include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
      clearMocks: true,
      css: true,
      maxWorkers: isCi ? 2 : undefined,
      testTimeout: isCi ? 10_000 : 5_000,
    },
  }),
);
