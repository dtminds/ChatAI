import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import {
  ConversationTicketsQuerySchema,
  ConversationTicketsResponseSchema,
  TicketClaimResponseSchema,
  TicketCommentRequestSchema,
  TicketCommentResponseSchema,
  TicketContextOptionsQuerySchema,
  TicketContextOptionsResponseSchema,
  TicketCreateRequestSchema,
  TicketCreateResponseSchema,
  TicketDetailResponseSchema,
  TicketListQuerySchema,
  TicketListResponseSchema,
  TicketSchema,
  TicketUpdateRequestSchema,
  TicketUpdateResponseSchema,
} from "../src/tickets/dto";

const ticket = {
  anchorMessageId: null,
  assignee: {
    displayName: "客服小李",
    subUserId: "2001",
  },
  canClaim: false,
  canEdit: true,
  canceledAt: null,
  completedAt: null,
  conversationId: "3001",
  createdAt: 1785168000000,
  createdBy: {
    displayName: "客服小李",
    subUserId: "2001",
  },
  customerAvatarUrl: null,
  customerName: "王女士",
  description: "确认退款到账时间",
  dueAt: 1785254400000,
  dueHint: null,
  overdue: false,
  ownerAccountAvatarUrl: null,
  ownerAccountId: "7001",
  ownerAccountName: "售后账号",
  priority: "high",
  sessionId: "4001",
  snapshotId: null,
  sourceType: "manual",
  status: "in_progress",
  ticketId: "5001",
  title: "跟进退款到账情况",
  updatedAt: 1785168300000,
};

const activity = {
  activityId: "6001",
  activityType: "created",
  content: null,
  createdAt: 1785168000000,
  detail: null,
  operator: {
    displayName: "客服小李",
    subUserId: "2001",
  },
  operatorType: "sub_user",
  ticketId: "5001",
};

