import type {
  WorkflowTenantCapacityResult,
  WorkflowType,
  WorkflowTypeEntitlementResult,
} from "@chatai/contracts";
import { encodeWorkflowType } from "./persistence-codecs.js";

const DEFAULT_ACTIVE_RUN_LIMIT = 10_000;
const DEFAULT_L1_MAX_ENTRIES = 10_000;
const DEFAULT_L1_TTL_MS = 60_000;
const DEFAULT_REDIS_TTL_SECONDS = 30 * 60;
const ENTITLEMENT_PATH = "/third-internal/wap-embed-workflow-definition/can-run";

export type WorkflowEntitlementCheckInput = {
  forceRefresh?: boolean;
  uid: number;
  workflowType: WorkflowType;
};

export interface WorkflowEntitlementPort {
  check(input: WorkflowEntitlementCheckInput): Promise<WorkflowTypeEntitlementResult>;
}

export type WorkflowTenantCapacityInput = { uid: number };

export interface WorkflowTenantCapacityPort {
  getTenantCapacity(input: WorkflowTenantCapacityInput): Promise<WorkflowTenantCapacityResult>;
}

export type WorkflowEntitlementDecision =
  | { action: "allow"; result: Extract<WorkflowTypeEntitlementResult, { entitled: true }> }
  | { action: "deny"; result: Extract<WorkflowTypeEntitlementResult, { entitled: false }> };

export type WorkflowEntitlementCache = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
};

export class WorkflowEntitlementUnavailableError extends Error {
  constructor(message = "Workflow entitlement service is unavailable", options?: ErrorOptions) {
    super(message, options);
    this.name = "WorkflowEntitlementUnavailableError";
  }
}

export class HttpWorkflowEntitlementPort implements WorkflowEntitlementPort, WorkflowTenantCapacityPort {
  private readonly activeRunLimit: number;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly inFlight = new Map<string, Promise<boolean>>();
  private readonly l1 = new Map<string, { entitled: boolean; expiresAt: number }>();
  private readonly l1MaxEntries: number;

  constructor(private readonly options: {
    activeRunLimit?: number;
    baseUrl: string;
    cache?: WorkflowEntitlementCache;
    cacheKeyPrefix?: string;
    fetch?: typeof fetch;
    l1MaxEntries?: number;
    l1TtlMs?: number;
    redisTtlSeconds?: number;
    timeoutMs?: number;
    token?: string;
  }) {
    this.baseUrl = normalizeHttpBaseUrl(options.baseUrl);
    this.fetchImpl = options.fetch ?? fetch;
    this.activeRunLimit = options.activeRunLimit ?? DEFAULT_ACTIVE_RUN_LIMIT;
    this.l1MaxEntries = options.l1MaxEntries ?? DEFAULT_L1_MAX_ENTRIES;
    assertActiveRunLimit(this.activeRunLimit);
    if (!Number.isSafeInteger(this.l1MaxEntries) || this.l1MaxEntries <= 0) {
      throw new Error("Workflow entitlement L1 cache size must be a positive safe integer");
    }
  }

  async check(input: WorkflowEntitlementCheckInput): Promise<WorkflowTypeEntitlementResult> {
    const entitled = await this.readEntitlement(input);
    return entitled ? { activeRunLimit: this.activeRunLimit, entitled: true } : { entitled: false };
  }

  async getTenantCapacity(): Promise<WorkflowTenantCapacityResult> {
    return { activeRunLimit: this.activeRunLimit };
  }

  private async readEntitlement(input: WorkflowEntitlementCheckInput): Promise<boolean> {
    const key = this.cacheKey(input.uid, input.workflowType);
    if (!input.forceRefresh) {
      const local = this.l1.get(key);
      if (local && local.expiresAt > Date.now()) return local.entitled;
      const cached = await this.readRedis(key);
      if (cached !== null) {
        this.writeL1(key, cached);
        return cached;
      }
    }

    const inFlightKey = input.forceRefresh ? `${key}:fresh` : key;
    const existing = this.inFlight.get(inFlightKey);
    if (existing) return existing;
    const request = this.fetchEntitlement(input).then(async (entitled) => {
      this.writeL1(key, entitled);
      await this.writeRedis(key, entitled);
      return entitled;
    }).finally(() => this.inFlight.delete(inFlightKey));
    this.inFlight.set(inFlightKey, request);
    return request;
  }

