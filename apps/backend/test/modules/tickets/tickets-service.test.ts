import { describe, expect, it, vi } from "vitest";
import { getRolePermissions } from "../../../src/modules/auth/permissions";
import {
  TicketsService,
  type TicketsActorScope,
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
    });
    repository.listCustomerConversationIds.mockResolvedValueOnce([301, 302]);
    const service = new TicketsService(repository);

    await service.listConversationTickets(createActor("operator"), "301", {
      scope: "customer",
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
    });
    await service.listConversationTickets(createActor("operator"), "301", {
      scope: "customer",
    });
    expect(repository.listTickets).toHaveBeenLastCalledWith(expect.objectContaining({
      conversationIds: [301],
    }));
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
    countTickets: vi.fn(async () => 0),
    getConversationIdentity: vi.fn(async () => undefined),
    listCustomerConversationIds: vi.fn(async () => []),
    listTickets: vi.fn(async () => ({
      items: page?.items ?? [baseRecord],
      page: 1,
      pageSize: 20,
      total: page?.items.length ?? 1,
      totalPages: 1,
    })),
  } satisfies TicketsRepositoryPort & {
    countTickets: ReturnType<typeof vi.fn>;
    getConversationIdentity: ReturnType<typeof vi.fn>;
    listCustomerConversationIds: ReturnType<typeof vi.fn>;
    listTickets: ReturnType<typeof vi.fn>;
  };
}
