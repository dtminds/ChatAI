import { describe, expect, it } from "vitest";
import {
  containsWorkflowCustomFieldVariableSelector,
  createWorkflowCustomFieldVariableSelector,
  getWorkflowCustomFieldVariableId,
  getWorkflowCustomFieldVariableValueType,
} from "../src/index.js";

describe("Workflow custom field variables", () => {
  it("uses stable subject customFields selectors", () => {
    expect(createWorkflowCustomFieldVariableSelector(42)).toEqual([
      "subject",
      "customFields",
      "42",
    ]);
    expect(getWorkflowCustomFieldVariableId(["subject", "customFields", "42"]))
      .toBe(42);
    expect(getWorkflowCustomFieldVariableId(["subject", "customFields", "042"]))
      .toBeNull();
    expect(getWorkflowCustomFieldVariableId(["subject", "id"]))
      .toBeNull();
  });

  it("maps number fields to number and known remaining fields to string", () => {
    expect(getWorkflowCustomFieldVariableValueType(11)).toEqual({ kind: "number" });
    expect([1, 2, 4, 5, 6, 12].map(getWorkflowCustomFieldVariableValueType))
      .toEqual(Array.from({ length: 6 }, () => ({ kind: "string" })));
    expect(getWorkflowCustomFieldVariableValueType(999)).toBeNull();
  });

  it("finds custom field selectors nested in node configuration", () => {
    expect(containsWorkflowCustomFieldVariableSelector({
      fields: [{ value: { selector: ["subject", "customFields", "42"] } }],
    })).toBe(true);
    expect(containsWorkflowCustomFieldVariableSelector({
      fields: [{ value: { selector: ["subject", "id"] } }],
    })).toBe(false);
  });
});