describe("ticket DTOs", () => {
  it("accepts all ticket enums and rejects unsupported values", () => {
    for (const status of ["open", "in_progress", "done", "canceled"]) {
      expect(Value.Check(TicketSchema, { ...ticket, status })).toBe(true);
    }
    for (const priority of ["low", "medium", "high"]) {
      expect(Value.Check(TicketSchema, { ...ticket, priority })).toBe(true);
    }
    for (const sourceType of ["manual", "ai"]) {
      expect(Value.Check(TicketSchema, { ...ticket, sourceType })).toBe(true);
    }
    for (const view of ["assigned_to_me", "reception", "unassigned", "created_by_me", "all"]) {
      expect(Value.Check(TicketListQuerySchema, { view })).toBe(true);
    }

    expect(Value.Check(TicketSchema, { ...ticket, status: "dismissed" })).toBe(false);
    expect(Value.Check(TicketListQuerySchema, { view: "team" })).toBe(false);
  });

  it("validates the three create context variants and rejects client anchors", () => {
    const base = {
      assigneeSubUserId: "2001",
      context: { type: "current" },
      conversationId: "3001",
      description: "确认退款到账时间",
      dueAt: 1785254400000,
      priority: "high",
      title: "跟进退款到账情况",
    };

    expect(Value.Check(TicketCreateRequestSchema, base)).toBe(true);
    expect(Value.Check(TicketCreateRequestSchema, {
      ...base,
      context: { sessionId: "4001", type: "session" },
    })).toBe(true);
    expect(Value.Check(TicketCreateRequestSchema, {
      ...base,
      context: { type: "none" },
    })).toBe(true);
    expect(Value.Check(TicketCreateRequestSchema, {
      ...base,
      anchorMessageId: "9001",
    })).toBe(false);
    expect(Value.Check(TicketCreateRequestSchema, {
      ...base,
      context: { type: "session" },
    })).toBe(false);
  });

  it("enforces title description and comment bounds", () => {
    const request = {
      context: { type: "none" },
      conversationId: "3001",
      priority: "medium",
      title: "有效标题",
    };

    expect(Value.Check(TicketCreateRequestSchema, { ...request, title: "" })).toBe(false);
    expect(Value.Check(TicketCreateRequestSchema, { ...request, title: "a".repeat(256) })).toBe(false);
    expect(Value.Check(TicketCreateRequestSchema, {
      ...request,
      description: "a".repeat(5001),
    })).toBe(false);
    expect(Value.Check(TicketCommentRequestSchema, { content: "" })).toBe(false);
    expect(Value.Check(TicketCommentRequestSchema, { content: "a".repeat(2001) })).toBe(false);
    expect(Value.Check(TicketCommentRequestSchema, { content: "需要继续核实" })).toBe(true);
  });

  it("requires expectedStatus for status patches and rejects immutable context", () => {
    expect(Value.Check(TicketUpdateRequestSchema, { title: "更新标题" })).toBe(true);
    expect(Value.Check(TicketUpdateRequestSchema, {
      expectedStatus: "open",
      status: "in_progress",
    })).toBe(true);
    expect(Value.Check(TicketUpdateRequestSchema, { status: "done" })).toBe(false);
    expect(Value.Check(TicketUpdateRequestSchema, { expectedStatus: "open" })).toBe(false);
    expect(Value.Check(TicketUpdateRequestSchema, {})).toBe(false);
    expect(Value.Check(TicketUpdateRequestSchema, {
      context: { type: "none" },
      title: "更新标题",
    })).toBe(false);
    expect(Value.Check(TicketUpdateRequestSchema, {
      sessionId: "4002",
      title: "更新标题",
    })).toBe(false);
  });

  it("validates list detail context counts and conversation response shapes", () => {
    expect(Value.Check(TicketListResponseSchema, {
      items: [ticket],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    })).toBe(true);
    expect(Value.Check(TicketDetailResponseSchema, {
      activities: [activity],
      assigneeOptions: [ticket.assignee],
      context: {
        kind: "session",
        messages: [],
        sessionId: "4001",
      },
      contextAccess: "allowed",
      evidenceMessages: [],
      ticket,
    })).toBe(true);
    expect(Value.Check(TicketDetailResponseSchema, {
      activities: [activity],
      assigneeOptions: [],
      context: { kind: "none" },
      contextAccess: "forbidden",
      evidenceMessages: [],
      ticket,
    })).toBe(true);
    expect(Value.Check(TicketContextOptionsQuerySchema, {
      conversationId: "3001",
      page: 1,
      pageSize: 20,
    })).toBe(true);
    expect(Value.Check(TicketContextOptionsResponseSchema, {
      assignees: [ticket.assignee],
      defaultAssigneeSubUserId: "2001",
      sessions: {
        items: [{
          endedAt: null,
          sessionId: "4001",
          startedAt: 1785160000000,
          status: "open",
          summary: null,
          title: null,
        }],
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      },
    })).toBe(true);
    expect(Value.Check(ConversationTicketsQuerySchema, {
      page: 1,
      pageSize: 20,
      scope: "customer",
    })).toBe(true);
    expect(Value.Check(ConversationTicketsResponseSchema, {
      activeCount: 1,
      items: [ticket],
      page: 1,
      pageSize: 20,
      scope: "customer",
      total: 1,
      totalPages: 1,
    })).toBe(true);
  });

  it("validates create update claim and comment responses", () => {
    expect(Value.Check(TicketCreateResponseSchema, { ticket })).toBe(true);
    expect(Value.Check(TicketUpdateResponseSchema, { ticket })).toBe(true);
    expect(Value.Check(TicketClaimResponseSchema, { ticket })).toBe(true);
    expect(Value.Check(TicketCommentResponseSchema, { activity })).toBe(true);
  });

  it("uses strings for every public identifier", () => {
    expect(Value.Check(TicketSchema, { ...ticket, ticketId: 5001 })).toBe(false);
    expect(Value.Check(TicketSchema, { ...ticket, conversationId: 3001 })).toBe(false);
    expect(Value.Check(TicketSchema, {
      ...ticket,
      assignee: { ...ticket.assignee, subUserId: 2001 },
    })).toBe(false);
  });
});
