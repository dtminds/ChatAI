import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    clearMocks: true,
    environment: "node",
    hookTimeout: 60_000,
    include: ["test/**/*.integration.test.ts"],
    testTimeout: 30_000,
  },
});
