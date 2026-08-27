import type { WorkflowDatabase } from "@chatai/workflow-runtime";
import type { Kysely } from "kysely";

export type WorkflowMetricSummary = {
  inProgressRunCount: number;
  lastRunAt: Date | null;
  successRatePercent: number | null;
  totalRunCount: number;
};

export type WorkflowMetricReader = {
  findByWorkflowIds(uid: number, workflowIds: string[]): Promise<Map<string, WorkflowMetricSummary>>;
};

export class MysqlWorkflowMetricReader implements WorkflowMetricReader {
  constructor(private readonly db: Kysely<WorkflowDatabase>) {}

  async findByWorkflowIds(uid: number, workflowIds: string[]) {
    const uniqueWorkflowIds = [...new Set(workflowIds)];
    if (uniqueWorkflowIds.length === 0) return new Map<string, WorkflowMetricSummary>();

    const summaryRows = await this.db.selectFrom("xy_wap_embed_workflow_metric")
      .select([
        "cancelled_run_count",
        "completed_run_count",
        "failed_run_count",
        "last_run_at",
        "total_run_count",
        "workflow_id",
      ])
      .where("uid", "=", uid)
      .where("workflow_id", "in", uniqueWorkflowIds)
      .execute();

    return new Map(summaryRows.map(row => {
      const totalRunCount = Number(row.total_run_count);
      const completedRunCount = Number(row.completed_run_count);
      const failedRunCount = Number(row.failed_run_count);
      const terminalRunCount = completedRunCount + failedRunCount + Number(row.cancelled_run_count);
      const successRateDenominator = completedRunCount + failedRunCount;
      const workflowId = String(row.workflow_id);
      return [workflowId, {
        inProgressRunCount: Math.max(totalRunCount - terminalRunCount, 0),
        lastRunAt: row.last_run_at,
        successRatePercent: successRateDenominator === 0
          ? null
          : Math.round(completedRunCount * 100 / successRateDenominator),
        totalRunCount,
      }] as const;
    }));
  }
}

export class EmptyWorkflowMetricReader implements WorkflowMetricReader {
  async findByWorkflowIds(): Promise<Map<string, WorkflowMetricSummary>> {
    return new Map();
  }
}
