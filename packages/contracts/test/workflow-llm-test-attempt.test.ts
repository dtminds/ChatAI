import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import {
  WorkflowLlmTestAttemptCreateRequestSchema,
  WorkflowLlmTestAttemptSchema,
} from "../src/index.js";

describe("Workflow LLM test Attempt contract", () => {
  it("accepts stable input IDs and exposes only mapped Attempt state", () => {
    expect(Value.Check(WorkflowLlmTestAttemptCreateRequestSchema, {
      expectedDraftVersion: 3,
      inputValues: { "input-message": "退款什么时候到账" },
    })).toBe(true);
    expect(Value.Check(WorkflowLlmTestAttemptSchema, {
      attemptId: "19",
      completedAt: null,
      createdAt: "2026-08-13T04:00:00.000Z",
      errorMessage: null,
      executionMode: "mock",
      expiresAt: "2026-08-14T04:00:00.000Z",
      inputValues: { "input-message": "退款什么时候到账" },
      nodeId: "llm-1",
      output: null,
      status: "running",
      workflowId: "31",
    })).toBe(true);
  });

  it("rejects unknown request fields and internal Adapter response details", () => {
    expect(Value.Check(WorkflowLlmTestAttemptCreateRequestSchema, {
      expectedDraftVersion: 3,
      inputValues: {},
      nodeConfig: {},
    })).toBe(false);
    expect(Value.Check(WorkflowLlmTestAttemptSchema, {
      attemptId: "19",
      completedAt: "2026-08-13T04:00:01.000Z",
      createdAt: "2026-08-13T04:00:00.000Z",
      errorMessage: null,
      executionMode: "mock",
      expiresAt: "2026-08-14T04:00:00.000Z",
      inputValues: {},
      nodeId: "llm-1",
      output: { "output-1": "summary" },
      rawResponse: { content: "summary", type: "text" },
      status: "succeeded",
      workflowId: "31",
    })).toBe(false);
  });
});
