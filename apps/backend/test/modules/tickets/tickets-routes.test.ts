import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerErrorHandler } from "../../../src/plugins/error-handler";
import { UnauthorizedError } from "../../../src/shared/errors";
import { registerTicketsRoutes } from "../../../src/modules/tickets/tickets.routes";

const service = vi.hoisted(() => ({
  addComment: vi.fn(),
  claimTicket: vi.fn(),
  createTicket: vi.fn(),
  deleteTicket: vi.fn(),
  getContextOptions: vi.fn(),
  getCounts: vi.fn(),
  getTicketAssigneeOptions: vi.fn(),
  getTicketContext: vi.fn(),
  getTicketDetail: vi.fn(),
  listConversationTickets: vi.fn(),
  listTicketActivities: vi.fn(),
  listTickets: vi.fn(),
  updateTicket: vi.fn(),
}));


const ticket = {
  anchorMessageId: null,
  assignee: { displayName: "客服甲", subUserId: "101" },
  canClaim: false,
  canDelete: true,
  canEdit: true,
  canceledAt: null,
  completedAt: null,
  conversationId: "301",
  createdAt: 1_785_168_000_000,
  createdBy: { displayName: "客服甲", subUserId: "101" },
  customerAvatarUrl: null,
  customerName: "客户甲",
  description: null,
  dueAt: null,
  dueHint: null,
  overdue: false,
  ownerAccountAvatarUrl: null,
  ownerAccountId: "201",
  ownerAccountName: "售后账号",
  priority: "medium" as const,
  sessionId: "401",
  snapshotId: null,
  sourceType: "manual" as const,
  status: "open" as const,
  ticketId: "501",
  title: "跟进退款",
  updatedAt: 1_785_168_000_000,
};

