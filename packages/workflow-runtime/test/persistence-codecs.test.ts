import { describe, expect, it } from "vitest";
import {
  decodeWorkflowSubjectType,
  decodeWorkflowType,
  encodeWorkflowSubjectType,
  encodeWorkflowType,
} from "../src/index.js";

describe("Workflow persistence codecs", () => {
  it.each([
    ["chatai_sop", 1],
    ["wecom_sop", 2],
    ["member_sop", 3],
  ] as const)("round-trips Workflow type %s through code %s", (type, code) => {
    expect(encodeWorkflowType(type)).toBe(code);
    expect(decodeWorkflowType(code)).toBe(type);
  });

  it.each([
    ["chatai_contact", 1],
    ["wecom_contact", 2],
    ["miniapp_member", 3],
  ] as const)("round-trips Subject type %s through code %s", (type, code) => {
    expect(encodeWorkflowSubjectType(type)).toBe(code);
    expect(decodeWorkflowSubjectType(code)).toBe(type);
  });

  it("fails closed for unknown or missing database codes", () => {
    expect(() => decodeWorkflowType(0)).toThrow("unknown Workflow Type code");
    expect(() => decodeWorkflowSubjectType(4)).toThrow("unknown Workflow Subject Type code");
    expect(() => decodeWorkflowType(undefined)).toThrow("invalid Workflow type code");
  });
});
