import { describe, expect, it, vi } from "vitest";
import { getRolePermissions } from "../../../src/modules/auth/permissions";
import {
  TicketsService,
  type TicketsActorScope,
  type TicketsContextReaderPort,
  type TicketsRepositoryPort,
} from "../../../src/modules/tickets/tickets.service";
import type { TicketRecord } from "../../../src/modules/tickets/tickets.types";

const baseRecord: TicketRecord = {
  anchorMessageId: null,
  assigneeDisplayName: "客服甲",
  assigneeSubUserId: "101",
  canceledAt: null,
  completedAt: null,
  conversationId: "301",
  createdAt: 1_785_168_000_000,
  createdByDisplayName: "客服甲",
  createdBySubUserId: "101",
  customerAvatarUrl: null,
  customerName: "客户甲",
  description: null,
  dueAt: null,
  hasAccountAccess: true,
  ownerAccountAvatarUrl: null,
  ownerAccountId: "201",
  ownerAccountName: "售后账号",
  overdue: false,
  priority: "medium",
  sessionId: "401",
  snapshotId: null,
  sourceType: "manual",
  status: "open",
  ticketId: "501",
  title: "跟进退款",
  updatedAt: 1_785_168_100_000,
};

describe("TicketsService", () => {
  it("passes each fixed view to the repository without widening it", async () => {
    const repository = createRepository();
    const service = new TicketsService(repository);
    const actor = createActor("operator");

    for (const view of [
      "assigned_to_me_active",
      "assigned_to_me",
      "reception",
      "created_by_me",
    ] as const) {
      await service.listTickets(actor, { view });
      expect(repository.listTickets).toHaveBeenLastCalledWith(expect.objectContaining({
        globalAccess: false,
        subUserId: 101,
        uid: 9001,
        view,
      }));
    }

    await service.listTickets(actor, {});
    expect(repository.listTickets).toHaveBeenLastCalledWith(expect.objectContaining({
      view: "assigned_to_me_active",
    }));
  });

  it("allows all only for owner and admin", async () => {
    const repository = createRepository();
    const service = new TicketsService(repository);

    await expect(service.listTickets(createActor("operator"), { view: "all" }))
      .rejects.toMatchObject({ code: "TICKET_FORBIDDEN", statusCode: 403 });
    await expect(service.listTickets(createActor("viewer"), { view: "all" }))
      .rejects.toMatchObject({ code: "TICKET_FORBIDDEN", statusCode: 403 });

    await service.listTickets(createActor("admin"), { view: "all" });
    expect(repository.listTickets).toHaveBeenLastCalledWith(expect.objectContaining({
      globalAccess: true,
      view: "all",
    }));
  });

  it("bounds reception and all views to a 30-day default and 60-day maximum", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-29T10:00:00+08:00"));
    try {
      const repository = createRepository();
      const service = new TicketsService(repository);
      const expectedDefaultRange = {
        createdFrom: Date.parse("2026-06-30T00:00:00.000+08:00"),
        createdTo: Date.parse("2026-07-29T23:59:59.999+08:00"),
      };

      await service.listTickets(createActor("operator"), { view: "reception" });
      expect(repository.listTickets).toHaveBeenLastCalledWith(expect.objectContaining({
        ...expectedDefaultRange,
        view: "reception",
      }));

      await service.listTickets(createActor("admin"), { view: "all" });
      expect(repository.listTickets).toHaveBeenLastCalledWith(expect.objectContaining({
        ...expectedDefaultRange,
        view: "all",
      }));

      await service.listTickets(createActor("operator"), { view: "assigned_to_me" });
      expect(repository.listTickets).toHaveBeenLastCalledWith(expect.objectContaining({
        createdFrom: undefined,
        createdTo: undefined,
        view: "assigned_to_me",
      }));

      const createdFrom = Date.parse("2026-06-01T00:00:00.000+08:00");
      const createdTo = Date.parse("2026-07-30T23:59:59.999+08:00");
      await service.listTickets(createActor("operator"), {
        createdFrom,
        createdTo,
        view: "reception",
      });
      expect(repository.listTickets).toHaveBeenLastCalledWith(expect.objectContaining({
        createdFrom,
        createdTo,
      }));

      await expect(service.listTickets(createActor("operator"), {
        createdFrom,
        view: "reception",
      })).rejects.toMatchObject({ code: "INVALID_TICKET_DATE_RANGE" });
      await expect(service.listTickets(createActor("operator"), {
        createdFrom,
        createdTo: Date.parse("2026-07-31T00:00:00.000+08:00"),
        view: "reception",
      })).rejects.toMatchObject({ code: "INVALID_TICKET_DATE_RANGE" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("normalizes explicit ticket ID and title search filters", async () => {
    const repository = createRepository();
    const service = new TicketsService(repository);
    const actor = createActor("operator");

    await service.listTickets(actor, {
      ticketId: "501",
      titleSearch: " 退款 ",
    });

    expect(repository.listTickets).toHaveBeenLastCalledWith(expect.objectContaining({
      ticketId: 501,
      titleSearch: "退款",
    }));

    await expect(service.listTickets(actor, { ticketId: "0" }))
      .rejects.toMatchObject({ code: "INVALID_TICKET_FILTER", statusCode: 400 });
  });

  it("counts only active tickets assigned to the current operator for navigation", async () => {
    const repository = createRepository();
    repository.countAssignedActiveTickets.mockResolvedValueOnce(3);
    const service = new TicketsService(repository);

    await expect(service.getCounts(createActor("operator"))).resolves.toEqual({
      assignedToMeActive: 3,
    });
    expect(repository.countAssignedActiveTickets).toHaveBeenCalledOnce();
    expect(repository.countAssignedActiveTickets).toHaveBeenCalledWith({
      assigneeSubUserId: 101,
      uid: 9001,
    });
    expect(repository.countActiveConversationTickets).not.toHaveBeenCalled();
  });

  it("returns list edit permissions without exposing detail-only claim permissions", async () => {
    const repository = createRepository({
      items: [
        baseRecord,
        {
          ...baseRecord,
          assigneeDisplayName: null,
          assigneeSubUserId: null,
          createdByDisplayName: null,
          createdBySubUserId: null,
          sourceType: "ai",
          ticketId: "502",
        },
      ],
    });
    const service = new TicketsService(repository);

    const operatorPage = await service.listTickets(createActor("operator"), {
      view: "assigned_to_me",
    });
    expect(operatorPage.items[0]).toMatchObject({ canDelete: true, canEdit: true });
    expect(operatorPage.items[1]).toMatchObject({ canDelete: false, canEdit: false });
    expect(operatorPage.items[0]).not.toHaveProperty("canClaim");
    expect(operatorPage.items[1]).not.toHaveProperty("canClaim");

    const viewerPage = await service.listTickets(createActor("viewer"), {
      view: "assigned_to_me",
    });
    expect(viewerPage.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ canDelete: true, canEdit: true }),
    ]));
    expect(viewerPage.items[0]).not.toHaveProperty("canClaim");
  });

  it("allows only the manual ticket creator to delete any non-deleted status", async () => {
    const repository = createRepository();
    const service = new TicketsService(repository);

    for (const status of ["open", "in_progress", "done", "canceled"] as const) {
      repository.getTicketDeleteRecordById.mockResolvedValueOnce({
        createdBySubUserId: "101",
        sourceType: "manual",
        status,
      });
      await expect(service.deleteTicket(createActor("operator"), "501"))
        .resolves.toEqual({ deleted: true });
      expect(repository.deleteTicket).toHaveBeenLastCalledWith({
        createdBySubUserId: 101,
        ticketId: 501,
        uid: 9001,
      });
    }

    repository.getTicketDeleteRecordById.mockResolvedValueOnce({
      createdBySubUserId: "101",
      sourceType: "manual",
      status: "open",
    });
    await expect(service.deleteTicket(createActor("viewer"), "501"))
      .resolves.toEqual({ deleted: true });
  });

  it("rejects ticket deletion by non-creators, elevated roles, and AI sources", async () => {
    const repository = createRepository();
    const service = new TicketsService(repository);

    repository.getTicketDeleteRecordById.mockResolvedValue({
      createdBySubUserId: "202",
      sourceType: "manual",
      status: "open",
    });
    await expect(service.deleteTicket(createActor("operator"), "501"))
      .rejects.toMatchObject({ code: "TICKET_DELETE_FORBIDDEN", statusCode: 403 });
    await expect(service.deleteTicket(createActor("admin"), "501"))
      .rejects.toMatchObject({ code: "TICKET_DELETE_FORBIDDEN", statusCode: 403 });

    repository.getTicketDeleteRecordById.mockResolvedValueOnce({
      createdBySubUserId: null,
      sourceType: "ai",
      status: "open",
    });
    await expect(service.deleteTicket(createActor("operator"), "501"))
      .rejects.toMatchObject({ code: "TICKET_DELETE_FORBIDDEN", statusCode: 403 });
  });

  it("treats missing, already deleted, and raced ticket deletion as not found", async () => {
    const repository = createRepository();
    const service = new TicketsService(repository);

    repository.getTicketDeleteRecordById.mockResolvedValueOnce(undefined);
    await expect(service.deleteTicket(createActor("operator"), "501"))
      .rejects.toMatchObject({ code: "TICKET_NOT_FOUND", statusCode: 404 });

    repository.getTicketDeleteRecordById.mockResolvedValueOnce({
      createdBySubUserId: "101",
      sourceType: "manual",
      status: "deleted",
    });
    await expect(service.deleteTicket(createActor("operator"), "501"))
      .rejects.toMatchObject({ code: "TICKET_NOT_FOUND", statusCode: 404 });

    repository.getTicketDeleteRecordById.mockResolvedValueOnce({
      createdBySubUserId: "101",
      sourceType: "manual",
      status: "open",
    });
    repository.deleteTicket.mockResolvedValueOnce(false);
    await expect(service.deleteTicket(createActor("operator"), "501"))
      .rejects.toMatchObject({ code: "TICKET_NOT_FOUND", statusCode: 404 });
  });

  it("maps legacy terminal statuses to canceled", async () => {
    const repository = createRepository({
      items: [
        { ...baseRecord, status: "dismissed" },
        { ...baseRecord, status: "expired", ticketId: "502" },
      ],
    });
    const service = new TicketsService(repository);

    const page = await service.listTickets(createActor("operator"), {
      view: "assigned_to_me",
    });

    expect(page.items.map((item) => item.status)).toEqual(["canceled", "canceled"]);
  });

  it("lists tickets only from the requested conversation", async () => {
    const repository = createRepository();
    repository.getConversationIdentity.mockResolvedValueOnce({
      chatType: 1,
      conversationId: 301,
      lastAuditInfoId: 9003,
      lastMessageAt: 1_785_168_000_000,
    });
    const service = new TicketsService(repository);

    await service.listConversationTickets(createActor("operator"), "301", {
      filter: "active",
    });
    expect(repository.listTickets).toHaveBeenLastCalledWith(expect.objectContaining({
      conversationIds: [301],
      statuses: ["open", "in_progress"],
      view: "visible",
    }));
  });

  it("counts active tickets for an accessible single conversation", async () => {
    const repository = createRepository();
    repository.getConversationIdentity.mockResolvedValueOnce({
      chatType: 1,
      conversationId: 301,
      lastAuditInfoId: 9003,
      lastMessageAt: 1_785_168_000_000,
    });
    repository.countActiveConversationTickets.mockResolvedValueOnce(3);
    const service = new TicketsService(repository);

    await expect(
      service.countConversationActiveTickets(
        createActor("operator"),
        "301",
      ),
    ).resolves.toEqual({ activeCount: 3 });
    expect(repository.canAccessConversation).toHaveBeenCalledWith({
      conversationId: 301,
      subUserId: 101,
      uid: 9001,
    });
    expect(repository.countActiveConversationTickets).toHaveBeenCalledWith({
      conversationId: 301,
      uid: 9001,
    });
  });

  it("rejects active ticket counts for group conversations", async () => {
    const repository = createRepository();
    repository.getConversationIdentity.mockResolvedValueOnce({
      chatType: 2,
      conversationId: 301,
      lastAuditInfoId: 9003,
      lastMessageAt: 1_785_168_000_000,
    });
    const service = new TicketsService(repository);

    await expect(
      service.countConversationActiveTickets(createActor("operator"), "301"),
    ).rejects.toMatchObject({ code: "TICKET_SINGLE_CHAT_ONLY" });
    expect(repository.countActiveConversationTickets).not.toHaveBeenCalled();
  });

  it("rejects active ticket counts without conversation access", async () => {
    const repository = createRepository();
    repository.getConversationIdentity.mockResolvedValueOnce({
      chatType: 1,
      conversationId: 301,
      lastAuditInfoId: 9003,
      lastMessageAt: 1_785_168_000_000,
    });
    repository.canAccessConversation.mockResolvedValueOnce(false);
    const service = new TicketsService(repository);

    await expect(
      service.countConversationActiveTickets(createActor("operator"), "301"),
    ).rejects.toMatchObject({ code: "TICKET_FORBIDDEN" });
    expect(repository.countActiveConversationTickets).not.toHaveBeenCalled();
  });

  it("rejects group chats and actors without chat access while allowing viewers to create", async () => {
    const repository = createRepository();
    const service = new TicketsService(repository);

    repository.getConversationIdentity.mockResolvedValueOnce({
      chatType: 2,
      conversationId: 301,
      lastAuditInfoId: 9003,
      lastMessageAt: 1_785_168_000_000,
    });
    await expect(service.createTicket(createActor("operator"), createPayload()))
      .rejects.toMatchObject({ code: "TICKET_SINGLE_CHAT_ONLY" });

    configureCreationConversation(repository);
    await expect(service.createTicket(createActor("viewer"), createPayload()))
      .resolves.toHaveProperty("ticket");

    configureCreationConversation(repository);
    repository.canAccessConversation.mockResolvedValueOnce(false);
    await expect(service.createTicket(createActor("operator"), createPayload()))
      .rejects.toMatchObject({ code: "TICKET_FORBIDDEN" });
  });

  it("links current context to an open latest session at its close boundary", async () => {
    const repository = createRepository();
    configureCreationConversation(repository);
    repository.listSessionOptions.mockResolvedValueOnce([{
      endedAt: null,
      nextCloseAt: 1_785_168_000_000,
      sessionId: "401",
      startedAt: 1_785_167_000_000,
      status: "open",
      summary: null,
      title: null,
    }]);
    const service = new TicketsService(repository);

    await service.createTicket(createActor("operator"), createPayload());

    expect(repository.createManualTicket).toHaveBeenCalledWith(expect.objectContaining({
      anchorMessageId: null,
      sessionId: 401,
    }));
    expect(repository.listSessionOptions).toHaveBeenCalledWith({
      conversationId: 301,
      limit: 1,
      uid: 9001,
    });
  });

  it("links current context to the latest closed session that covers the last message", async () => {
    const repository = createRepository();
    configureCreationConversation(repository, { lastMessageAt: 200 });
    repository.listSessionOptions.mockResolvedValueOnce([{
      endedAt: 300,
      nextCloseAt: null,
      sessionId: "401",
      startedAt: 100,
      status: "ended",
      summary: null,
      title: null,
    }]);
    const service = new TicketsService(repository);

    await service.createTicket(createActor("operator"), createPayload());

    expect(repository.createManualTicket).toHaveBeenCalledWith(expect.objectContaining({
      anchorMessageId: null,
      sessionId: 401,
    }));
  });

  it("anchors the latest message when it falls after the latest session boundary", async () => {
    const repository = createRepository();
    configureCreationConversation(repository, { lastMessageAt: 400 });
    repository.listSessionOptions.mockResolvedValueOnce([{
      endedAt: 300,
      nextCloseAt: null,
      sessionId: "401",
      startedAt: 100,
      status: "ended",
      summary: null,
      title: null,
    }]);
    const service = new TicketsService(repository);

    await service.createTicket(createActor("operator"), createPayload());

    expect(repository.createManualTicket).toHaveBeenCalledWith(expect.objectContaining({
      anchorMessageId: 9003,
      sessionId: null,
    }));
  });

  it("allows current context without sessions and supports none or selected session", async () => {
    const repository = createRepository();
    configureCreationConversation(repository, {
      lastAuditInfoId: null,
      lastMessageAt: null,
    });
    const service = new TicketsService(repository);

    await service.createTicket(createActor("operator"), createPayload());
    expect(repository.createManualTicket).toHaveBeenLastCalledWith(expect.objectContaining({
      anchorMessageId: null,
      sessionId: null,
    }));

    configureCreationConversation(repository);
    await service.createTicket(createActor("operator"), createPayload({
      context: { type: "none" },
    }));
    expect(repository.createManualTicket).toHaveBeenLastCalledWith(expect.objectContaining({
      anchorMessageId: null,
      sessionId: null,
    }));

    configureCreationConversation(repository);
    repository.isSessionInConversation.mockResolvedValueOnce(true);
    await service.createTicket(createActor("operator"), createPayload({
      context: { sessionId: "777", type: "session" },
    }));
    expect(repository.createManualTicket).toHaveBeenLastCalledWith(expect.objectContaining({
      anchorMessageId: null,
      sessionId: 777,
    }));
  });

  it("defaults assignment to creator but accepts explicit unassigned and rejects invalid assignees", async () => {
    const repository = createRepository();
    const service = new TicketsService(repository);

    configureCreationConversation(repository);
    await service.createTicket(createActor("operator"), createPayload({ context: { type: "none" } }));
    expect(repository.createManualTicket).toHaveBeenLastCalledWith(expect.objectContaining({
      assigneeSubUserId: 101,
      createdBySubUserId: 101,
    }));

    configureCreationConversation(repository);
    await service.createTicket(createActor("operator"), createPayload({
      assigneeSubUserId: null,
      context: { type: "none" },
    }));
    expect(repository.createManualTicket).toHaveBeenLastCalledWith(expect.objectContaining({
      assigneeSubUserId: null,
    }));

    configureCreationConversation(repository);
    repository.isValidAssignee.mockResolvedValueOnce(false);
    await expect(service.createTicket(createActor("operator"), createPayload({
      assigneeSubUserId: "999",
      context: { type: "none" },
    }))).rejects.toMatchObject({ code: "INVALID_TICKET_ASSIGNEE" });
  });

  it("writes a zero due timestamp as an unset due date when creating", async () => {
    const repository = createRepository();
    configureCreationConversation(repository);
    const service = new TicketsService(repository);

    await service.createTicket(createActor("operator"), createPayload({
      context: { type: "none" },
      dueAt: 0,
    }));

    expect(repository.createManualTicket).toHaveBeenCalledWith(expect.objectContaining({
      dueAt: null,
    }));
  });

  it("returns only the five latest sessions and valid assignees for the create dialog", async () => {
    const repository = createRepository();
    configureCreationConversation(repository);
    repository.listAssigneeOptions.mockResolvedValueOnce([
      { displayName: "客服甲", subUserId: "101" },
    ]);
    repository.listSessionOptions.mockResolvedValueOnce([{
      endedAt: null,
      nextCloseAt: 1_785_168_060_000,
      sessionId: "401",
      startedAt: 1_785_168_000_000,
      status: "open",
      summary: null,
      title: null,
    }, {
      endedAt: 1_785_160_000_000,
      nextCloseAt: null,
      sessionId: "400",
      startedAt: 1_785_159_000_000,
      status: "ended",
      summary: null,
      title: null,
    }]);
    const service = new TicketsService(repository);

    await expect(service.getContextOptions(createActor("operator"), {
      conversationId: "301",
    })).resolves.toMatchObject({
      defaultAssigneeSubUserId: "101",
      sessions: [{ sessionId: "400" }],
    });
    expect(repository.listSessionOptions).toHaveBeenCalledWith({
      conversationId: 301,
      limit: 5,
      uid: 9001,
    });
  });

  it("keeps the latest historical session selectable when it does not cover the last message", async () => {
    const repository = createRepository();
    configureCreationConversation(repository, { lastMessageAt: 400 });
    repository.listSessionOptions.mockResolvedValueOnce([{
      endedAt: 300,
      nextCloseAt: null,
      sessionId: "401",
      startedAt: 100,
      status: "ended",
      summary: null,
      title: null,
    }]);
    const service = new TicketsService(repository);

    await expect(service.getContextOptions(createActor("operator"), {
      conversationId: "301",
    })).resolves.toMatchObject({
      sessions: [{ sessionId: "401" }],
    });
  });

  it("enforces the write matrix for assignees creators account-only users and admins", async () => {
    const repository = createRepository();
    const service = new TicketsService(repository);

    repository.getTicketRecordById.mockResolvedValueOnce({
      ...baseRecord,
      assigneeSubUserId: "202",
      createdBySubUserId: "101",
    });
    await service.updateTicket(createActor("operator"), "501", { priority: "high" });
    expect(repository.updateTicket).toHaveBeenCalledWith(expect.objectContaining({
      enforceWriteAccess: true,
    }));

    repository.getTicketRecordById.mockResolvedValueOnce({
      ...baseRecord,
      assigneeSubUserId: "202",
      createdBySubUserId: "202",
      hasAccountAccess: true,
    });
    await expect(service.updateTicket(createActor("operator"), "501", { priority: "high" }))
      .rejects.toMatchObject({ code: "TICKET_FORBIDDEN" });

    await expect(service.updateTicket(createActor("viewer"), "501", { priority: "high" }))
      .resolves.toHaveProperty("ticket");

    repository.getTicketRecordById.mockResolvedValueOnce({
      ...baseRecord,
      assigneeSubUserId: "202",
      createdBySubUserId: "202",
      hasAccountAccess: false,
    });
    await expect(service.updateTicket(createActor("admin"), "501", { priority: "high" }))
      .resolves.toHaveProperty("ticket");
  });

  it("records one activity containing all fields changed by one edit", async () => {
    const repository = createRepository();
    const service = new TicketsService(repository);
    const dueAt = 1_785_254_400_000;

    await service.updateTicket(createActor("operator"), "501", {
      description: "客户已补充退款账号",
      dueAt,
      priority: "high",
    });

    expect(repository.updateTicket).toHaveBeenCalledWith(expect.objectContaining({
      activities: [{
        activityType: "content_updated",
        detail: {
          changes: [
            { after: "high", before: "medium", field: "priority" },
            { after: dueAt, before: null, field: "dueAt" },
            { after: "客户已补充退款账号", before: null, field: "description" },
          ],
        },
      }],
    }));
  });

  it("does not record a due date change when both values mean unset", async () => {
    const repository = createRepository();
    repository.getTicketRecordById.mockResolvedValue({
      ...baseRecord,
      dueAt: 0,
    });
    const service = new TicketsService(repository);

    await service.updateTicket(createActor("operator"), "501", { dueAt: null });

    expect(repository.updateTicket).not.toHaveBeenCalled();
  });

  it("does not write a zero due timestamp when the due date is unset", async () => {
    const repository = createRepository();
    const service = new TicketsService(repository);

    await service.updateTicket(createActor("operator"), "501", { dueAt: 0 });

    expect(repository.updateTicket).not.toHaveBeenCalled();
  });

  it("validates reassignment and uses a status fence for state changes", async () => {
    const repository = createRepository();
    const service = new TicketsService(repository);
    repository.isValidAssignee.mockResolvedValueOnce(false);

    await expect(service.updateTicket(createActor("operator"), "501", {
      assigneeSubUserId: "999",
    })).rejects.toMatchObject({ code: "INVALID_TICKET_ASSIGNEE" });

    repository.getTicketRecordById.mockResolvedValueOnce(baseRecord);
    await service.updateTicket(createActor("operator"), "501", {
      expectedStatus: "open",
      status: "done",
    });
    expect(repository.updateTicket).toHaveBeenLastCalledWith(expect.objectContaining({
      expectedStatuses: ["open"],
      values: expect.objectContaining({
        completedBySubUserId: 101,
        status: "done",
      }),
    }));

    repository.getTicketRecordById.mockResolvedValueOnce({ ...baseRecord, status: "done" });
    await expect(service.updateTicket(createActor("operator"), "501", {
      expectedStatus: "open",
      status: "canceled",
    })).rejects.toMatchObject({ code: "TICKET_STATE_CONFLICT" });
  });

  it("returns an in-progress ticket to open when its assignee is cleared atomically", async () => {
    const repository = createRepository();
    repository.getTicketRecordById.mockResolvedValueOnce({ ...baseRecord, status: "in_progress" });
    const service = new TicketsService(repository);

    await service.updateTicket(createActor("operator"), "501", { assigneeSubUserId: null });

    expect(repository.updateTicket).toHaveBeenCalledWith(expect.objectContaining({
      expectedStatuses: ["in_progress"],
      values: expect.objectContaining({ assigneeSubUserId: null, status: "open" }),
    }));
  });

  it("keeps an explicit terminal transition when clearing an in-progress assignee", async () => {
    const repository = createRepository();
    repository.getTicketRecordById.mockResolvedValueOnce({ ...baseRecord, status: "in_progress" });
    const service = new TicketsService(repository);

    await service.updateTicket(createActor("operator"), "501", {
      assigneeSubUserId: null,
      expectedStatus: "in_progress",
      status: "done",
    });

    expect(repository.updateTicket).toHaveBeenCalledWith(expect.objectContaining({
      expectedStatuses: ["in_progress"],
      values: expect.objectContaining({
        assigneeSubUserId: null,
        completedBySubUserId: 101,
        status: "done",
      }),
    }));
  });

  it("claims account-visible unassigned tickets without restricting their status and reports races", async () => {
    const repository = createRepository();
    repository.getTicketRecordById.mockResolvedValueOnce({
      ...baseRecord,
      assigneeSubUserId: null,
      createdBySubUserId: null,
      sourceType: "ai",
      status: "done",
    });
    const service = new TicketsService(repository);

    await service.claimTicket(createActor("viewer"), "501");
    expect(repository.claimTicket).toHaveBeenCalledWith({
      assigneeSubUserId: 101,
      ticketId: 501,
      uid: 9001,
    });

    repository.getTicketRecordById.mockResolvedValueOnce({
      ...baseRecord,
      assigneeSubUserId: null,
      createdBySubUserId: null,
      sourceType: "ai",
    });
    repository.claimTicket.mockResolvedValueOnce(false);
    await expect(service.claimTicket(createActor("operator"), "501"))
      .rejects.toMatchObject({ code: "TICKET_ALREADY_CLAIMED" });
  });

  it("trims comments and applies the same write permission", async () => {
    const repository = createRepository();
    const service = new TicketsService(repository);

    await service.addComment(createActor("viewer"), "501", { content: "  已电话确认  " });
    expect(repository.addTicketComment).toHaveBeenCalledWith(expect.objectContaining({
      content: "已电话确认",
      enforceWriteAccess: true,
    }));

    repository.getTicketRecordById.mockResolvedValueOnce({
      ...baseRecord,
      assigneeSubUserId: "202",
      createdBySubUserId: "202",
    });
    await expect(service.addComment(createActor("operator"), "501", { content: "备注" }))
      .rejects.toMatchObject({ code: "TICKET_FORBIDDEN" });
  });

  it("rejects comments longer than one thousand characters", async () => {
    const service = new TicketsService(createRepository());

    await expect(service.addComment(createActor("operator"), "501", {
      content: "a".repeat(1001),
    })).rejects.toMatchObject({
      code: "INVALID_TICKET_COMMENT",
      statusCode: 400,
    });
  });

  it("keeps ticket detail visible while withholding inaccessible chat context", async () => {
    const repository = createRepository();
    const contextReader = createContextReader();
    repository.getTicketAccessRecordById.mockResolvedValueOnce({
      ...baseRecord,
      hasAccountAccess: false,
    });
    const service = new TicketsService(repository, contextReader);

    const detail = await service.getTicketContext(createActor("operator"), "501");

    expect(detail).toMatchObject({ context: { kind: "none" }, contextAccess: "forbidden" });
    expect(contextReader.listSessionMessageRecordPage).not.toHaveBeenCalled();
  });

  it("loads session context without querying unused AI evidence", async () => {
    const repository = createRepository();
    const message = { msgid: "m-1", seq: 9001 } as never;
    const other = { msgid: "m-2", seq: 9002 } as never;
    const contextReader = createContextReader();
    contextReader.listSessionMessageRecordPage.mockResolvedValueOnce({
      hasMore: false,
      messages: [message, other],
      nextCursor: null,
    });
    const service = new TicketsService(repository, contextReader);

    const detail = await service.getTicketContext(createActor("operator"), "501");

    expect(detail.context).toMatchObject({ kind: "session", sessionId: "401" });
    expect(detail.context).toMatchObject({ messages: [message, other] });
  });

  it("uses lightweight access records for independently loaded detail sections", async () => {
    const repository = createRepository();
    const service = new TicketsService(repository, createContextReader());

    await service.getTicketContext(createActor("operator"), "501");
    await service.listTicketActivities(createActor("operator"), "501", {});
    await service.getTicketAssigneeOptions(createActor("operator"), "501");

    expect(repository.getTicketAccessRecordById).toHaveBeenCalledTimes(3);
    expect(repository.getTicketRecordById).not.toHaveBeenCalled();
    expect(repository.listTicketActivities).toHaveBeenCalledWith({
      beforeActivityId: undefined,
      limit: 20,
      ticketId: 501,
      uid: 9001,
    });
  });

  it("uses an opaque cursor to load older session messages", async () => {
    const repository = createRepository();
    const contextReader = createContextReader();
    contextReader.listSessionMessageRecordPage
      .mockResolvedValueOnce({
        hasMore: true,
        messages: [{ seq: 9002 } as never],
        nextCursor: { messageId: 9002, messageTime: 1_785_168_000_000 },
      })
      .mockResolvedValueOnce({
        hasMore: false,
        messages: [{ seq: 9001 } as never],
        nextCursor: null,
      });
    const service = new TicketsService(repository, contextReader);

    const firstPage = await service.getTicketContext(createActor("operator"), "501", {
      pageSize: 1,
    });
    expect(firstPage.context).toMatchObject({
      hasMore: true,
      kind: "session",
      messages: [{ seq: 9002 }],
    });
    const cursor = firstPage.context.kind === "session" ? firstPage.context.nextCursor : null;
    expect(cursor).toEqual(expect.any(String));

    await service.getTicketContext(createActor("operator"), "501", {
      cursor: cursor!,
      pageSize: 1,
    });
    expect(contextReader.listSessionMessageRecordPage).toHaveBeenNthCalledWith(
      2,
      { uid: 9001 },
      "401",
      {
        before: { messageId: 9002, messageTime: 1_785_168_000_000 },
        limit: 1,
      },
    );
  });

  it("rejects malformed session context cursors instead of hiding them as load failures", async () => {
    const service = new TicketsService(createRepository(), createContextReader());

    await expect(service.getTicketContext(createActor("operator"), "501", {
      cursor: "not-a-valid-cursor",
    })).rejects.toMatchObject({
      code: "INVALID_TICKET_CONTEXT_CURSOR",
      statusCode: 400,
    });
  });

  it("reads ten messages on each side of an anchor without requiring a logical session", async () => {
    const repository = createRepository();
    const contextReader = createContextReader();
    const anchor = { msgid: "9009", seq: 9009 } as never;
    contextReader.listMessageContext.mockResolvedValueOnce({
      messages: [anchor],
      targetMessageId: "9009",
    });
    repository.getTicketAccessRecordById.mockResolvedValueOnce({
      ...baseRecord,
      anchorMessageId: "9009",
      sessionId: null,
    });
    const service = new TicketsService(repository, contextReader);

    const detail = await service.getTicketContext(createActor("operator"), "501");

    expect(contextReader.listMessageContext).toHaveBeenCalledWith(
      { uid: 9001 },
      "301",
      "9009",
      { after: 10, before: 10 },
    );
    expect(detail.context).toMatchObject({ anchorMessageId: "9009", kind: "message" });
  });

  it("keeps ticket detail available when context loading fails", async () => {
    const repository = createRepository();
    const contextReader = createContextReader();
    contextReader.listSessionMessageRecordPage.mockRejectedValueOnce(new Error("message store unavailable"));
    const service = new TicketsService(repository, contextReader);

    await expect(service.getTicketContext(createActor("operator"), "501")).resolves.toMatchObject({
      context: { kind: "none" },
      contextAccess: "error",
    });
  });

  it("loads older activity pages with a descending id cursor", async () => {
    const repository = createRepository();
    repository.listTicketActivities.mockResolvedValueOnce({
      hasMore: true,
      items: [{
        activityId: "600",
        activityType: "comment_added",
        content: "更早的评论",
        createdAt: 1_785_168_000_000,
        detail: null,
        operatorDisplayName: "客服甲",
        operatorSubUserId: "101",
        operatorType: "sub_user",
        ticketId: "501",
      }],
      nextCursor: "600",
    });
    const service = new TicketsService(repository);

    await expect(service.listTicketActivities(createActor("operator"), "501", {
      beforeActivityId: "601",
      pageSize: 20,
    })).resolves.toMatchObject({
      hasMore: true,
      items: [{
        activityId: "600",
        operator: { displayName: "客服甲", subUserId: "101" },
      }],
      nextCursor: "600",
    });
    expect(repository.listTicketActivities).toHaveBeenCalledWith({
      beforeActivityId: 601,
      limit: 20,
      ticketId: 501,
      uid: 9001,
    });
  });
});

