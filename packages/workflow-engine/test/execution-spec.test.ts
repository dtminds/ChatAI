import type { WorkflowExecutionSpec } from "@chatai/contracts";
import { describe, expect, it } from "vitest";
import { normalizeWorkflowExecutionSpec } from "../src/index.js";

describe("Workflow Execution Spec persistence", () => {
  it("clones a valid v3 spec", () => {
    const spec = executionSpec();

    const normalized = normalizeWorkflowExecutionSpec(spec);

    expect(normalized).toEqual(spec);
    expect(normalized).not.toBe(spec);
  });

  it("rejects a stored spec from an older schema version", () => {
    expect(() => normalizeWorkflowExecutionSpec({
      ...executionSpec(),
      requiredCapabilities: [],
      schemaVersion: 2,
    })).toThrow("schema version 3");
  });

  it("rejects removed capability metadata even when the version claims v3", () => {
    const spec = executionSpec();
    const start = spec.nodes[0];
    if (!start) throw new Error("Start node missing");

    expect(() => normalizeWorkflowExecutionSpec({
      ...spec,
      nodes: [{ ...start, requiredCapabilities: [] }, ...spec.nodes.slice(1)],
    })).toThrow("schema version 3");
  });
});

function executionSpec(): WorkflowExecutionSpec {
  return {
    edges: [{ id: "start-end", source: "start", sourceOutletId: "default", target: "end" }],
    entryNodeId: "start",
    nodes: [
      { config: {}, id: "start", kind: "start", nodeSchemaVersion: 1 },
      { config: {}, id: "end", kind: "end", nodeSchemaVersion: 1 },
    ],
    revision: 1,
    schemaVersion: 3,
    terminalNodeId: "end",
    workflowId: "42",
  };
}
