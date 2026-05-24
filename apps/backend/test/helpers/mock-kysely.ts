export type MockWhereClause =
  | [string, string, unknown]
  | MockWhereExpression;

export type MockWhereExpression =
  | {
      kind: "condition";
      lhs: MockWhereLhs;
      operator: string;
      rhs: unknown;
    }
  | {
      kind: "or";
      clauses: MockWhereExpression[];
    };

export type MockWhereLhs =
  | string
  | {
      kind: "cast";
      expr: MockWhereLhs;
      dataType: string;
    }
  | {
      kind: "ref";
      column: string;
    };

export function createMockExpressionBuilder() {
  const eb = ((lhs: unknown, operator?: string, rhs?: unknown) => {
    if (typeof operator === "string") {
      return {
        kind: "condition",
        lhs: normalizeLhs(lhs),
        operator,
        rhs,
      } satisfies MockWhereExpression;
    }

    return lhs;
  }) as ((lhs: unknown, operator?: string, rhs?: unknown) => MockWhereExpression) & {
    cast: (expr: MockWhereLhs | string, dataType: string) => MockWhereLhs;
    or: (clauses: MockWhereExpression[]) => MockWhereExpression;
    ref: (column: string) => MockWhereLhs;
  };

  eb.or = (clauses) => ({
    kind: "or",
    clauses,
  });
  eb.cast = (expr, dataType) => ({
    kind: "cast",
    expr: normalizeLhs(expr),
    dataType,
  });
  eb.ref = (column) => ({
    kind: "ref",
    column,
  });

  return eb;
}

export function addMockWhereClause(
  clauses: MockWhereClause[],
  first: string | ((eb: ReturnType<typeof createMockExpressionBuilder>) => MockWhereExpression),
  operator?: string,
  value?: unknown,
) {
  if (typeof first === "function") {
    clauses.push(first(createMockExpressionBuilder()));
    return;
  }

  clauses.push([first, operator ?? "=", value]);
}

export function matchesMockWhereClauses(
  row: Record<string, unknown>,
  clauses: MockWhereClause[],
) {
  return clauses.every((clause) => matchesMockWhereClause(row, clause));
}

export function applyMockPaging<T>(
  rows: T[],
  limit?: number,
  offset?: number,
) {
  const start = typeof offset === "number" ? offset : 0;
  const end = typeof limit === "number" ? start + limit : rows.length;

  return rows.slice(start, end);
}

function matchesMockWhereClause(
  row: Record<string, unknown>,
  clause: MockWhereClause,
) {
  if (Array.isArray(clause)) {
    return matchesSimpleWhere(row, clause[0], clause[1], clause[2]);
  }

  if (clause.kind === "or") {
    return clause.clauses.some((nested) => matchesMockWhereClause(row, nested));
  }

  return matchesSimpleWhere(
    row,
    resolveLhsColumn(clause.lhs),
    clause.operator,
    clause.rhs,
    isCastLhs(clause.lhs),
  );
}

function matchesSimpleWhere(
  row: Record<string, unknown>,
  column: string,
  operator: string,
  value: unknown,
  forceString = false,
) {
  if (column === "limit" || column === "offset") {
    return true;
  }

  const key = column.split(".").at(-1) ?? column;
  const rowValue = row[key];
  const normalizedRowValue = forceString ? String(rowValue ?? "") : rowValue;

  if (operator === "=") {
    return String(normalizedRowValue) === String(value);
  }

  if (operator === "!=") {
    return String(normalizedRowValue) !== String(value);
  }

  if (operator === "in" && Array.isArray(value)) {
    return value.map(String).includes(String(normalizedRowValue));
  }

  if (operator === "like") {
    const needle = String(value ?? "").replace(/%/g, "").toLowerCase();

    return String(normalizedRowValue ?? "").toLowerCase().includes(needle);
  }

  if (operator === "is") {
    return value === null ? rowValue === null || rowValue === undefined : rowValue === value;
  }

  return true;
}

function resolveLhsColumn(lhs: MockWhereLhs) {
  if (typeof lhs === "string") {
    return lhs;
  }

  if (lhs.kind === "ref") {
    return lhs.column;
  }

  return resolveLhsColumn(lhs.expr);
}

function isCastLhs(lhs: MockWhereLhs) {
  return typeof lhs !== "string" && lhs.kind === "cast";
}

function normalizeLhs(expr: MockWhereLhs | string): MockWhereLhs {
  if (typeof expr === "string") {
    return {
      kind: "ref",
      column: expr,
    };
  }

  return expr;
}
