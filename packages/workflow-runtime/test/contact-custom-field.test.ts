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
      fieldIds: [7, 42],
      port: { getContactCustomFields },
      uid: 9,
    })).resolves.toEqual({ "7": 12.5, "42": " VIP " });
    expect(getContactCustomFields).toHaveBeenCalledTimes(1);
    expect(getContactCustomFields).toHaveBeenCalledWith({
      externalUserId: 101,
      signal: undefined,
      uid: 9,
    });
  });

  it("does not query when the node has no custom field references", async () => {
    const getContactCustomFields = vi.fn();
    await expect(prepareWorkflowContactCustomFields({
      externalUserId: 101,
      fieldIds: [],
      port: { getContactCustomFields },
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
    expect(() => normalizeWorkflowContactCustomFieldValues(fields, fieldIds))
      .toThrow(expect.objectContaining({ code, failureKind: "terminal" }));
  });

  it("maps port failure kinds into node failures", async () => {
    for (const failureKind of ["retryable", "terminal"] as const) {
      await expect(prepareWorkflowContactCustomFields({
        externalUserId: 101,
        fieldIds: [7],
        port: {
          getContactCustomFields: async () => {
            throw new WorkflowContactCustomFieldLookupError("lookup failed", { failureKind });
          },
        },
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
    expect(readWorkflowCustomFieldSnapshot({ customFields: { "7": 12, "42": "VIP" } }, [7, 42]))
      .toEqual({ "7": 12, "42": "VIP" });
    expect(readWorkflowCustomFieldSnapshot({ customFields: { "7": 12 } }, [7, 42]))
      .toBeNull();
    expect(readWorkflowCustomFieldSnapshot({ customFields: { "7": Number.NaN } }, [7]))
      .toBeNull();
  });
});
