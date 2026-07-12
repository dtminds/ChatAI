import { describe, expect, it, vi } from "vitest";
import {
  logWorkflowReadinessTransition,
  logWorkflowRoleHeartbeat,
} from "../src/observability.js";

describe("workflow worker observability", () => {
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
  });

  it("logs readiness only when dependency state changes", () => {
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
    }, "workflow worker readiness recovered");
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
