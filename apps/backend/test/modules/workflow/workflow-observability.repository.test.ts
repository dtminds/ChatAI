import { describe, expect, it } from "vitest";
import { WorkflowObservabilityRepository } from "../../../src/modules/workflow/workflow-observability.repository.js";

const DEFINITION_TABLE = "xy_wap_embed_workflow_definition";
const TASK_TABLE = "xy_wap_embed_workflow_task";
const TRANSITION_TABLE = "xy_wap_embed_workflow_task_transition";

describe("workflow observability repository", () => {
  it("counts due backlog with the scheduler bucket and due predicates", async () => {
    const db = createRecordingDb();
    const repository = new WorkflowObservabilityRepository(db as never);

    await repository.getTaskQueueCounts();

    const dueQuery = db.queries.find((query) =>
      query.table === TASK_TABLE && query.whereSql.includes("bucket_time"),
    );
    expect(dueQuery?.whereSql).toContain("bucket_time");
    expect(dueQuery?.whereSql).toContain("due_at");
    expect(dueQuery?.whereSql).toContain("pending");
    expect(dueQuery?.whereSql).toContain("date_format");
    expect(db.queries.some((query) =>
      query.table === TASK_TABLE && query.whereSql.includes("date_sub"),
    )).toBe(true);
  });

  it("counts transitions only for live definitions", async () => {
    const db = createRecordingDb();
    const repository = new WorkflowObservabilityRepository(db as never);

    await repository.getTransitionCounts();

    expect(db.queries[0]?.table).toBe(`${TRANSITION_TABLE} as transition`);
    expect(db.queries[0]?.whereSql).toContain("definition.biz_status");
    expect(db.queries[0]?.whereSql).toContain("1");
  });

  it("pages from the filter driver table instead of slicing definitions", async () => {
    const cases = [
      { firstTable: DEFINITION_TABLE, state: "all" as const },
      { firstTable: `${TASK_TABLE} as task`, state: "backlog" as const },
      { firstTable: `${TRANSITION_TABLE} as transition`, state: "transitioning" as const },
      { firstTable: `${TRANSITION_TABLE} as transition`, state: "dead" as const },
    ];

    for (const { firstTable, state } of cases) {
      const db = createRecordingDb({ keyCount: 0 });
      const repository = new WorkflowObservabilityRepository(db as never);
      await repository.listWorkflows({ page: 2, pageSize: 20, state });
      expect(db.queries[0]?.table).toBe(firstTable);
      expect(db.queries[0]?.limit).toBe(20);
      expect(db.queries[0]?.offset).toBe(20);
      expect(db.queries.some((query) => query.table === firstTable && query.isCount)).toBe(true);
    }
  });

  it("hydrates the current page with a constant number of queries at N=1 and N=100", async () => {
    for (const keyCount of [1, 100]) {
      const db = createRecordingDb({ keyCount });
      const repository = new WorkflowObservabilityRepository(db as never);
      const result = await repository.listWorkflows({
        page: 1,
        pageSize: 100,
        state: "all",
      });
      expect(result.total).toBe(keyCount);
      expect(result.items).toHaveLength(keyCount);
      expect(db.queries).toHaveLength(7);
      expect(new Set(db.queries.map((query) => query.table)).size).toBeLessThanOrEqual(6);
    }
  });
});

function createRecordingDb(options: { keyCount?: number } = {}) {
  const keyCount = options.keyCount ?? 0;
  const keyRows = Array.from({ length: keyCount }, (_, index) => ({
    id: index + 1,
    name: `旅程 ${index + 1}`,
    runtime_status: "active",
    uid: 9,
    workflow_id: index + 1,
  }));
  const queries: QueryRecord[] = [];

  return {
    queries,
    selectFrom(table: string) {
      const query: QueryRecord = {
        isCount: false,
        limit: undefined,
        offset: undefined,
        table,
        whereSql: "",
      };
      queries.push(query);
      const builder = {
        execute: async () => {
          if (query.limit != null) return keyRows;
          if (table === DEFINITION_TABLE) {
            return keyRows.map((row) => ({
              id: row.workflow_id,
              name: row.name,
              runtime_status: row.runtime_status,
              uid: row.uid,
            }));
          }
          return [];
        },
        executeTakeFirst: async () => undefined,
        executeTakeFirstOrThrow: async () => {
          query.isCount = true;
          return { count: keyCount, oldest_due_at: null };
        },
        groupBy: () => builder,
        innerJoin: () => builder,
        limit: (value: number) => {
          query.limit = value;
          return builder;
        },
        offset: (value: number) => {
          query.offset = value;
          return builder;
        },
        orderBy: () => builder,
        select: () => builder,
        selectAll: () => builder,
        where: (...args: unknown[]) => {
          query.whereSql += ` ${args.map(clauseSql).join(" ")}`;
          return builder;
        },
      };
      return builder;
    },
  };
}

type QueryRecord = {
  isCount: boolean;
  limit?: number;
  offset?: number;
  table: string;
  whereSql: string;
};

function clauseSql(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(clauseSql).join(" ");
  if (value && typeof value === "object" && "toOperationNode" in value) {
    return JSON.stringify((value as { toOperationNode(): unknown }).toOperationNode());
  }
  return String(value ?? "");
}
