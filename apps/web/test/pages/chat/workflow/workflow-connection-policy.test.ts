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
      target: "action-message",
      targetHandle: null,
    })).toBeUndefined();
    expect(getWorkflowConnectionPolicyViolation(reconnectableDraft, {
      source: "branch-intent",
      sourceHandle: "branch-missing",
      target: "action-message",
      targetHandle: null,
    })).toBe("invalid-handle");
    expect(getWorkflowConnectionPolicyViolation(reconnectableDraft, {
      source: "wait-2d",
      sourceHandle: "branch-high",
      target: "goal",
      targetHandle: null,
    })).toBe("invalid-handle");
    expect(getWorkflowConnectionPolicyViolation(reconnectableDraft, {
      source: "wait-2d",
      sourceHandle: null,
      target: "trigger",
      targetHandle: null,
    })).toBe("invalid-node-kind");
  });

  it("rejects connections when the source or target handle is already occupied", () => {
    const draft = createInitialDraft();

    expect(getWorkflowConnectionPolicyViolation(draft, {
      source: "wait-2d",
      sourceHandle: null,
      target: "goal",
      targetHandle: null,
    })).toBe("source-handle-occupied");
    expect(getWorkflowConnectionPolicyViolation(draft, {
      source: "branch-intent",
      sourceHandle: "branch-normal",
      target: "goal",
      targetHandle: null,
    })).toBe("target-handle-occupied");

    const reconnectableDraft = {
      ...draft,
      edges: [
        ...draft.edges,
        createEdge("branch-intent", "goal", undefined, { sourceHandle: "branch-normal" }),
      ],
    };

    expect(getWorkflowConnectionPolicyViolation(reconnectableDraft, {
      source: "branch-intent",
      sourceHandle: "branch-normal",
      target: "action-message",
      targetHandle: null,
    })).toBe("source-handle-occupied");
  });

  it("treats null and undefined default handles as the same connection identity", () => {
    const draft = createInitialDraft();

    expect(getWorkflowConnectionPolicyViolation(draft, {
      source: "trigger",
      sourceHandle: null,
      target: "wait-2d",
      targetHandle: null,
    })).toBe("duplicate-connection");

    expect(draft.edges.find((edge) =>
      edge.source === "trigger" && edge.target === "wait-2d",
    )?.sourceHandle).toBeUndefined();
  });
});
