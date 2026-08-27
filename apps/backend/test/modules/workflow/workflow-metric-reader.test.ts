import { describe, expect, it } from "vitest";
import { MysqlWorkflowMetricReader } from "../../../src/modules/workflow/workflow-metric-reader.js";

describe("MysqlWorkflowMetricReader", () => {
  it("loads current-page cumulative metrics in one deduplicated batch", async () => {
    const queries: Array<{
      selects: unknown[];
      table: string;
      wheres: unknown[][];
    }> = [];
    const db = {
      selectFrom(table: string) {
        const query = { selects: [], table, wheres: [] } as typeof queries[number];
        queries.push(query);
        const builder = {
          select(columns: unknown) { query.selects.push(columns); return builder; },
          where(...args: unknown[]) { query.wheres.push(args); return builder; },
          async execute() {
            return [
              {
                cancelled_run_count: "20",
                completed_run_count: "100",
                failed_run_count: "5",
                last_run_at: new Date("2026-08-27T09:00:00+08:00"),
                total_run_count: "12345",
                workflow_id: "42",
              },
              {
                cancelled_run_count: "1",
                completed_run_count: "0",
                failed_run_count: "0",
                last_run_at: new Date("2026-08-26T09:00:00+08:00"),
                total_run_count: "3",
                workflow_id: "43",
              },
            ];
          },
        };
        return builder;
      },
    };
    const reader = new MysqlWorkflowMetricReader(db as never);

    const result = await reader.findByWorkflowIds(9, ["42", "42", "43"]);

    expect(queries).toHaveLength(1);
    expect(queries[0]?.table).toBe("xy_wap_embed_workflow_metric");
    expect(queries[0]?.wheres).toEqual([
      ["uid", "=", 9],
      ["workflow_id", "in", ["42", "43"]],
    ]);
    expect(result.get("42")).toEqual({
      inProgressRunCount: 12_220,
      lastRunAt: new Date("2026-08-27T09:00:00+08:00"),
      successRatePercent: 95,
      totalRunCount: 12_345,
    });
    expect(result.get("43")).toEqual({
      inProgressRunCount: 2,
      lastRunAt: new Date("2026-08-26T09:00:00+08:00"),
      successRatePercent: null,
      totalRunCount: 3,
    });
  });
});
