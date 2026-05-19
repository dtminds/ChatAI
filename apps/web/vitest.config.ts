import { defineConfig, mergeConfig } from "vitest/config";
import { createViteConfig } from "./vite.config";

const isCi = process.env.CI === "true";
const testGroup = process.env.VITEST_TEST_GROUP;
const baseTestInclude = ["test/**/*.test.ts", "test/**/*.test.tsx"];
const integrationTestInclude = ["test/pages/chat/**/*.int.test.tsx"];
const testTimeout =
  testGroup === "integration"
    ? isCi
      ? 20_000
      : 20_000
    : isCi
      ? 10_000
      : 5_000;

const testInclude =
  testGroup === "integration"
    ? integrationTestInclude
    : [...baseTestInclude, ...integrationTestInclude];

const testExclude = testGroup === "unit" ? integrationTestInclude : [];

export default mergeConfig(
  createViteConfig("test"),
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./test/setup.ts"],
      exclude: testExclude,
      include: testInclude,
      clearMocks: true,
      css: true,
      maxWorkers: isCi ? 2 : undefined,
      testTimeout,
    },
  }),
);
