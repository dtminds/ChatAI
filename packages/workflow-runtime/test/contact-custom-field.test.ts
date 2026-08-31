import { describe, expect, it, vi } from "vitest";
import {
  normalizeWorkflowContactCustomFieldValues,
  prepareWorkflowContactCustomFields,
  readWorkflowCustomFieldSnapshot,
  WorkflowContactCustomFieldLookupError,
} from "../src/index.js";

describe("Workflow contact custom field preparation", () => {
  it("queries once for all references and normalizes optionVal by field type", async () => {
    const getContactCustomFields = vi.fn(async () => [
      { fieldId: 42, fieldType: 1, rawValue: " VIP " },
      { fieldId: 7, fieldType: 11, rawValue: "12.5" },
      { fieldId: 99, fieldType: 1, rawValue: "unused" },
    ]);

    await expect(prepareWorkflowContactCustomFields({
      externalUserId: 101,
      port: { getContactCustomFields },
      requirements: [requirement(7), requirement(42)],
      uid: 9,
    })).resolves.toEqual({ "7": 12.5, "42": " VIP " });
    expect(getContactCustomFields).toHaveBeenCalledTimes(1);
    expect(getContactCustomFields).toHaveBeenCalledWith({
      externalUserId: 101,
      fieldIds: [7, 42],
      signal: undefined,
      uid: 9,
    });
  });

  it("does not query when the node has no custom field references", async () => {
    const getContactCustomFields = vi.fn();
    await expect(prepareWorkflowContactCustomFields({
      externalUserId: 101,
      port: { getContactCustomFields },
      requirements: [],
      uid: 9,
    })).resolves.toEqual({});
    expect(getContactCustomFields).not.toHaveBeenCalled();
  });

  it.each([
    {
      fields: [{ fieldId: 7, fieldType: 11, rawValue: "" }],
      fieldIds: [7],
      code: "WORKFLOW_CONTACT_CUSTOM_FIELD_VALUE_INVALID",
    },
    {
      fields: [{ fieldId: 7, fieldType: 999, rawValue: "x" }],
      fieldIds: [7],
      code: "WORKFLOW_CONTACT_CUSTOM_FIELD_VALUE_INVALID",
    },
    {
      fields: [{ fieldId: 8, fieldType: 1, rawValue: "x" }],
      fieldIds: [7],
      code: "WORKFLOW_CONTACT_CUSTOM_FIELD_UNAVAILABLE",
    },
  ])("rejects invalid or unavailable referenced values as $code", ({ fields, fieldIds, code }) => {
    expect(() => normalizeWorkflowContactCustomFieldValues(
      fields,
      fieldIds.map(fieldId => requirement(fieldId)),
    ))
      .toThrow(expect.objectContaining({ code, failureKind: "terminal" }));
  });

  it("rejects a current field type that drifted from the published node requirement", () => {
    expect(() => normalizeWorkflowContactCustomFieldValues(
      [{ fieldId: 42, fieldType: 11, rawValue: "12" }],
      [requirement(42, ["string"])],
    )).toThrow(expect.objectContaining({
      code: "WORKFLOW_CONTACT_CUSTOM_FIELD_VALUE_INVALID",
      failureKind: "terminal",
    }));
  });

  it("accepts either supported field type for an untyped message reference", () => {
    expect(normalizeWorkflowContactCustomFieldValues(
      [
        { fieldId: 7, fieldType: 11, rawValue: "12" },
        { fieldId: 42, fieldType: 1, rawValue: "VIP" },
      ],
      [requirement(7), requirement(42)],
    )).toEqual({ "7": 12, "42": "VIP" });
  });

  it("maps port failure kinds into node failures", async () => {
    for (const failureKind of ["retryable", "terminal"] as const) {
      await expect(prepareWorkflowContactCustomFields({
        externalUserId: 101,
        port: {
          getContactCustomFields: async () => {
            throw new WorkflowContactCustomFieldLookupError("lookup failed", { failureKind });
          },
        },
        requirements: [requirement(7)],
        uid: 9,
      })).rejects.toMatchObject({
        code: failureKind === "terminal"
          ? "WORKFLOW_CONTACT_CUSTOM_FIELD_REJECTED"
          : "WORKFLOW_CONTACT_CUSTOM_FIELD_LOOKUP_FAILED",
        failureKind,
      });
    }
  });

  it("only accepts complete finite snapshots for the current references", () => {
    expect(readWorkflowCustomFieldSnapshot(
      { customFields: { "7": 12, "42": "VIP" } },
      [requirement(7), requirement(42)],
    ))
      .toEqual({ "7": 12, "42": "VIP" });
    expect(readWorkflowCustomFieldSnapshot(
      { customFields: { "7": 12 } },
      [requirement(7), requirement(42)],
    ))
      .toBeNull();
    expect(readWorkflowCustomFieldSnapshot(
      { customFields: { "7": Number.NaN } },
      [requirement(7)],
    ))
      .toBeNull();
  });

  it("rejects a snapshot whose value type does not match the published node requirement", () => {
    expect(() => readWorkflowCustomFieldSnapshot(
      { customFields: { "42": 12 } },
      [requirement(42, ["string"])],
    )).toThrow(expect.objectContaining({
      code: "WORKFLOW_CONTACT_CUSTOM_FIELD_VALUE_INVALID",
      failureKind: "terminal",
    }));
  });
});

function requirement(
  fieldId: number,
  valueTypes: readonly ("number" | "string")[] = ["number", "string"],
) {
  return { fieldId, valueTypes };
}
