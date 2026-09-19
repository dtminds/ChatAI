import type { Redis } from "ioredis";
import { describe, expect, it, vi } from "vitest";
import { createWorkflowTaskCapacity } from "../src/task-capacity.js";

const config = {
  controllerIntervalMs: 300_000,
  controllerLockTtlMs: 30_000,
  deferDelayMs: 60_000,
  deferJitterMs: 0,
  demandWindowMs: 600_000,
  globalConcurrency: 2,
  leaseTtlMs: 60_000,
  quotaTtlMs: 900_000,
  scanLimit: 500,
  stableCycles: 2,
  tenantMaxSharePercent: 50,
};

const leaseDurationMs = 60_000;

const logger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
};

function acquireInput(uid: number, taskId: string, now: Date) {
  return { leaseDurationMs, now, taskId, taskVersion: 1, uid };
}

describe("Workflow Task capacity", () => {
  it("keeps integer global and UID limits in the in-memory fallback", async () => {
    const { port } = createWorkflowTaskCapacity({ config, keyPrefix: "test:", logger });
    const now = new Date("2026-09-19T00:00:00.000Z");

    await expect(port.acquire(acquireInput(1, "task-1", now)))
      .resolves.toMatchObject({ kind: "allowed" });
    await expect(port.acquire(acquireInput(1, "task-2", now)))
      .resolves.toMatchObject({
        kind: "deferred",
        reasonCode: "WORKFLOW_TASK_TENANT_CAPACITY_LIMITED",
      });
    await expect(port.acquire(acquireInput(2, "task-3", now)))
      .resolves.toMatchObject({ kind: "allowed" });
  });

  it("releases only the matching lease token", async () => {
    const { port } = createWorkflowTaskCapacity({ config, keyPrefix: "test:", logger });
    const now = new Date("2026-09-19T00:00:00.000Z");
    const admission = await port.acquire(acquireInput(1, "task-1", now));
    if (admission.kind !== "allowed") throw new Error("Expected a capacity lease");

    await port.release({ uid: 1, lease: { ...admission.lease, token: "stale-token" } });
    await expect(port.acquire(acquireInput(1, "task-2", now)))
      .resolves.toMatchObject({ kind: "deferred" });

    await port.release({ uid: 1, lease: admission.lease });
    await expect(port.acquire(acquireInput(1, "task-2", now)))
      .resolves.toMatchObject({ kind: "allowed" });
  });

  it("keeps a duplicate task delivery from releasing the active lease early", async () => {
    const { port } = createWorkflowTaskCapacity({ config, keyPrefix: "test:", logger });
    const now = new Date("2026-09-19T00:00:00.000Z");
    const first = await port.acquire(acquireInput(1, "task-1", now));
    const duplicate = await port.acquire(acquireInput(1, "task-1", now));
    if (first.kind !== "allowed" || duplicate.kind !== "allowed") {
      throw new Error("Expected duplicate delivery to reuse the capacity lease");
    }

    await port.release({ uid: 1, lease: duplicate.lease });
    await expect(port.acquire(acquireInput(1, "task-2", now)))
      .resolves.toMatchObject({ kind: "deferred" });
    await port.release({ uid: 1, lease: first.lease });
    await expect(port.acquire(acquireInput(1, "task-2", now)))
      .resolves.toMatchObject({ kind: "allowed" });
  });

  it("uses one atomic Redis script for admission and records demand on rejection", async () => {
    const client = {
      eval: vi.fn(async () => [0, 1, "", 0]),
    } as unknown as Redis;
    const { port } = createWorkflowTaskCapacity({ config, keyPrefix: "test:", logger, client });
    const result = await port.acquire({
      leaseDurationMs,
      now: new Date("2026-09-19T00:00:00.000Z"),
      taskId: "task-1",
      taskVersion: 1,
      uid: 9,
    });

    expect(result).toMatchObject({
      kind: "deferred",
      reasonCode: "WORKFLOW_TASK_TENANT_CAPACITY_LIMITED",
    });
    const [script, keyCount] = client.eval.mock.calls[0]!;
    expect(keyCount).toBe(6);
    expect(client.eval.mock.calls[0]?.[7]).toBe("test:workflow:task-capacity:saturated-quota");
    expect(String(script)).toContain("ZREMRANGEBYSCORE");
    expect(String(script)).toContain("ZCARD");
    expect(String(script)).toContain("ZADD");
    expect(String(script)).toContain("PEXPIRE");
  });

  it("uses the same Redis lease token for duplicate admissions", async () => {
    const client = {
      eval: vi.fn(async () => [1, 0, "existing-token", 0]),
    } as unknown as Redis;
    const { port } = createWorkflowTaskCapacity({ config, keyPrefix: "test:", logger, client });
    const result = await port.acquire({
      leaseDurationMs,
      now: new Date("2026-09-19T00:00:00.000Z"),
      taskId: "task-1",
      taskVersion: 1,
      uid: 9,
    });

    expect(result).toEqual({
      kind: "allowed",
      lease: { leaseId: "9|task-1|1", token: "existing-token" },
    });
    if (result.kind !== "allowed") throw new Error("Expected an allowed admission");
    await port.release({
      uid: 9,
      lease: result.lease,
    });
    expect(client.eval).toHaveBeenCalledTimes(2);
  });

  it("shrinks quota from the scanned UID competition set", async () => {
    const client = {
      eval: vi.fn(async () => "OK"),
      hget: vi.fn(async () => undefined),
      hgetall: vi.fn(async () => ({})),
      hset: vi.fn(async () => 1),
      pexpire: vi.fn(async () => 1),
      set: vi.fn(async () => "OK"),
      time: vi.fn(async () => ["0", "0"]),
      pipeline: vi.fn(() => ({
        exec: vi.fn(async () => []),
        hset: vi.fn(),
        pexpire: vi.fn(),
      })),
      zrange: vi.fn(async () => []),
      zrangebyscore: vi.fn(async () => []),
      zremrangebyscore: vi.fn(async () => 0),
    } as unknown as Redis;
    const { controller } = createWorkflowTaskCapacity({ config, keyPrefix: "test:", logger, client });
    const result = await controller.run({
      now: new Date("2026-09-19T00:00:00.000Z"),
      repository: {
        listDueTaskUids: vi.fn(async () => ({
          scanComplete: true,
          scannedUidCount: 2,
          uids: [101, 202],
        })),
      },
    });

    expect(result).toMatchObject({ knownContenderCount: 2, quotaChangedCount: 2 });
    const pipeline = client.pipeline.mock.results[0]?.value;
    expect(pipeline.hset).toHaveBeenCalledWith(
      "test:workflow:task-capacity:quota:101",
      expect.objectContaining({ quota: "1" }),
    );
    expect(pipeline.hset).toHaveBeenCalledWith(
      "test:workflow:task-capacity:quota:202",
      expect.objectContaining({ quota: "1" }),
    );
  });

  it("does not expand an existing quota when the UID scan is incomplete", async () => {
    const incompleteScanConfig = { ...config, globalConcurrency: 10, tenantMaxSharePercent: 90 };
    const client = {
      eval: vi.fn(async () => "OK"),
      hget: vi.fn(async () => "1"),
      hgetall: vi.fn(async () => ({ quota: "1", stable_cycles: "0" })),
      set: vi.fn(async () => "OK"),
      time: vi.fn(async () => ["0", "0"]),
      pipeline: vi.fn(() => ({
        exec: vi.fn(async () => []),
        hset: vi.fn(),
        pexpire: vi.fn(),
      })),
      zrange: vi.fn(async () => []),
      zrangebyscore: vi.fn(async () => []),
      zremrangebyscore: vi.fn(async () => 0),
    } as unknown as Redis;
    const { controller } = createWorkflowTaskCapacity({
      config: incompleteScanConfig,
      keyPrefix: "test:",
      logger,
      client,
    });

    await controller.run({
      now: new Date("2026-09-19T00:00:00.000Z"),
      repository: {
        listDueTaskUids: vi.fn(async () => ({
          scanComplete: false,
          scannedUidCount: 2,
          uids: [101, 202],
        })),
      },
    });

    const pipeline = client.pipeline.mock.results[0]?.value;
    expect(pipeline.hset).toHaveBeenCalledWith(
      "test:workflow:task-capacity:quota:101",
      expect.objectContaining({ quota: "1" }),
    );
    expect(pipeline.hset).toHaveBeenCalledWith(
      "test:workflow:task-capacity:quota:202",
      expect.objectContaining({ quota: "1" }),
    );
  });

  it("uses one saturated quota after demand exceeds the managed UID threshold", async () => {
    const saturatedConfig = { ...config, globalConcurrency: 1_000, tenantMaxSharePercent: 90 };
    const demandUids = Array.from({ length: 101 }, (_, index) => String(index + 1));
    const client = {
      eval: vi.fn(async () => 1),
      hget: vi.fn(async () => undefined),
      pipeline: vi.fn(() => ({
        exec: vi.fn(async () => []),
        hset: vi.fn(),
        pexpire: vi.fn(),
      })),
      set: vi.fn(async () => "OK"),
      time: vi.fn(async () => ["0", "0"]),
      zrange: vi.fn(async () => []),
      zrangebyscore: vi.fn(async () => demandUids),
      zremrangebyscore: vi.fn(async () => 0),
    } as unknown as Redis;
    const { controller } = createWorkflowTaskCapacity({
      config: saturatedConfig,
      keyPrefix: "test:",
      logger,
      client,
    });

    const result = await controller.run({
      now: new Date("2026-09-19T00:00:00.000Z"),
      repository: {
        listDueTaskUids: vi.fn(async () => ({
          scanComplete: true,
          scannedUidCount: 0,
          uids: [],
        })),
      },
    });

    expect(client.zrangebyscore).toHaveBeenCalledWith(
      "test:workflow:task-capacity:demand",
      -600_000,
      "+inf",
      "LIMIT",
      0,
      101,
    );
    expect(client.set).toHaveBeenCalledWith(
      "test:workflow:task-capacity:saturated-quota",
      "10",
      "PX",
      900_000,
    );
    expect(client.hget).not.toHaveBeenCalled();
    expect(client.pipeline).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      demandUidCount: 101,
      knownContenderCount: 101,
      quotaChangedCount: 1,
    });
  });

  it("keeps per-UID quotas at the managed UID threshold", async () => {
    const thresholdConfig = { ...config, globalConcurrency: 1_000, tenantMaxSharePercent: 90 };
    const uids = Array.from({ length: 100 }, (_, index) => index + 1);
    const pipeline = {
      exec: vi.fn(async () => []),
      hset: vi.fn(),
      pexpire: vi.fn(),
    };
    const client = {
      eval: vi.fn(async () => 1),
      hget: vi.fn(async () => undefined),
      pipeline: vi.fn(() => pipeline),
      set: vi.fn(async () => "OK"),
      time: vi.fn(async () => ["0", "0"]),
      zrange: vi.fn(async () => []),
      zrangebyscore: vi.fn(async () => []),
      zremrangebyscore: vi.fn(async () => 0),
    } as unknown as Redis;
    const { controller } = createWorkflowTaskCapacity({
      config: thresholdConfig,
      keyPrefix: "test:",
      logger,
      client,
    });

    const result = await controller.run({
      now: new Date("2026-09-19T00:00:00.000Z"),
      repository: {
        listDueTaskUids: vi.fn(async () => ({
          scanComplete: true,
          scannedUidCount: 100,
          uids,
        })),
      },
    });

    expect(pipeline.hset).toHaveBeenCalledTimes(100);
    expect(pipeline.hset).toHaveBeenCalledWith(
      "test:workflow:task-capacity:quota:100",
      expect.objectContaining({ quota: "10" }),
    );
    expect(client.set).not.toHaveBeenCalledWith(
      "test:workflow:task-capacity:saturated-quota",
      expect.anything(),
      "PX",
      expect.anything(),
    );
    expect(result).toMatchObject({ knownContenderCount: 100, quotaChangedCount: 100 });
  });

  it.each([
    {
      label: "returns a lost lock",
      renew: async () => 0,
    },
    {
      label: "rejects",
      renew: async () => {
        throw new Error("Redis unavailable");
      },
    },
  ])("stops the controller when lock renewal $label", async ({ renew }) => {
    vi.useFakeTimers();
    try {
      let resolveScanStarted: () => void = () => {};
      const scanStarted = new Promise<void>(resolve => {
        resolveScanStarted = resolve;
      });
      let resolveScan: (value: { scanComplete: boolean; scannedUidCount: number; uids: number[] }) => void = () => {};
      const scan = new Promise<{ scanComplete: boolean; scannedUidCount: number; uids: number[] }>(resolve => {
        resolveScan = resolve;
      });
      const evalMock = vi.fn(async (script: unknown) => {
        if (String(script).includes("PEXPIRE")) return renew();
        return 1;
      });
      const client = {
        eval: evalMock,
        hget: vi.fn(async () => undefined),
        pipeline: vi.fn(() => ({
          exec: vi.fn(async () => []),
          hset: vi.fn(),
          pexpire: vi.fn(),
        })),
        set: vi.fn(async () => "OK"),
        time: vi.fn(async () => ["0", "0"]),
        zrange: vi.fn(async () => []),
        zrangebyscore: vi.fn(async () => []),
        zremrangebyscore: vi.fn(async () => 0),
      } as unknown as Redis;
      const controllerConfig = { ...config, controllerLockTtlMs: 2_000 };
      const { controller } = createWorkflowTaskCapacity({
        client,
        config: controllerConfig,
        keyPrefix: "test:",
        logger,
      });
      const execution = controller.run({
        now: new Date("2026-09-19T00:00:00.000Z"),
        repository: {
          listDueTaskUids: vi.fn(async () => {
            resolveScanStarted();
            return scan;
          }),
        },
      });

      await scanStarted;
      await vi.advanceTimersByTimeAsync(1_000);
      resolveScan({ scanComplete: true, scannedUidCount: 0, uids: [] });

      await expect(execution).rejects.toThrow("controller lock was lost");
      expect(evalMock).toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: "workflow.task-capacity.controller.lock-lost" }),
        expect.any(String),
      );
      expect(client.pipeline).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves departed UID quotas to expire while multiple contenders remain", async () => {
    const competingConfig = { ...config, globalConcurrency: 10, tenantMaxSharePercent: 90 };
    const client = {
      eval: vi.fn(async () => "OK"),
      hget: vi.fn(async () => "5"),
      hgetall: vi.fn(async () => ({ quota: "1", stable_cycles: "1" })),
      set: vi.fn(async () => "OK"),
      time: vi.fn(async () => ["0", "0"]),
      pipeline: vi.fn(() => ({
        exec: vi.fn(async () => []),
        hset: vi.fn(),
        pexpire: vi.fn(),
      })),
      zrange: vi.fn(async () => []),
      zrangebyscore: vi.fn(async () => []),
      zremrangebyscore: vi.fn(async () => 0),
    } as unknown as Redis;
    const { controller } = createWorkflowTaskCapacity({
      config: competingConfig,
      keyPrefix: "test:",
      logger,
      client,
    });

    const result = await controller.run({
      now: new Date("2026-09-19T00:00:00.000Z"),
      repository: {
        listDueTaskUids: vi.fn(async () => ({
          scanComplete: true,
          scannedUidCount: 2,
          uids: [101, 202],
        })),
      },
    });

    expect(result).toMatchObject({ knownContenderCount: 2, quotaChangedCount: 2 });
    expect(client.hgetall).not.toHaveBeenCalled();
  });
});
