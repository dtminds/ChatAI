import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@chatai/contracts": path.resolve(
        import.meta.dirname,
        "../../packages/contracts/src/index.ts",
      ),
      "@chatai/database": path.resolve(
        import.meta.dirname,
        "../../packages/database/src/index.ts",
      ),
      "@chatai/insights": path.resolve(
        import.meta.dirname,
        "../../packages/insights/src/index.ts",
      ),
      "@chatai/tickets": path.resolve(
        import.meta.dirname,
        "../../packages/tickets/src/index.ts",
      ),
      "@chatai/user-memory": path.resolve(
        import.meta.dirname,
        "../../packages/user-memory/src/index.ts",
      ),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    clearMocks: true,
  },
});
