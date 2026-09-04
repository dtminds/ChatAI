import { describe, expect, it, vi } from "vitest";
import { createWorkflowWorkerRuntimeState } from "../src/worker-runtime-state.js";

describe("workflow worker runtime state", () => {
  it("UPSERTs the latest in-memory tick on flush", async () => {
    const insert = vi.fn(async () => undefined);
    const logger = { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const state = createWorkflowWorkerRuntimeState({
      db: createDb(insert) as never,
      flushIntervalMs: 60_000,
      logger,
      now: () => new Date("2026-08-28T13:00:00.000Z"),
      reportedBy: "worker-1",
    });

    state.markStarted("scheduler");
    state.markSucceeded("scheduler", 12);
    state.start();
    await vi.waitFor(() => expect(insert).toHaveBeenCalledOnce());
    expect(insert).toHaveBeenCalledWith({
      values: {
        last_duration_ms: 12,
        last_error_code: null,
        last_failure_at: null,
        last_started_at: new Date("2026-08-28T13:00:00.000Z"),
        last_success_at: new Date("2026-08-28T13:00:00.000Z"),
        reported_at: new Date("2026-08-28T13:00:00.000Z"),
        reported_by: "worker-1",
        role: "scheduler",
      },
    });
    await state.close();
  });

  it("keeps flush failures off the role loop and logs a warning", async () => {
    const insert = vi.fn(async () => {
      throw new Error("db unavailable");
    });
    const logger = { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const state = createWorkflowWorkerRuntimeState({
      db: createDb(insert) as never,
      flushIntervalMs: 60_000,
      logger,
      reportedBy: "worker-1",
    });
    state.markFailed("outbox", { code: "WORKFLOW_OUTBOX_FAILED" });
    state.start();
    await vi.waitFor(() => expect(logger.warn).toHaveBeenCalled());
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "workflow.worker.runtime_state.flush_failed" }),
      "workflow worker runtime state flush failed",
    );
    await expect(state.close()).resolves.toBeUndefined();
  });

  it("reports consumer liveness from subscription health, not message volume", async () => {
    const insert = vi.fn(async () => undefined);
    const state = createWorkflowWorkerRuntimeState({
      db: createDb(insert) as never,
      flushIntervalMs: 60_000,
      logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
      now: () => new Date("2026-08-28T13:00:00.000Z"),
      reportedBy: "worker-1",
    });
    state.markConsumer("task-consumer", true);
    state.markConsumer("entry-consumer", false);
    state.start();
    await vi.waitFor(() => expect(insert).toHaveBeenCalledTimes(2));
    const rows = insert.mock.calls.map((call) => call[0].values);
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        last_error_code: null,
        last_success_at: new Date("2026-08-28T13:00:00.000Z"),
        role: "task-consumer",
      }),
      expect.objectContaining({
        last_error_code: "subscription_disconnected",
        role: "entry-consumer",
      }),
    ]));
    await state.close();
  });
});

function createDb(insert: (input: { values: Record<string, unknown> }) => Promise<unknown>) {
  return {
    insertInto() {
      return {
        values(values: Record<string, unknown>) {
          return {
            onDuplicateKeyUpdate() {
              return {
                async execute() {
                  await insert({ values });
                },
              };
            },
          };
        },
      };
    },
  };
}
