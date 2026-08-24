import {
  WorkflowTenantCapacityResultSchema,
  WorkflowTypeEntitlementResultSchema,
  type WorkflowTenantCapacityResult,
  type WorkflowType,
  type WorkflowTypeEntitlementResult,
} from "@chatai/contracts";
import type { TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const WORKFLOW_ENTITLEMENT_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1_000;

export type WorkflowEntitlementCheckInput = {
  signal?: AbortSignal;
  uid: number;
  workflowType: WorkflowType;
};

export interface WorkflowEntitlementPort {
  check(input: WorkflowEntitlementCheckInput): Promise<WorkflowTypeEntitlementResult>;
}

export type WorkflowTenantCapacityInput = {
  signal?: AbortSignal;
  uid: number;
};

export interface WorkflowTenantCapacityPort {
  getTenantCapacity(input: WorkflowTenantCapacityInput): Promise<WorkflowTenantCapacityResult>;
}

export type WorkflowEntitlementMode = "allow" | "enforce";

export type WorkflowEntitlementDecision =
  | { action: "allow"; result: Extract<WorkflowTypeEntitlementResult, { entitled: true }> }
  | {
      action: "pause" | "stop";
      result: Extract<WorkflowTypeEntitlementResult, { entitled: false }>;
      unentitledSince: Date;
    };

export class WorkflowEntitlementUnavailableError extends Error {
  constructor(message = "Workflow entitlement service is unavailable", options?: ErrorOptions) {
    super(message, options);
    this.name = "WorkflowEntitlementUnavailableError";
  }
}

export class HttpWorkflowEntitlementPort implements
  WorkflowEntitlementPort,
  WorkflowTenantCapacityPort {
  constructor(private readonly options: {
    endpoint: string;
    fetch?: typeof fetch;
    timeoutMs?: number;
    token?: string;
  }) {
    if (!/^https?:\/\//.test(options.endpoint)) {
      throw new Error("Workflow entitlement endpoint must be an HTTP(S) URL");
    }
  }

  async check(input: WorkflowEntitlementCheckInput) {
    return this.request<WorkflowTypeEntitlementResult>(
      input,
      { uid: input.uid, workflowType: input.workflowType },
      WorkflowTypeEntitlementResultSchema,
    );
  }

  async getTenantCapacity(input: WorkflowTenantCapacityInput) {
    return this.request<WorkflowTenantCapacityResult>(
      input,
      { uid: input.uid },
      WorkflowTenantCapacityResultSchema,
    );
  }

  private async request<TResult>(
    input: { signal?: AbortSignal },
    body: Record<string, unknown>,
    schema: TSchema,
  ): Promise<TResult> {
    const timeoutMs = this.options.timeoutMs ?? 3_000;
    const timeoutController = new AbortController();
    const forwardAbort = () => timeoutController.abort(input.signal?.reason);
    input.signal?.addEventListener("abort", forwardAbort, { once: true });
    const timer = setTimeout(() => timeoutController.abort(), timeoutMs);

    try {
      const response = await (this.options.fetch ?? fetch)(this.options.endpoint, {
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
          ...(this.options.token ? { Authorization: `Bearer ${this.options.token}` } : {}),
        },
        method: "POST",
        signal: timeoutController.signal,
      });
      if (!response.ok) {
        throw new WorkflowEntitlementUnavailableError(
          `Workflow entitlement endpoint returned HTTP ${response.status}`,
        );
      }
      const responseBody: unknown = await response.json();
      if (!Value.Check(schema, responseBody)) {
        throw new WorkflowEntitlementUnavailableError(
          "Workflow entitlement endpoint returned an invalid response",
        );
      }
      return structuredClone(responseBody) as TResult;
    } catch (error) {
      if (error instanceof WorkflowEntitlementUnavailableError) throw error;
      throw new WorkflowEntitlementUnavailableError(undefined, { cause: error });
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", forwardAbort);
    }
  }
}

export class UnavailableWorkflowEntitlementPort implements
  WorkflowEntitlementPort,
  WorkflowTenantCapacityPort {
  async check(): Promise<never> {
    throw new WorkflowEntitlementUnavailableError();
  }

  async getTenantCapacity(): Promise<never> {
    throw new WorkflowEntitlementUnavailableError();
  }
}

export class AllowAllWorkflowEntitlementPort implements
  WorkflowEntitlementPort,
  WorkflowTenantCapacityPort {
  async check(): Promise<WorkflowTypeEntitlementResult> {
    return {
      activeRunLimit: Number.MAX_SAFE_INTEGER,
      entitled: true,
      unentitledSince: null,
    };
  }

  async getTenantCapacity(): Promise<WorkflowTenantCapacityResult> {
    return { activeRunLimit: Number.MAX_SAFE_INTEGER };
  }
}

export function createWorkflowEntitlementPort(options: {
  endpoint?: string | null;
  fetch?: typeof fetch;
  mode?: string | null;
  timeoutMs?: number;
  token?: string | null;
}): WorkflowEntitlementPort & WorkflowTenantCapacityPort {
  const mode = options.mode?.trim() || "enforce";
  if (mode === "allow") return new AllowAllWorkflowEntitlementPort();
  if (mode !== "enforce") {
    throw new Error("WORKFLOW_ENTITLEMENT_MODE must be allow or enforce");
  }
  if (!options.endpoint) return new UnavailableWorkflowEntitlementPort();
  return new HttpWorkflowEntitlementPort({
    endpoint: options.endpoint,
    fetch: options.fetch,
    timeoutMs: options.timeoutMs,
    token: options.token ?? undefined,
  });
}

export async function decideWorkflowEntitlement(
  port: WorkflowEntitlementPort,
  input: WorkflowEntitlementCheckInput & { now: Date },
): Promise<WorkflowEntitlementDecision> {
  let result: WorkflowTypeEntitlementResult;
  try {
    result = await port.check(input);
  } catch (error) {
    if (error instanceof WorkflowEntitlementUnavailableError) throw error;
    throw new WorkflowEntitlementUnavailableError(undefined, { cause: error });
  }
  if (result.entitled) return { action: "allow", result };

  const unentitledSince = new Date(result.unentitledSince);
  const elapsedMs = input.now.getTime() - unentitledSince.getTime();
  if (Number.isNaN(unentitledSince.getTime()) || elapsedMs < 0) {
    throw new WorkflowEntitlementUnavailableError(
      "Workflow entitlement endpoint returned an invalid unentitledSince",
    );
  }
  return {
    action: elapsedMs >= WORKFLOW_ENTITLEMENT_GRACE_PERIOD_MS ? "stop" : "pause",
    result,
    unentitledSince,
  };
}
