import { describe, expect, it } from "vitest";
import {
  evaluateWorkflowBranchCondition,
  evaluateWorkflowBranchPath,
  isWorkflowBranchConditionValueComplete,
  isWorkflowBranchConfigComplete,
  type WorkflowBranchCondition,
} from "../src/index.js";

describe("workflow branch contract", () => {
  it.each([
    ["equals", "vip", "vip", true],
    ["not-equals", "vip", "other", true],
    ["contains", "contact.tag_added", "tag", true],
    ["not-contains", "contact.friend_added", "tag", true],
    ["starts-with", "contact.tag_added", "contact", true],
    ["ends-with", "contact.tag_added", "added", true],
    ["greater-than", 9, 8, true],
    ["greater-than-or-equal", 8, 8, true],
    ["less-than", 7, 8, true],
    ["less-than-or-equal", 8, 8, true],
    ["is-true", true, undefined, true],
    ["is-false", false, undefined, true],
    ["is-empty", "", undefined, true],
    ["is-not-empty", [1], undefined, true],
    ["datetime-before", "2026-08-10T09:00:00+08:00", "2026-08-10T10:00", true],
    ["datetime-before-or-equal", "2026-08-10T02:00:00.000Z", "2026-08-10T10:00", true],
    ["datetime-after", "2026-08-10T11:00:00+08:00", "2026-08-10T10:00", true],
    ["datetime-after-or-equal", "2026-08-10T10:00:00+08:00", "2026-08-10T10:00", true],
    ["equals", "2026-08-10T02:00:00.000Z", "2026-08-10T10:00", true],
    ["datetime-between", "2026-08-10T10:30:00+08:00", ["2026-08-10T10:00", "2026-08-10T11:00"], true],
  ] as const)("evaluates %s", (operator, actual, value, expected) => {
    const condition = {
      id: "condition-1",
      operator,
      selector: ["trigger", "value"],
      ...(value !== undefined ? { value } : {}),
      valueType: operator.startsWith("datetime-") || operator === "equals" && typeof actual === "string" && actual.includes("T")
        ? "datetime"
        : typeof actual === "number"
          ? "number"
          : typeof actual === "boolean"
            ? "boolean"
            : Array.isArray(actual)
              ? "message-id-list"
              : "string",
    } as WorkflowBranchCondition;
    expect(evaluateWorkflowBranchCondition(condition, () => ({ available: true, value: actual })))
      .toBe(expected);
  });

  it("does not treat an unavailable selector as an empty value", () => {
    const condition = branchCondition({ operator: "is-empty" });
    expect(evaluateWorkflowBranchCondition(condition, () => ({ available: false, value: undefined })))
      .toBe(false);
  });

  it("supports all/any and preserves ordered first-match semantics for callers", () => {
    const conditions = [
      branchCondition({ selector: ["trigger", "first"], value: "yes" }),
      branchCondition({ id: "condition-2", selector: ["trigger", "second"], value: "yes" }),
    ];
    const resolve = (selector: string[]) => ({
      available: true,
      value: selector[1] === "first" ? "yes" : "no",
    });
    expect(evaluateWorkflowBranchPath({ conditions, logic: "all" }, resolve)).toBe(false);
    expect(evaluateWorkflowBranchPath({ conditions, logic: "any" }, resolve)).toBe(true);
  });

  it("requires complete ordered paths and rejects impossible local datetimes", () => {
    const config = {
      branchPaths: [
        {
          conditions: [branchCondition({
            operator: "equals",
            value: "2026-02-30T09:30",
            valueType: "datetime",
          })],
          id: "if",
          label: "如果",
          logic: "all",
        },
        { conditions: [], id: "else", isDefault: true, label: "否则", logic: "all" },
      ],
    };
    expect(isWorkflowBranchConfigComplete(config)).toBe(false);
    expect(isWorkflowBranchConditionValueComplete(config.branchPaths[0]!.conditions[0]!))
      .toBe(false);
  });
});

function branchCondition(
  overrides: Partial<WorkflowBranchCondition> = {},
): WorkflowBranchCondition {
  return {
    id: "condition-1",
    operator: "equals",
    selector: ["trigger", "value"],
    value: "yes",
    valueType: "string",
    ...overrides,
  };
}
