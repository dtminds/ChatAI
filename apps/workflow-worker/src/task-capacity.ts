import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import {
  type WorkflowTaskCapacityAdmission,
  type WorkflowTaskCapacityLease,
  type WorkflowTaskCapacityPort,
  type WorkflowTaskCapacityRepository,
} from "@chatai/workflow-runtime";
import type { WorkflowWorkerConfig } from "./config.js";
import type { createWorkflowWorkerLogger } from "./logger.js";

type TaskCapacityConfig = WorkflowWorkerConfig["taskCapacity"];
type WorkflowWorkerLogger = ReturnType<typeof createWorkflowWorkerLogger>;

type TaskCapacityControllerSummary = {
  controllerLockSkipped: boolean;
  demandUidCount: number;
  durationMs: number;
  globalCapacity: number;
  knownContenderCount: number;
  quotaChangedCount: number;
  scanComplete: boolean;
  scannedTaskCount: number;
};

const ACQUIRE_SCRIPT = `
local now = redis.call("TIME")
local now_ms = now[1] * 1000 + math.floor(now[2] / 1000)
local lease_key = KEYS[4]
local existing_token = redis.call("HGET", lease_key, "token")
local existing_expires_at = tonumber(redis.call("HGET", lease_key, "expires_at_ms") or "0")
if existing_token and existing_expires_at > now_ms then
  redis.call("HINCRBY", lease_key, "references", 1)
  redis.call("PEXPIRE", lease_key, ARGV[7])
  redis.call("ZADD", KEYS[1], existing_expires_at, ARGV[2])
  redis.call("ZADD", KEYS[2], existing_expires_at, ARGV[2])
  return {1, 0, existing_token, now_ms}
end
if existing_token then redis.call("DEL", lease_key) end

redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", now_ms)
redis.call("ZREMRANGEBYSCORE", KEYS[2], "-inf", now_ms)
local quota = tonumber(redis.call("HGET", KEYS[3], "quota") or ARGV[5])
if redis.call("ZCARD", KEYS[1]) >= tonumber(ARGV[4]) then
  redis.call("ZADD", KEYS[5], now_ms, ARGV[1])
  redis.call("PEXPIRE", KEYS[5], ARGV[6])
  return {0, 1, "", now_ms}
end
if redis.call("ZCARD", KEYS[2]) >= quota then
  redis.call("ZADD", KEYS[5], now_ms, ARGV[1])
  redis.call("PEXPIRE", KEYS[5], ARGV[6])
  return {0, 2, "", now_ms}
end

local expires_at = now_ms + tonumber(ARGV[7])
redis.call("HSET", lease_key, "uid", ARGV[1], "token", ARGV[3], "expires_at_ms", expires_at, "references", 1)
redis.call("PEXPIRE", lease_key, ARGV[7])
redis.call("ZADD", KEYS[1], expires_at, ARGV[2])
redis.call("ZADD", KEYS[2], expires_at, ARGV[2])
return {1, 0, ARGV[3], now_ms}
`;

const RELEASE_SCRIPT = `
local stored_uid = redis.call("HGET", KEYS[3], "uid")
local stored_token = redis.call("HGET", KEYS[3], "token")
if stored_uid ~= ARGV[1] or stored_token ~= ARGV[2] then return 0 end
local references = tonumber(redis.call("HGET", KEYS[3], "references") or "1")
if references > 1 then
  redis.call("HINCRBY", KEYS[3], "references", -1)
  return 1
end
redis.call("ZREM", KEYS[1], ARGV[3])
redis.call("ZREM", KEYS[2], ARGV[3])
redis.call("DEL", KEYS[3])
return 1
`;

const RELEASE_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  redis.call("DEL", KEYS[1])
  return 1
