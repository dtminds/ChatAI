import type {
  AccountPermission,
  AccountRole,
  ConversationTicketsQuery,
  ConversationTicketsResponse,
  Ticket,
  TicketCountsResponse,
  TicketListQuery,
  TicketListResponse,
  TicketStatus,
} from "@chatai/contracts";
import { BadRequestError, ForbiddenError } from "../../shared/errors.js";
import { parseMySqlId } from "../../shared/id-utils.js";
import type {
  TicketConversationIdentity,
  TicketCountRepositoryInput,
  TicketListRepositoryInput,
  TicketRecord,
  TicketRecordPage,
} from "./tickets.types.js";

export type TicketsActorScope = {
  permissions: readonly AccountPermission[];
  role: AccountRole;
  subUserId: string;
  uid: number;
};

export interface TicketsRepositoryPort {
  countTickets(input: TicketCountRepositoryInput): Promise<number>;
  getConversationIdentity(
    uid: number,
    conversationId: number,
  ): Promise<TicketConversationIdentity | undefined>;
  listCustomerConversationIds(input: {
    platform: number;
    thirdExternalUserId: string;
    uid: number;
  }): Promise<number[]>;
  listTickets(input: TicketListRepositoryInput): Promise<TicketRecordPage>;
}

export class TicketsService {
  constructor(private readonly repository: TicketsRepositoryPort) {}

  async listTickets(
    actor: TicketsActorScope,
    query: TicketListQuery,
  ): Promise<TicketListResponse> {
    const subUserId = getActorSubUserId(actor);
    const view = query.view ?? "assigned_to_me";
    const globalAccess = hasGlobalTicketAccess(actor);

    if (view === "all" && !globalAccess) {
      throw new ForbiddenError("TICKET_FORBIDDEN", "无权查看全部工单");
    }

    const page = await this.repository.listTickets({
      ...normalizeListFilters(query),
      globalAccess,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      subUserId,
      uid: actor.uid,
      view,
    });

    return mapTicketPage(page, actor);
  }

  async getCounts(actor: TicketsActorScope): Promise<TicketCountsResponse> {
    const subUserId = getActorSubUserId(actor);
    const globalAccess = hasGlobalTicketAccess(actor);
    const [assignedToMeActive, unassignedOpen] = await Promise.all([
      this.repository.countTickets({
        globalAccess,
        statuses: ["open", "in_progress"],
        subUserId,
        uid: actor.uid,
        view: "assigned_to_me",
      }),
      this.repository.countTickets({
        globalAccess,
        subUserId,
        uid: actor.uid,
        view: "unassigned",
      }),
    ]);

    return { assignedToMeActive, unassignedOpen };
  }

  async listConversationTickets(
    actor: TicketsActorScope,
    conversationId: string,
    query: ConversationTicketsQuery,
  ): Promise<ConversationTicketsResponse> {
    const numericConversationId = parseMySqlId(conversationId);

    if (numericConversationId == null) {
      throw new BadRequestError("INVALID_TICKET_CONTEXT", "聊天窗口参数无效");
    }

    const identity = await this.repository.getConversationIdentity(
      actor.uid,
      numericConversationId,
    );

    if (!identity || identity.chatType !== 1) {
      throw new BadRequestError("TICKET_SINGLE_CHAT_ONLY", "工单仅支持单聊客户");
    }

    const scope = query.scope ?? "conversation";
    const conversationIds = scope === "customer"
      ? await this.resolveCustomerConversationIds(identity, actor.uid)
      : [identity.conversationId];
    const subUserId = getActorSubUserId(actor);
    const globalAccess = hasGlobalTicketAccess(actor);
    const repositoryInput: TicketListRepositoryInput = {
      conversationIds,
      globalAccess,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      status: query.status,
      subUserId,
      uid: actor.uid,
      view: "visible",
    };
    const [page, activeCount] = await Promise.all([
      this.repository.listTickets(repositoryInput),
      this.repository.countTickets({
        conversationIds,
        globalAccess,
        statuses: ["open", "in_progress"],
        subUserId,
        uid: actor.uid,
        view: "visible",
      }),
    ]);

    return {
      ...mapTicketPage(page, actor),
      activeCount,
      scope,
    };
  }

