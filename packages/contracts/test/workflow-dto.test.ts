import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import {
  WorkflowDefinitionSchema,
  WorkflowCreateRequestSchema,
  WorkflowDraftSchema,
  WorkflowMetadataUpdateRequestSchema,
  WorkflowRuntimeStatusSchema,
  WorkflowDataOverviewSchema,
  WorkflowEntryRecordPageSchema,
  WorkflowEntryRecordDetailSchema,
} from "../src/workflow/dto.js";
import {
  WorkflowEntryCommandSchema,
  WorkflowStartConfigSchema,
  WorkflowWaitConfigSchema,
} from "../src/workflow/trigger.js";

describe("workflow contracts", () => {
  it("accepts the production node kinds and rejects legacy kinds", () => {
    const draft = createDraft("branch");

    expect(Value.Check(WorkflowDraftSchema, draft)).toBe(true);
    expect(Value.Check(WorkflowDraftSchema, createDraft("action"))).toBe(false);
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
    expect(Value.Check(WorkflowWaitConfigSchema, { duration: 15, unit: "minute" })).toBe(true);
    expect(Value.Check(WorkflowWaitConfigSchema, { duration: 0, unit: "day" })).toBe(false);
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
          summary: "",
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
