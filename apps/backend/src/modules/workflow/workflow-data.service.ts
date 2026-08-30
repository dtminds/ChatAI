import type {
  WorkflowCapacityOverview,
  WorkflowDataOverview,
  WorkflowEntryRecordDetail,
  WorkflowEntryRecordPage,
  WorkflowTenantOverview,
  WorkflowType,
} from "@chatai/contracts";
import { getEnabledWorkflowTypes, getWorkflowSurfaceTypes } from "@chatai/contracts";
import {
  formatWorkflowMetricDate,
  UnavailableWorkflowEntitlementPort,
  type WorkflowTenantCapacityPort,
} from "@chatai/workflow-runtime";
import {
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
} from "../../shared/errors.js";
import type { WorkflowOperatorScope } from "./workflow.service.js";

export type WorkflowDataReader = {
  getCapacityUsage(input: { date: string; uid: number }): Promise<{
    activeRunCount: number;
    capacityRejectedCountToday: number;
  }>;
  getOverview(input: {
    uid: number;
    workflowId: string;
    workflowTypes?: WorkflowType[];
  }): Promise<WorkflowDataOverview>;
  getTenantOverview(input: {
    today: string;
    uid: number;
    windowStart: string;
    workflowTypes?: WorkflowType[];
    yesterday: string;
  }): Promise<{
    activeWorkflowCount: number;
    recentCompletedRunCount: number;
    recentFailedRunCount: number;
    todayRunCount: number;
    totalWorkflowCount: number;
    yesterdayRunCount: number;
  }>;
  listRecords(input: {
    cursor?: string;
    limit: number;
    nodeId?: string;
    status?: string;
    uid: number;
    workflowId: string;
    workflowTypes?: WorkflowType[];
  }): Promise<WorkflowEntryRecordPage>;
  getRecord(input: {
    recordId: string;
    uid: number;
    workflowId: string;
    workflowTypes?: WorkflowType[];
  }): Promise<WorkflowEntryRecordDetail>;
};

export class WorkflowDataService {
  private readonly capacityPort: WorkflowTenantCapacityPort;
  private readonly clock: () => Date;

  constructor(
    private readonly reader: WorkflowDataReader,
    options: {
      capacityPort?: WorkflowTenantCapacityPort;
      clock?: () => Date;
    } = {},
  ) {
    this.capacityPort = options.capacityPort ?? new UnavailableWorkflowEntitlementPort();
    this.clock = options.clock ?? (() => new Date());
  }

  async getCapacityOverview(scope: WorkflowOperatorScope): Promise<WorkflowCapacityOverview> {
    assertAccess(scope);
    const date = formatWorkflowMetricDate(this.clock());
    try {
      const [usage, capacity] = await Promise.all([
        this.reader.getCapacityUsage({ date, uid: scope.uid }),
        this.capacityPort.getTenantCapacity({ uid: scope.uid }),
      ]);
      const full = capacity.activeRunLimit === 0
        || usage.activeRunCount >= capacity.activeRunLimit;
      const usagePercent = full
        ? 100
        : Math.floor(usage.activeRunCount / capacity.activeRunLimit * 100);
      return {
        capacityRejectedCountToday: usage.capacityRejectedCountToday,
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
    if (scope.surface && getVisibleWorkflowTypes(scope).length === 0) {
      throw new NotFoundError("WORKFLOW_NOT_FOUND", "内容已不存在");
    }
    const input = {
      uid: scope.uid,
      workflowId,
      ...(scope.surface ? { workflowTypes: getVisibleWorkflowTypes(scope) } : {}),
    };
    return this.reader.getOverview(input);
  }

  async getTenantOverview(scope: WorkflowOperatorScope): Promise<WorkflowTenantOverview> {
    assertAccess(scope);
    if (scope.surface && getVisibleWorkflowTypes(scope).length === 0) {
      return {
        activeWorkflowCount: 0,
        recentFailedRunCount: 0,
        recentSuccessRatePercent: null,
        todayRunCount: 0,
        todayRunCountChangePercent: 0,
        totalWorkflowCount: 0,
      };
    }
    const now = this.clock();
    const today = formatWorkflowMetricDate(now);
    const yesterday = formatWorkflowMetricDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    const windowStart = formatWorkflowMetricDate(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
    const overview = await this.reader.getTenantOverview({
      today,
      uid: scope.uid,
      windowStart,
      ...(scope.surface ? { workflowTypes: getVisibleWorkflowTypes(scope) } : {}),
      yesterday,
    });
    const resultCount = overview.recentCompletedRunCount + overview.recentFailedRunCount;
    return {
      activeWorkflowCount: overview.activeWorkflowCount,
      recentFailedRunCount: overview.recentFailedRunCount,
      recentSuccessRatePercent: resultCount === 0
        ? null
        : Math.round(overview.recentCompletedRunCount * 1000 / resultCount) / 10,
      todayRunCount: overview.todayRunCount,
      todayRunCountChangePercent: overview.yesterdayRunCount === 0
        ? overview.todayRunCount === 0 ? 0 : null
        : Math.round((overview.todayRunCount - overview.yesterdayRunCount) * 100
          / overview.yesterdayRunCount),
      totalWorkflowCount: overview.totalWorkflowCount,
    };
  }

  listRecords(scope: WorkflowOperatorScope, input: Omit<Parameters<WorkflowDataReader["listRecords"]>[0], "uid" | "workflowTypes">) {
    assertAccess(scope);
    if (scope.surface && getVisibleWorkflowTypes(scope).length === 0) {
      throw new NotFoundError("WORKFLOW_NOT_FOUND", "内容已不存在");
    }
    return this.reader.listRecords({
      ...input,
      uid: scope.uid,
      ...(scope.surface ? { workflowTypes: getVisibleWorkflowTypes(scope) } : {}),
    });
  }

  getRecord(scope: WorkflowOperatorScope, workflowId: string, recordId: string) {
    assertAccess(scope);
    if (scope.surface && getVisibleWorkflowTypes(scope).length === 0) {
      throw new NotFoundError("WORKFLOW_NOT_FOUND", "内容已不存在");
    }
    return this.reader.getRecord({
      recordId,
      uid: scope.uid,
      workflowId,
      ...(scope.surface ? { workflowTypes: getVisibleWorkflowTypes(scope) } : {}),
    });
  }
}

function assertAccess(scope: WorkflowOperatorScope) {
  if (!scope.roles.some(role => role === "owner" || role === "admin")) {
    throw new ForbiddenError("WORKFLOW_ACCESS_FORBIDDEN", "无权查看数据");
  }
}

function getVisibleWorkflowTypes(scope: WorkflowOperatorScope): WorkflowType[] {
  return scope.surface ? getWorkflowSurfaceTypes(scope.surface) : getEnabledWorkflowTypes();
}
