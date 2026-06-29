type WhereClause =
  | { type: "eq"; column: string; value: unknown }
  | { type: "or"; clauses: Array<{ column: string; operator: string; value: unknown }> };

type QueryExecutionEvent = {
  isCountQuery: boolean;
  orderByCalls: Array<[string, string | undefined]>;
  selectedAll: boolean;
  selectedColumns: string[];
  table: string;
  type: "execute" | "executeTakeFirst";
};

type KbReadDbMockOptions = {
  beforeExecute?: (event: QueryExecutionEvent) => Promise<void> | void;
};

function createExpressionBuilder() {
  const eb = ((column: string, operator: string, value: unknown) => ({
    column,
    operator,
    value,
  })) as ((column: string, operator: string, value: unknown) => {
    column: string;
    operator: string;
    value: unknown;
  }) & {
    or: (
      clauses: Array<{ column: string; operator: string; value: unknown }>,
    ) => WhereClause;
  };

  eb.or = (clauses) => ({ type: "or", clauses });

  return eb;
}

function matchesWhere(row: Record<string, unknown>, where: WhereClause) {
  if (where.type === "eq") {
    return row[where.column] === where.value;
  }

  return where.clauses.some((clause) => matchesColumn(row, clause));
}

function matchesColumn(
  row: Record<string, unknown>,
  clause: { column: string; operator: string; value: unknown },
) {
  if (clause.operator === "=") {
    return row[clause.column] === clause.value;
  }

  if (clause.operator === "like") {
    const pattern = String(clause.value).replace(/^%/, "").replace(/%$/, "");
    return String(row[clause.column] ?? "").includes(pattern);
  }

  return true;
}

