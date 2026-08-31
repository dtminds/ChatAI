import { describe, expect, it } from "vitest";
import {
  containsWorkflowCustomFieldVariableSelector,
  createWorkflowCustomFieldVariableSelector,
  getWorkflowCustomFieldVariableId,
  getWorkflowCustomFieldVariableIds,
  getWorkflowCustomFieldVariableRequirements,
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
    expect(getWorkflowCustomFieldVariableIds({
      first: ["subject", "customFields", "42"],
      nested: [
        { selector: ["subject", "customFields", "7"] },
        { selector: ["subject", "customFields", "42"] },
      ],
    })).toEqual([7, 42]);
  });

  it("derives published value type requirements from typed selector owners", () => {
    expect(getWorkflowCustomFieldVariableRequirements({
      branch: {
        selector: ["subject", "customFields", "42"],
        valueType: "string",
      },
      message: { selector: ["subject", "customFields", "7"] },
      typedInput: {
        selector: ["subject", "customFields", "7"],
        valueType: { kind: "number" },
      },
    })).toEqual([
      { fieldId: 7, valueTypes: ["number"] },
      { fieldId: 42, valueTypes: ["string"] },
    ]);
  });
});
