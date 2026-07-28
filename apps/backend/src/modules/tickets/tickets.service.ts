import type {
  AccountPermission,
  AccountRole,
  ConversationTicketsQuery,
  ConversationTicketsResponse,
  Ticket,
  TicketActivity,
  TicketActivityListQuery,
  TicketActivityPage,
  TicketAssigneeOptionsResponse,
  TicketClaimResponse,
  TicketCommentRequest,
  TicketCommentResponse,
  TicketContextOptionsQuery,
  TicketContextOptionsResponse,
  TicketContextQuery,
  TicketContextResponse,
  TicketCountsResponse,
  TicketCreateRequest,
  TicketCreateResponse,
  TicketDetailResponse,
  TicketListQuery,
  TicketListResponse,
  TicketStatus,
  TicketUpdateRequest,
  TicketUpdateResponse,
  WorkbenchMessageDto,
} from "@chatai/contracts";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../shared/errors.js";
import { parseMySqlId } from "../../shared/id-utils.js";
import { buildInsightMessageInput } from "../insights/insight-message-input-builder.js";
import type {
  TicketConversationIdentity,
  TicketAccessRecord,
  TicketCountRepositoryInput,
  TicketActivityRecord,
  TicketActivityRecordPage,
  TicketListRepositoryInput,
  TicketMutationActivity,
  TicketRecord,
  TicketRecordPage,
  TicketSessionOptions,
  TicketMessageCandidate,
} from "./tickets.types.js";

export type TicketsActorScope = {
  permissions: readonly AccountPermission[];
  role: AccountRole;
  subUserId: string;
  uid: number;
};

export interface TicketsRepositoryPort {
  addTicketComment(input: {
    content: string;
    enforceWriteAccess: boolean;
    operatorSubUserId: number;
    ticketId: number;
    uid: number;
  }): Promise<TicketActivityRecord | undefined>;
  canAccessConversation(input: {
    conversationId: number;
    subUserId: number;
    uid: number;
  }): Promise<boolean>;
  countTickets(input: TicketCountRepositoryInput): Promise<number>;
  claimTicket(input: {
    assigneeSubUserId: number;
    ticketId: number;
    uid: number;
  }): Promise<boolean>;
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
  getTicketAccessRecordById(input: {
    globalAccess: boolean;
    subUserId: number;
    ticketId: number;
    uid: number;
  }): Promise<TicketAccessRecord | undefined>;
  listTicketActivities(input: {
    beforeActivityId?: number;
    limit: number;
    ticketId: number;
    uid: number;
  }): Promise<TicketActivityRecordPage>;
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
    limit: number;
    uid: number;
  }): Promise<TicketSessionOptions>;
  listTickets(input: TicketListRepositoryInput): Promise<TicketRecordPage>;
  updateTicket(input: {
    activities: TicketMutationActivity[];
    enforceWriteAccess: boolean;
    expectedStatuses?: string[];
    operatorSubUserId: number;
    ticketId: number;
    uid: number;
    values: {
      assigneeSubUserId?: number | null;
      canceledAt?: Date | null;
      canceledBySubUserId?: number | null;
      completedAt?: Date | null;
      completedBySubUserId?: number | null;
      description?: string | null;
      dueAt?: Date | null;
      priority?: TicketCreateRequest["priority"];
      status?: string;
      title?: string;
    };
  }): Promise<boolean>;
}

export interface TicketsContextReaderPort {
  listMessageContext(
    scope: { uid: number },
    conversationId: string,
    messageId: string,
    options: { after: number; before: number },
  ): Promise<{ messages: WorkbenchMessageDto[]; targetMessageId: string }>;
  listSessionMessageRecordPage(
    scope: { uid: number },
    sessionId: string,
    options: {
      before?: { messageId: number; messageTime: number };
      limit: number;
    },
  ): Promise<{
    hasMore: boolean;
    messages: WorkbenchMessageDto[];
    nextCursor: { messageId: number; messageTime: number } | null;
  } | undefined>;
}

export class TicketsService {
  constructor(
    private readonly repository: TicketsRepositoryPort,
    private readonly contextReader?: TicketsContextReaderPort,
  ) {}

