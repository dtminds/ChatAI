import { describe, expect, it, vi } from "vitest";
import {
  createWorkflowEntryConsumeObserver,
  createWorkflowTaskConsumeObserver,
  logWorkflowReadinessTransition,
  logWorkflowRoleHeartbeat,
} from "../src/observability.js";

describe("workflow worker observability", () => {
  it("summarizes Entry outcomes and limits rejected message samples", () => {
    const logger = createLogger();
    const observer = createWorkflowEntryConsumeObserver({
      deadLetterTopic: "entry-dlq",
      logger,
      options: { intervalMs: 3_600_000, sampleLimit: 1 },
    });
    const message = { id: "message-1", redeliveryCount: 2, topic: "entry-topic" };

    observer.record(message, { code: "admitted", disposition: "ack" });
    observer.record(message, { code: "invalid_json", disposition: "ack" });
    observer.record(message, { code: "payload_invalid", disposition: "ack" });
    observer.record(message, {
      code: "temporary_failure",
      disposition: "nack",
      errorCode: "WORKFLOW_ENTITLEMENT_UNAVAILABLE",
      errorName: "WorkflowRuntimeError",
      failureStage: "runtime_admission",
    });
    observer.flush();
    observer.close();

    expect(logger.warn).toHaveBeenNthCalledWith(1, expect.objectContaining({
      code: "invalid_json",
      deadLetterTopic: "entry-dlq",
      event: "workflow.entry.consume.rejected",
      messageId: "message-1",
      redeliveryCount: 2,
      topic: "entry-topic",
    }), "workflow entry message rejected");
    expect(logger.warn).toHaveBeenNthCalledWith(2, expect.objectContaining({
      code: "temporary_failure",
      errorCode: "WORKFLOW_ENTITLEMENT_UNAVAILABLE",
      errorName: "WorkflowRuntimeError",
      event: "workflow.entry.consume.failed",
      failureStage: "runtime_admission",
    }), "workflow entry message processing failed");
    expect(logger.warn.mock.calls[1]?.[0]).not.toHaveProperty("err");
    expect(logger.warn.mock.calls[1]?.[0]).not.toHaveProperty("diagnosticMessage");
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledWith({
      activeRunRejected: 0,
      admitted: 1,
      deduplicated: 0,
      entryPolicyRejected: 0,
      event: "workflow.entry.consume.summary",
      nacked: 1,
      noMatch: 0,
      received: 4,
      rejected: 2,
      role: "entry-consumer",
      runtimeRejected: 0,
    }, "workflow entry consume summary");
  });

  it("summarizes Task outcomes and limits failure samples without storing message IDs", () => {
    const logger = createLogger();
    const observer = createWorkflowTaskConsumeObserver({
      deadLetterTopic: "task-dlq",
      logger,
      options: { intervalMs: 3_600_000, sampleLimit: 1 },
    });
    const message = { id: "message-1", redeliveryCount: 1, topic: "task-topic" };
    const command = { runId: "5", taskId: "7", taskVersion: 3, uid: "9" };

    observer.record(message, { code: "completed", command, disposition: "ack" });
    observer.record(message, {
      code: "temporary_failure",
      command,
      disposition: "nack",
      error: new Error("database unavailable"),
    });
    observer.record({ ...message, id: "message-2" }, {
      code: "temporary_failure",
      command,
      disposition: "nack",
      error: new Error("still unavailable"),
    });
    observer.record(message, { code: "invalid_task_message", disposition: "nack" });
    observer.flush();
    observer.close();

    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenNthCalledWith(1, expect.objectContaining({
      deadLetterTopic: "task-dlq",
      event: "workflow.task.consume.failed",
      messageId: "message-1",
      runId: "5",
      taskId: "7",
    }), "workflow task message processing failed");
    expect(logger.warn).toHaveBeenNthCalledWith(2, expect.objectContaining({
      code: "invalid_task_message",
      event: "workflow.task.consume.rejected",
    }), "workflow task message rejected");
    expect(logger.info).toHaveBeenCalledWith({
      ackedBoundary: 0,
      capabilityFailed: 0,
      completed: 1,
      event: "workflow.task.consume.summary",
      invalid: 1,
      nacked: 2,
      nodeFailed: 0,
      received: 4,
      retryScheduled: 0,
      role: "task-consumer",
    }, "workflow task consume summary");
  });

  it("keeps idle polling at debug level", () => {
    const logger = createLogger();

    logWorkflowRoleHeartbeat(logger, "scheduler", {
      completedAt: new Date("2026-07-12T00:00:00.000Z"),
      durationMs: 12,
      result: { cancelled: 0, deferred: 0, dispatched: 0 },
    });

    expect(logger.debug).toHaveBeenCalledWith({
      cancelled: 0,
      deferred: 0,
      dispatched: 0,
      durationMs: 12,
      event: "workflow.worker.role.idle",
      role: "scheduler",
    }, "workflow worker role idle");
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("records completed work at info and recovery signals at warn", () => {
    const logger = createLogger();

    logWorkflowRoleHeartbeat(logger, "scheduler", {
      completedAt: new Date("2026-07-12T00:00:00.000Z"),
      durationMs: 18,
      result: { cancelled: 0, deferred: 0, dispatched: 3 },
    });
    logWorkflowRoleHeartbeat(logger, "outbox", {
      completedAt: new Date("2026-07-12T00:00:01.000Z"),
      durationMs: 24,
      result: { claimed: 2, dead: 0, failed: 1, sent: 1 },
    });
    logWorkflowRoleHeartbeat(logger, "reconciler", {
      completedAt: new Date("2026-07-12T00:00:02.000Z"),
      durationMs: 31,
      result: {
        historyCleanupHasMore: true,
        nodeExecutionsDeleted: 4,
        outboxDeleted: 6,
        runsDeleted: 2,
        tasksDeleted: 5,
      },
    });

    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
      dispatched: 3,
      event: "workflow.worker.role.completed",
      role: "scheduler",
    }), "workflow worker role completed");
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({
      event: "workflow.worker.role.warning",
      failed: 1,
      role: "outbox",
    }), "workflow worker role reported warning counters");
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
      event: "workflow.worker.role.completed",
      historyCleanupHasMore: true,
      nodeExecutionsDeleted: 4,
      outboxDeleted: 6,
      role: "reconciler",
      runsDeleted: 2,
      tasksDeleted: 5,
    }), "workflow worker role completed");
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("records expected workflow cancellations at info", () => {
    const logger = createLogger();

    logWorkflowRoleHeartbeat(logger, "scheduler", {
      completedAt: new Date("2026-07-12T00:00:00.000Z"),
      durationMs: 12,
      result: { cancelled: 2, deferred: 0, dispatched: 0 },
    });
    logWorkflowRoleHeartbeat(logger, "reconciler", {
      completedAt: new Date("2026-07-12T00:00:01.000Z"),
      durationMs: 18,
      result: { cancelled: 3, nextCursor: "run-42", taskLeasesRecovered: 0 },
    });

    expect(logger.info).toHaveBeenNthCalledWith(1, {
      cancelled: 2,
      deferred: 0,
      dispatched: 0,
      durationMs: 12,
      event: "workflow.worker.role.completed",
      role: "scheduler",
    }, "workflow worker role completed");
    expect(logger.info).toHaveBeenNthCalledWith(2, {
      cancelled: 3,
      durationMs: 18,
      event: "workflow.worker.role.completed",
      role: "reconciler",
      taskLeasesRecovered: 0,
    }, "workflow worker role completed");
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("warns on consistency repairs without logging internal cursors", () => {
    const logger = createLogger();

    logWorkflowRoleHeartbeat(logger, "reconciler", {
      completedAt: new Date("2026-07-12T00:00:00.000Z"),
      durationMs: 20,
      result: {
        inconsistentRunsFailed: 1,
        nextConsistencyRunCursor: "91",
        nextConsistencyTaskCursor: "103",
        staleTasksCancelled: 2,
        terminalRunTasksCancelled: 3,
      },
    });

    expect(logger.warn).toHaveBeenCalledWith({
      durationMs: 20,
      event: "workflow.worker.role.warning",
      inconsistentRunsFailed: 1,
      role: "reconciler",
      staleTasksCancelled: 2,
      terminalRunTasksCancelled: 3,
    }, "workflow worker role reported warning counters");
  });

  it("warns when a revision cleanup batch fails", () => {
    const logger = createLogger();

    logWorkflowRoleHeartbeat(logger, "reconciler", {
      completedAt: new Date("2026-07-12T00:00:00.000Z"),
      durationMs: 20,
      result: { revisionCleanupFailed: 1 },
    });

    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({
      event: "workflow.worker.role.warning",
      revisionCleanupFailed: 1,
      role: "reconciler",
    }), "workflow worker role reported warning counters");
  });

  it("keeps consistency scans without repairs at debug level", () => {
    const logger = createLogger();

    logWorkflowRoleHeartbeat(logger, "reconciler", {
      completedAt: new Date("2026-07-12T00:00:00.000Z"),
      durationMs: 20,
      result: {
        inconsistentRunsFailed: 0,
        runsChecked: 100,
        staleTasksCancelled: 0,
        tasksChecked: 100,
        terminalRunTasksCancelled: 0,
      },
    });

    expect(logger.debug).toHaveBeenCalledWith(expect.objectContaining({
      event: "workflow.worker.role.idle",
      role: "reconciler",
      runsChecked: 100,
      tasksChecked: 100,
    }), "workflow worker role idle");
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("logs readiness only when the overall ready status changes", () => {
    const logger = createLogger();
    const ready = {
      broker: true,
      database: true,
      roles: { outbox: true, scheduler: true },
    };

    expect(logWorkflowReadinessTransition(logger, ready, structuredClone(ready))).toBe(false);
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();

    const degraded = {
      ...ready,
      broker: false,
    };
    expect(logWorkflowReadinessTransition(logger, ready, degraded)).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith({
      broker: false,
      database: true,
      event: "workflow.worker.readiness.changed",
      roles: { outbox: true, scheduler: true },
      status: "not-ready",
    }, "workflow worker readiness degraded");

    expect(logWorkflowReadinessTransition(logger, degraded, ready)).toBe(true);
    expect(logger.info).toHaveBeenCalledWith({
      broker: true,
      database: true,
      event: "workflow.worker.readiness.changed",
      roles: { outbox: true, scheduler: true },
      status: "ready",
    }, "workflow worker readiness became ready");
  });

  it("does not report partial startup progress as readiness degradation", () => {
    const logger = createLogger();
    const starting = {
      broker: true,
      database: false,
      roles: { outbox: false, reconciler: false, scheduler: false },
    };
    const partiallyReady = {
      broker: true,
      database: true,
      roles: { outbox: false, reconciler: false, scheduler: true },
    };

    expect(logWorkflowReadinessTransition(logger, starting, partiallyReady)).toBe(false);
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

function createLogger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
}
