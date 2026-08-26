import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@chatai/contracts": path.resolve(__dirname, "../../packages/contracts/src/index.ts"),
      "@chatai/llm": path.resolve(__dirname, "../../packages/llm/src/index.ts"),
      "@chatai/workflow-engine": path.resolve(__dirname, "../../packages/workflow-engine/src/index.ts"),
      "@chatai/workflow-runtime": path.resolve(__dirname, "../../packages/workflow-runtime/src/index.ts"),
    },
  },
  test: {
    clearMocks: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
