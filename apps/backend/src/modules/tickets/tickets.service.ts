import type {
  AccountPermission,
  AccountRole,
  ConversationTicketCountResponse,
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
  TicketDeleteResponse,
  TicketDetailResponse,
  TicketListItem,
  TicketListQuery,
  TicketListResponse,
  TicketStatus,
  TicketView,
  TicketUpdateRequest,
  TicketUpdateResponse,
  WorkbenchMessageDto,
} from "@chatai/contracts";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../shared/errors.js";
import { parseMySqlId } from "../../shared/id-utils.js";
import type {
  TicketConversationIdentity,
  TicketAccessRecord,
  TicketDeleteRecord,
  TicketActivityRecord,
  TicketActivityRecordPage,
  TicketListRepositoryInput,
  TicketMutationActivity,
  TicketRecord,
  TicketRecordPage,
  TicketSessionOptionRecord,
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
  countAssignedActiveTickets(input: {
    assigneeSubUserId: number;
    uid: number;
  }): Promise<number>;
  countActiveConversationTickets(input: {
    conversationId: number;
    uid: number;
  }): Promise<number>;
  deleteTicket(input: {
    createdBySubUserId: number;
    ticketId: number;
    uid: number;
  }): Promise<boolean>;
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
  getTicketDeleteRecordById(input: {
    ticketId: number;
    uid: number;
  }): Promise<TicketDeleteRecord | undefined>;
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
  listSessionOptions(input: {
    conversationId: number;
    limit: number;
    uid: number;
  }): Promise<TicketSessionOptionRecord[]>;
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
    const { conversationId, identity, subUserId } = await this.getCreationConversation(
      actor,
      query.conversationId,
    );
    const [sessionRecords, assignees] = await Promise.all([
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
      sessions: removeCurrentSessionOption(identity, sessionRecords)
        .map(toTicketSessionOption),
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

    const dueAt = normalizeDueAt(payload.dueAt);

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
    const view = query.view ?? "assigned_to_me_active";
    const globalAccess = hasGlobalTicketAccess(actor);

    if (view === "all" && !globalAccess) {
      throw new ForbiddenError("TICKET_FORBIDDEN", "无权查看全部工单");
    }

    const page = await this.repository.listTickets({
      ...normalizeListFilters(query, view),
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
    const assignedToMeActive = await this.repository.countAssignedActiveTickets({
      assigneeSubUserId: subUserId,
      uid: actor.uid,
    });

    return { assignedToMeActive };
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

    const subUserId = getActorSubUserId(actor);
    const globalAccess = hasGlobalTicketAccess(actor);
    const filter = query.filter ?? "active";
    const repositoryInput: TicketListRepositoryInput = {
      conversationIds: [identity.conversationId],
      ...(filter === "active"
        ? { statuses: ["open", "in_progress"] }
        : { status: filter }),
      globalAccess,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      subUserId,
      uid: actor.uid,
      view: "visible",
    };
    const page = await this.repository.listTickets(repositoryInput);

    return {
      ...mapTicketPage(page, actor),
    };
  }

  async countConversationActiveTickets(
    actor: TicketsActorScope,
    conversationIdValue: string,
  ): Promise<ConversationTicketCountResponse> {
    const conversationId = parseMySqlId(conversationIdValue);

    if (conversationId == null) {
      throw new BadRequestError("INVALID_TICKET_CONTEXT", "聊天窗口参数无效");
    }

    const identity = await this.repository.getConversationIdentity(
      actor.uid,
      conversationId,
    );

    if (!identity || identity.chatType !== 1) {
      throw new BadRequestError("TICKET_SINGLE_CHAT_ONLY", "工单仅支持单聊客户");
    }

    if (
      !hasGlobalTicketAccess(actor)
      && !(await this.repository.canAccessConversation({
        conversationId,
        subUserId: getActorSubUserId(actor),
        uid: actor.uid,
      }))
    ) {
      throw new ForbiddenError("TICKET_FORBIDDEN", "无权访问当前聊天");
    }

    return {
      activeCount: await this.repository.countActiveConversationTickets({
        conversationId,
        uid: actor.uid,
      }),
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

  async deleteTicket(
    actor: TicketsActorScope,
    ticketIdValue: string,
  ): Promise<TicketDeleteResponse> {
    const ticketId = parseMySqlId(ticketIdValue);
    if (ticketId == null) {
      throw new BadRequestError("INVALID_TICKET_ID", "工单参数无效");
    }
    const record = await this.repository.getTicketDeleteRecordById({ ticketId, uid: actor.uid });
    if (!record || record.status === "deleted") {
      throw new NotFoundError("TICKET_NOT_FOUND", "工单不存在");
    }
    if (!canDeleteTicket(actor, record)) {
      throw new ForbiddenError("TICKET_DELETE_FORBIDDEN", "无权删除该工单");
    }
    const deleted = await this.repository.deleteTicket({
      createdBySubUserId: getActorSubUserId(actor),
      ticketId,
      uid: actor.uid,
    });
    if (!deleted) {
      throw new NotFoundError("TICKET_NOT_FOUND", "工单不存在");
    }
    return { deleted: true };
  }

  async claimTicket(
    actor: TicketsActorScope,
    ticketIdValue: string,
  ): Promise<TicketClaimResponse> {
    const { record, subUserId, ticketId } = await this.getVisibleTicket(actor, ticketIdValue);

    if (!record.hasAccountAccess) {
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
      const dueAt = normalizeDueAt(payload.dueAt);
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

  private async getCreationConversation(
    actor: TicketsActorScope,
    conversationIdValue: string,
  ) {
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

    const [latestSession] = await this.repository.listSessionOptions({
      conversationId,
      limit: 1,
      uid,
    });

    if (isCurrentSessionOption(identity, latestSession)) {
      return {
        anchorMessageId: null,
        sessionId: parseMySqlId(latestSession.sessionId),
      };
    }

    return {
      anchorMessageId: identity.lastAuditInfoId,
      sessionId: null,
    };
  }
}

function removeCurrentSessionOption(
  identity: TicketConversationIdentity,
  sessions: TicketSessionOptionRecord[],
) {
  return isCurrentSessionOption(identity, sessions[0])
    ? sessions.slice(1)
    : sessions;
}

function isCurrentSessionOption(
  identity: TicketConversationIdentity,
  session: TicketSessionOptionRecord | undefined,
): session is TicketSessionOptionRecord {
  if (!session || identity.lastMessageAt == null) {
    return false;
  }

  const coverageEndedAt = session.nextCloseAt ?? session.endedAt;
  return coverageEndedAt != null && identity.lastMessageAt <= coverageEndedAt;
}

function toTicketSessionOption({ nextCloseAt: _nextCloseAt, ...session }: TicketSessionOptionRecord) {
  return session;
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
  if (hasGlobalTicketAccess(actor)) {
    return true;
  }

  return record.assigneeSubUserId === actor.subUserId
    || (record.sourceType === "manual" && record.createdBySubUserId === actor.subUserId);
}

export function canDeleteTicket(
  actor: TicketsActorScope,
  record: Pick<TicketRecord, "createdBySubUserId" | "sourceType">,
) {
  return record.sourceType === "manual"
    && record.createdBySubUserId === actor.subUserId;
}

function mapTicketPage(page: TicketRecordPage, actor: TicketsActorScope): TicketListResponse {
  return {
    ...page,
    items: page.items.map((record) => mapTicketListItem(record, actor)),
  };
}

function mapTicketListItem(
  record: TicketRecord,
  actor: TicketsActorScope,
): TicketListItem {
  const status = normalizeTicketStatus(record.status);
  return {
    anchorMessageId: record.anchorMessageId,
    assignee: record.assigneeSubUserId == null
      ? null
      : {
          displayName: record.assigneeDisplayName ?? "",
          subUserId: record.assigneeSubUserId,
        },
    canDelete: canDeleteTicket(actor, record),
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

export function mapTicket(record: TicketRecord, actor: TicketsActorScope): Ticket {
  return {
    ...mapTicketListItem(record, actor),
    canClaim: record.assigneeSubUserId == null
      && record.hasAccountAccess,
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

const millisecondsPerDay = 24 * 60 * 60 * 1000;
const shanghaiUtcOffsetMs = 8 * 60 * 60 * 1000;
const boundedTicketListDefaultDays = 30;
const boundedTicketListMaximumDays = 60;

function normalizeListFilters(query: TicketListQuery, view: TicketView) {
  const createdRange = normalizeTicketListCreatedRange(query, view);

  return {
    assigneeSubUserId: parseOptionalFilterId(query.assigneeSubUserId, "负责人"),
    createdFrom: createdRange.createdFrom,
    createdTo: createdRange.createdTo,
    dueScope: query.dueScope,
    ownerAccountId: parseOptionalFilterId(query.ownerAccountId, "所属账号"),
    priority: query.priority,
    sourceType: query.sourceType,
    status: query.status,
    ticketId: parseOptionalFilterId(query.ticketId, "工单 ID"),
    titleSearch: query.titleSearch?.trim() || undefined,
  };
}

function normalizeTicketListCreatedRange(
  query: Pick<TicketListQuery, "createdFrom" | "createdTo">,
  view: TicketView,
) {
  if (view !== "reception" && view !== "all") {
    return {
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
    };
  }

  if (query.createdFrom == null && query.createdTo == null) {
    return getDefaultTicketListCreatedRange();
  }

  if (
    query.createdFrom == null
    || query.createdTo == null
    || !Number.isSafeInteger(query.createdFrom)
    || !Number.isSafeInteger(query.createdTo)
    || query.createdTo < query.createdFrom
    || query.createdTo - query.createdFrom >= boundedTicketListMaximumDays * millisecondsPerDay
  ) {
    throw new BadRequestError(
      "INVALID_TICKET_DATE_RANGE",
      "创建时间范围应完整且不超过 60 天",
    );
  }

  return {
    createdFrom: query.createdFrom,
    createdTo: query.createdTo,
  };
}

function getDefaultTicketListCreatedRange(now = Date.now()) {
  const shanghaiDayStart = Math.floor(
    (now + shanghaiUtcOffsetMs) / millisecondsPerDay,
  ) * millisecondsPerDay - shanghaiUtcOffsetMs;

  return {
    createdFrom: shanghaiDayStart - (boundedTicketListDefaultDays - 1) * millisecondsPerDay,
    createdTo: shanghaiDayStart + millisecondsPerDay - 1,
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

function normalizeDueAt(value: number | null | undefined) {
  if (value == null || value === 0) {
    return null;
  }

  const dueAt = new Date(value);
  if (!Number.isFinite(dueAt.getTime())) {
    throw new BadRequestError("INVALID_TICKET_DUE_AT", "截止时间参数无效");
  }

  return dueAt;
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