  private async fetchEntitlement(input: WorkflowEntitlementCheckInput): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 3_000);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${ENTITLEMENT_PATH}`, {
        body: JSON.stringify({
          uid: input.uid,
          workflowType: encodeWorkflowType(input.workflowType),
        }),
        headers: {
          "Content-Type": "application/json",
          ...(this.options.token ? { Authorization: `Bearer ${this.options.token}` } : {}),
        },
        method: "POST",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new WorkflowEntitlementUnavailableError(
          `Workflow entitlement endpoint returned HTTP ${response.status}`,
        );
      }
      const body: unknown = await response.json();
      if (!isBusinessSuccessEnvelope(body)) {
        throw new WorkflowEntitlementUnavailableError(
          "Workflow entitlement endpoint returned an invalid response",
        );
      }
      return body.data;
    } catch (error) {
      if (error instanceof WorkflowEntitlementUnavailableError) throw error;
      throw new WorkflowEntitlementUnavailableError(undefined, { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }

  private cacheKey(uid: number, workflowType: WorkflowType) {
    return `${this.options.cacheKeyPrefix ?? "chatai:"}workflow:entitlement:v1:${uid}:${workflowType}`;
  }

  private writeL1(key: string, entitled: boolean) {
    this.l1.delete(key);
    this.l1.set(key, {
      entitled,
      expiresAt: Date.now() + (this.options.l1TtlMs ?? DEFAULT_L1_TTL_MS),
    });
    if (this.l1.size > this.l1MaxEntries) {
      const oldestKey = this.l1.keys().next().value;
      if (oldestKey !== undefined) this.l1.delete(oldestKey);
    }
  }

  private async readRedis(key: string): Promise<boolean | null> {
    if (!this.options.cache) return null;
    try {
      const value = await this.options.cache.get(key);
      if (value === "1") return true;
      if (value === "0") return false;
      return null;
    } catch {
      return null;
    }
  }

  private async writeRedis(key: string, entitled: boolean) {
    if (!this.options.cache) return;
    try {
      await this.options.cache.set(
        key,
        entitled ? "1" : "0",
        this.options.redisTtlSeconds ?? DEFAULT_REDIS_TTL_SECONDS,
      );
    } catch {
      // Redis is an optimization; Java remains authoritative.
    }
  }
}

export class UnavailableWorkflowEntitlementPort implements WorkflowEntitlementPort, WorkflowTenantCapacityPort {
  constructor(private readonly activeRunLimit = DEFAULT_ACTIVE_RUN_LIMIT) {
    assertActiveRunLimit(activeRunLimit);
  }

  async check(): Promise<never> {
    throw new WorkflowEntitlementUnavailableError();
  }

  async getTenantCapacity(): Promise<WorkflowTenantCapacityResult> {
    return { activeRunLimit: this.activeRunLimit };
  }
}

export function createWorkflowEntitlementPort(options: {
  activeRunLimit?: number;
  baseUrl?: string | null;
  cache?: WorkflowEntitlementCache;
  cacheKeyPrefix?: string;
  fetch?: typeof fetch;
  l1MaxEntries?: number;
  l1TtlMs?: number;
  redisTtlSeconds?: number;
  timeoutMs?: number;
  token?: string | null;
}): WorkflowEntitlementPort & WorkflowTenantCapacityPort {
  if (!options.baseUrl) return new UnavailableWorkflowEntitlementPort(options.activeRunLimit);
  return new HttpWorkflowEntitlementPort({
    activeRunLimit: options.activeRunLimit,
    baseUrl: options.baseUrl,
    cache: options.cache,
    cacheKeyPrefix: options.cacheKeyPrefix,
    fetch: options.fetch,
    l1MaxEntries: options.l1MaxEntries,
    l1TtlMs: options.l1TtlMs,
    redisTtlSeconds: options.redisTtlSeconds,
    timeoutMs: options.timeoutMs,
    token: options.token ?? undefined,
  });
}

export async function decideWorkflowEntitlement(
  port: WorkflowEntitlementPort,
  input: WorkflowEntitlementCheckInput,
): Promise<WorkflowEntitlementDecision> {
  try {
    const result = await port.check(input);
    return result.entitled ? { action: "allow", result } : { action: "deny", result };
  } catch (error) {
    if (error instanceof WorkflowEntitlementUnavailableError) throw error;
    throw new WorkflowEntitlementUnavailableError(undefined, { cause: error });
  }
}

function isBusinessSuccessEnvelope(value: unknown): value is { data: boolean; success: true } {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return body.success === true
    && typeof body.data === "boolean";
}

function normalizeHttpBaseUrl(value: string) {
  if (!/^https?:\/\//.test(value)) {
    throw new Error("JAVA_INTERNAL_API_BASE_URL must be an HTTP(S) URL");
  }
  return value.replace(/\/+$/, "");
}

function assertActiveRunLimit(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Workflow active Run limit must be a non-negative safe integer");
  }
}
