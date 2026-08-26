import type {
  WorkflowCapacityOverview,
  WorkflowDataOverview,
  WorkflowEntryRecordDetail,
  WorkflowEntryRecordPage,
} from "@chatai/contracts";
import {
  UnavailableWorkflowEntitlementPort,
  type WorkflowTenantCapacityPort,
} from "@chatai/workflow-runtime";
import {
  ForbiddenError,
  ServiceUnavailableError,
} from "../../shared/errors.js";
import type { WorkflowOperatorScope } from "./workflow.service.js";

export type WorkflowDataReader = {
  getCapacityUsage(input: { uid: number }): Promise<{
    activeRunCount: number;
  }>;
  getOverview(input: { uid: number; workflowId: string }): Promise<WorkflowDataOverview>;
  getRecord(input: { recordId: string; uid: number; workflowId: string }): Promise<WorkflowEntryRecordDetail>;
  listRecords(input: {
    cursor?: string;
    limit: number;
    nodeId?: string;
    status?: string;
    uid: number;
    workflowId: string;
  }): Promise<WorkflowEntryRecordPage>;
};

export class WorkflowDataService {
  private readonly capacityPort: WorkflowTenantCapacityPort;

  constructor(
    private readonly reader: WorkflowDataReader,
    options: {
      capacityPort?: WorkflowTenantCapacityPort;
    } = {},
  ) {
    this.capacityPort = options.capacityPort ?? new UnavailableWorkflowEntitlementPort();
  }

  async getCapacityOverview(scope: WorkflowOperatorScope): Promise<WorkflowCapacityOverview> {
    assertAccess(scope);
    try {
      const [usage, capacity] = await Promise.all([
        this.reader.getCapacityUsage({ uid: scope.uid }),
        this.capacityPort.getTenantCapacity({ uid: scope.uid }),
      ]);
      const full = capacity.activeRunLimit === 0
        || usage.activeRunCount >= capacity.activeRunLimit;
      const usagePercent = full
        ? 100
        : Math.floor(usage.activeRunCount / capacity.activeRunLimit * 100);
      return {
        status: full ? "full" as const : usagePercent >= 80 ? "warning" as const : "normal" as const,
        usagePercent,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableError) throw error;
      throw new ServiceUnavailableError(
        "WORKFLOW_CAPACITY_UNAVAILABLE",
        "暂时无法获取 SOP 客户容量",
      );
    }
  }

  getOverview(scope: WorkflowOperatorScope, workflowId: string) {
    assertAccess(scope);
    return this.reader.getOverview({ uid: scope.uid, workflowId });
  }

  listRecords(scope: WorkflowOperatorScope, input: Omit<Parameters<WorkflowDataReader["listRecords"]>[0], "uid">) {
    assertAccess(scope);
    return this.reader.listRecords({ ...input, uid: scope.uid });
  }

  getRecord(scope: WorkflowOperatorScope, workflowId: string, recordId: string) {
    assertAccess(scope);
    return this.reader.getRecord({ recordId, uid: scope.uid, workflowId });
  }
}

function assertAccess(scope: WorkflowOperatorScope) {
  if (!scope.roles.some(role => role === "owner" || role === "admin")) {
    throw new ForbiddenError("WORKFLOW_ACCESS_FORBIDDEN", "无权查看 Workflow 数据");
  }
}
