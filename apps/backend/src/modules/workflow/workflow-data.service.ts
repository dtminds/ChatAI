import type {
  WorkflowCapacityOverview,
  WorkflowDataOverview,
  WorkflowEntryRecordDetail,
  WorkflowEntryRecordPage,
} from "@chatai/contracts";
import { getEnabledWorkflowTypes } from "@chatai/contracts";
import {
  formatWorkflowMetricDate,
  UnavailableWorkflowEntitlementPort,
  type WorkflowEntitlementPort,
} from "@chatai/workflow-runtime";
import {
  ForbiddenError,
  ServiceUnavailableError,
} from "../../shared/errors.js";
import type { WorkflowOperatorScope } from "./workflow.service.js";

export type WorkflowDataReader = {
  getCapacityUsage(input: { date: string; uid: number }): Promise<{
    activeRunCount: number;
    capacityRejectedCountToday: number;
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
  private readonly clock: () => Date;
  private readonly entitlementPort: WorkflowEntitlementPort;

  constructor(
    private readonly reader: WorkflowDataReader,
    options: {
      clock?: () => Date;
      entitlementPort?: WorkflowEntitlementPort;
    } = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.entitlementPort = options.entitlementPort ?? new UnavailableWorkflowEntitlementPort();
  }

  async getCapacityOverview(scope: WorkflowOperatorScope): Promise<WorkflowCapacityOverview> {
    assertAccess(scope);
    const date = formatWorkflowMetricDate(this.clock());
    try {
      const [usage, entitlements] = await Promise.all([
        this.reader.getCapacityUsage({ date, uid: scope.uid }),
        Promise.all(getEnabledWorkflowTypes().map(workflowType =>
          this.entitlementPort.check({ uid: scope.uid, workflowType }))),
      ]);
      const activeRunLimits = [...new Set(entitlements.flatMap(result =>
        result.entitled ? [result.activeRunLimit] : []))];
      if (activeRunLimits.length === 0) {
        throw new ForbiddenError("WORKFLOW_ENTITLEMENT_REQUIRED", "当前租户未开通 Workflow");
      }
      if (activeRunLimits.length !== 1) {
        throw new ServiceUnavailableError(
          "WORKFLOW_CAPACITY_UNAVAILABLE",
          "暂时无法获取 SOP 客户容量",
        );
      }
      return {
        ...usage,
        activeRunLimit: activeRunLimits[0]!,
        date,
      };
    } catch (error) {
      if (error instanceof ForbiddenError || error instanceof ServiceUnavailableError) throw error;
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