describe("tickets routes", () => {
  it("requires authentication for every ticket endpoint", async () => {
    const app = await createTicketsApp();
    const requests = [
      { method: "GET", url: "/api/server/tickets" },
      { method: "GET", url: "/api/server/tickets/counts" },
      { method: "GET", url: "/api/server/tickets/context-options?conversationId=301" },
      { method: "GET", url: "/api/server/tickets/by-conversation/301" },
      { method: "GET", url: "/api/server/tickets/501" },
      { method: "GET", url: "/api/server/tickets/501/activities" },
      { method: "GET", url: "/api/server/tickets/501/assignee-options" },
      { method: "GET", url: "/api/server/tickets/501/context?cursor=cursor-1&pageSize=50" },
      {
        method: "POST",
        payload: {
          context: { type: "none" },
          conversationId: "301",
          priority: "medium",
          title: "跟进退款",
        },
        url: "/api/server/tickets",
      },
      {
        method: "PATCH",
        payload: { priority: "high" },
        url: "/api/server/tickets/501",
      },
      { method: "DELETE", url: "/api/server/tickets/501" },
      { method: "POST", url: "/api/server/tickets/501/claim" },
      {
        method: "POST",
        payload: { content: "已电话确认" },
        url: "/api/server/tickets/501/comments",
      },
    ] as const;

    for (const request of requests) {
      const response = await app.inject(request);
      expect(response.statusCode, `${request.method} ${request.url}`).toBe(401);
    }

    await app.close();
  });

  it("exposes every ticket command through the standard success envelope", async () => {
    const app = await createTicketsApp();
    const authorization = "Bearer test-token";
    service.listTickets.mockResolvedValue({
      items: [ticket], page: 1, pageSize: 20, total: 1, totalPages: 1,
    });
    service.getCounts.mockResolvedValue({
      assignedToMeActive: 1, unassignedOpen: 0,
    });
    service.getContextOptions.mockResolvedValue({
      assignees: [],
      defaultAssigneeSubUserId: "101",
      sessions: [],
    });
    service.listConversationTickets.mockResolvedValue({
      activeCount: 1,
      items: [ticket],
      page: 1,
      pageSize: 20,
      scope: "conversation",
      total: 1,
      totalPages: 1,
    });
    service.getTicketDetail.mockResolvedValue({
      ticket,
    });
    service.getTicketAssigneeOptions.mockResolvedValue({ items: [] });
    service.getTicketContext.mockResolvedValue({ context: { kind: "none" }, contextAccess: "allowed" });
    service.listTicketActivities.mockResolvedValue({
      hasMore: false,
      items: [],
      nextCursor: null,
    });
    service.createTicket.mockResolvedValue({ ticket });
    service.updateTicket.mockResolvedValue({ ticket });
    service.deleteTicket.mockResolvedValue({ deleted: true });
    service.claimTicket.mockResolvedValue({ ticket });
    service.addComment.mockResolvedValue({
      activity: {
        activityId: "601",
        activityType: "comment_added",
        content: "已电话确认",
        createdAt: 1_785_168_000_000,
        detail: null,
        operator: { displayName: "客服甲", subUserId: "101" },
        operatorType: "sub_user",
        ticketId: "501",
      },
    });

    const requests = [
      { method: "GET", url: "/api/server/tickets?view=reception&page=1&pageSize=20" },
      { method: "GET", url: "/api/server/tickets/counts" },
      { method: "GET", url: "/api/server/tickets/context-options?conversationId=301" },
      { method: "GET", url: "/api/server/tickets/by-conversation/301?scope=conversation" },
      { method: "GET", url: "/api/server/tickets/501" },
      { method: "GET", url: "/api/server/tickets/501/activities?beforeActivityId=601&pageSize=50" },
      { method: "GET", url: "/api/server/tickets/501/assignee-options" },
      { method: "GET", url: "/api/server/tickets/501/context?cursor=cursor-1&pageSize=50" },
      {
        method: "POST",
        payload: {
          context: { type: "none" },
          conversationId: "301",
          priority: "medium",
          title: "跟进退款",
        },
        url: "/api/server/tickets",
      },
      {
        method: "PATCH",
        payload: { expectedStatus: "open", status: "done" },
        url: "/api/server/tickets/501",
      },
      { method: "DELETE", url: "/api/server/tickets/501" },
      { method: "POST", url: "/api/server/tickets/501/claim" },
      {
        method: "POST",
        payload: { content: "已电话确认" },
        url: "/api/server/tickets/501/comments",
      },
    ] as const;

    for (const request of requests) {
      const response = await app.inject({
        ...request,
        headers: { authorization },
      });
      expect(response.statusCode, `${request.method} ${request.url}: ${response.body}`).toBe(200);
      expect(response.json()).toMatchObject({ success: true });
    }

    expect(service.listTickets).toHaveBeenCalledWith(
      expect.objectContaining({ role: "operator", subUserId: "101", uid: 9001 }),
      expect.objectContaining({ page: 1, pageSize: 20, view: "reception" }),
    );
    expect(service.listTicketActivities).toHaveBeenCalledWith(
      expect.objectContaining({ role: "operator", subUserId: "101", uid: 9001 }),
      "501",
      { beforeActivityId: "601", pageSize: 50 },
    );
    expect(service.getTicketContext).toHaveBeenCalledWith(
      expect.objectContaining({ role: "operator", subUserId: "101", uid: 9001 }),
      "501",
      { cursor: "cursor-1", pageSize: 50 },
    );
    expect(service.deleteTicket).toHaveBeenCalledWith(
      expect.objectContaining({ role: "operator", subUserId: "101", uid: 9001 }),
      "501",
    );
    await app.close();
  });

  it("rejects status updates without the expected current status", async () => {
    const app = await createTicketsApp();
    const response = await app.inject({
      headers: { authorization: "Bearer test-token" },
      method: "PATCH",
      payload: { status: "done" },
      url: "/api/server/tickets/501",
    });

    expect(response.statusCode).toBe(400);
    expect(service.updateTicket).not.toHaveBeenCalled();
    await app.close();
  });
});

async function createTicketsApp() {
  const app = Fastify({ logger: false });
  await registerErrorHandler(app);
  app.decorate("authenticate", async (request: { headers: { authorization?: string }; user?: unknown }) => {
    if (!request.headers.authorization) {
      throw new UnauthorizedError();
    }
    request.user = {
      roles: ["operator"],
      sessionId: "501",
      sessionVersion: 1,
      subUserId: "101",
      uid: 9001,
    };
  });
  await registerTicketsRoutes(app, () => service as never);
  return app;
}
