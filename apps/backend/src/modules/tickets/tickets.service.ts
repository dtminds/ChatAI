import type {
  AccountPermission,
  AccountRole,
  ConversationTicketsQuery,
  ConversationTicketsResponse,
  Ticket,
  TicketContextOptionsQuery,
  TicketContextOptionsResponse,
  TicketCountsResponse,
  TicketCreateRequest,
  TicketCreateResponse,
  TicketListQuery,
  TicketListResponse,
  TicketStatus,
} from "@chatai/contracts";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../shared/errors.js";
import { parseMySqlId } from "../../shared/id-utils.js";
import { buildInsightMessageInput } from "../insights/insight-message-input-builder.js";
import type {
  TicketConversationIdentity,
  TicketCountRepositoryInput,
  TicketListRepositoryInput,
  TicketRecord,
  TicketRecordPage,
  TicketSessionOptionPage,
  TicketMessageCandidate,
} from "./tickets.types.js";

export type TicketsActorScope = {
  permissions: readonly AccountPermission[];
  role: AccountRole;
  subUserId: string;
  uid: number;
};

export interface TicketsRepositoryPort {
  canAccessConversation(input: {
    conversationId: number;
    subUserId: number;
    uid: number;
  }): Promise<boolean>;
  countTickets(input: TicketCountRepositoryInput): Promise<number>;
  createManualTicket(input: {
    anchorMessageId: number | null;
    assigneeSubUserId: number | null;
    conversationId: number;
    createdBySubUserId: number;
    description: string | null;
    dueAt: Date | null;
    priority: TicketCreateRequest["priority"];
    sessionId: number | null;
    title: string;
    uid: number;
  }): Promise<number>;
  getConversationIdentity(
    uid: number,
    conversationId: number,
  ): Promise<TicketConversationIdentity | undefined>;
  getTicketRecordById(input: {
    globalAccess: boolean;
    subUserId: number;
    ticketId: number;
    uid: number;
  }): Promise<TicketRecord | undefined>;
  isSessionInConversation(input: {
    conversationId: number;
    sessionId: number;
    uid: number;
  }): Promise<boolean>;
  isValidAssignee(input: {
    assigneeSubUserId: number;
    conversationId: number;
    uid: number;
  }): Promise<boolean>;
  listAssigneeOptions(input: {
    conversationId: number;
    uid: number;
  }): Promise<TicketContextOptionsResponse["assignees"]>;
  listCustomerConversationIds(input: {
    platform: number;
    thirdExternalUserId: string;
    uid: number;
  }): Promise<number[]>;
  listOpenSessionAssignments(input: {
    conversationId: number;
    sourceMessageIds: number[];
    uid: number;
  }): Promise<Array<{ sessionId: string; sourceMessageId: string }>>;
  listRecentMessageCandidates(input: {
    beforeMessageId?: number;
    conversation: TicketConversationIdentity;
    limit: number;
    uid: number;
  }): Promise<TicketMessageCandidate[]>;
  listSessionOptions(input: {
    conversationId: number;
    page: number;
    pageSize: number;
    uid: number;
  }): Promise<TicketSessionOptionPage>;
  listTickets(input: TicketListRepositoryInput): Promise<TicketRecordPage>;
}

export class TicketsService {
  constructor(private readonly repository: TicketsRepositoryPort) {}

  async getContextOptions(
    actor: TicketsActorScope,
    query: TicketContextOptionsQuery,
  ): Promise<TicketContextOptionsResponse> {
    const { conversationId, subUserId } = await this.getCreationConversation(
      actor,
      query.conversationId,
    );
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [sessions, assignees] = await Promise.all([
      this.repository.listSessionOptions({
        conversationId,
        page,
        pageSize,
        uid: actor.uid,
      }),
      this.repository.listAssigneeOptions({
        conversationId,
        uid: actor.uid,
      }),
    ]);
    return {
      assignees,
      defaultAssigneeSubUserId: assignees.some(
        (assignee) => assignee.subUserId === String(subUserId),
      )
        ? String(subUserId)
        : null,
      sessions,
    };
  }

