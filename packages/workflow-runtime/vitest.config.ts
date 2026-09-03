import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@chatai/llm": path.resolve(
        import.meta.dirname,
        "../llm/src/index.ts",
      ),
    },
  },
  test: {
    clearMocks: true,
    environment: "node",
    exclude: ["test/**/*.integration.test.ts"],
    include: ["test/**/*.test.ts"],
  },
});
