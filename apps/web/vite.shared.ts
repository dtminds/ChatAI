import path from "node:path";
import type { UserConfig } from "vite";

export function getRepoRoot() {
  return path.resolve(import.meta.dirname, "../..");
}

export function getWebViteResolveConfig(): NonNullable<UserConfig["resolve"]> {
  const repoRoot = getRepoRoot();

  return {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@chatai/contracts": path.resolve(
        repoRoot,
        "packages/contracts/src/index.ts",
      ),
      "@chatai/workflow-engine/graph": path.resolve(
        repoRoot,
        "packages/workflow-engine/src/graph.ts",
      ),
      "@chatai/workflow-engine/node-contract-registry": path.resolve(
        repoRoot,
        "packages/workflow-engine/src/node-contract-registry.ts",
      ),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  };
}
