import { describe, expect, it } from "vitest";
import {
  addWorkflowBranchCondition,
  addWorkflowBranchPath,
  getBranchConditionSummary,
  getBranchOperatorOptions,
  getBranchPathTop,
  getWorkflowBranchEstimatedHeight,
  getWorkflowBranchPaths,
  isWorkflowBranchConditionComplete,
  moveWorkflowBranchPath,
  normalizeWorkflowBranchPaths,
  removeWorkflowBranchCondition,
  removeWorkflowBranchPath,
  WORKFLOW_BRANCH_FIRST_HANDLE_TOP,
  WORKFLOW_BRANCH_HANDLE_ROW_GAP,
} from "@/pages/chat/workflow/branch-paths";
import type { WorkflowBranchPath } from "@/pages/chat/workflow/types";
import { workflowContextVariables } from "@/pages/chat/workflow/workflow-variables";

function createPath(id: string, value = id): WorkflowBranchPath {
  return {
    conditions: [{
      id: `condition-${id}`,
      operator: "equals",
      selector: ["customer", "name"],
      value,
    }],
    id,
    label: "会被规范化",
    logic: "all",
  };
}

function createFallback(id = "fallback"): WorkflowBranchPath {
  return {
    conditions: [],
    id,
    isDefault: true,
    label: "会被规范化",
    logic: "all",
  };
}

describe("workflow branch paths", () => {
  it("keeps fixed branch labels and a single fallback path last", () => {
    const paths = normalizeWorkflowBranchPaths([
      createFallback(),
      createPath("vip"),
      createPath("normal"),
    ]);

    expect(paths.map(({ id, label, isDefault }) => ({ id, label, isDefault }))).toEqual([
      { id: "vip", isDefault: undefined, label: "如果" },
      { id: "normal", isDefault: undefined, label: "否则如果" },
      { id: "fallback", isDefault: true, label: "否则" },
    ]);
  });

  it("normalizes malformed ids deterministically without collisions", () => {
    const malformed = [
      { ...createPath("duplicate"), id: "" },
      createPath("duplicate"),
      createPath("duplicate"),
      { ...createFallback("duplicate") },
    ];

    const first = normalizeWorkflowBranchPaths(malformed);
    const second = normalizeWorkflowBranchPaths(malformed);

    expect(second).toEqual(first);
    expect(new Set(first.map((path) => path.id)).size).toBe(first.length);
    expect(first.at(-1)).toEqual(expect.objectContaining({ isDefault: true, label: "否则" }));
  });

  it("adds and reorders paths while preserving ids and recomputing fixed labels", () => {
    const initial = normalizeWorkflowBranchPaths([
      createPath("first"),
      createPath("second"),
      createFallback(),
    ]);
    const moved = moveWorkflowBranchPath(initial, "second", "up");
    const added = addWorkflowBranchPath(moved);

    expect(moved.map((path) => path.id)).toEqual(["second", "first", "fallback"]);
    expect(moved.map((path) => path.label)).toEqual(["如果", "否则如果", "否则"]);
    expect(added.slice(0, -1).map((path) => path.label)).toEqual([
      "如果",
      "否则如果",
      "否则如果",
    ]);
    expect(added.at(-1)?.label).toBe("否则");
  });

  it("does not remove fallback or the last conditional path", () => {
    const paths = normalizeWorkflowBranchPaths([createPath("only"), createFallback()]);

    expect(removeWorkflowBranchPath(paths, "fallback")).toEqual(paths);
    expect(removeWorkflowBranchPath(paths, "only")).toEqual(paths);
  });

  it("limits conditions and protects the last condition", () => {
    const path = createPath("first");
    const withSecond = addWorkflowBranchCondition(path);

    expect(withSecond.conditions).toHaveLength(2);
    expect(removeWorkflowBranchCondition(withSecond, withSecond.conditions[1].id).conditions)
      .toHaveLength(1);
    expect(removeWorkflowBranchCondition(path, path.conditions[0].id)).toEqual(path);
  });

  it("uses type-specific operators and validates inclusive datetime ranges", () => {
    expect(getBranchOperatorOptions("string").map((option) => option.value)).toContain("contains");
    expect(getBranchOperatorOptions("number").map((option) => option.value)).toContain("greater-than");
    expect(getBranchOperatorOptions("message-id-list").map((option) => option.value))
      .toEqual(["is-empty", "is-not-empty"]);

    const condition = {
      id: "date-range",
      operator: "datetime-between" as const,
      selector: ["trigger", "occurredAt"],
      value: ["2026-07-01T00:00", "2026-07-01T00:00"] as [string, string],
    };
    expect(isWorkflowBranchConditionComplete(condition, workflowContextVariables)).toBe(true);
    expect(isWorkflowBranchConditionComplete({
      ...condition,
      value: ["2026-07-02T00:00", "2026-07-01T00:00"],
    }, workflowContextVariables)).toBe(false);
    expect(isWorkflowBranchConditionComplete({
      ...condition,
      value: ["2026-02-30T00:00", "2026-03-01T00:00"],
    }, workflowContextVariables)).toBe(false);
    expect(isWorkflowBranchConditionComplete({
      id: "invalid-number",
      operator: "greater-than",
      selector: ["node", "order-query", "amount"],
      value: "10",
    }, [{
      key: "amount",
      label: "订单金额",
      scope: "node",
      selector: ["node", "order-query", "amount"],
      type: "number",
    }])).toBe(false);
  });

  it("builds readable summaries and aligns dynamic handles with path rows", () => {
    const paths = normalizeWorkflowBranchPaths([
      createPath("first", "会员"),
      createPath("second", "高意向"),
      createFallback(),
    ]);
    const data = { branchPaths: paths };

    expect(getBranchConditionSummary(paths[0], workflowContextVariables))
      .toBe("客户昵称 等于 会员");
    expect(getBranchConditionSummary(paths[2], workflowContextVariables))
      .toBe("不满足以上条件");
    expect(getBranchPathTop(data, "first")).toBe(WORKFLOW_BRANCH_FIRST_HANDLE_TOP);
    expect(getBranchPathTop(data, "second")).toBe(
      WORKFLOW_BRANCH_FIRST_HANDLE_TOP + WORKFLOW_BRANCH_HANDLE_ROW_GAP,
    );
    expect(getWorkflowBranchEstimatedHeight(data)).toBe(188);
  });

  it("creates the fixed default if and else paths", () => {
    expect(getWorkflowBranchPaths().map((path) => path.label)).toEqual(["如果", "否则"]);
  });

  it("caps conditional paths and conditions at ten", () => {
    let paths = getWorkflowBranchPaths();
    for (let index = 0; index < 12; index += 1) {
      paths = addWorkflowBranchPath(paths);
    }
    expect(paths.filter((path) => !path.isDefault)).toHaveLength(10);

    let path = paths[0];
    for (let index = 0; index < 12; index += 1) {
      path = addWorkflowBranchCondition(path);
    }
    expect(path.conditions).toHaveLength(10);
  });
});
