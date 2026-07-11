import { describe, expect, it } from "vitest";
import {
  createWorkflowActionIdempotencyKey,
  getWorkflowExecutionBoundaryDecision,
  transitionRun,
  transitionTask,
  WorkflowStateTransitionError,
} from "../src/index.js";

describe("workflow state machine", () => {
  it("allows recoverable run transitions and rejects terminal transitions", () => {
    expect(transitionRun("waiting", "running")).toBe("running");
    expect(transitionRun("running", "completed")).toBe("completed");
    expect(() => transitionRun("completed", "running")).toThrow(WorkflowStateTransitionError);
    expect(() => transitionRun("cancelled", "queued")).toThrow(WorkflowStateTransitionError);
  });

  it("fences stale task state transitions", () => {
    expect(transitionTask("pending", "leased")).toBe("leased");
    expect(transitionTask("running", "pending")).toBe("pending");
    expect(() => transitionTask("completed", "running")).toThrow(WorkflowStateTransitionError);
  });

  it("creates a stable action idempotency key", () => {
    const input = { nodeId: "message-1", runId: "91", sequence: 4, uid: "8" };

    expect(createWorkflowActionIdempotencyKey(input)).toBe("8:91:message-1:4");
    expect(createWorkflowActionIdempotencyKey(input)).toBe(createWorkflowActionIdempotencyKey(input));
  });

  it("blocks execution for paused, stopped, and deleted workflows", () => {
    expect(getWorkflowExecutionBoundaryDecision({ bizStatus: 1, runtimeStatus: "active" })).toBe("execute");
    expect(getWorkflowExecutionBoundaryDecision({ bizStatus: 1, runtimeStatus: "paused" })).toBe("defer");
    expect(getWorkflowExecutionBoundaryDecision({ bizStatus: 1, runtimeStatus: "stopped" })).toBe("cancel");
    expect(getWorkflowExecutionBoundaryDecision({ bizStatus: 0, runtimeStatus: "active" })).toBe("cancel");
  });
});
