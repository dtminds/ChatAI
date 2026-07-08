import { describe, expect, it } from "vitest";
import {
  getWorkflowConnectionPolicyViolation,
} from "@/pages/chat/ai-hosting/workflow/connection-policy";
import {
  createInitialDraft,
} from "@/pages/chat/ai-hosting/workflow/graph";

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
});