end
return 0
`;

const CAPACITY_UNAVAILABLE_LOG_INTERVAL_MS = 60_000;
const CAPACITY_RELEASE_ERROR_LOG_INTERVAL_MS = 60_000;

export type WorkflowTaskCapacityController = {
  run(input: {
    now: Date;
    repository: WorkflowTaskCapacityRepository;
  }): Promise<TaskCapacityControllerSummary>;
};

export function createWorkflowTaskCapacity(input: {
  client?: Redis;
  config: TaskCapacityConfig;
  keyPrefix: string;
  logger: WorkflowWorkerLogger;
}): {
  controller: WorkflowTaskCapacityController;
  port: WorkflowTaskCapacityPort;
} {
  if (!input.client) {
    const inMemory = new InMemoryWorkflowTaskCapacity(input.config);
    return {
      controller: { run: async ({ now }) => inMemory.controllerSummary(now) },
      port: inMemory,
    };
  }
  const redis = new RedisWorkflowTaskCapacity(input.client, input.config, input.keyPrefix, input.logger);
  return { controller: redis, port: redis };
}

class RedisWorkflowTaskCapacity implements WorkflowTaskCapacityPort, WorkflowTaskCapacityController {
  private lastUnavailableLogAt = Number.NEGATIVE_INFINITY;
  private lastReleaseErrorLogAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly client: Redis,
    private readonly config: TaskCapacityConfig,
    private readonly keyPrefix: string,
    private readonly logger: WorkflowWorkerLogger,
  ) {}

  async acquire(input: {
    now: Date;
    taskId: string;
    taskVersion: number;
    uid: number;
  }): Promise<WorkflowTaskCapacityAdmission> {
    const leaseId = createLeaseId(input.uid, input.taskId, input.taskVersion);
    const token = randomUUID();
    try {
      const result = await this.client.eval(
        ACQUIRE_SCRIPT,
        5,
        this.globalLeasesKey(),
        this.uidLeasesKey(input.uid),
        this.quotaKey(input.uid),
        this.leaseKey(leaseId),
        this.demandKey(),
        input.uid,
        leaseId,
        token,
        this.config.globalConcurrency,
        calculateTenantQuota(this.config.globalConcurrency, this.config.tenantMaxSharePercent),
        this.config.demandWindowMs + this.config.controllerIntervalMs,
        this.config.leaseTtlMs,
      );
      if (!Array.isArray(result) || result.length < 3) {
        throw new Error("Workflow Task capacity returned an invalid Redis result");
      }
      const allowed = Number(result[0]) === 1;
      const reason = Number(result[1]);
      const returnedToken = String(result[2] ?? "");
      if (allowed && returnedToken.length === 0) {
        throw new Error("Workflow Task capacity returned an empty lease token");
      }
      if (allowed) return { kind: "allowed", lease: { leaseId, token: returnedToken } };
      if (reason !== 1 && reason !== 2) {
        throw new Error("Workflow Task capacity returned an invalid rejection reason");
      }
      return {
        kind: "deferred",
        reasonCode: "WORKFLOW_TASK_TENANT_CAPACITY_LIMITED",
        retryAt: createRetryAt(input.now, this.config),
      };
    } catch (error) {
      this.logUnavailable(error, input.uid);
      return {
        kind: "deferred",
        reasonCode: "WORKFLOW_TASK_CAPACITY_UNAVAILABLE",
        retryAt: new Date(input.now.getTime() + Math.max(30_000, this.config.deferDelayMs)),
      };
    }
  }

  async release(input: { lease: WorkflowTaskCapacityLease; uid: number }): Promise<void> {
    try {
      await this.client.eval(
        RELEASE_SCRIPT,
        3,
        this.globalLeasesKey(),
        this.uidLeasesKey(input.uid),
        this.leaseKey(input.lease.leaseId),
        input.uid,
        input.lease.token,
        input.lease.leaseId,
      );
    } catch (error) {
      const now = Date.now();
      if (now - this.lastReleaseErrorLogAt >= CAPACITY_RELEASE_ERROR_LOG_INTERVAL_MS) {
        this.lastReleaseErrorLogAt = now;
        this.logger.warn({
          error: error instanceof Error ? error.message : "unknown",
          event: "workflow.task-capacity.release.failed",
          uid: input.uid,
        }, "Workflow Task capacity release failed; lease TTL will recover it");
      }
    }
  }

  async run(input: {
    now: Date;
    repository: WorkflowTaskCapacityRepository;
  }): Promise<TaskCapacityControllerSummary> {
    const startedAt = Date.now();
    const owner = randomUUID();
    const locked = await this.client.set(
      this.controllerLockKey(),
      owner,
      "PX",
      this.config.controllerLockTtlMs,
      "NX",
    );
    if (locked !== "OK") {
      return this.summary({
        controllerLockSkipped: true,
        demandUidCount: 0,
        knownContenderCount: 0,
        quotaChangedCount: 0,
        scanComplete: true,
        scannedTaskCount: 0,
      }, startedAt);
    }

    try {
      const nowMs = input.now.getTime();
      await this.client.zremrangebyscore(this.globalLeasesKey(), "-inf", nowMs);
      await this.client.zremrangebyscore(this.demandKey(), "-inf", nowMs - this.config.demandWindowMs);
      const scan = await input.repository.listDueTaskUids({ limit: this.config.scanLimit, now: input.now });
      const demandUids = await this.client.zrangebyscore(
        this.demandKey(),
        nowMs - this.config.demandWindowMs,
        nowMs,
      );
      const activeLeases = await this.client.zrange(this.globalLeasesKey(), 0, -1);
      const contenders = new Set<number>(scan.uids);
      for (const uid of demandUids) addUid(contenders, uid);
      for (const leaseId of activeLeases) addUid(contenders, leaseId);
      const contenderCount = contenders.size;
      let quotaChangedCount = 0;
      if (contenderCount >= 2) {
        const quota = Math.max(1, Math.floor(this.config.globalConcurrency / contenderCount));
        for (const uid of contenders) {
          await this.writeQuota(uid, quota, 0);
          quotaChangedCount += 1;
        }
      } else if (contenderCount === 1 && scan.scanComplete) {
        const [uid] = contenders;
        if (uid !== undefined && await this.restoreQuotaIfStable(uid)) quotaChangedCount += 1;
      }
      const summary = this.summary({
        controllerLockSkipped: false,
        demandUidCount: demandUids.length,
        knownContenderCount: contenderCount,
        quotaChangedCount,
        scanComplete: scan.scanComplete,
        scannedTaskCount: scan.scannedTaskCount,
      }, startedAt);
      this.logger.info({ ...summary, event: "workflow.task.capacity.controller.summary" },
        "Workflow Task capacity controller completed");
      return summary;
    } finally {
      await this.client.eval(RELEASE_LOCK_SCRIPT, 1, this.controllerLockKey(), owner);
    }
  }

  private async restoreQuotaIfStable(uid: number) {
    const current = await this.client.hgetall(this.quotaKey(uid));
    const quota = Number(current.quota);
    const stableCycles = Number(current.stable_cycles ?? 0);
    const maxQuota = calculateTenantQuota(this.config.globalConcurrency, this.config.tenantMaxSharePercent);
    if (!Number.isFinite(quota) || quota >= maxQuota) {
      await this.writeQuota(uid, maxQuota, 0);
      return false;
    }
    const nextStableCycles = stableCycles + 1;
    if (nextStableCycles < this.config.stableCycles) {
      await this.writeQuota(uid, quota, nextStableCycles);
      return true;
    }
    await this.writeQuota(uid, maxQuota, 0);
    return true;
  }

  private async writeQuota(uid: number, quota: number, stableCycles: number) {
    const key = this.quotaKey(uid);
    await this.client.hset(key, {
      quota: String(quota),
      stable_cycles: String(stableCycles),
      updated_at_ms: String(Date.now()),
    });
    await this.client.pexpire(key, this.config.quotaTtlMs);
  }

  private summary(
    values: Omit<TaskCapacityControllerSummary, "durationMs" | "globalCapacity">,
    startedAt: number,
  ): TaskCapacityControllerSummary {
    return {
      ...values,
      durationMs: Math.max(0, Date.now() - startedAt),
      globalCapacity: this.config.globalConcurrency,
    };
  }

  private logUnavailable(error: unknown, uid: number) {
    const now = Date.now();
    if (now - this.lastUnavailableLogAt < CAPACITY_UNAVAILABLE_LOG_INTERVAL_MS) return;
    this.lastUnavailableLogAt = now;
    this.logger.warn({
      error: error instanceof Error ? error.message : "unknown",
      event: "workflow.task-capacity.acquire.unavailable",
      uid,
    }, "Workflow Task capacity unavailable");
  }

  private globalLeasesKey() {
    return `${this.keyPrefix}workflow:task-capacity:leases`;
  }

  private uidLeasesKey(uid: number) {
    return `${this.keyPrefix}workflow:task-capacity:leases:${uid}`;
  }

  private quotaKey(uid: number) {
    return `${this.keyPrefix}workflow:task-capacity:quota:${uid}`;
  }

  private leaseKey(leaseId: string) {
    return `${this.keyPrefix}workflow:task-capacity:lease:${encodeURIComponent(leaseId)}`;
  }

  private demandKey() {
    return `${this.keyPrefix}workflow:task-capacity:demand`;
  }

  private controllerLockKey() {
    return `${this.keyPrefix}workflow:task-capacity:controller-lock`;
  }
}

class InMemoryWorkflowTaskCapacity implements WorkflowTaskCapacityPort {
  private readonly leases = new Map<string, { expiresAt: number; references: number; token: string; uid: number }>();
  private readonly quotas = new Map<number, { quota: number; stableCycles: number; expiresAt: number }>();
  private readonly demand = new Map<number, number>();

  constructor(private readonly config: TaskCapacityConfig) {}

  async acquire(input: {
    now: Date;
    taskId: string;
    taskVersion: number;
    uid: number;
  }): Promise<WorkflowTaskCapacityAdmission> {
    this.cleanup(input.now.getTime());
    const leaseId = createLeaseId(input.uid, input.taskId, input.taskVersion);
    const existing = this.leases.get(leaseId);
    if (existing) {
      existing.references += 1;
      return {
        kind: "allowed",
        lease: { leaseId, token: existing.token },
      };
    }
    const quota = this.quotas.get(input.uid)?.quota
      ?? calculateTenantQuota(this.config.globalConcurrency, this.config.tenantMaxSharePercent);
    const uidUsed = [...this.leases.values()].filter(lease => lease.uid === input.uid).length;
    if (this.leases.size >= this.config.globalConcurrency || uidUsed >= quota) {
      this.demand.set(input.uid, input.now.getTime());
      return {
        kind: "deferred",
        reasonCode: "WORKFLOW_TASK_TENANT_CAPACITY_LIMITED",
        retryAt: createRetryAt(input.now, this.config),
      };
    }
    const token = randomUUID();
    this.leases.set(leaseId, {
      expiresAt: input.now.getTime() + this.config.leaseTtlMs,
      references: 1,
      token,
      uid: input.uid,
    });
    return { kind: "allowed", lease: { leaseId, token } };
  }

  async release(input: { lease: WorkflowTaskCapacityLease }): Promise<void> {
    const existing = this.leases.get(input.lease.leaseId);
    if (existing?.token !== input.lease.token) return;
    if (existing.references > 1) {
      existing.references -= 1;
      return;
    }
    this.leases.delete(input.lease.leaseId);
  }

  controllerSummary(now: Date): TaskCapacityControllerSummary {
    this.cleanup(now.getTime());
    return {
      controllerLockSkipped: false,
      demandUidCount: this.demand.size,
      durationMs: 0,
      globalCapacity: this.config.globalConcurrency,
      knownContenderCount: new Set([
        ...this.demand.keys(),
        ...[...this.leases.values()].map(lease => lease.uid),
      ]).size,
      quotaChangedCount: 0,
      scanComplete: true,
      scannedTaskCount: 0,
    };
  }

  private cleanup(nowMs: number) {
    for (const [leaseId, lease] of this.leases) {
      if (lease.expiresAt <= nowMs) this.leases.delete(leaseId);
    }
    for (const [uid, timestamp] of this.demand) {
      if (timestamp <= nowMs - this.config.demandWindowMs) this.demand.delete(uid);
    }
  }
}

function calculateTenantQuota(globalConcurrency: number, tenantMaxSharePercent: number) {
  return Math.max(1, Math.floor(globalConcurrency * tenantMaxSharePercent / 100));
}

function createRetryAt(now: Date, config: TaskCapacityConfig) {
  const jitter = config.deferJitterMs <= 0
    ? 0
    : Math.floor(Math.random() * (config.deferJitterMs + 1));
  return new Date(now.getTime() + config.deferDelayMs + jitter);
}

function createLeaseId(uid: number, taskId: string, taskVersion: number) {
  return `${uid}|${taskId}|${taskVersion}`;
}

function addUid(target: Set<number>, value: string | number) {
  const raw = typeof value === "number" ? value : value.split("|", 1)[0];
  const uid = Number(raw);
  if (Number.isSafeInteger(uid) && uid > 0) target.add(uid);
}
