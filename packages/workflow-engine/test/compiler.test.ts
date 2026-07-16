import { describe, expect, it } from "vitest";
import { compileWorkflowDraft, WorkflowCompilationError } from "../src/index.js";

describe("compileWorkflowDraft", () => {
  it("validates and strips canvas-only node data", () => {
    const spec = compileWorkflowDraft({
      draft: createDraft(),
      revision: 3,
      workflowId: "42",
    });

    expect(spec).toMatchObject({
      entryNodeId: "start",
      revision: 3,
      terminalNodeId: "end",
      workflowId: "42",
    });
    expect(spec.nodes.find((node) => node.id === "wait")).toEqual({
      config: { duration: 2, mode: "duration", unit: "day" },
      id: "wait",
      kind: "wait",
      nodeSchemaVersion: 1,
    });
    expect(spec.nodes.find((node) => node.id === "start")?.config).toEqual({
      accountIds: ["account-a"],
      entryPolicy: { mode: "never" },
      triggers: [{ type: "contact.friend_added" }],
    });
    expect(spec.edges[0]).toMatchObject({ sourceOutletId: "default" });
  });

  it("compiles fixed-time wait configuration without duration fields", () => {
    const draft = createDraft();
    const waitNode = draft.nodes.find((node) => node.id === "wait")!;
    waitNode.data = {
      ...waitNode.data,
      dayOffset: 2,
      mode: "fixed-time",
      time: "20:00",
    };
    delete waitNode.data.duration;
    delete waitNode.data.unit;

    const spec = compileWorkflowDraft({ draft, revision: 3, workflowId: "42" });

    expect(spec.nodes.find((node) => node.id === "wait")?.config).toEqual({
      dayOffset: 2,
      mode: "fixed-time",
      time: "20:00",
    });
  });

  it("compiles legacy rolling entry windows with the current maximum", () => {
    const draft = createDraft();
    Object.assign(draft.nodes.find(node => node.id === "start")!.data, {
      entryPolicy: {
        maxEntries: 2,
        mode: "rolling_window",
        windowSize: 365,
        windowUnit: "day",
      },
    });

    const spec = compileWorkflowDraft({ draft, revision: 1, workflowId: "42" });

    expect(spec.nodes.find(node => node.id === "start")?.config.entryPolicy).toEqual({
      maxEntries: 2,
      mode: "rolling_window",
      windowSize: 90,
      windowUnit: "day",
    });
  });

  it("rejects unreachable nodes, cycles, and missing branch outlets", () => {
    const draft = createDraft();
    draft.nodes.splice(2, 0, node("orphan", "message"));
    draft.edges.splice(1, 0, {
      id: "cycle",
      source: "wait",
      target: "start",
    });

    expect(() => compileWorkflowDraft({ draft, revision: 1, workflowId: "42" }))
      .toThrowError(WorkflowCompilationError);

    try {
      compileWorkflowDraft({ draft, revision: 1, workflowId: "42" });
    } catch (error) {
      expect((error as WorkflowCompilationError).issues.map((issue) => issue.code))
        .toEqual(expect.arrayContaining(["cycle", "unreachable-node"]));
    }
  });

  it("propagates the longest depth through merged paths", () => {
    const longPath = Array.from({ length: 17 }, (_, index) => `long-${index + 1}`);
    const draft = {
      edges: [
        { id: "start-branch", source: "start", target: "branch" },
        { id: "branch-short-merge", source: "branch", sourceHandle: "short", target: "merge" },
        { id: "branch-long-first", source: "branch", sourceHandle: "long", target: longPath[0] },
        ...longPath.slice(0, -1).map((source, index) => ({
          id: `${source}-${longPath[index + 1]}`,
          source,
          target: longPath[index + 1],
        })),
        { id: "long-merge", source: longPath.at(-1)!, target: "merge" },
        { id: "merge-end", source: "merge", target: "end" },
      ],
      nodes: [
        node("start", "start"),
        node("branch", "branch", {
          branchPaths: [
            { id: "short", isDefault: true },
            { id: "long" },
          ],
        }),
        ...longPath.map((id) => node(id, "message")),
        node("merge", "message"),
        node("end", "end"),
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    };

    expect(() => compileWorkflowDraft({ draft, revision: 1, workflowId: "42" }))
      .toThrowError(WorkflowCompilationError);
  });

  it("rejects node configurations that would fail only at execution time", () => {
    const invalidWait = createDraft();
    invalidWait.nodes.find((item) => item.id === "wait")!.data.duration = -1;

    expectCompilationIssues(invalidWait, ["invalid-node-config"]);

    const invalidBranch = {
      edges: [
        { id: "start-branch", source: "start", target: "branch" },
        { id: "branch-first-end", source: "branch", sourceHandle: "first", target: "end" },
      ],
      nodes: [
        node("start", "start"),
        node("branch", "branch", {
          branchPaths: [
            { id: "first", isDefault: false },
            { id: "first", isDefault: true },
          ],
        }),
        node("end", "end"),
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    };

    expectCompilationIssues(invalidBranch, ["invalid-node-config"]);
  });

  it("rejects node kinds that Phase 3 cannot execute", () => {
    const draft = createDraft();
    draft.nodes.splice(2, 0, node("message", "message"));
    draft.edges.splice(1, 1,
      { id: "wait-message", source: "wait", target: "message" },
      { id: "message-end", source: "message", target: "end" },
    );

    expectCompilationIssues(draft, ["unsupported-runtime-node"]);
  });
});

function expectCompilationIssues(
  draft: Parameters<typeof compileWorkflowDraft>[0]["draft"],
  expectedCodes: string[],
) {
  try {
    compileWorkflowDraft({ draft, revision: 1, workflowId: "42" });
    throw new Error("Expected workflow compilation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(WorkflowCompilationError);
    expect((error as WorkflowCompilationError).issues.map((issue) => issue.code))
      .toEqual(expect.arrayContaining(expectedCodes));
  }
}

function createDraft() {
  return {
    edges: [
      { id: "start-wait", source: "start", target: "wait" },
      { id: "wait-end", source: "wait", target: "end" },
    ],
    nodes: [
      node("start", "start", startConfig()),
      node("wait", "wait", { duration: 2, mode: "duration", unit: "day" }),
      node("end", "end"),
    ],
    viewport: { x: 100, y: 50, zoom: 1 },
  };
}

function startConfig() {
  return {
    accountIds: ["account-a"],
    entryPolicy: { mode: "never" },
    panelState: { section: "triggers" },
    triggers: [{ type: "contact.friend_added" }],
  };
}

function node(id: string, kind: string, config: Record<string, unknown> = {}) {
  return {
    data: {
      ...config,
      kind,
      label: kind,
      metric: "canvas metric",
      schemaVersion: 1,
      status: "ready",
      title: kind,
    },
    id,
    position: { x: 0, y: 0 },
    type: "workflowNode",
  };
}
