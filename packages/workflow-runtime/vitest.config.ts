import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    clearMocks: true,
    environment: "node",
    exclude: ["test/**/*.integration.test.ts"],
    include: ["test/**/*.test.ts"],
  },
});
