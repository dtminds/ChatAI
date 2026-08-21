import { describe, expect, it } from "vitest";
import {
  createWorkflowNodeExecutionKey,
  getWorkflowExecutionBoundaryDecision,
  transitionRun,
  transitionTask,
  WorkflowStateTransitionError,
} from "../src/index.js";

describe("workflow state machine", () => {
  it("allows recoverable run transitions and rejects terminal transitions", () => {
    expect(transitionRun("queued", "running")).toBe("running");
    expect(transitionRun("queued", "waiting")).toBe("waiting");
    expect(transitionRun("running", "running")).toBe("running");
    expect(transitionRun("waiting", "running")).toBe("running");
    expect(transitionRun("waiting", "completed")).toBe("completed");
    expect(transitionRun("running", "completed")).toBe("completed");
    expect(() => transitionRun("completed", "running")).toThrow(WorkflowStateTransitionError);
    expect(() => transitionRun("cancelled", "queued")).toThrow(WorkflowStateTransitionError);
  });

  it("fences stale task state transitions", () => {
    expect(transitionTask("pending", "leased")).toBe("leased");
    expect(transitionTask("pending", "running")).toBe("running");
    expect(transitionTask("running", "pending")).toBe("pending");
    expect(() => transitionTask("completed", "running")).toThrow(WorkflowStateTransitionError);
  });

  it("creates a stable node execution key", () => {
    const input = { nodeId: "message-1", runId: "91", sequence: 4, uid: "8" };

    expect(createWorkflowNodeExecutionKey(input)).toBe("8:91:message-1:4");
    expect(createWorkflowNodeExecutionKey(input)).toBe(createWorkflowNodeExecutionKey(input));
  });

  it("blocks execution for paused, stopped, and deleted workflows", () => {
    expect(getWorkflowExecutionBoundaryDecision({ bizStatus: 1, runtimeStatus: "active" })).toBe("execute");
    expect(getWorkflowExecutionBoundaryDecision({ bizStatus: 1, runtimeStatus: "paused" })).toBe("defer");
    expect(getWorkflowExecutionBoundaryDecision({ bizStatus: 1, runtimeStatus: "stopped" })).toBe("cancel");
    expect(getWorkflowExecutionBoundaryDecision({ bizStatus: 0, runtimeStatus: "active" })).toBe("cancel");
  });
});
