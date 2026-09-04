import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@chatai/contracts": path.resolve(
        import.meta.dirname,
        "../contracts/src/index.ts",
      ),
      "@chatai/database": path.resolve(
        import.meta.dirname,
        "../database/src/index.ts",
      ),
    },
  },
  test: {
    clearMocks: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
