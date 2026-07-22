import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflowRoot = join(process.cwd(), "src/pages/chat/workflow");
const workflowCss = readFileSync(join(workflowRoot, "workflow-page.css"), "utf8");
const workflowVersionHistory = readFileSync(
  join(workflowRoot, "canvas/workflow-version-history.tsx"),
  "utf8",
);

function getCssBlock(selector: string) {
  const start = workflowCss.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);

  const end = workflowCss.indexOf("\n}", start);
  expect(end).toBeGreaterThan(start);
  return workflowCss.slice(start, end + 2);
}

describe("Workflow theme contract", () => {
  it("defines dark-mode overrides for every canvas-specific contrast boundary", () => {
    const darkBlock = getCssBlock(".dark .workflow-page");
    const darkModeTokens = [
      "--workflow-canvas-bg",
      "--workflow-grid",
      "--workflow-edge",
      "--workflow-border",
      "--workflow-panel-bg-blur",
      "--workflow-node-card-border",
      "--workflow-node-card-border-width",
      "--workflow-node-handle-ring",
      "--workflow-node-accent-strong",
      "--workflow-node-accent-soft",
      "--workflow-control-active",
      "--workflow-divider",
    ];

    for (const token of darkModeTokens) {
      expect(darkBlock).toContain(`${token}:`);
    }
  });

  it("derives workflow surfaces from semantic theme tokens", () => {
    const lightBlock = getCssBlock(".workflow-page");

    expect(lightBlock).toContain("--workflow-panel-bg: var(--card);");
    expect(lightBlock).toContain("--workflow-panel-section: var(--accent);");
    expect(lightBlock).toContain("--workflow-param-bg: var(--muted);");
    expect(lightBlock).toContain("--workflow-text-tertiary: var(--muted-foreground);");
    expect(lightBlock).toContain("--workflow-blue: var(--primary);");
  });

  it("keeps body-ported version history on global semantic tokens", () => {
    expect(workflowVersionHistory).not.toContain("var(--workflow-");
  });
});
