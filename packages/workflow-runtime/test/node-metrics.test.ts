import { describe, expect, it } from "vitest";
import { createNodeMetricDeltas } from "../src/node-metrics.js";

describe("workflow node metrics", () => {
  it("counts one admitted run on the start node without a current balance", () => {
    expect(createNodeMetricDeltas({
      kind: "entered",
      nodeId: "start",
      nodeKind: "start",
    })).toEqual([
      { completed: 0, current: 0, entered: 1, nodeId: "start", passed: 0 },
    ]);
  });

  it("moves current balance and increments passed when a normal node advances", () => {
    expect(createNodeMetricDeltas({
      fromNodeId: "message-1",
      fromNodeKind: "message",
      kind: "advanced",
      toNodeId: "wait-1",
      toNodeKind: "wait",
    })).toEqual([
      { completed: 0, current: -1, entered: 0, nodeId: "message-1", passed: 1 },
      { completed: 0, current: 1, entered: 0, nodeId: "wait-1", passed: 0 },
    ]);
  });

  it("does not expose current or passed metrics for start and end nodes", () => {
    expect(createNodeMetricDeltas({
      fromNodeId: "start",
      fromNodeKind: "start",
      kind: "advanced",
      toNodeId: "end",
      toNodeKind: "end",
    })).toEqual([]);

    expect(createNodeMetricDeltas({
      kind: "completed",
      nodeId: "end",
      nodeKind: "end",
    })).toEqual([
      { completed: 1, current: 0, entered: 0, nodeId: "end", passed: 0 },
    ]);
  });

  it("removes failed or cancelled records from current without counting them as passed", () => {
    expect(createNodeMetricDeltas({
      kind: "left-incomplete",
      nodeId: "wait-1",
      nodeKind: "wait",
    })).toEqual([
      { completed: 0, current: -1, entered: 0, nodeId: "wait-1", passed: 0 },
    ]);
  });
});
