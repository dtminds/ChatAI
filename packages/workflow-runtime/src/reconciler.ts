import type { WorkflowType } from "@chatai/contracts";
import {
  decideWorkflowEntitlement,
  UnavailableWorkflowEntitlementPort,
  WorkflowEntitlementUnavailableError,
  type WorkflowEntitlementPort,
} from "./entitlement.js";
import type { WorkflowRuntimeRepository } from "./types.js";

const WORKFLOW_TYPES: WorkflowType[] = ["chatai_sop", "wecom_sop", "member_sop"];
const ENTITLEMENT_TENANT_CONCURRENCY = 10;

export class WorkflowRuntimeReconciler {
  private readonly entitlementPort: WorkflowEntitlementPort;

  constructor(
    private readonly repository: WorkflowRuntimeRepository,
    options: { entitlementPort?: WorkflowEntitlementPort } = {},
  ) {
    this.entitlementPort = options.entitlementPort ?? new UnavailableWorkflowEntitlementPort();
  }

  recoverExpiredLeases(input: { limit: number; maxAttempts: number; now: Date }) {
    return this.repository.recoverExpiredLeases(input);
  }

  republishStalledDispatchedTasks(input: { dispatchedBefore: Date; limit: number; now: Date }) {
    return this.repository.republishStalledDispatchedTasks(input);
  }

  cleanupExpiredInbox(input: { limit: number; now: Date }) {
    return this.repository.cleanupExpiredInbox(input);
  }

  cleanupWorkflowHistory(
    input: Parameters<WorkflowRuntimeRepository["cleanupWorkflowHistory"]>[0],
  ) {
    return this.repository.cleanupWorkflowHistory(input);
  }

  recoverExpiredOutboxLeases(input: { limit: number; now: Date }) {
    return this.repository.recoverExpiredOutboxLeases(input);
  }

  reconcileRunTaskConsistency(
    input: Parameters<WorkflowRuntimeRepository["reconcileRunTaskConsistency"]>[0],
  ) {
    return this.repository.reconcileRunTaskConsistency(input);
  }

  reconcileTenantCapacityCounts(
    input: Parameters<WorkflowRuntimeRepository["reconcileTenantCapacityCounts"]>[0],
  ) {
    return this.repository.reconcileTenantCapacityCounts(input);
  }

  async deactivateUnentitledWorkflows(input: { afterUid?: number; limit: number }) {
    const tenants = await this.repository.listActiveCapacityTenants(input);
    let checksUnavailable = 0;
    let workflowsDeactivated = 0;
    for (let offset = 0; offset < tenants.uids.length; offset += ENTITLEMENT_TENANT_CONCURRENCY) {
      const results = await Promise.all(
        tenants.uids.slice(offset, offset + ENTITLEMENT_TENANT_CONCURRENCY).map(async uid => {
          const typeResults = await Promise.all(WORKFLOW_TYPES.map(async workflowType => {
            try {
              const cached = await decideWorkflowEntitlement(
                this.entitlementPort,
                { uid, workflowType },
              );
              if (cached.action === "allow") return { unavailable: false } as const;
              const confirmed = await decideWorkflowEntitlement(this.entitlementPort, {
                forceRefresh: true,
                uid,
                workflowType,
              });
              return confirmed.action === "deny"
                ? { deniedType: workflowType, unavailable: false } as const
                : { unavailable: false } as const;
            } catch (error) {
              if (!(error instanceof WorkflowEntitlementUnavailableError)) throw error;
              return { unavailable: true } as const;
            }
          }));
          const workflows = await this.repository.listActiveRunWorkflowIds({
            uid,
            workflowTypes: typeResults
              .filter((result): result is { deniedType: WorkflowType; unavailable: false } =>
                "deniedType" in result)
              .map(result => result.deniedType),
          });
          let deactivated = 0;
          for (const workflow of workflows) {
            const result = await this.repository.deactivateWorkflowForEntitlementLoss({
              opSubUserId: "0",
              uid,
              workflowId: workflow.workflowId,
              workflowType: workflow.workflowType,
            });
            deactivated += result.affectedDefinitions;
          }
          return {
            checksUnavailable: typeResults.filter(result => result.unavailable).length,
            workflowsDeactivated: deactivated,
          };
        }),
      );
      for (const result of results) {
        checksUnavailable += result.checksUnavailable;
        workflowsDeactivated += result.workflowsDeactivated;
      }
    }
    return {
      checksUnavailable,
      hasMore: tenants.hasMore,
      lastUid: tenants.lastUid,
      tenantsChecked: tenants.uids.length,
      workflowsDeactivated,
    };
  }

  reconcileEventSubscriptions(
    input: Parameters<WorkflowRuntimeRepository["reconcileEventSubscriptions"]>[0],
  ) {
    return this.repository.reconcileEventSubscriptions(input);
  }

  aggregateNodeMetricEvents(input: { limit: number }) {
    return this.repository.aggregateNodeMetricEvents(input);
  }

  cleanupProcessedNodeMetricEvents(input: { limit: number; processedBefore: Date }) {
    return this.repository.cleanupProcessedNodeMetricEvents(input);
  }

  async processRevisionCleanups(input: {
    leaseDurationMs: number;
    leaseOwner: string;
    limit: number;
    maxAttempts: number;
    now: Date;
    retryDelayMs: number;
  }) {
    const requests = await this.repository.claimRevisionCleanupBatch({
      leaseExpiresAt: new Date(input.now.getTime() + input.leaseDurationMs),
      leaseOwner: input.leaseOwner,
      limit: input.limit,
      maxAttempts: input.maxAttempts,
      now: input.now,
    });
    let cancelled = 0;
    let failed = 0;
    let obsolete = 0;
    for (const request of requests) {
      try {
        const result = await this.repository.processRevisionCleanupBatch({
          cleanupId: request.id,
          leaseOwner: input.leaseOwner,
          limit: input.limit,
          now: input.now,
        });
        if (result.kind !== "success") {
          throw new Error(`Workflow Revision cleanup ${result.kind}`);
        }
        cancelled += result.cancelled;
        if (result.status === "obsolete") obsolete += 1;
      } catch (error) {
        failed += 1;
        await this.repository.failRevisionCleanup({
          cleanupId: request.id,
          errorCode: error instanceof Error
            ? error.message.slice(0, 128)
            : "WORKFLOW_REVISION_CLEANUP_FAILED",
          leaseOwner: input.leaseOwner,
          maxAttempts: input.maxAttempts,
          nextAttemptAt: new Date(input.now.getTime() + input.retryDelayMs),
        });
      }
    }
    return { cancelled, claimed: requests.length, failed, obsolete };
  }

  async cancelStoppedWorkflow(input: {
    afterRunId?: string;
    limit: number;
    uid: number;
    workflowId: string;
  }) {
    const result = await this.repository.cancelWorkflowBatch(input);
    return {
      cancelled: result.cancelled,
      done: !result.hasMore,
      nextCursor: result.lastRunId,
    };
  }

  async cancelUnavailableRuns(input: { afterRunId?: string; limit: number }) {
    const result = await this.repository.cancelUnavailableWorkflowRuns(input);
    return {
      cancelled: result.cancelled,
      done: !result.hasMore,
      nextCursor: result.lastRunId,
    };
  }
}
