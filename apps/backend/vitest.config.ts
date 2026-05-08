import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@chatai/contracts": path.resolve(
        __dirname,
        "../../packages/contracts/src/index.ts",
      ),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    clearMocks: true,
  },
});
