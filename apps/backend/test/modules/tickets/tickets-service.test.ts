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
  dueHint: null,
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
      "assigned_to_me",
      "reception",
      "unassigned",
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

  it("uses the same fixed scopes for navigation counts", async () => {
    const repository = createRepository();
    repository.countTickets
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);
    const service = new TicketsService(repository);

    await expect(service.getCounts(createActor("operator"))).resolves.toEqual({
      assignedToMeActive: 3,
      unassignedOpen: 2,
    });
    expect(repository.countTickets).toHaveBeenNthCalledWith(1, expect.objectContaining({
      statuses: ["open", "in_progress"],
      view: "assigned_to_me",
    }));
    expect(repository.countTickets).toHaveBeenNthCalledWith(2, expect.objectContaining({
      view: "unassigned",
    }));
  });

  it("derives edit and claim permissions from actor relation and viewer role", async () => {
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
    expect(operatorPage.items[0]).toMatchObject({ canClaim: false, canEdit: true });
    expect(operatorPage.items[1]).toMatchObject({ canClaim: true, canEdit: false });

    const viewerPage = await service.listTickets(createActor("viewer"), {
      view: "assigned_to_me",
    });
    expect(viewerPage.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ canClaim: false, canEdit: false }),
    ]));
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

  it("resolves customer conversations on the server and falls back to current chat", async () => {
    const repository = createRepository();
    repository.getConversationIdentity.mockResolvedValueOnce({
      chatType: 1,
      conversationId: 301,
      platform: 5,
      thirdExternalUserId: "customer-1",
      thirdUserId: "account-1",
    });
    repository.listCustomerConversationIds.mockResolvedValueOnce([301, 302]);
    const service = new TicketsService(repository);

    await service.listConversationTickets(createActor("operator"), "301", {
      scope: "customer",
    });
    expect(repository.listCustomerConversationIds).toHaveBeenCalledWith({
      platform: 5,
      subUserId: 101,
      thirdExternalUserId: "customer-1",
      uid: 9001,
    });
    expect(repository.listTickets).toHaveBeenLastCalledWith(expect.objectContaining({
      conversationIds: [301, 302],
      view: "visible",
    }));

    repository.getConversationIdentity.mockResolvedValueOnce({
      chatType: 1,
      conversationId: 301,
      platform: 5,
      thirdExternalUserId: "",
      thirdUserId: "account-1",
    });
    await service.listConversationTickets(createActor("operator"), "301", {
      scope: "customer",
    });
    expect(repository.listTickets).toHaveBeenLastCalledWith(expect.objectContaining({
      conversationIds: [301],
    }));
  });

  it("rejects group chats viewers and actors without chat access", async () => {
    const repository = createRepository();
    const service = new TicketsService(repository);

    repository.getConversationIdentity.mockResolvedValueOnce({
      chatType: 2,
      conversationId: 301,
      platform: 5,
      thirdExternalUserId: "customer-1",
      thirdUserId: "account-1",
    });
    await expect(service.createTicket(createActor("operator"), createPayload()))
      .rejects.toMatchObject({ code: "TICKET_SINGLE_CHAT_ONLY" });

    await expect(service.createTicket(createActor("viewer"), createPayload()))
      .rejects.toMatchObject({ code: "TICKET_FORBIDDEN" });

    configureCreationConversation(repository);
    repository.canAccessConversation.mockResolvedValueOnce(false);
    await expect(service.createTicket(createActor("operator"), createPayload()))
      .rejects.toMatchObject({ code: "TICKET_FORBIDDEN" });
  });

  it("links current context only when the latest meaningful message is in an open session", async () => {
    const repository = createRepository();
    configureCreationConversation(repository);
    repository.listRecentMessageCandidates.mockResolvedValueOnce([
      messageRow(9003, "最新消息"),
      messageRow(9002, "较早消息"),
    ]);
    repository.listOpenSessionAssignments.mockResolvedValueOnce([
      { sessionId: "401", sourceMessageId: "9003" },
      { sessionId: "400", sourceMessageId: "9002" },
    ]);
    const service = new TicketsService(repository);

    await service.createTicket(createActor("operator"), createPayload());

    expect(repository.createManualTicket).toHaveBeenCalledWith(expect.objectContaining({
      anchorMessageId: null,
      sessionId: 401,
    }));
  });

  it("anchors the latest message when only an older message has session ownership", async () => {
    const repository = createRepository();
    configureCreationConversation(repository);
    repository.listRecentMessageCandidates.mockResolvedValueOnce([
      messageRow(9003, "最新消息"),
      messageRow(9002, "较早消息"),
    ]);
    repository.listOpenSessionAssignments.mockResolvedValueOnce([
      { sessionId: "400", sourceMessageId: "9002" },
    ]);
    const service = new TicketsService(repository);

    await service.createTicket(createActor("operator"), createPayload());

    expect(repository.createManualTicket).toHaveBeenCalledWith(expect.objectContaining({
      anchorMessageId: 9003,
      sessionId: null,
    }));
  });

  it("allows current context with no meaningful messages and supports none or selected session", async () => {
    const repository = createRepository();
    configureCreationConversation(repository);
    repository.listRecentMessageCandidates.mockResolvedValueOnce([
      { ...messageRow(9003, ""), content: "{}", msgtype: "image" },
    ]);
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

  it("returns paged sessions and valid assignees for the create dialog", async () => {
    const repository = createRepository();
    configureCreationConversation(repository);
    repository.listAssigneeOptions.mockResolvedValueOnce([
      { displayName: "客服甲", subUserId: "101" },
    ]);
    repository.listSessionOptions.mockResolvedValueOnce({
      items: [{
        endedAt: null,
        sessionId: "401",
        startedAt: 1_785_168_000_000,
        status: "open",
        summary: null,
        title: null,
      }],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    const service = new TicketsService(repository);

    await expect(service.getContextOptions(createActor("operator"), {
      conversationId: "301",
    })).resolves.toMatchObject({
      defaultAssigneeSubUserId: "101",
      sessions: { total: 1 },
    });
  });

  it("enforces the write matrix for assignees creators account-only viewers and admins", async () => {
    const repository = createRepository();
    const service = new TicketsService(repository);

    repository.getTicketRecordById.mockResolvedValueOnce({
      ...baseRecord,
      assigneeSubUserId: "202",
      createdBySubUserId: "101",
    });
    await service.updateTicket(createActor("operator"), "501", { priority: "high" });
    expect(repository.updateTicket).toHaveBeenCalled();

    repository.getTicketRecordById.mockResolvedValueOnce({
      ...baseRecord,
      assigneeSubUserId: "202",
      createdBySubUserId: "202",
      hasAccountAccess: true,
    });
    await expect(service.updateTicket(createActor("operator"), "501", { priority: "high" }))
      .rejects.toMatchObject({ code: "TICKET_FORBIDDEN" });

    await expect(service.updateTicket(createActor("viewer"), "501", { priority: "high" }))
      .rejects.toMatchObject({ code: "TICKET_FORBIDDEN" });

    repository.getTicketRecordById.mockResolvedValueOnce({
      ...baseRecord,
      assigneeSubUserId: "202",
      createdBySubUserId: "202",
      hasAccountAccess: false,
    });
    await expect(service.updateTicket(createActor("admin"), "501", { priority: "high" }))
      .resolves.toHaveProperty("ticket");
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

  it("claims only account-visible open unassigned tickets and reports claim races", async () => {
    const repository = createRepository();
    repository.getTicketRecordById.mockResolvedValueOnce({
      ...baseRecord,
      assigneeSubUserId: null,
      createdBySubUserId: null,
      sourceType: "ai",
    });
    const service = new TicketsService(repository);

    await service.claimTicket(createActor("operator"), "501");
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

    await service.addComment(createActor("operator"), "501", { content: "  已电话确认  " });
    expect(repository.addTicketComment).toHaveBeenCalledWith(expect.objectContaining({
      content: "已电话确认",
    }));

    repository.getTicketRecordById.mockResolvedValueOnce({
      ...baseRecord,
      assigneeSubUserId: "202",
      createdBySubUserId: "202",
    });
    await expect(service.addComment(createActor("operator"), "501", { content: "备注" }))
      .rejects.toMatchObject({ code: "TICKET_FORBIDDEN" });
  });

  it("keeps ticket detail visible while withholding inaccessible chat context", async () => {
    const repository = createRepository();
    const contextReader = createContextReader();
    repository.canAccessConversation.mockResolvedValueOnce(false);
    const service = new TicketsService(repository, contextReader);

    const detail = await service.getTicketDetail(createActor("operator"), "501");

    expect(detail).toMatchObject({ context: { kind: "none" }, contextAccess: "forbidden" });
    expect(contextReader.listSessionMessageRecords).not.toHaveBeenCalled();
  });

  it("reads session context and filters AI evidence to its configured message ids", async () => {
    const repository = createRepository();
    const message = { msgid: "m-1", seq: 9001 } as never;
    const other = { msgid: "m-2", seq: 9002 } as never;
    const contextReader = createContextReader();
    contextReader.listSessionMessageRecords.mockResolvedValueOnce([message, other]);
    repository.listTicketEvidenceMessageIds.mockResolvedValueOnce(["9002"]);
    repository.getTicketRecordById.mockResolvedValueOnce({
      ...baseRecord,
      snapshotId: "701",
    });
    const service = new TicketsService(repository, contextReader);

    const detail = await service.getTicketDetail(createActor("operator"), "501");

    expect(detail.context).toMatchObject({ kind: "session", sessionId: "401" });
    expect(detail.evidenceMessages).toEqual([other]);
  });

  it("reads ten messages on each side of an anchor without requiring a logical session", async () => {
    const repository = createRepository();
    const contextReader = createContextReader();
    const anchor = { msgid: "9009", seq: 9009 } as never;
    contextReader.listMessageContext.mockResolvedValueOnce({
      messages: [anchor],
      targetMessageId: "9009",
    });
    repository.getTicketRecordById.mockResolvedValueOnce({
      ...baseRecord,
      anchorMessageId: "9009",
      sessionId: null,
    });
    const service = new TicketsService(repository, contextReader);

    const detail = await service.getTicketDetail(createActor("operator"), "501");

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
    contextReader.listSessionMessageRecords.mockRejectedValueOnce(new Error("message store unavailable"));
    const service = new TicketsService(repository, contextReader);

    await expect(service.getTicketDetail(createActor("operator"), "501")).resolves.toMatchObject({
      context: { kind: "none" },
      contextAccess: "error",
      ticket: { ticketId: "501" },
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
    countTickets: vi.fn(async () => 0),
    createManualTicket: vi.fn(async () => 501),
    getConversationIdentity: vi.fn(async () => undefined),
    getTicketRecordById: vi.fn(async () => baseRecord),
    isSessionInConversation: vi.fn(async () => false),
    isValidAssignee: vi.fn(async () => true),
    listAssigneeOptions: vi.fn(async () => []),
    listCustomerConversationIds: vi.fn(async () => []),
    listOpenSessionAssignments: vi.fn(async () => []),
    listRecentMessageCandidates: vi.fn(async () => []),
    listSessionOptions: vi.fn(async () => ({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    })),
    listTicketActivities: vi.fn(async () => []),
    listTicketEvidenceMessageIds: vi.fn(async () => []),
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
    countTickets: ReturnType<typeof vi.fn>;
    createManualTicket: ReturnType<typeof vi.fn>;
    getConversationIdentity: ReturnType<typeof vi.fn>;
    getTicketRecordById: ReturnType<typeof vi.fn>;
    isSessionInConversation: ReturnType<typeof vi.fn>;
    isValidAssignee: ReturnType<typeof vi.fn>;
    listAssigneeOptions: ReturnType<typeof vi.fn>;
    listCustomerConversationIds: ReturnType<typeof vi.fn>;
    listOpenSessionAssignments: ReturnType<typeof vi.fn>;
    listRecentMessageCandidates: ReturnType<typeof vi.fn>;
    listSessionOptions: ReturnType<typeof vi.fn>;
    listTickets: ReturnType<typeof vi.fn>;
  };
}

function createContextReader() {
  return {
    listMessageContext: vi.fn(async () => ({ messages: [], targetMessageId: "" })),
    listSessionMessageRecords: vi.fn(async () => []),
  } satisfies TicketsContextReaderPort & {
    listMessageContext: ReturnType<typeof vi.fn>;
    listSessionMessageRecords: ReturnType<typeof vi.fn>;
  };
}

function configureCreationConversation(repository: ReturnType<typeof createRepository>) {
  repository.getConversationIdentity.mockResolvedValueOnce({
    chatType: 1,
    conversationId: 301,
    platform: 5,
    thirdExternalUserId: "customer-1",
    thirdUserId: "account-1",
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

function messageRow(id: number, content: string) {
  return {
    chat_type: 1,
    content: JSON.stringify({ content }),
    conversation_id: 301,
    from_type: 2,
    id,
    msgtime: 1_785_168_000_000 + id,
    msgtype: "text",
    third_from_id: "customer-1",
    third_user_id: "account-1",
  };
}