export function createKbReadDbMock(options: KbReadDbMockOptions = {}) {
  const subUser = {
    id: 101,
    uid: 9001,
  };

  const kbs = [
    {
      create_time: new Date("2026-06-19T14:02:22.000Z"),
      id: 1,
      last_operator_id: 1,
      name: "华为产品知识",
      operator_id: 1,
      remark: "华为各系列产品规格、功能与常见问题",
      status: 1,
      uid: 9001,
      update_time: new Date("2026-06-20T14:02:22.000Z"),
    },
  ];

  const docs = [
    {
      create_time: new Date("2026-06-18T15:22:22.000Z"),
      doc_process_time: null,
      doc_suffix: "doc",
      doc_type: 2,
      doc_update_time: null,
      doc_url: "kb-docs/example.doc",
      id: 1001,
      kb_id: 1,
      last_operator_id: 1,
      last_sync_time: null,
      name: "产品说明大全",
      operator_id: 1,
      point_num: 20,
      remark: null,
      status: 1,
      sync_error_msg: null,
      sync_status: 0,
      tokens: null,
      uid: 9001,
      update_time: new Date("2026-06-20T15:22:22.000Z"),
      volc_doc_id: "volc-doc-1",
      volc_resource_id: null,
      volc_strategy_resource_id: null,
    },
    {
      create_time: new Date("2026-06-18T12:00:00.000Z"),
      doc_process_time: null,
      doc_suffix: "png",
      doc_type: 3,
      doc_update_time: null,
      doc_url: "kb-images/example.png",
      id: 1002,
      kb_id: 1,
      last_operator_id: 1,
      last_sync_time: null,
      name: "产品宣传图",
      operator_id: 1,
      point_num: 1,
      remark: null,
      status: 1,
      sync_error_msg: null,
      sync_status: 0,
      tokens: null,
      uid: 9001,
      update_time: new Date("2026-06-19T12:00:00.000Z"),
      volc_doc_id: "volc-doc-2",
      volc_resource_id: null,
      volc_strategy_resource_id: null,
    },
    {
      create_time: new Date("2026-06-16T15:22:22.000Z"),
      doc_process_time: null,
      doc_suffix: "txt",
      doc_type: 2,
      doc_update_time: null,
      doc_url: "kb-docs/failed.txt",
      id: 1003,
      kb_id: 1,
      last_operator_id: 1,
      last_sync_time: null,
      name: "失败知识",
      operator_id: 1,
      point_num: null,
      remark: null,
      status: 1,
      sync_error_msg: "解析失败",
      sync_status: 1,
      tokens: null,
      uid: 9001,
      update_time: new Date("2026-06-16T15:22:22.000Z"),
      volc_doc_id: "volc-doc-3",
      volc_resource_id: null,
      volc_strategy_resource_id: null,
    },
  ];

  const chunks = [
    {
      content: "切片正文",
      create_time: new Date("2026-06-18T15:22:22.000Z"),
      description: null,
      doc_id: 1001,
      html_content: null,
      id: 501,
      kb_id: 1,
      last_sync_time: null,
      md_content: null,
      point_process_time: null,
      point_update_time: null,
      source: 1,
      status: 1,
      sync_status: 0,
      title: "切片标题",
      tokens: null,
      type: "text",
      uid: 9001,
      update_time: new Date("2026-06-18T15:22:22.000Z"),
      volc_chunk_id: null,
      volc_doc_id: null,
      volc_resource_id: null,
    },
    {
      content: "系统切片正文",
      create_time: new Date("2026-06-18T15:22:22.000Z"),
      description: null,
      doc_id: 1001,
      html_content: null,
      id: 502,
      kb_id: 1,
      last_sync_time: null,
      md_content: null,
      point_process_time: null,
      point_update_time: null,
      source: 2,
      status: 1,
      sync_status: 0,
      title: "系统切片",
      tokens: null,
      type: "text",
      uid: 9001,
      update_time: new Date("2026-06-18T15:22:22.000Z"),
      volc_chunk_id: null,
      volc_doc_id: null,
      volc_resource_id: null,
    },
  ];

  return {
    insertInto(table: string) {
      let values: Record<string, unknown> = {};

      const builder = {
        executeTakeFirstOrThrow: async () => {
          if (table !== "xy_wap_embed_agent_kb") {
            throw new Error(`Unsupported insert table: ${table}`);
          }

          const nextId = kbs.reduce((maxId, kb) => Math.max(maxId, kb.id), 0) + 1;
          const now = new Date();
          const row = {
            create_time: now,
            id: nextId,
            last_operator_id: values.last_operator_id ?? 1,
            name: values.name,
            operator_id: values.operator_id ?? 1,
            remark: values.remark ?? "",
            status: values.status ?? 1,
            uid: values.uid,
            update_time: now,
          };

          kbs.unshift(row);

          return { insertId: nextId };
        },
        values: (nextValues: Record<string, unknown>) => {
          values = nextValues;
          return builder;
        },
      };

      return builder;
    },
    updateTable(table: string) {
      let setValues: Record<string, unknown> = {};
      const wheres: WhereClause[] = [];

      const filterRows = <TRow extends Record<string, unknown>>(rows: TRow[]) =>
        rows.filter((row) => wheres.every((where) => matchesWhere(row, where)));

      const builder = {
        executeTakeFirst: async () => {
          if (table === "xy_wap_embed_agent_kb_doc") {
            const matched = filterRows(docs);
            matched.forEach((row) => Object.assign(row, setValues));
            return { numUpdatedRows: BigInt(matched.length) };
          }

          throw new Error(`Unsupported update table: ${table}`);
        },
        set(values: Record<string, unknown>) {
          setValues = values;
          return builder;
        },
        where(
          columnOrFn:
            | string
            | ((eb: ReturnType<typeof createExpressionBuilder>) => WhereClause),
          _operator?: string,
          _value?: unknown,
        ) {
          if (typeof columnOrFn === "function") {
            wheres.push(columnOrFn(createExpressionBuilder()));
          } else {
            wheres.push({ type: "eq", column: columnOrFn, value: _value });
          }

          return builder;
        },
      };

      return builder;
    },
    selectFrom(table: string) {
      const wheres: WhereClause[] = [];
      const orderByCalls: Array<[string, string | undefined]> = [];
      let isCountQuery = false;
      let selectedAll = false;
      let selectedColumns: string[] = [];

      const filterRows = <TRow extends Record<string, unknown>>(rows: TRow[]) =>
        rows.filter((row) => wheres.every((where) => matchesWhere(row, where)));
      const projectRows = <TRow extends Record<string, unknown>>(rows: TRow[]) => {
        if (selectedAll || selectedColumns.length === 0) {
          return rows;
        }

        return rows.map((row) =>
          Object.fromEntries(selectedColumns.map((column) => [column, row[column]])),
        );
      };

      const builder = {
        countResult: async () => {
          let rows: Record<string, unknown>[] = [];
          if (table === "xy_wap_embed_agent_kb") {
            rows = filterRows(kbs);
          } else if (table === "xy_wap_embed_agent_kb_doc") {
            rows = filterRows(docs);
          } else if (table === "xy_wap_embed_agent_kb_chunk") {
            rows = filterRows(chunks);
          }

          return { total: rows.length };
        },
        execute: async () => {
          await options.beforeExecute?.({
            isCountQuery,
            orderByCalls,
            selectedAll,
            selectedColumns,
            table,
            type: "execute",
          });

          if (table === "xy_wap_embed_agent_kb") {
            return projectRows(filterRows(kbs));
          }

          if (table === "xy_wap_embed_agent_kb_doc") {
            return projectRows(filterRows(docs));
          }

          if (table === "xy_wap_embed_agent_kb_chunk") {
            return projectRows(filterRows(chunks));
          }

          return [];
        },
        executeTakeFirst: async () => {
          await options.beforeExecute?.({
            isCountQuery,
            orderByCalls,
            selectedAll,
            selectedColumns,
            table,
            type: "executeTakeFirst",
          });

          if (table === "xy_wap_embed_sub_user") {
            return subUser;
          }

          if (table === "xy_wap_embed_sub_user_session") {
            return {
              expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
              id: "501",
              refresh_token_hash: "dev-refresh-token-hash",
              revoked_at: null,
              session_version: 1,
              sub_user_id: "101",
            };
          }

          if (isCountQuery) {
            return builder.countResult();
          }

          const rows = await builder.execute();
          return rows[0];
        },
        limit: () => builder,
        offset: () => builder,
        orderBy: (column: string, direction?: string) => {
          orderByCalls.push([column, direction]);
          return builder;
        },
        select: (selection?: unknown) => {
          if (typeof selection === "function") {
            isCountQuery = true;
            return builder;
          }

          if (Array.isArray(selection)) {
            selectedAll = false;
            selectedColumns = selection.map(String);
          }

          return builder;
        },
        selectAll: () => {
          selectedAll = true;
          selectedColumns = [];
          return builder;
        },
        where(
          columnOrFn:
            | string
            | ((eb: ReturnType<typeof createExpressionBuilder>) => WhereClause),
          operator?: string,
          value?: unknown,
        ) {
          if (typeof columnOrFn === "function") {
            wheres.push(columnOrFn(createExpressionBuilder()));
          } else {
            wheres.push({ type: "eq", column: columnOrFn, value });
          }

          return builder;
        },
      };

      return builder;
    },
  };
}
