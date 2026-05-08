import { defineConfig, mergeConfig } from "vitest/config";
import { createViteConfig } from "./vite.config";

export default mergeConfig(
  createViteConfig("test"),
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./test/setup.ts"],
      include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
      clearMocks: true,
      css: true,
    },
  }),
);
