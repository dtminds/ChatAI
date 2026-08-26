import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@chatai/database": path.resolve(
        import.meta.dirname,
        "../../packages/database/src/index.ts",
      ),
      "@chatai/insights": path.resolve(
        import.meta.dirname,
        "../../packages/insights/src/index.ts",
      ),
      "@chatai/llm": path.resolve(
        import.meta.dirname,
        "../../packages/llm/src/index.ts",
      ),
      "@chatai/user-memory": path.resolve(
        import.meta.dirname,
        "../../packages/user-memory/src/index.ts",
      ),
    },
  },
  test: {
    clearMocks: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