  async createTicket(
    actor: TicketsActorScope,
    payload: TicketCreateRequest,
  ): Promise<TicketCreateResponse> {
    const { conversationId, identity, subUserId } = await this.getCreationConversation(
      actor,
      payload.conversationId,
    );
    const title = payload.title.trim();

    if (!title) {
      throw new BadRequestError("INVALID_TICKET_TITLE", "工单标题不能为空");
    }

    const context = await this.resolveCreateContext(
      actor.uid,
      conversationId,
      identity,
      payload.context,
    );
    const assigneeSubUserId = payload.assigneeSubUserId === undefined
      ? subUserId
      : payload.assigneeSubUserId === null
        ? null
        : parseMySqlId(payload.assigneeSubUserId);

    if (payload.assigneeSubUserId != null && assigneeSubUserId == null) {
      throw new BadRequestError("INVALID_TICKET_ASSIGNEE", "负责人参数无效");
    }

    if (
      assigneeSubUserId != null
      && !(await this.repository.isValidAssignee({
        assigneeSubUserId,
        conversationId,
        uid: actor.uid,
      }))
    ) {
      throw new BadRequestError("INVALID_TICKET_ASSIGNEE", "负责人不具备所属账号访问权");
    }

    const dueAt = payload.dueAt == null ? null : new Date(payload.dueAt);

    if (dueAt && !Number.isFinite(dueAt.getTime())) {
      throw new BadRequestError("INVALID_TICKET_DUE_AT", "截止时间参数无效");
    }

    const ticketId = await this.repository.createManualTicket({
      anchorMessageId: context.anchorMessageId,
      assigneeSubUserId,
      conversationId,
      createdBySubUserId: subUserId,
      description: normalizeOptionalText(payload.description),
      dueAt,
      priority: payload.priority,
      sessionId: context.sessionId,
      title,
      uid: actor.uid,
    });
    const record = await this.repository.getTicketRecordById({
      globalAccess: hasGlobalTicketAccess(actor),
      subUserId,
      ticketId,
      uid: actor.uid,
    });

    if (!record) {
      throw new NotFoundError("TICKET_NOT_FOUND", "工单创建后无法读取");
    }

    return { ticket: mapTicket(record, actor) };
  }

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

  private async getCreationConversation(
    actor: TicketsActorScope,
    conversationIdValue: string,
  ) {
    if (actor.role === "viewer") {
      throw new ForbiddenError("TICKET_FORBIDDEN", "当前账号无工单创建权限");
    }

    const subUserId = getActorSubUserId(actor);
    const conversationId = parseMySqlId(conversationIdValue);

    if (conversationId == null) {
      throw new BadRequestError("INVALID_TICKET_CONTEXT", "聊天窗口参数无效");
    }

    const identity = await this.repository.getConversationIdentity(actor.uid, conversationId);

    if (!identity || identity.chatType !== 1) {
      throw new BadRequestError("TICKET_SINGLE_CHAT_ONLY", "工单仅支持单聊客户");
    }

    if (!(await this.repository.canAccessConversation({
      conversationId,
      subUserId,
      uid: actor.uid,
    }))) {
      throw new ForbiddenError("TICKET_FORBIDDEN", "无权访问当前聊天");
    }

    return { conversationId, identity, subUserId };
  }

  private async resolveCreateContext(
    uid: number,
    conversationId: number,
    identity: TicketConversationIdentity,
    context: TicketCreateRequest["context"],
  ) {
    if (context.type === "none") {
      return { anchorMessageId: null, sessionId: null };
    }

    if (context.type === "session") {
      const sessionId = parseMySqlId(context.sessionId);

      if (
        sessionId == null
        || !(await this.repository.isSessionInConversation({ conversationId, sessionId, uid }))
      ) {
        throw new BadRequestError("INVALID_TICKET_CONTEXT", "所选接待会话不属于当前聊天");
      }

      return { anchorMessageId: null, sessionId };
    }

    const messages = await this.listRecentMeaningfulMessages(uid, identity, 5);
    const latestMessage = messages[0];

    if (!latestMessage) {
      return { anchorMessageId: null, sessionId: null };
    }

    const sourceMessageIds = messages
      .map((message) => parseMySqlId(message.sourceMessageId))
      .filter((messageId): messageId is number => messageId != null);
    const assignments = await this.repository.listOpenSessionAssignments({
      conversationId,
      sourceMessageIds,
      uid,
    });
    const latestAssignment = assignments.find(
      (assignment) => assignment.sourceMessageId === latestMessage.sourceMessageId,
    );

    const assignedSessionId = latestAssignment
      ? parseMySqlId(latestAssignment.sessionId)
      : null;

    return assignedSessionId != null
      ? { anchorMessageId: null, sessionId: assignedSessionId }
      : {
          anchorMessageId: parseMySqlId(latestMessage.sourceMessageId),
          sessionId: null,
        };
  }

  private async listRecentMeaningfulMessages(
    uid: number,
    identity: TicketConversationIdentity,
    limit: number,
  ) {
    const meaningful = [] as ReturnType<typeof buildInsightMessageInput>[];
    const batchSize = 50;
    let beforeMessageId: number | undefined;

    while (meaningful.length < limit) {
      const rows = await this.repository.listRecentMessageCandidates({
        beforeMessageId,
        conversation: identity,
        limit: batchSize,
        uid,
      });

      for (const row of rows) {
        const message = buildInsightMessageInput(row);

        if (message.meaningfulForBoundary) {
          meaningful.push(message);
        }

        if (meaningful.length >= limit) {
          break;
        }
      }

      const nextBeforeMessageId = parseMySqlId(String(rows.at(-1)?.id ?? ""));

      if (rows.length < batchSize || nextBeforeMessageId == null) {
        break;
      }

      beforeMessageId = nextBeforeMessageId;
    }

    return meaningful.slice(0, limit);
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

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}
