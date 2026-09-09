import { describe, expect, it, vi } from "vitest";
import { resolveTenantState, resolveWorkerHealth } from "../../../../src/modules/ai-hosting/user-memory/user-memory-observability.service.js";
import { UserMemoryWorkerObservability } from "@chatai/user-memory/worker";

describe("user memory observability", () => {
  it("marks stale heartbeats offline and unrecovered failures as errors", () => {
    const now = 100_000;
    expect(resolveWorkerHealth(undefined, now)).toBe("offline");
    expect(resolveWorkerHealth({ reported_at: new Date(now - 46_000), last_failure_at: null, last_success_at: null }, now)).toBe("offline");
    expect(resolveWorkerHealth({ reported_at: new Date(now), last_failure_at: new Date(now - 1), last_success_at: new Date(now - 2) }, now)).toBe("error");
    expect(resolveWorkerHealth({ reported_at: new Date(now), last_failure_at: new Date(now - 2), last_success_at: new Date(now - 1) }, now)).toBe("healthy");
  });

  it("prioritizes disabled, expired-lease, active and due tenant states", () => {
    const now = 100_000;
    const config = { enabled: 1, next_run_at: new Date(now + 1), active_run_id: 1 } as never;
    const running = { status: "running", lease_until: new Date(now + 1) } as never;
    expect(resolveTenantState({ ...config, enabled: 0 } as never, undefined, now)).toBe("disabled");
    expect(resolveTenantState(config, undefined, now)).toBe("warning");
    expect(resolveTenantState(config, { ...running, lease_until: new Date(now - 1) } as never, now)).toBe("warning");
    expect(resolveTenantState(config, running, now)).toBe("running");
    expect(resolveTenantState({ ...config, active_run_id: null, next_run_at: new Date(now - 1) } as never, undefined, now)).toBe("due");
    expect(resolveTenantState({ ...config, active_run_id: null, next_run_at: new Date(now + 1) } as never, undefined, now)).toBe("normal");
  });

  it("upserts the single runtime row with the latest tick result", async () => {
    const values = vi.fn();
    const execute = vi.fn().mockResolvedValue({});
    const update = { execute };
    const insert = { values: vi.fn(() => ({ onDuplicateKeyUpdate: vi.fn((next) => { values(next); return update; }) })) };
    const db = { insertInto: vi.fn(() => insert) };
    let now = 1_000;
    const observability = new UserMemoryWorkerObservability({ db: db as never, logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() } as never, now: () => now, reportedBy: "host:1" });
    const startedAt = observability.tickStarted();
    now = 1_025;
    observability.tickSucceeded(startedAt);
    await observability.stop();
    expect(insert.values).toHaveBeenCalledWith(expect.objectContaining({ runtime_key: "user_memory", last_duration_ms: 25, last_error_code: null, reported_by: "host:1" }));
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ last_duration_ms: 25, last_error_code: null }));
  });

  it("logs worker lifecycle events when observability starts and stops", async () => {
    const execute = vi.fn().mockResolvedValue({});
    const db = {
      insertInto: vi.fn(() => ({
        values: vi.fn(() => ({
          onDuplicateKeyUpdate: vi.fn(() => ({ execute })),
        })),
      })),
    };
    const logger = { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const observability = new UserMemoryWorkerObservability({
      db: db as never,
      logger,
      now: () => 1_000,
      reportedBy: "host:1",
    });

    observability.start();
    await observability.stop();

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ eventCode: "agent_user_memory_worker.started" }),
      "Agent 用户记忆 Worker 已启动",
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ eventCode: "agent_user_memory_worker.stopped" }),
      "Agent 用户记忆 Worker 已停止",
    );
  });
});
