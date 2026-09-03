import { describe, expect, it } from "vitest";
import {
  getWorkflowConnectionPolicyViolation,
} from "@/pages/chat/workflow/connection-policy";
import {
  createEdge,
  createInitialDraft,
} from "@/pages/chat/workflow/graph";

describe("workflow connection policy", () => {
  it("validates node kinds and handles through node definitions", () => {
    const draft = createInitialDraft();
    const reconnectableDraft = {
      ...draft,
      edges: draft.edges.filter((edge) => edge.source !== "branch-intent"),
    };

    expect(getWorkflowConnectionPolicyViolation(reconnectableDraft, {
      source: "branch-intent",
      sourceHandle: "branch-high",
      target: "message-welcome",
      targetHandle: null,
    })).toBeUndefined();
    expect(getWorkflowConnectionPolicyViolation(reconnectableDraft, {
      source: "branch-intent",
      sourceHandle: "branch-missing",
      target: "message-welcome",
      targetHandle: null,
    })).toBe("invalid-handle");
    expect(getWorkflowConnectionPolicyViolation(reconnectableDraft, {
      source: "wait-2d",
      sourceHandle: "branch-high",
      target: "end",
      targetHandle: null,
    })).toBe("invalid-handle");
    expect(getWorkflowConnectionPolicyViolation(reconnectableDraft, {
      source: "wait-2d",
      sourceHandle: null,
      target: "start",
      targetHandle: null,
    })).toBe("invalid-node-kind");
  });

  it("rejects occupied source handles but allows multiple incoming paths", () => {
    const draft = createInitialDraft();

    expect(getWorkflowConnectionPolicyViolation(draft, {
      source: "wait-2d",
      sourceHandle: null,
      target: "end",
      targetHandle: null,
    })).toBe("source-handle-occupied");
    expect(getWorkflowConnectionPolicyViolation(draft, {
      source: "branch-intent",
      sourceHandle: "branch-default",
      target: "end",
      targetHandle: null,
    })).toBeUndefined();

    const reconnectableDraft = {
      ...draft,
      edges: [
        ...draft.edges,
        createEdge("branch-intent", "end", undefined, { sourceHandle: "branch-default" }),
      ],
    };

    expect(getWorkflowConnectionPolicyViolation(reconnectableDraft, {
      source: "branch-intent",
      sourceHandle: "branch-default",
      target: "message-welcome",
      targetHandle: null,
    })).toBe("source-handle-occupied");
  });

  it("treats null and undefined default handles as the same connection identity", () => {
    const draft = createInitialDraft();

    expect(getWorkflowConnectionPolicyViolation(draft, {
      source: "start",
      sourceHandle: null,
      target: "wait-2d",
      targetHandle: null,
    })).toBe("duplicate-connection");

    expect(draft.edges.find((edge) =>
      edge.source === "start" && edge.target === "wait-2d",
    )?.sourceHandle).toBeUndefined();
  });
});
