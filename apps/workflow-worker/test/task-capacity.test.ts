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

const logger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
};

describe("Workflow Task capacity", () => {
  it("keeps integer global and UID limits in the in-memory fallback", async () => {
    const { port } = createWorkflowTaskCapacity({ config, keyPrefix: "test:", logger });
    const now = new Date("2026-09-19T00:00:00.000Z");

    await expect(port.acquire({ now, taskId: "task-1", taskVersion: 1, uid: 1 }))
      .resolves.toMatchObject({ kind: "allowed" });
    await expect(port.acquire({ now, taskId: "task-2", taskVersion: 1, uid: 1 }))
      .resolves.toMatchObject({
        kind: "deferred",
        reasonCode: "WORKFLOW_TASK_TENANT_CAPACITY_LIMITED",
      });
    await expect(port.acquire({ now, taskId: "task-3", taskVersion: 1, uid: 2 }))
      .resolves.toMatchObject({ kind: "allowed" });
  });

  it("releases only the matching lease token", async () => {
    const { port } = createWorkflowTaskCapacity({ config, keyPrefix: "test:", logger });
    const now = new Date("2026-09-19T00:00:00.000Z");
    const admission = await port.acquire({ now, taskId: "task-1", taskVersion: 1, uid: 1 });
    if (admission.kind !== "allowed") throw new Error("Expected a capacity lease");

    await port.release({ uid: 1, lease: { ...admission.lease, token: "stale-token" } });
    await expect(port.acquire({ now, taskId: "task-2", taskVersion: 1, uid: 1 }))
      .resolves.toMatchObject({ kind: "deferred" });

    await port.release({ uid: 1, lease: admission.lease });
    await expect(port.acquire({ now, taskId: "task-2", taskVersion: 1, uid: 1 }))
      .resolves.toMatchObject({ kind: "allowed" });
  });

  it("keeps a duplicate task delivery from releasing the active lease early", async () => {
    const { port } = createWorkflowTaskCapacity({ config, keyPrefix: "test:", logger });
    const now = new Date("2026-09-19T00:00:00.000Z");
    const first = await port.acquire({ now, taskId: "task-1", taskVersion: 1, uid: 1 });
    const duplicate = await port.acquire({ now, taskId: "task-1", taskVersion: 1, uid: 1 });
    if (first.kind !== "allowed" || duplicate.kind !== "allowed") {
      throw new Error("Expected duplicate delivery to reuse the capacity lease");
    }

    await port.release({ uid: 1, lease: duplicate.lease });
    await expect(port.acquire({ now, taskId: "task-2", taskVersion: 1, uid: 1 }))
      .resolves.toMatchObject({ kind: "deferred" });
    await port.release({ uid: 1, lease: first.lease });
    await expect(port.acquire({ now, taskId: "task-2", taskVersion: 1, uid: 1 }))
      .resolves.toMatchObject({ kind: "allowed" });
  });

  it("uses one atomic Redis script for admission and records demand on rejection", async () => {
    const client = {
      eval: vi.fn(async () => [0, 1, "", 0]),
    } as unknown as Redis;
    const { port } = createWorkflowTaskCapacity({ config, keyPrefix: "test:", logger, client });
    const result = await port.acquire({
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
      hgetall: vi.fn(async () => ({})),
      hset: vi.fn(async () => 1),
      pexpire: vi.fn(async () => 1),
      set: vi.fn(async () => "OK"),
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
    expect(client.hset).toHaveBeenCalledWith("test:workflow:task-capacity:quota:101", expect.objectContaining({ quota: "1" }));
    expect(client.hset).toHaveBeenCalledWith("test:workflow:task-capacity:quota:202", expect.objectContaining({ quota: "1" }));
  });
});