  async getContextOptions(
    actor: TicketsActorScope,
    query: TicketContextOptionsQuery,
  ): Promise<TicketContextOptionsResponse> {
    const { conversationId, subUserId } = await this.getCreationConversation(
      actor,
      query.conversationId,
    );
    const [sessions, assignees] = await Promise.all([
      this.repository.listSessionOptions({
        conversationId,
        limit: 5,
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
    const subUserId = getActorSubUserId(actor);
    const conversationIds = scope === "customer"
      ? await this.resolveCustomerConversationIds(identity, actor.uid, subUserId)
      : [identity.conversationId];
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

  async getTicketDetail(
    actor: TicketsActorScope,
    ticketIdValue: string,
  ): Promise<TicketDetailResponse> {
    const { record } = await this.getVisibleTicket(actor, ticketIdValue);

    return { ticket: mapTicket(record, actor) };
  }

  async getTicketContext(
    actor: TicketsActorScope,
    ticketIdValue: string,
    query: TicketContextQuery = {},
  ): Promise<TicketContextResponse> {
    const { record } = await this.getVisibleTicketAccess(actor, ticketIdValue);

    if (!record.hasAccountAccess) {
      return { context: { kind: "none" }, contextAccess: "forbidden" };
    }

    let context: TicketContextResponse["context"];
    try {
      context = await this.loadTicketContext(actor.uid, record, query);
    } catch (error) {
      if (error instanceof BadRequestError) {
        throw error;
      }
      return { context: { kind: "none" }, contextAccess: "error" };
    }

    return { context, contextAccess: "allowed" };
  }

  async getTicketAssigneeOptions(
    actor: TicketsActorScope,
    ticketIdValue: string,
  ): Promise<TicketAssigneeOptionsResponse> {
    const { record } = await this.getVisibleTicketAccess(actor, ticketIdValue);
    if (!canModifyTicket(actor, record)) {
      throw new ForbiddenError("TICKET_FORBIDDEN", "无权修改该工单");
    }
    return {
      items: await this.repository.listAssigneeOptions({
        conversationId: parseMySqlId(record.conversationId)!,
        uid: actor.uid,
      }),
    };
  }

  async listTicketActivities(
    actor: TicketsActorScope,
    ticketIdValue: string,
    query: TicketActivityListQuery,
  ): Promise<TicketActivityPage> {
    const { ticketId } = await this.getVisibleTicketAccess(actor, ticketIdValue);
    let beforeActivityId: number | undefined;
    if (query.beforeActivityId !== undefined) {
      const parsedCursor = parseMySqlId(query.beforeActivityId);
      if (parsedCursor == null) {
        throw new BadRequestError("INVALID_TICKET_ACTIVITY_CURSOR", "处理记录游标无效");
      }
      beforeActivityId = parsedCursor;
    }

    return mapTicketActivityPage(await this.repository.listTicketActivities({
      beforeActivityId,
      limit: query.pageSize ?? 20,
      ticketId,
      uid: actor.uid,
    }));
  }

  async updateTicket(
    actor: TicketsActorScope,
    ticketIdValue: string,
    payload: TicketUpdateRequest,
  ): Promise<TicketUpdateResponse> {
    const { record, subUserId, ticketId } = await this.getVisibleTicket(actor, ticketIdValue);

    if (!canModifyTicket(actor, record)) {
      throw new ForbiddenError("TICKET_FORBIDDEN", "无权修改该工单");
    }

    const mutation = await this.buildTicketMutation(actor, record, payload, subUserId);

    if (Object.keys(mutation.values).length > 0) {
      const updated = await this.repository.updateTicket({
        activities: mutation.activities,
        enforceWriteAccess: !hasGlobalTicketAccess(actor),
        expectedStatuses: mutation.expectedStatuses,
        operatorSubUserId: subUserId,
        ticketId,
        uid: actor.uid,
        values: mutation.values,
      });

      if (!updated) {
        throw new BadRequestError("TICKET_STATE_CONFLICT", "工单状态已变化，请刷新后重试");
      }
    }

    return { ticket: await this.getMappedTicket(actor, ticketId) };
  }

  async claimTicket(
    actor: TicketsActorScope,
    ticketIdValue: string,
  ): Promise<TicketClaimResponse> {
    const { record, subUserId, ticketId } = await this.getVisibleTicket(actor, ticketIdValue);

    if (actor.role === "viewer" || !record.hasAccountAccess) {
      throw new ForbiddenError("TICKET_FORBIDDEN", "无权领取该工单");
    }
    if (record.assigneeSubUserId != null) {
      throw new BadRequestError("TICKET_ALREADY_CLAIMED", "工单已被分配");
    }
    if (!(await this.repository.isValidAssignee({
      assigneeSubUserId: subUserId,
      conversationId: parseMySqlId(record.conversationId)!,
      uid: actor.uid,
    }))) {
      throw new ForbiddenError("TICKET_FORBIDDEN", "当前账号不再具备所属账号访问权");
    }

    const claimed = await this.repository.claimTicket({
      assigneeSubUserId: subUserId,
      ticketId,
      uid: actor.uid,
    });

    if (!claimed) {
      throw new BadRequestError("TICKET_ALREADY_CLAIMED", "工单已被其他人领取");
    }

    return { ticket: await this.getMappedTicket(actor, ticketId) };
  }

  async addComment(
    actor: TicketsActorScope,
    ticketIdValue: string,
    payload: TicketCommentRequest,
  ): Promise<TicketCommentResponse> {
    const { record, subUserId, ticketId } = await this.getVisibleTicket(actor, ticketIdValue);

    if (!canModifyTicket(actor, record)) {
      throw new ForbiddenError("TICKET_FORBIDDEN", "无权为该工单添加备注");
    }

    const content = payload.content.trim();

    if (!content || content.length > 1000) {
      throw new BadRequestError("INVALID_TICKET_COMMENT", "评论长度应为 1-1000 个字符");
    }

    const activity = await this.repository.addTicketComment({
      content,
      enforceWriteAccess: !hasGlobalTicketAccess(actor),
      operatorSubUserId: subUserId,
      ticketId,
      uid: actor.uid,
    });

    if (!activity) {
      throw new ForbiddenError("TICKET_FORBIDDEN", "工单负责人已变化，当前无权添加备注");
    }

    return { activity: mapTicketActivity(activity) };
  }

  private async getVisibleTicket(actor: TicketsActorScope, ticketIdValue: string) {
    const ticketId = parseMySqlId(ticketIdValue);

    if (ticketId == null) {
      throw new NotFoundError("TICKET_NOT_FOUND", "工单不存在");
    }

    const subUserId = getActorSubUserId(actor);
    const record = await this.repository.getTicketRecordById({
      globalAccess: hasGlobalTicketAccess(actor),
      subUserId,
      ticketId,
      uid: actor.uid,
    });

    if (!record) {
      throw new NotFoundError("TICKET_NOT_FOUND", "工单不存在或无权查看");
    }

    return { record, subUserId, ticketId };
  }

  private async getVisibleTicketAccess(actor: TicketsActorScope, ticketIdValue: string) {
    const ticketId = parseMySqlId(ticketIdValue);

    if (ticketId == null) {
      throw new NotFoundError("TICKET_NOT_FOUND", "工单不存在");
    }

    const subUserId = getActorSubUserId(actor);
    const record = await this.repository.getTicketAccessRecordById({
      globalAccess: hasGlobalTicketAccess(actor),
      subUserId,
      ticketId,
      uid: actor.uid,
    });

    if (!record) {
      throw new NotFoundError("TICKET_NOT_FOUND", "工单不存在或无权查看");
    }

    return { record, subUserId, ticketId };
  }

  private async getMappedTicket(actor: TicketsActorScope, ticketId: number) {
    const subUserId = getActorSubUserId(actor);
    const record = await this.repository.getTicketRecordById({
      globalAccess: hasGlobalTicketAccess(actor),
      subUserId,
      ticketId,
      uid: actor.uid,
    });

    if (!record) {
      throw new NotFoundError("TICKET_NOT_FOUND", "工单不存在或无权查看");
    }

    return mapTicket(record, actor);
  }

  private async loadTicketContext(
    uid: number,
    record: TicketAccessRecord,
    query: TicketContextQuery,
  ): Promise<TicketContextResponse["context"]> {
    if (!this.contextReader) {
      return { kind: "none" };
    }
    if (record.sessionId != null) {
      const before = query.cursor == null ? undefined : decodeTicketContextCursor(query.cursor);
      const page = await this.contextReader.listSessionMessageRecordPage(
        { uid },
        record.sessionId,
        { before, limit: query.pageSize ?? 50 },
      );
      return page
        ? {
            hasMore: page.hasMore,
            kind: "session",
            messages: page.messages,
            nextCursor: page.nextCursor == null ? null : encodeTicketContextCursor(page.nextCursor),
            sessionId: record.sessionId,
          }
        : { kind: "none" };
    }
    if (record.anchorMessageId != null) {
      const context = await this.contextReader.listMessageContext(
        { uid },
        record.conversationId,
        record.anchorMessageId,
        { after: 10, before: 10 },
      );
      return context.messages.some((message) =>
        message.msgid === context.targetMessageId || String(message.seq) === context.targetMessageId
      )
        ? { anchorMessageId: record.anchorMessageId, kind: "message", messages: context.messages }
        : { kind: "none" };
    }
    return { kind: "none" };
  }

  private async buildTicketMutation(
    actor: TicketsActorScope,
    record: TicketRecord,
    payload: TicketUpdateRequest,
    subUserId: number,
  ) {
    const values: Parameters<TicketsRepositoryPort["updateTicket"]>[0]["values"] = {};
    const activities: TicketMutationActivity[] = [];
    const editChanges: TicketEditChange[] = [];
    const currentStatus = normalizeTicketStatus(record.status);
    const requestedStatus = "status" in payload ? payload.status : undefined;
    const expectedStatus = "expectedStatus" in payload ? payload.expectedStatus : undefined;
    let targetStatus = requestedStatus ?? currentStatus;
    let targetAssignee = record.assigneeSubUserId == null
      ? null
      : parseMySqlId(record.assigneeSubUserId);

    if (payload.assigneeSubUserId !== undefined) {
      targetAssignee = payload.assigneeSubUserId == null
        ? null
        : parseMySqlId(payload.assigneeSubUserId);
      if (payload.assigneeSubUserId != null && targetAssignee == null) {
        throw new BadRequestError("INVALID_TICKET_ASSIGNEE", "负责人参数无效");
      }
      const targetAssigneeOption = targetAssignee == null
        ? undefined
        : (await this.repository.listAssigneeOptions({
            conversationId: parseMySqlId(record.conversationId)!,
            uid: actor.uid,
          })).find((option) => option.subUserId === String(targetAssignee));
      if (targetAssignee != null && !targetAssigneeOption) {
        throw new BadRequestError("INVALID_TICKET_ASSIGNEE", "负责人不具备所属账号访问权");
      }
      if (String(targetAssignee ?? "") !== (record.assigneeSubUserId ?? "")) {
        values.assigneeSubUserId = targetAssignee;
        editChanges.push(ticketEditChange(
          "assignee",
          record.assigneeSubUserId,
          targetAssignee,
          {
            afterLabel: targetAssigneeOption?.displayName ?? "未分配",
            beforeLabel: record.assigneeDisplayName ?? "未分配",
          },
        ));
      }
    }

    if (
      currentStatus === "in_progress"
      && targetAssignee == null
      && requestedStatus === undefined
    ) {
      targetStatus = "open";
    }
    if (targetStatus === "in_progress" && targetAssignee == null) {
      throw new BadRequestError(
        "INVALID_TICKET_STATUS_TRANSITION",
        "未分配负责人的工单不能进入处理中",
      );
    }

    const statusWasRequested = requestedStatus !== undefined;
    if (statusWasRequested && expectedStatus !== currentStatus) {
      throw new BadRequestError("TICKET_STATE_CONFLICT", "工单状态已变化，请刷新后重试");
    }
    if (targetStatus !== currentStatus) {
      assertTicketStatusTransition(currentStatus, targetStatus);
      values.status = targetStatus;
      if (statusWasRequested) {
        activities.push(changeActivity("status_changed", currentStatus, targetStatus));
      } else {
        editChanges.push(ticketEditChange("status", currentStatus, targetStatus));
      }
      const now = new Date();
      if (targetStatus === "done") {
        values.completedAt = now;
        values.completedBySubUserId = subUserId;
      } else if (currentStatus === "done") {
        values.completedAt = null;
        values.completedBySubUserId = null;
      }
      if (targetStatus === "canceled") {
        values.canceledAt = now;
        values.canceledBySubUserId = subUserId;
      } else if (currentStatus === "canceled") {
        values.canceledAt = null;
        values.canceledBySubUserId = null;
      }
    }

    if (payload.title !== undefined) {
      const title = payload.title.trim();
      if (!title) {
        throw new BadRequestError("INVALID_TICKET_TITLE", "工单标题不能为空");
      }
      if (title !== record.title) {
        values.title = title;
        editChanges.push(ticketEditChange("title", record.title, title));
      }
    }
    if (payload.priority !== undefined && payload.priority !== record.priority) {
      values.priority = payload.priority;
      editChanges.push(ticketEditChange("priority", record.priority, payload.priority));
    }
    if (payload.dueAt !== undefined) {
      const dueAt = payload.dueAt == null ? null : new Date(payload.dueAt);
      if (dueAt && !Number.isFinite(dueAt.getTime())) {
        throw new BadRequestError("INVALID_TICKET_DUE_AT", "截止时间参数无效");
      }
      const dueAtMs = dueAt?.getTime() ?? null;
      const currentDueAtMs = normalizeNullableTimestamp(record.dueAt);
      if (dueAtMs !== currentDueAtMs) {
        values.dueAt = dueAt;
        editChanges.push(ticketEditChange("dueAt", currentDueAtMs, dueAtMs));
      }
    }
    if (payload.description !== undefined) {
      const description = normalizeOptionalText(payload.description);
      if (description !== record.description) {
        values.description = description;
        editChanges.push(ticketEditChange("description", record.description, description));
      }
    }
    if (editChanges.length > 0) {
      activities.push({
        activityType: "content_updated",
        detail: { changes: editChanges },
      });
    }

    const statusNeedsFence = statusWasRequested || targetStatus !== currentStatus;
    return {
      activities,
      expectedStatuses: statusNeedsFence
        ? currentStatus === "canceled"
          ? ["canceled", "dismissed", "expired"]
          : [currentStatus]
        : undefined,
      values,
    };
  }

  private async resolveCustomerConversationIds(
    identity: TicketConversationIdentity,
    uid: number,
    subUserId: number,
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

function encodeTicketContextCursor(cursor: { messageId: number; messageTime: number }) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeTicketContextCursor(value: string) {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    const messageId = Number(parsed.messageId);
    const messageTime = Number(parsed.messageTime);
    if (Number.isSafeInteger(messageId) && messageId > 0 && Number.isFinite(messageTime) && messageTime > 0) {
      return { messageId, messageTime };
    }
  } catch {
    // handled below
  }
  throw new BadRequestError("INVALID_TICKET_CONTEXT_CURSOR", "关联上下文游标无效");
}

export function hasGlobalTicketAccess(actor: TicketsActorScope) {
  return actor.role === "owner" || actor.role === "admin";
}

export function canModifyTicket(
  actor: TicketsActorScope,
  record: Pick<TicketRecord, "assigneeSubUserId" | "createdBySubUserId" | "sourceType">,
) {
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

function assertTicketStatusTransition(current: TicketStatus, target: TicketStatus) {
  const allowed: Record<TicketStatus, readonly TicketStatus[]> = {
    canceled: ["open"],
    done: ["open"],
    in_progress: ["open", "done", "canceled"],
    open: ["in_progress", "done", "canceled"],
  };

  if (!allowed[current].includes(target)) {
    throw new BadRequestError(
      "INVALID_TICKET_STATUS_TRANSITION",
      "当前工单状态不允许执行该操作",
    );
  }
}

function changeActivity(
  activityType: TicketMutationActivity["activityType"],
  before: unknown,
  after: unknown,
  field?: string,
): TicketMutationActivity {
  return {
    activityType,
    detail: field == null ? { after, before } : { after, before, field },
  };
}

type TicketEditChange = {
  after: unknown;
  afterLabel?: string;
  before: unknown;
  beforeLabel?: string;
  field: "assignee" | "description" | "dueAt" | "priority" | "status" | "title";
};

function ticketEditChange(
  field: TicketEditChange["field"],
  before: unknown,
  after: unknown,
  labels?: Pick<TicketEditChange, "afterLabel" | "beforeLabel">,
): TicketEditChange {
  return { after, before, field, ...labels };
}

function normalizeNullableTimestamp(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function mapTicketActivity(record: TicketActivityRecord): TicketActivity {
  return {
    activityId: record.activityId,
    activityType: record.activityType,
    content: record.content,
    createdAt: record.createdAt,
    detail: record.detail,
    operator: record.operatorSubUserId == null
      ? null
      : {
          displayName: record.operatorDisplayName ?? "",
          subUserId: record.operatorSubUserId,
        },
    operatorType: record.operatorType,
    ticketId: record.ticketId,
  };
}

function mapTicketActivityPage(page: TicketActivityRecordPage): TicketActivityPage {
  return {
    hasMore: page.hasMore,
    items: page.items.map(mapTicketActivity),
    nextCursor: page.nextCursor,
  };
}
