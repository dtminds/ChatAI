import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@chatai/contracts": path.resolve(import.meta.dirname, "../contracts/src/index.ts"),
    },
  },
  test: {
    clearMocks: true,
    environment: "node",
    hookTimeout: 60_000,
    include: ["test/**/*.integration.test.ts"],
    testTimeout: 30_000,
  },
});
