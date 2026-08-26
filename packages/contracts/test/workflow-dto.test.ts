import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import {
  WorkflowCapacityOverviewSchema,
  WorkflowDefinitionSchema,
  WorkflowCreateRequestSchema,
  WorkflowDraftSchema,
  WorkflowMetadataUpdateRequestSchema,
  WorkflowReviewApproveRequestSchema,
  WorkflowReviewRejectRequestSchema,
  WorkflowRuntimeStatusSchema,
  WorkflowDataOverviewSchema,
  WorkflowEntryRecordPageSchema,
  WorkflowEntryRecordDetailSchema,
} from "../src/workflow/dto.js";
import {
  getEnabledWorkflowTypes,
  getWorkflowCapabilityProfile,
  WorkflowTenantCapacityResultSchema,
  WorkflowTypeEntitlementResultSchema,
} from "../src/workflow/policy.js";
import { normalizeWorkflowEntryPolicy } from "../src/workflow/retention.js";
import {
  WorkflowStartDraftConfigSchema,
  WorkflowStartConfigSchema,
  WorkflowWaitConfigSchema,
} from "../src/workflow/trigger.js";

describe("workflow contracts", () => {
  it("validates the tenant Workflow capacity overview", () => {
    expect(Value.Check(WorkflowCapacityOverviewSchema, {
      status: "warning",
      usagePercent: 80,
    })).toBe(true);
    expect(Value.Check(WorkflowCapacityOverviewSchema, {
      status: "warning",
      usagePercent: 101,
    })).toBe(false);
  });

  it("accepts the production node kinds and rejects legacy kinds", () => {
    const nodeKinds = [
      "start",
      "branch",
      "wait",
      "wait-event",
      "message",
      "message-query",
      "handoff",
      "agent",
      "llm",
      "order-bind",
      "order-query",
      "order-conversion",
      "tag-query",
      "tag",
      "customer-update",
      "coupon",
      "ai-collect",
      "audience-filter",
      "ai-intent",
      "end",
    ];

    nodeKinds.forEach((kind) => {
      expect(Value.Check(WorkflowDraftSchema, createDraft(kind))).toBe(true);
    });
    expect(Value.Check(WorkflowDraftSchema, createDraft("action"))).toBe(false);

    const maxTitleDraft = createDraft("wait");
    maxTitleDraft.nodes[0]!.data.title = "一".repeat(10);
    expect(Value.Check(WorkflowDraftSchema, maxTitleDraft)).toBe(true);
    maxTitleDraft.nodes[0]!.data.title = "一".repeat(11);
    expect(Value.Check(WorkflowDraftSchema, maxTitleDraft)).toBe(false);
  });

  it("keeps workflow type policy separate from runtime implementation", () => {
    expect(getEnabledWorkflowTypes()).toEqual(["chatai_sop", "wecom_sop"]);
    expect(getWorkflowCapabilityProfile("chatai_sop")).toMatchObject({
      allowedEntryEventTypes: [
        "message.received",
        "contact.friend_added",
        "contact.tag_added",
      ],
      availability: "enabled",
      subjectType: "chatai_contact",
    });
    expect(getWorkflowCapabilityProfile("wecom_sop")).toMatchObject({
      allowedEntryEventTypes: ["contact.friend_added", "contact.tag_added"],
      availability: "enabled",
      subjectType: "wecom_contact",
    });
    expect(getWorkflowCapabilityProfile("wecom_sop").allowedNodeKinds).not.toContain("message");
    expect(getWorkflowCapabilityProfile("chatai_sop").variableCatalog).toEqual(expect.arrayContaining([
      "subject.id",
      "trigger.occurredAt",
      "trigger.projection.externalUserId",
      "trigger.projection.workUserId",
      "trigger.projection.seatId",
    ]));
    expect(getWorkflowCapabilityProfile("wecom_sop").variableCatalog).toEqual(expect.arrayContaining([
      "subject.id",
      "trigger.occurredAt",
      "trigger.projection.workUserId",
      "trigger.projection.externalUserId",
    ]));
    expect(getWorkflowCapabilityProfile("wecom_sop").variableCatalog).not.toContain(
      "trigger.projection.seatId",
    );
    expect(getWorkflowCapabilityProfile("member_sop")).toMatchObject({
      allowedEntryEventTypes: [],
      allowedNodeKinds: [],
      availability: "reserved",
      subjectType: "miniapp_member",
    });
  });

  it("keeps database identifiers as decimal strings", () => {
    const definition = {
      capabilitySummary: {
        runtimeSupportedNodeKinds: ["start", "wait", "end"],
      },
      createdAt: "2026-07-10T00:00:00.000Z",
      currentReview: null,
      description: "引导新客完成首购",
      draft: createDraft("branch"),
      draftVersion: 1,
      hasUnpublishedChanges: true,
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
      statusReason: null,
      updatedAt: "2026-07-10T00:00:00.000Z",
      workflowType: "chatai_sop",
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

  it("limits workflow review comments and rejection reasons to 200 characters", () => {
    expect(Value.Check(WorkflowReviewApproveRequestSchema, {
      comment: "审".repeat(200),
    })).toBe(true);
    expect(Value.Check(WorkflowReviewApproveRequestSchema, {
      comment: "审".repeat(201),
    })).toBe(false);
    expect(Value.Check(WorkflowReviewRejectRequestSchema, {
      reason: "驳".repeat(200),
    })).toBe(true);
    expect(Value.Check(WorkflowReviewRejectRequestSchema, {
      reason: "驳".repeat(201),
    })).toBe(false);
  });

  it("accepts workflow metadata when creating a workflow", () => {
    expect(Value.Check(WorkflowCreateRequestSchema, {
      clientRequestId: "create-workflow-1",
      description: "添加客户后发送欢迎消息",
      name: "新客欢迎旅程",
      workflowType: "chatai_sop",
    })).toBe(true);
    expect(Value.Check(WorkflowCreateRequestSchema, {
      description: "描".repeat(1001),
      name: "新客欢迎旅程",
      workflowType: "chatai_sop",
    })).toBe(false);
    expect(Value.Check(WorkflowCreateRequestSchema, {
      name: "未选择类型",
    })).toBe(false);
  });

  it("requires coherent entitlement results", () => {
    expect(Value.Check(WorkflowTypeEntitlementResultSchema, {
      activeRunLimit: 10_000,
      entitled: true,
      unentitledSince: null,
    })).toBe(true);
    expect(Value.Check(WorkflowTypeEntitlementResultSchema, {
      entitled: true,
      unentitledSince: null,
    })).toBe(false);
    expect(Value.Check(WorkflowTypeEntitlementResultSchema, {
      entitled: false,
      unentitledSince: "2026-08-01T00:00:00+08:00",
    })).toBe(true);
    expect(Value.Check(WorkflowTypeEntitlementResultSchema, {
      entitled: false,
      unentitledSince: null,
    })).toBe(false);
  });

  it("validates tenant capacity results independently from Workflow Type entitlement", () => {
    expect(Value.Check(WorkflowTenantCapacityResultSchema, {
      activeRunLimit: 10_000,
    })).toBe(true);
    for (const result of [
      {},
      { activeRunLimit: -1 },
      { activeRunLimit: 1.5 },
      { activeRunLimit: Number.MAX_SAFE_INTEGER + 1 },
      { activeRunLimit: 10_000, workflowType: "chatai_sop" },
    ]) {
      expect(Value.Check(WorkflowTenantCapacityResultSchema, result)).toBe(false);
    }
  });

  it("models paused and stopped as distinct runtime states", () => {
    expect(Value.Check(WorkflowRuntimeStatusSchema, "paused")).toBe(true);
    expect(Value.Check(WorkflowRuntimeStatusSchema, "stopped")).toBe(true);
  });
  it("validates production start and wait configurations", () => {
    const incompleteFriendSourceConfig = {
      entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
      messageSendingWindow: { endTime: "20:00", startTime: "09:00" },
      seatIds: [101],
      triggers: [{ sourceIds: [], type: "contact.friend_added" }],
    };
    expect(Value.Check(WorkflowStartDraftConfigSchema, incompleteFriendSourceConfig)).toBe(true);
    expect(Value.Check(WorkflowStartConfigSchema, incompleteFriendSourceConfig)).toBe(false);
    expect(Value.Check(WorkflowStartConfigSchema, {
      entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
      triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" }],
      workUserIds: [201],
    })).toBe(true);
    expect(Value.Check(WorkflowStartConfigSchema, {
      entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
      triggers: [{
        addWayKey: "scan",
        sourceIds: ["activity-1"],
        sourceMatchMode: "any",
        type: "contact.friend_added",
      }],
      workUserIds: [201],
    })).toBe(true);
    expect(Value.Check(WorkflowStartConfigSchema, {
      entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
      triggers: [{
        sourceIds: ["a", "b", "c", "d", "e"],
        type: "contact.friend_added",
      }],
      workUserIds: [201],
    })).toBe(true);
    expect(Value.Check(WorkflowStartConfigSchema, {
      entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
      triggers: [{
        sourceIds: ["a", "b", "c", "d", "e", "f"],
        type: "contact.friend_added",
      }],
      workUserIds: [201],
    })).toBe(false);
    expect(Value.Check(WorkflowStartConfigSchema, {
      entryMode: "audience-import",
      entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
      seatIds: [101],
      triggers: [],
    })).toBe(true);
    expect(Value.Check(WorkflowStartConfigSchema, {
      entryMode: "audience-import",
      entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
      seatIds: [101],
      triggers: [{ sourceIds: [], type: "contact.friend_added" }],
    })).toBe(false);
    expect(Value.Check(WorkflowStartConfigSchema, {
      entryMode: "direct-push",
      entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
      seatIds: [101],
      triggers: [],
    })).toBe(true);
    expect(Value.Check(WorkflowStartConfigSchema, {
      entryMode: "direct-push",
      entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
      triggers: [],
      workUserIds: [201],
    })).toBe(true);
    expect(Value.Check(WorkflowStartConfigSchema, {
      entryMode: "direct-push",
      entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
      seatIds: [101],
      triggers: [{ keywords: ["价格"], type: "message.received" }],
    })).toBe(false);
    expect(Value.Check(WorkflowStartConfigSchema, {
      entryMode: "event",
      entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
      seatIds: [101],
      triggers: [],
    })).toBe(false);
    expect(Value.Check(WorkflowStartConfigSchema, {
      entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
      seatIds: [101],
      triggers: [{ keywords: ["价格", "优惠"], type: "message.received" }],
    })).toBe(true);
    expect(Value.Check(WorkflowStartDraftConfigSchema, {
      entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
      seatIds: [101],
      triggers: [{ keywords: [], type: "message.received" }],
    })).toBe(true);
    expect(Value.Check(WorkflowStartConfigSchema, {
      entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
      seatIds: [101],
      triggers: [{ keywords: [], type: "message.received" }],
    })).toBe(false);
    expect(Value.Check(WorkflowStartConfigSchema, {
      entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
      seatIds: [101],
      triggers: [
        { sourceIds: [], type: "contact.friend_added" },
        { keywords: [], type: "message.received" },
      ],
    })).toBe(false);
    expect(Value.Check(WorkflowStartConfigSchema, {
      entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
      seatIds: [101],
      triggers: [{ sourceIds: [], type: "contact.friend_added" }],
      workUserIds: [201],
    })).toBe(false);
    expect(Value.Check(WorkflowStartConfigSchema, {
      entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
      messageSendingWindow: { endTime: "20:00", startTime: "25:00" },
      seatIds: [101],
      triggers: [{ sourceIds: [], type: "contact.friend_added" }],
    })).toBe(false);
    expect(Value.Check(WorkflowStartConfigSchema, {
      entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
      messageSendingWindow: { endTime: "20:00", startTime: "09:00" },
      triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" }],
      workUserIds: [201],
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
      entryPolicy: { maxEntries: 2, mode: "rolling_window", windowSize, windowUnit },
      seatIds: [101],
      triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" }],
    });

    expect(Value.Check(WorkflowStartConfigSchema, createConfig(90, "day"))).toBe(true);
    expect(Value.Check(WorkflowStartConfigSchema, createConfig(91, "day"))).toBe(false);
    expect(Value.Check(WorkflowStartConfigSchema, createConfig(2_160, "hour"))).toBe(true);
    expect(Value.Check(WorkflowStartConfigSchema, createConfig(2_161, "hour"))).toBe(false);
  });

  it("limits configured entry counts to ten", () => {
    const createConfig = (entryPolicy:
      | { maxEntries: number; mode: "lifetime_limit" }
      | { maxEntries: number; mode: "rolling_window"; windowSize: number; windowUnit: "day" }
    ) => ({
      entryPolicy,
      seatIds: [101],
      triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" }],
    });

    expect(Value.Check(WorkflowStartConfigSchema, createConfig({
      maxEntries: 10,
      mode: "lifetime_limit",
    }))).toBe(true);
    expect(Value.Check(WorkflowStartConfigSchema, createConfig({
      maxEntries: 11,
      mode: "lifetime_limit",
    }))).toBe(false);
    expect(Value.Check(WorkflowStartConfigSchema, createConfig({
      maxEntries: 10,
      mode: "rolling_window",
      windowSize: 7,
      windowUnit: "day",
    }))).toBe(true);
    expect(Value.Check(WorkflowStartConfigSchema, createConfig({
      maxEntries: 11,
      mode: "rolling_window",
      windowSize: 7,
      windowUnit: "day",
    }))).toBe(false);
  });

  it("normalizes legacy entry limits to the current maximum", () => {
    expect(normalizeWorkflowEntryPolicy({
      maxEntries: 1_000,
      mode: "lifetime_limit",
    })).toEqual({
      maxEntries: 10,
      mode: "lifetime_limit",
    });
    expect(normalizeWorkflowEntryPolicy({
      maxEntries: 1_000,
      mode: "rolling_window",
      windowSize: 365,
      windowUnit: "day",
    })).toEqual({
      maxEntries: 10,
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

  it("validates user-facing workflow data mode responses", () => {
    expect(Value.Check(WorkflowDataOverviewSchema, {
      calculatedAt: "2026-07-12T10:00:00.000Z",
      nodes: [
        { completed: 0, current: 0, entered: 120, incomplete: 0, nodeId: "start", passed: 0 },
        { completed: 0, current: 18, entered: 0, incomplete: 0, nodeId: "wait-1", passed: 102 },
        { completed: 96, current: 0, entered: 0, incomplete: 0, nodeId: "end", passed: 0 },
      ],
      publishedRevision: 3,
      summary: { completed: 96, current: 18, entered: 120, incomplete: 6 },
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
        subjectType: "chatai_contact",
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
      subjectType: "chatai_contact",
      terminalReason: null,
      steps: [{
        occurredAt: "2026-07-12T09:00:00.000Z",
        nodeId: "start",
        nodeKind: "start",
        revision: 1,
        status: "completed",
        title: "进入流程",
      }],
    })).toBe(true);
    expect(Value.Check(WorkflowEntryRecordDetailSchema, {
      createdAt: "2026-07-12T09:00:00.000Z",
      customer: { avatar: null, name: "张三" },
      recordId: "32",
      revision: 3,
      status: "waiting",
      subjectType: "chatai_contact",
      terminalReason: null,
      steps: [{
        nextExecuteAt: "2026-07-13T01:00:00.000Z",
        occurredAt: "2026-07-12T12:31:00.000Z",
        nodeId: "message-1",
        nodeKind: "message",
        revision: 3,
        status: "waiting",
        title: "消息发送",
      }],
    })).toBe(true);

    expect(Value.Check(WorkflowEntryRecordDetailSchema, {
      createdAt: "2026-07-12T09:00:00.000Z",
      customer: { avatar: null, name: "张三" },
      recordId: "31",
      revision: 3,
      status: "waiting",
      subjectType: "chatai_contact",
      terminalReason: "flow_changed_current_node_deleted",
      steps: [{
        occurredAt: "2026-07-12T09:00:00.000Z",
        nodeId: "future-action",
        nodeKind: "unknown",
        revision: 3,
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
