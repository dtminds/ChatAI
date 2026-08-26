import { describe, expect, it } from "vitest";
import { MysqlWorkflowMetricReader } from "../../../src/modules/workflow/workflow-metric-reader.js";

describe("MysqlWorkflowMetricReader", () => {
  it("loads only the requested Workflow summary fields in one deduplicated batch", async () => {
    const query = {
      selects: [] as unknown[],
      wheres: [] as unknown[][],
    };
    const db = {
      selectFrom() {
        const builder = {
          select(columns: unknown) { query.selects.push(columns); return builder; },
          where(...args: unknown[]) { query.wheres.push(args); return builder; },
          async execute() {
            return [{
              last_run_at: new Date("2026-08-26T10:20:00.000Z"),
              total_run_count: "12345",
              workflow_id: "42",
            }];
          },
        };
        return builder;
      },
    };
    const reader = new MysqlWorkflowMetricReader(db as never);

    const result = await reader.findByWorkflowIds(9, ["42", "42", "43"]);

    expect(query.selects).toEqual([["last_run_at", "total_run_count", "workflow_id"]]);
    expect(query.wheres).toEqual([
      ["uid", "=", 9],
      ["workflow_id", "in", ["42", "43"]],
    ]);
    expect(result.get("42")).toMatchObject({ totalRunCount: 12_345 });
  });
});
