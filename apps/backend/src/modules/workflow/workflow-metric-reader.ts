import type { WorkflowDatabase } from "@chatai/workflow-runtime";
import type { Kysely } from "kysely";

export type WorkflowMetricSummary = {
  lastRunAt: Date | null;
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

    const rows = await this.db.selectFrom("xy_wap_embed_workflow_metric")
      .select(["last_run_at", "total_run_count", "workflow_id"])
      .where("uid", "=", uid)
      .where("workflow_id", "in", uniqueWorkflowIds)
      .execute();

    return new Map(rows.map(row => [String(row.workflow_id), {
      lastRunAt: row.last_run_at,
      totalRunCount: Number(row.total_run_count),
    }]));
  }
}

export class EmptyWorkflowMetricReader implements WorkflowMetricReader {
  async findByWorkflowIds(): Promise<Map<string, WorkflowMetricSummary>> {
    return new Map();
  }
}
