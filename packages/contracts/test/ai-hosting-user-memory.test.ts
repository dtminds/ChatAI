import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import {
  AgentUserMemoryCategorySchema,
  AgentUserMemoryCustomerListResponseSchema,
  AgentUserMemoryDocumentSchema,
  AgentUserMemoryErrorCodeSchema,
  AgentUserMemoryItemSchema,
  AgentUserMemoryManualCreateRequestSchema,
  AgentUserMemoryObservabilitySummaryResponseSchema,
  AgentUserMemoryRunItemStatusSchema,
  AgentUserMemoryRunStatusSchema,
  AgentUserMemorySettingsRequestSchema,
} from "../src/index.js";

describe("agent user memory contracts", () => {
  it("accepts exactly the three memory categories regardless of source", () => {
    for (const category of [
      "customer_profile", "preference", "recent_intent",
    ]) expect(Value.Check(AgentUserMemoryCategorySchema, category)).toBe(true);
    expect(Value.Check(AgentUserMemoryCategorySchema, "manual_note")).toBe(false);
    expect(Value.Check(AgentUserMemoryCategorySchema, "health")).toBe(false);
    for (const category of ["profile", "communication", "product_context", "recent_context"])
      expect(Value.Check(AgentUserMemoryCategorySchema, category)).toBe(false);
  });

  it("keeps manual and AI item sources structurally distinct", () => {
    const base = { id: 1, category: "preference", content: "偏好无糖", createdAt: 1, updatedAt: 1, expiresAt: null };
    expect(Value.Check(AgentUserMemoryItemSchema, { ...base, source: "manual", updatedBySubUserId: 2 })).toBe(true);
    expect(Value.Check(AgentUserMemoryItemSchema, { ...base, source: "ai", sourceSessionId: 3, evidenceMessageIds: [4] })).toBe(true);
    expect(Value.Check(AgentUserMemoryItemSchema, { ...base, source: "manual", sourceSessionId: 3, evidenceMessageIds: [4] })).toBe(false);
  });

  it("requires schema version one and rejects unknown document fields", () => {
    const document = { schemaVersion: 1, nextItemId: 1, manual: [], ai: [] };
    expect(Value.Check(AgentUserMemoryDocumentSchema, document)).toBe(true);
    expect(Value.Check(AgentUserMemoryDocumentSchema, { ...document, pending: [] })).toBe(false);
  });

  it("validates manual requests and epoch millisecond values", () => {
    expect(Value.Check(AgentUserMemoryManualCreateRequestSchema, {
      category: "customer_profile", content: "身高 168cm", expectedVersion: 0, expiresAt: 1_800_000_000_000,
    })).toBe(true);
    expect(Value.Check(AgentUserMemoryManualCreateRequestSchema, {
      category: "customer_profile", content: "身高 168cm", expectedVersion: -1,
    })).toBe(false);
    expect(Value.Check(AgentUserMemoryManualCreateRequestSchema, {
      category: "customer_profile", content: "身高 168cm", expectedVersion: 0, extra: true,
    })).toBe(false);
    expect(Value.Check(AgentUserMemoryManualCreateRequestSchema, {
      category: "customer_profile", content: "身".repeat(101), expectedVersion: 0,
    })).toBe(false);
  });

  it("accepts partial settings updates with a bounded extraction instruction", () => {
    expect(Value.Check(AgentUserMemorySettingsRequestSchema, {
      enabled: true,
    })).toBe(true);
    expect(Value.Check(AgentUserMemorySettingsRequestSchema, {
      extractionInstruction: "重点关注客户主动表达的尺码与面料偏好",
    })).toBe(true);
    expect(Value.Check(AgentUserMemorySettingsRequestSchema, {})).toBe(false);
    expect(Value.Check(AgentUserMemorySettingsRequestSchema, {
      extractionInstruction: "提".repeat(2001),
    })).toBe(false);
  });

  it("uses page-based customer-list pagination", () => {
    const response = {
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    };
    expect(Value.Check(AgentUserMemoryCustomerListResponseSchema, response)).toBe(true);
    expect(Value.Check(AgentUserMemoryCustomerListResponseSchema, {
      items: [],
      nextCursor: "next",
    })).toBe(false);
  });

  it("keeps run and item state machines narrow", () => {
    for (const status of ["pending", "running", "waiting", "succeeded", "partial", "failed", "canceled"])
      expect(Value.Check(AgentUserMemoryRunStatusSchema, status)).toBe(true);
    for (const status of ["prepared", "submitted", "succeeded", "failed", "skipped", "canceled"])
      expect(Value.Check(AgentUserMemoryRunItemStatusSchema, status)).toBe(true);
    expect(Value.Check(AgentUserMemoryRunItemStatusSchema, "discovered")).toBe(false);
    expect(Value.Check(AgentUserMemoryRunItemStatusSchema, "deferred")).toBe(false);
  });

  it("validates the worker summary without exposing customer data", () => {
    expect(Value.Check(AgentUserMemoryObservabilitySummaryResponseSchema, {
      observedAt: 1,
      worker: { health: "healthy", reportedAt: 1, reportedBy: "worker:1" },
      totals: { enabledTenantCount: 2, dueTenantCount: 1, delayedTenantCount: 0, activeRunCount: 1, expiredLeaseCount: 0, oldestRunnableAt: 1 },
      last24Hours: {
        succeededRunCount: 1, partialRunCount: 0, failedRunCount: 0, canceledRunCount: 0,
        selectedCustomerCount: 10, successCount: 9, failureCount: 0, skippedCount: 1,
        inputTokens: 100, outputTokens: 20,
      },
      trend: [{ date: "2026-08-02", selectedCustomerCount: 10, successCount: 9, failureCount: 0, skippedCount: 1, inputTokens: 100, outputTokens: 20 }],
    })).toBe(true);
  });

  it("exports stable automatic-maintenance error codes", () => {
    expect(Value.Check(AgentUserMemoryErrorCodeSchema, "AGENT_USER_MEMORY_ITEM_SUPERSEDED")).toBe(true);
    expect(Value.Check(AgentUserMemoryErrorCodeSchema, "AGENT_USER_MEMORY_ITEM_NO_READABLE_MESSAGES")).toBe(true);
    expect(Value.Check(AgentUserMemoryErrorCodeSchema, "AGENT_USER_MEMORY_ATTEMPTS_EXHAUSTED")).toBe(true);
    expect(Value.Check(AgentUserMemoryErrorCodeSchema, "AGENT_USER_MEMORY_PENDING_CURSOR_INVALID")).toBe(false);
  });
});
