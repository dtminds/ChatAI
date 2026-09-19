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
  scanLimit: 10_000,
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
    expect(keyCount).toBe(5);
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
      sadd: vi.fn(async () => 1),
      srem: vi.fn(async () => 1),
      smembers: vi.fn(async () => []),
      set: vi.fn(async () => "OK"),
      time: vi.fn(async () => ["0", "0"]),
      pipeline: vi.fn(() => ({
        exec: vi.fn(async () => []),
        hset: vi.fn(),
        pexpire: vi.fn(),
        sadd: vi.fn(),
        srem: vi.fn(),
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
          scannedTaskCount: 2,
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
      sadd: vi.fn(async () => 1),
      smembers: vi.fn(async () => []),
      set: vi.fn(async () => "OK"),
      time: vi.fn(async () => ["0", "0"]),
      pipeline: vi.fn(() => ({
        exec: vi.fn(async () => []),
        hset: vi.fn(),
        pexpire: vi.fn(),
        sadd: vi.fn(),
        srem: vi.fn(),
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
          scannedTaskCount: 2,
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
});