function createActor(role: TicketsActorScope["role"]): TicketsActorScope {
  return {
    permissions: getRolePermissions(role),
    role,
    subUserId: "101",
    uid: 9001,
  };
}

function createRepository(page?: { items: TicketRecord[] }) {
  return {
    addTicketComment: vi.fn(async () => ({
      activityId: "601",
      activityType: "comment_added" as const,
      content: "已电话确认",
      createdAt: 1_785_168_000_000,
      detail: null,
      operatorDisplayName: "客服甲",
      operatorSubUserId: "101",
      operatorType: "sub_user" as const,
      ticketId: "501",
    })),
    canAccessConversation: vi.fn(async () => true),
    claimTicket: vi.fn(async () => true),
    countAssignedActiveTickets: vi.fn(async () => 0),
    countActiveConversationTickets: vi.fn(async () => 0),
    createManualTicket: vi.fn(async () => 501),
    deleteTicket: vi.fn(async () => true),
    getConversationIdentity: vi.fn(async () => undefined),
    getTicketAccessRecordById: vi.fn(async () => baseRecord),
    getTicketDeleteRecordById: vi.fn(async () => ({
      createdBySubUserId: baseRecord.createdBySubUserId,
      sourceType: baseRecord.sourceType,
      status: "open" as const,
    })),
    getTicketRecordById: vi.fn(async () => baseRecord),
    isSessionInConversation: vi.fn(async () => false),
    isValidAssignee: vi.fn(async () => true),
    listAssigneeOptions: vi.fn(async () => []),
    listSessionOptions: vi.fn(async () => []),
    listTicketActivities: vi.fn(async () => ({
      hasMore: false,
      items: [],
      nextCursor: null,
    })),
    listTickets: vi.fn(async () => ({
      items: page?.items ?? [baseRecord],
      page: 1,
      pageSize: 20,
      total: page?.items.length ?? 1,
      totalPages: 1,
    })),
    updateTicket: vi.fn(async () => true),
  } satisfies TicketsRepositoryPort & {
    canAccessConversation: ReturnType<typeof vi.fn>;
    countAssignedActiveTickets: ReturnType<typeof vi.fn>;
    countActiveConversationTickets: ReturnType<typeof vi.fn>;
    createManualTicket: ReturnType<typeof vi.fn>;
    getConversationIdentity: ReturnType<typeof vi.fn>;
    getTicketAccessRecordById: ReturnType<typeof vi.fn>;
    getTicketRecordById: ReturnType<typeof vi.fn>;
    isSessionInConversation: ReturnType<typeof vi.fn>;
    isValidAssignee: ReturnType<typeof vi.fn>;
    listAssigneeOptions: ReturnType<typeof vi.fn>;
    listSessionOptions: ReturnType<typeof vi.fn>;
    listTickets: ReturnType<typeof vi.fn>;
  };
}

function createContextReader() {
  return {
    listMessageContext: vi.fn(async () => ({ messages: [], targetMessageId: "" })),
    listSessionMessageRecordPage: vi.fn(async () => ({
      hasMore: false,
      messages: [],
      nextCursor: null,
    })),
  } satisfies TicketsContextReaderPort & {
    listMessageContext: ReturnType<typeof vi.fn>;
    listSessionMessageRecordPage: ReturnType<typeof vi.fn>;
  };
}

function configureCreationConversation(
  repository: ReturnType<typeof createRepository>,
  overrides: Partial<{
    lastAuditInfoId: number | null;
    lastMessageAt: number | null;
  }> = {},
) {
  repository.getConversationIdentity.mockResolvedValueOnce({
    chatType: 1,
    conversationId: 301,
    lastAuditInfoId: 9003,
    lastMessageAt: 1_785_168_000_000,
    ...overrides,
  });
}

function createPayload(overrides: Record<string, unknown> = {}) {
  return {
    context: { type: "current" as const },
    conversationId: "301",
    priority: "medium" as const,
    title: "跟进退款",
    ...overrides,
  } as never;
}
