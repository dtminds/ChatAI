import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import {
  WORKFLOW_RUNTIME_SUPPORTED_NODE_KINDS,
  WorkflowDefinitionSchema,
  WorkflowCreateRequestSchema,
  WorkflowDraftSchema,
  WorkflowMetadataUpdateRequestSchema,
  WorkflowRuntimeStatusSchema,
  WorkflowDataOverviewSchema,
  WorkflowEntryRecordPageSchema,
  WorkflowEntryRecordDetailSchema,
} from "../src/workflow/dto.js";
import { normalizeWorkflowEntryPolicy } from "../src/workflow/retention.js";
import {
  WorkflowEntryCommandSchema,
  WorkflowStartConfigSchema,
  WorkflowWaitConfigSchema,
} from "../src/workflow/trigger.js";

describe("workflow contracts", () => {
  it("accepts the production node kinds and rejects legacy kinds", () => {
    const nodeKinds = [
      "start",
      "branch",
      "wait",
      "message",
      "message-query",
      "handoff",
      "agent",
      "llm",
      "order-query",
      "tag-query",
      "tag",
      "customer-update",
      "coupon",
      "ai-collect",
      "ai-intent",
      "end",
    ];

    nodeKinds.forEach((kind) => {
      expect(Value.Check(WorkflowDraftSchema, createDraft(kind))).toBe(true);
    });
    expect(Value.Check(WorkflowDraftSchema, createDraft("action"))).toBe(false);
  });

  it("exposes the node kinds currently supported by the runtime", () => {
    expect(WORKFLOW_RUNTIME_SUPPORTED_NODE_KINDS).toEqual([
      "start",
      "wait",
      "end",
    ]);
    expect(WORKFLOW_RUNTIME_SUPPORTED_NODE_KINDS).toContain("wait");
    expect(WORKFLOW_RUNTIME_SUPPORTED_NODE_KINDS).not.toContain("message");
  });

  it("keeps database identifiers as decimal strings", () => {
    const definition = {
      createdAt: "2026-07-10T00:00:00.000Z",
      description: "引导新客完成首购",
      draft: createDraft("branch"),
      draftVersion: 1,
      id: "9007199254740993",
      name: "新客培育",
      permissions: {
        canDelete: true,
        canEdit: true,
        canOperate: true,
        canPublish: true,
        canView: true,
      },
      publishedRevision: null,
      runtimeStatus: "inactive",
      updatedAt: "2026-07-10T00:00:00.000Z",
      validatedDraftVersion: null,
    };

    expect(Value.Check(WorkflowDefinitionSchema, definition)).toBe(true);
    expect(Value.Check(WorkflowDefinitionSchema, { ...definition, id: 9_007_199_254_740_993 })).toBe(false);
  });

  it("limits workflow metadata descriptions to 1000 characters", () => {
    expect(Value.Check(WorkflowMetadataUpdateRequestSchema, {
      description: "描".repeat(1000),
      name: "新客培育",
    })).toBe(true);
    expect(Value.Check(WorkflowMetadataUpdateRequestSchema, {
      description: "描".repeat(1001),
      name: "新客培育",
    })).toBe(false);
  });

  it("accepts workflow metadata when creating a workflow", () => {
    expect(Value.Check(WorkflowCreateRequestSchema, {
      clientRequestId: "create-workflow-1",
      description: "添加客户后发送欢迎消息",
      name: "新客欢迎旅程",
    })).toBe(true);
    expect(Value.Check(WorkflowCreateRequestSchema, {
      description: "描".repeat(1001),
      name: "新客欢迎旅程",
    })).toBe(false);
  });

  it("models paused and stopped as distinct runtime states", () => {
    expect(Value.Check(WorkflowRuntimeStatusSchema, "paused")).toBe(true);
    expect(Value.Check(WorkflowRuntimeStatusSchema, "stopped")).toBe(true);
  });

  it("validates production start and wait configurations", () => {
    expect(Value.Check(WorkflowStartConfigSchema, {
      accountIds: ["account-a"],
      entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
      triggers: [
        { type: "contact.friend_added" },
        { tagIds: ["tag-vip"], type: "customer.tag_added" },
        { keywords: ["优惠"], match: "keywords", type: "message.received" },
      ],
    })).toBe(true);
    expect(Value.Check(WorkflowStartConfigSchema, {
      accountIds: [],
      entryPolicy: { maxEntries: 0, mode: "lifetime_limit" },
      triggers: [],
    })).toBe(false);
    expect(Value.Check(WorkflowWaitConfigSchema, {
      duration: 15,
      mode: "duration",
      unit: "minute",
    })).toBe(true);
    expect(Value.Check(WorkflowWaitConfigSchema, {
      duration: 360,
      mode: "duration",
      unit: "minute",
    })).toBe(true);
    expect(Value.Check(WorkflowWaitConfigSchema, {
      duration: 361,
      mode: "duration",
      unit: "minute",
    })).toBe(false);
    expect(Value.Check(WorkflowWaitConfigSchema, {
      duration: 96,
      mode: "duration",
      unit: "hour",
    })).toBe(true);
    expect(Value.Check(WorkflowWaitConfigSchema, {
      duration: 97,
      mode: "duration",
      unit: "hour",
    })).toBe(false);
    expect(Value.Check(WorkflowWaitConfigSchema, {
      duration: 45,
      mode: "duration",
      unit: "day",
    })).toBe(true);
    expect(Value.Check(WorkflowWaitConfigSchema, {
      duration: 46,
      mode: "duration",
      unit: "day",
    })).toBe(false);
    expect(Value.Check(WorkflowWaitConfigSchema, {
      dayOffset: 45,
      mode: "fixed-time",
      time: "09:00",
    })).toBe(true);
    expect(Value.Check(WorkflowWaitConfigSchema, {
      dayOffset: 46,
      mode: "fixed-time",
      time: "09:00",
    })).toBe(false);
    expect(Value.Check(WorkflowWaitConfigSchema, {
      dayOffset: 2,
      mode: "fixed-time",
      time: "17:58",
    })).toBe(true);
    expect(Value.Check(WorkflowWaitConfigSchema, {
      duration: 0,
      mode: "duration",
      unit: "day",
    })).toBe(false);
    expect(Value.Check(WorkflowWaitConfigSchema, {
      dayOffset: 1,
      mode: "fixed-time",
      time: "24:00",
    })).toBe(false);
  });

  it("limits rolling entry windows to 90 days by actual duration", () => {
    const createConfig = (windowSize: number, windowUnit: "day" | "hour") => ({
      accountIds: ["account-a"],
      entryPolicy: { maxEntries: 2, mode: "rolling_window", windowSize, windowUnit },
      triggers: [{ type: "contact.friend_added" }],
    });

    expect(Value.Check(WorkflowStartConfigSchema, createConfig(90, "day"))).toBe(true);
    expect(Value.Check(WorkflowStartConfigSchema, createConfig(91, "day"))).toBe(false);
    expect(Value.Check(WorkflowStartConfigSchema, createConfig(2_160, "hour"))).toBe(true);
    expect(Value.Check(WorkflowStartConfigSchema, createConfig(2_161, "hour"))).toBe(false);
  });

  it("normalizes legacy rolling entry windows to the current maximum", () => {
    expect(normalizeWorkflowEntryPolicy({
      maxEntries: 2,
      mode: "rolling_window",
      windowSize: 365,
      windowUnit: "day",
    })).toEqual({
      maxEntries: 2,
      mode: "rolling_window",
      windowSize: 90,
      windowUnit: "day",
    });
    expect(normalizeWorkflowEntryPolicy({
      maxEntries: 2,
      mode: "rolling_window",
      windowSize: 8_760,
      windowUnit: "hour",
    })).toEqual({
      maxEntries: 2,
      mode: "rolling_window",
      windowSize: 2_160,
      windowUnit: "hour",
    });
  });

  it("validates standard entry commands by event payload", () => {
    const base = {
      accountId: "account-a",
      eventId: "event-1",
      occurredAt: "2026-07-11T00:00:00.000Z",
      subjectId: "external-user-1",
      thirdUserId: "account-a",
      uid: "9",
    };
    expect(Value.Check(WorkflowEntryCommandSchema, {
      ...base,
      eventType: "customer.tag_added",
      triggerPayload: { tagId: "tag-vip" },
    })).toBe(true);
    expect(Value.Check(WorkflowEntryCommandSchema, {
      ...base,
      accountId: undefined,
      eventType: "contact.friend_added",
      triggerPayload: {},
    })).toBe(false);
    expect(Value.Check(WorkflowEntryCommandSchema, {
      ...base,
      eventType: "customer.tag_added",
      triggerPayload: {},
    })).toBe(false);
    expect(Value.Check(WorkflowEntryCommandSchema, {
      ...base,
      eventType: "message.received",
      triggerPayload: { messageId: "message-1", messageType: "text", text: "咨询优惠" },
    })).toBe(true);
  });

  it("validates user-facing workflow data mode responses", () => {
    expect(Value.Check(WorkflowDataOverviewSchema, {
      calculatedAt: "2026-07-12T10:00:00.000Z",
      nodes: [
        { completed: 0, current: 0, entered: 120, nodeId: "start", passed: 0 },
        { completed: 0, current: 18, entered: 0, nodeId: "wait-1", passed: 102 },
        { completed: 96, current: 0, entered: 0, nodeId: "end", passed: 0 },
      ],
      revision: 3,
    })).toBe(true);
    expect(Value.Check(WorkflowEntryRecordPageSchema, {
      items: [{
        createdAt: "2026-07-12T09:00:00.000Z",
        currentNodeId: "wait-1",
        customer: { avatar: null, name: "张三" },
        nextExecuteAt: "2026-07-13T10:00:00.000Z",
        recordId: "31",
        revision: 3,
        status: "waiting",
        updatedAt: "2026-07-12T10:00:00.000Z",
      }],
      nextCursor: null,
    })).toBe(true);
    expect(Value.Check(WorkflowEntryRecordDetailSchema, {
      createdAt: "2026-07-12T09:00:00.000Z",
      customer: { avatar: null, name: "张三" },
      recordId: "31",
      revision: 3,
      status: "waiting",
      steps: [{
        occurredAt: "2026-07-12T09:00:00.000Z",
        nodeId: "start",
        nodeKind: "start",
        status: "completed",
        title: "进入流程",
      }],
    })).toBe(true);

    expect(Value.Check(WorkflowEntryRecordDetailSchema, {
      createdAt: "2026-07-12T09:00:00.000Z",
      customer: { avatar: null, name: "张三" },
      recordId: "31",
      revision: 3,
      status: "waiting",
      steps: [{
        occurredAt: "2026-07-12T09:00:00.000Z",
        nodeId: "future-action",
        nodeKind: "unknown",
        status: "current",
        title: "未来动作",
      }],
    })).toBe(true);
  });
});

function createDraft(kind: string) {
  return {
    edges: [],
    nodes: [
      {
        data: {
          kind,
          label: "条件分支",
          metric: "",
          schemaVersion: 1,
          status: "ready",
          title: "条件分支",
        },
        id: "node-1",
        position: { x: 0, y: 0 },
        type: "workflowNode",
      },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}