  private async resolveCustomerConversationIds(
    identity: TicketConversationIdentity,
    uid: number,
  ) {
    if (!identity.thirdExternalUserId) {
      return [identity.conversationId];
    }

    const conversationIds = await this.repository.listCustomerConversationIds({
      platform: identity.platform,
      thirdExternalUserId: identity.thirdExternalUserId,
      uid,
    });

    return conversationIds.length > 0 ? conversationIds : [identity.conversationId];
  }
}

export function hasGlobalTicketAccess(actor: TicketsActorScope) {
  return actor.role === "owner" || actor.role === "admin";
}

export function canModifyTicket(actor: TicketsActorScope, record: TicketRecord) {
  if (actor.role === "viewer") {
    return false;
  }

  if (hasGlobalTicketAccess(actor)) {
    return true;
  }

  return record.assigneeSubUserId === actor.subUserId
    || (record.sourceType === "manual" && record.createdBySubUserId === actor.subUserId);
}

function mapTicketPage(page: TicketRecordPage, actor: TicketsActorScope): TicketListResponse {
  return {
    ...page,
    items: page.items.map((record) => mapTicket(record, actor)),
  };
}

export function mapTicket(record: TicketRecord, actor: TicketsActorScope): Ticket {
  const status = normalizeTicketStatus(record.status);
  return {
    anchorMessageId: record.anchorMessageId,
    assignee: record.assigneeSubUserId == null
      ? null
      : {
          displayName: record.assigneeDisplayName ?? "",
          subUserId: record.assigneeSubUserId,
        },
    canClaim: actor.role !== "viewer"
      && status === "open"
      && record.assigneeSubUserId == null
      && record.hasAccountAccess,
    canEdit: canModifyTicket(actor, record),
    canceledAt: record.canceledAt,
    completedAt: record.completedAt,
    conversationId: record.conversationId,
    createdAt: record.createdAt,
    createdBy: record.createdBySubUserId == null
      ? null
      : {
          displayName: record.createdByDisplayName ?? "",
          subUserId: record.createdBySubUserId,
        },
    customerAvatarUrl: record.customerAvatarUrl,
    customerName: record.customerName,
    description: record.description,
    dueAt: record.dueAt,
    dueHint: record.dueHint,
    overdue: record.overdue,
    ownerAccountAvatarUrl: record.ownerAccountAvatarUrl,
    ownerAccountId: record.ownerAccountId,
    ownerAccountName: record.ownerAccountName,
    priority: record.priority,
    sessionId: record.sessionId,
    snapshotId: record.snapshotId,
    sourceType: record.sourceType,
    status,
    ticketId: record.ticketId,
    title: record.title,
    updatedAt: record.updatedAt,
  };
}

function normalizeTicketStatus(status: string): TicketStatus {
  if (status === "in_progress" || status === "done" || status === "canceled") {
    return status;
  }

  if (status === "dismissed" || status === "expired") {
    return "canceled";
  }

  return "open";
}

function normalizeListFilters(query: TicketListQuery) {
  return {
    assigneeSubUserId: parseOptionalFilterId(query.assigneeSubUserId, "负责人"),
    createdFrom: query.createdFrom,
    createdTo: query.createdTo,
    dueScope: query.dueScope,
    ownerAccountId: parseOptionalFilterId(query.ownerAccountId, "所属账号"),
    priority: query.priority,
    search: query.search,
    sourceType: query.sourceType,
    status: query.status,
  };
}

function parseOptionalFilterId(value: string | undefined, label: string) {
  if (value == null) {
    return undefined;
  }

  const parsed = parseMySqlId(value);

  if (parsed == null) {
    throw new BadRequestError("INVALID_TICKET_FILTER", `${label}参数无效`);
  }

  return parsed;
}

function getActorSubUserId(actor: TicketsActorScope) {
  const subUserId = parseMySqlId(actor.subUserId);

  if (subUserId == null) {
    throw new ForbiddenError("TICKET_FORBIDDEN", "当前账号无工单访问权限");
  }

  return subUserId;
}
