import type { TicketActivity, TicketPriority, TicketUser } from "@chatai/contracts";
import type {
  ExpressionBuilder,
  Kysely,
  SelectQueryBuilder,
  Transaction,
} from "kysely";
import { sql } from "kysely";
import type { Database } from "../../db/schema.js";
import type {
  TicketAccessRecord,
  TicketConversationIdentity,
  TicketActivityRecord,
  TicketActivityRecordPage,
  TicketDeleteRecord,
  TicketListRepositoryInput,
  TicketMutationActivity,
  TicketRecord,
  TicketRecordPage,
  TicketSessionOptionRecord,
} from "./tickets.types.js";

type TicketQueryDatabase = Database & {
  conversation: Database["xy_wap_embed_conversation"];
  ticket: Database["xy_wap_embed_session_action_item"];
};

type TicketBaseQuery = SelectQueryBuilder<
  TicketQueryDatabase,
  "conversation" | "ticket",
  {}
>;

type TicketAccountAccessIdentity = {
  platform: number;
  thirdUserId: string;
};

type ResolvedTicketListRepositoryInput = TicketListRepositoryInput & {
  accountAccessIdentities?: TicketAccountAccessIdentity[];
};

type TicketPageRow = Omit<TicketQueryRow,
  | "assignee_display_name"
  | "created_by_display_name"
  | "customer_avatar_url"
  | "customer_name"
  | "has_account_access"
  | "owner_account_avatar_url"
  | "owner_account_id"
  | "owner_account_name"
> & {
  conversation_platform: number | string;
  conversation_third_external_userid: string;
  conversation_third_userid: string;
  has_account_access?: number | string;
};

type TicketHydrationRow = Pick<TicketQueryRow,
  | "assignee_display_name"
  | "created_by_display_name"
  | "customer_avatar_url"
  | "customer_name"
  | "owner_account_avatar_url"
  | "owner_account_id"
  | "owner_account_name"
  | "ticket_id"
>;

type TicketActivityQueryRow = {
  activity_id: number | string;
  activity_type: string;
  content: string | null;
  create_time: Date | string;
  detail_json: unknown;
  operator_display_name: string | null;
  operator_sub_user_id: number | string | null;
  operator_type: string;
  ticket_id: number | string;
};

type TicketQueryRow = {
  anchor_message_id: number | string | null;
  assignee_display_name: string | null;
  assignee_sub_user_id: number | string | null;
  canceled_at: Date | string | null;
  completed_at: Date | string | null;
  conversation_id: number | string;
  create_time: Date | string;
  created_by_display_name: string | null;
  created_by_sub_user_id: number | string | null;
  customer_avatar_url: string | null;
  customer_name: string | null;
  description: string | null;
  due_at: Date | string | null;
  has_account_access: number | string;
  owner_account_avatar_url: string | null;
  owner_account_id: number | string | null;
  owner_account_name: string | null;
  overdue: number | string;
  priority: string;
  session_id: number | string | null;
  snapshot_id: number | string | null;
  source_type: string;
  status: string;
  ticket_id: number | string;
  title: string;
  update_time: Date | string;
};

export class TicketsRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async listTickets(input: TicketListRepositoryInput): Promise<TicketRecordPage> {
    const resolvedInput = await this.resolveListInput(input);
    const countRow = await this.buildFilteredTicketQuery(resolvedInput)
      .select((expressionBuilder) =>
        expressionBuilder.fn.countAll<number>().as("total"),
      )
      .executeTakeFirst();
    const total = toNonNegativeNumber(countRow?.total);

    const items = await this.listTicketRecords(resolvedInput, {
      includeAccountAccess: false,
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
      ordered: true,
    });

    return {
      items,
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
    };
  }

  private async listTicketRecords(
    input: ResolvedTicketListRepositoryInput,
    options: {
      includeAccountAccess: boolean;
      limit: number;
      offset: number;
      ordered: boolean;
    },
  ) {
    let query = this.buildFilteredTicketQuery(input)
      .select([
        "ticket.id as ticket_id",
        "ticket.conversation_id as conversation_id",
        "ticket.session_id as session_id",
        "ticket.anchor_message_id as anchor_message_id",
        "ticket.snapshot_id as snapshot_id",
        "ticket.source_type as source_type",
        "ticket.title as title",
        "ticket.description as description",
        "ticket.priority as priority",
        "ticket.assignee_sub_user_id as assignee_sub_user_id",
        "ticket.created_by_sub_user_id as created_by_sub_user_id",
        "ticket.due_at as due_at",
        "ticket.status as status",
        "ticket.create_time as create_time",
        "ticket.update_time as update_time",
        "ticket.completed_at as completed_at",
        "ticket.canceled_at as canceled_at",
        "conversation.platform as conversation_platform",
        "conversation.third_external_userid as conversation_third_external_userid",
        "conversation.third_userid as conversation_third_userid",
      ])
      .select(
        sql<number>`CASE
          WHEN ticket.status IN ('open', 'in_progress')
            AND ticket.due_at IS NOT NULL
            AND ticket.due_at < CURRENT_TIMESTAMP THEN 1
          ELSE 0
        END`.as("overdue"),
      );
    if (options.includeAccountAccess) {
      query = query.select((expressionBuilder) =>
        expressionBuilder
          .case()
          .when(this.buildAccountAccessExists(expressionBuilder, input))
          .then(1)
          .else(0)
          .end()
          .as("has_account_access"),
      );
    }
    if (options.ordered) {
      query = query.orderBy("ticket.id", "desc");
    }
    const pageRows = await query
      .limit(options.limit)
      .offset(options.offset)
      .execute() as TicketPageRow[];
    const hydrationByTicketId = await this.hydrateTicketPage(input.uid, pageRows);
    const rows = pageRows.map((row): TicketQueryRow => {
      const {
        conversation_platform: _conversationPlatform,
        conversation_third_external_userid: _conversationThirdExternalUserId,
        conversation_third_userid: _conversationThirdUserId,
        ...ticket
      } = row;
      return {
        ...ticket,
        has_account_access: row.has_account_access ?? 0,
        ...(hydrationByTicketId.get(String(row.ticket_id)) ?? emptyTicketHydration),
      };
    });

    return rows.map(mapTicketRecord);
  }

  async countAssignedActiveTickets(input: {
    assigneeSubUserId: number;
    uid: number;
  }) {
    const row = await this.db
      .selectFrom("xy_wap_embed_session_action_item as ticket")
      .select((expressionBuilder) =>
        expressionBuilder.fn.countAll<number>().as("total"),
      )
      .where("ticket.uid", "=", input.uid)
      .where("ticket.assignee_sub_user_id", "=", input.assigneeSubUserId)
      .where("ticket.status", "in", ["open", "in_progress"])
      .executeTakeFirst();

    return toNonNegativeNumber(row?.total);
  }

  async countActiveConversationTickets(input: {
    conversationId: number;
    uid: number;
  }) {
    const row = await this.db
      .selectFrom("xy_wap_embed_session_action_item as ticket")
      .select((expressionBuilder) =>
        expressionBuilder.fn.countAll<number>().as("total"),
      )
      .where("ticket.uid", "=", input.uid)
      .where("ticket.conversation_id", "=", input.conversationId)
      .where("ticket.status", "in", ["open", "in_progress"])
      .executeTakeFirst();

    return toNonNegativeNumber(row?.total);
  }

  async getConversationIdentity(uid: number, conversationId: number) {
    const row = await this.db
      .selectFrom("xy_wap_embed_conversation as conversation")
      .select([
        "conversation.id as conversation_id",
        "conversation.last_audit_info_id as last_audit_info_id",
        "conversation.last_msgtime as last_msgtime",
        "conversation.chat_type as chat_type",
      ])
      .where("conversation.uid", "=", uid)
      .where("conversation.id", "=", conversationId)
      .where("conversation.biz_status", "=", 1)
      .executeTakeFirst();

    if (!row) {
      return undefined;
    }

    return {
      chatType: Number(row.chat_type),
      conversationId: Number(row.conversation_id),
      lastAuditInfoId: toNullablePositiveNumber(row.last_audit_info_id),
      lastMessageAt: toNullablePositiveNumber(row.last_msgtime),
    } satisfies TicketConversationIdentity;
  }

  async canAccessConversation(input: {
    conversationId: number;
    subUserId: number;
    uid: number;
  }) {
    const row = await this.db
      .selectFrom("xy_wap_embed_conversation as conversation")
      .innerJoin("xy_wap_embed_user_seat as seat", (join) =>
        join
          .onRef("seat.uid", "=", "conversation.uid")
          .onRef("seat.platform", "=", "conversation.platform")
          .onRef("seat.third_userid", "=", "conversation.third_userid"),
      )
      .innerJoin("xy_wap_embed_user_seat_sub_relation as relation", (join) =>
        join
          .onRef("relation.user_seat_id", "=", "seat.id")
          .onRef("relation.uid", "=", "seat.uid")
          .onRef("relation.platform", "=", "seat.platform"),
      )
      .select(sql<number>`1`.as("allowed"))
      .where("conversation.id", "=", input.conversationId)
      .where("conversation.uid", "=", input.uid)
      .where("conversation.biz_status", "=", 1)
      .where("seat.biz_status", "=", 1)
      .where("relation.sub_id", "=", input.subUserId)
      .limit(1)
      .executeTakeFirst();

    return row != null;
  }

  async listAssigneeOptions(input: {
    conversationId: number;
    uid: number;
  }): Promise<TicketUser[]> {
    const rows = await this.db
      .selectFrom("xy_wap_embed_conversation as conversation")
      .innerJoin("xy_wap_embed_user_seat as seat", (join) =>
        join
          .onRef("seat.uid", "=", "conversation.uid")
          .onRef("seat.platform", "=", "conversation.platform")
          .onRef("seat.third_userid", "=", "conversation.third_userid"),
      )
      .innerJoin("xy_wap_embed_user_seat_sub_relation as relation", (join) =>
        join
          .onRef("relation.user_seat_id", "=", "seat.id")
          .onRef("relation.uid", "=", "seat.uid")
          .onRef("relation.platform", "=", "seat.platform"),
      )
      .innerJoin("xy_wap_embed_sub_user as sub_user", (join) =>
        join
          .onRef("sub_user.id", "=", "relation.sub_id")
          .onRef("sub_user.uid", "=", "relation.uid"),
      )
      .select([
        "sub_user.id as sub_user_id",
        "sub_user.name as display_name",
      ])
      .distinct()
      .where("conversation.id", "=", input.conversationId)
      .where("conversation.uid", "=", input.uid)
      .where("conversation.biz_status", "=", 1)
      .where("seat.biz_status", "=", 1)
      .where("sub_user.status", "=", 1)
      .where((expressionBuilder) =>
        expressionBuilder.or([
          expressionBuilder("sub_user.type", "=", 1),
          expressionBuilder("sub_user.role", "!=", "viewer"),
        ]),
      )
      .orderBy("sub_user.id", "asc")
      .execute();

    return rows.map((row) => ({
      displayName: row.display_name,
      subUserId: String(row.sub_user_id),
    }));
  }

  async isValidAssignee(input: {
    assigneeSubUserId: number;
    conversationId: number;
    uid: number;
  }) {
    const options = await this.listAssigneeOptions(input);

    return options.some((option) => option.subUserId === String(input.assigneeSubUserId));
  }

  async listSessionOptions(input: {
    conversationId: number;
    limit: number;
    uid: number;
  }): Promise<TicketSessionOptionRecord[]> {
    const rows = await this.db
      .selectFrom("xy_wap_embed_logical_session as session")
      .leftJoin("xy_wap_embed_session_summary as summary", (join) =>
        join.onRef("summary.snapshot_id", "=", "session.current_snapshot_id"),
      )
      .select([
        "session.id as session_id",
        "session.next_close_at as next_close_at",
        "session.started_at as started_at",
        "session.ended_at as ended_at",
        "session.status as status",
        "summary.session_title as session_title",
        "summary.summary_text as summary_text",
      ])
      .where("session.uid", "=", input.uid)
      .where("session.conversation_id", "=", input.conversationId)
      .orderBy(
        sql<number>`COALESCE(session.ended_at, session.last_message_at, session.started_at)`,
        "desc",
      )
      .orderBy("session.id", "desc")
      .limit(input.limit)
      .execute();

    return rows.map((row) => ({
      endedAt: row.ended_at == null ? null : Number(row.ended_at),
      nextCloseAt: row.next_close_at == null ? null : Number(row.next_close_at),
      sessionId: String(row.session_id),
      startedAt: Number(row.started_at),
      status: row.status === "open" ? "open" : "ended",
      summary: row.summary_text || null,
      title: row.session_title || null,
    }));
  }

  async isSessionInConversation(input: {
    conversationId: number;
    sessionId: number;
    uid: number;
  }) {
    const row = await this.db
      .selectFrom("xy_wap_embed_logical_session as session")
      .select("session.id")
      .where("session.uid", "=", input.uid)
      .where("session.conversation_id", "=", input.conversationId)
      .where("session.id", "=", input.sessionId)
      .limit(1)
      .executeTakeFirst();

    return row != null;
  }

  async createManualTicket(input: {
    anchorMessageId: number | null;
    assigneeSubUserId: number | null;
    conversationId: number;
    createdBySubUserId: number;
    description: string | null;
    dueAt: Date | null;
    priority: TicketPriority;
    sessionId: number | null;
    title: string;
    uid: number;
  }) {
    return this.db.transaction().execute(async (transaction) => {
      const insertResult = await transaction
        .insertInto("xy_wap_embed_session_action_item")
        .values({
          action_type: "follow_up",
          anchor_message_id: input.anchorMessageId,
          assignee_sub_user_id: input.assigneeSubUserId,
          canceled_at: null,
          canceled_by_sub_user_id: null,
          completed_at: null,
          completed_by_sub_user_id: null,
          conversation_id: input.conversationId,
          created_by_sub_user_id: input.createdBySubUserId,
          description: input.description,
          due_at: input.dueAt,
          priority: input.priority,
          session_id: input.sessionId,
          snapshot_id: null,
          source_type: "manual",
          status: "open",
          title: input.title,
          uid: input.uid,
        })
        .executeTakeFirstOrThrow();
      const ticketId = Number(insertResult.insertId);

      if (!Number.isSafeInteger(ticketId) || ticketId <= 0) {
        throw new Error("TICKET_INSERT_ID_MISSING");
      }

      await transaction
        .insertInto("xy_wap_embed_ticket_activity")
        .values({
          activity_type: "created",
          content: null,
          detail_json: null,
          operator_sub_user_id: input.createdBySubUserId,
          operator_type: "sub_user",
          ticket_id: ticketId,
          uid: input.uid,
        })
        .executeTakeFirstOrThrow();

      return ticketId;
    });
  }

  async createAiTickets(input: {
    conversationId: number;
    items: Array<{
      priority: TicketPriority;
      title: string;
    }>;
    sessionId: number;
    snapshotId: number;
    uid: number;
  }) {
    if (input.items.length === 0) {
      return [];
    }

    return this.db.transaction().execute(async (transaction) => {
      const assigneeSubUserId = await this.resolveAiTicketAssignee(transaction, input);
      const ticketIds: number[] = [];

      for (const item of input.items) {
        const insertResult = await transaction
          .insertInto("xy_wap_embed_session_action_item")
          .values({
            action_type: "follow_up",
            anchor_message_id: null,
            assignee_sub_user_id: assigneeSubUserId,
            canceled_at: null,
            canceled_by_sub_user_id: null,
            completed_at: null,
            completed_by_sub_user_id: null,
            conversation_id: input.conversationId,
            created_by_sub_user_id: null,
            description: null,
            due_at: null,
            priority: item.priority,
            session_id: input.sessionId,
            snapshot_id: input.snapshotId,
            source_type: "ai",
            status: "open",
            title: item.title,
            uid: input.uid,
          })
          .executeTakeFirstOrThrow();
        const ticketId = Number(insertResult.insertId);

        if (!Number.isSafeInteger(ticketId) || ticketId <= 0) {
          throw new Error("TICKET_INSERT_ID_MISSING");
        }

        ticketIds.push(ticketId);
      }

      await transaction
        .insertInto("xy_wap_embed_ticket_activity")
        .values(ticketIds.map((ticketId) => ({
          activity_type: "created" as const,
          content: null,
          detail_json: null,
          operator_sub_user_id: null,
          operator_type: "ai" as const,
          ticket_id: ticketId,
          uid: input.uid,
        })))
        .executeTakeFirstOrThrow();

      return ticketIds;
    });
  }

  private async resolveAiTicketAssignee(
    transaction: Transaction<Database>,
    input: { conversationId: number; uid: number },
  ) {
    const assignee = await transaction
      .selectFrom("xy_wap_embed_conversation as conversation")
      .innerJoin("xy_wap_embed_user_seat as seat", (join) =>
        join
          .onRef("seat.uid", "=", "conversation.uid")
          .onRef("seat.platform", "=", "conversation.platform")
          .onRef("seat.third_userid", "=", "conversation.third_userid"),
      )
      .innerJoin("xy_wap_embed_sub_user as sub_user", (join) =>
        join
          .onRef("sub_user.id", "=", "seat.host_sub_id")
          .onRef("sub_user.uid", "=", "seat.uid"),
      )
      .select("seat.host_sub_id as assignee_sub_user_id")
      .where("conversation.uid", "=", input.uid)
      .where("conversation.id", "=", input.conversationId)
      .where("conversation.biz_status", "=", 1)
      .where("seat.biz_status", "=", 1)
      .where("sub_user.status", "=", 1)
      .where((expressionBuilder) =>
        expressionBuilder.or([
          expressionBuilder("sub_user.type", "=", 1),
          expressionBuilder("sub_user.role", "!=", "viewer"),
        ]),
      )
      .executeTakeFirst();
    const assigneeSubUserId = assignee?.assignee_sub_user_id == null
      ? null
      : Number(assignee.assignee_sub_user_id);

    return Number.isSafeInteger(assigneeSubUserId) && (assigneeSubUserId ?? 0) > 0
      ? assigneeSubUserId
      : null;
  }

  async getTicketRecordById(input: {
    globalAccess: boolean;
    subUserId: number;
    ticketId: number;
    uid: number;
  }) {
    const records = await this.listTicketRecords({
      globalAccess: input.globalAccess,
      page: 1,
      pageSize: 1,
      subUserId: input.subUserId,
      ticketIds: [input.ticketId],
      uid: input.uid,
      view: "visible",
    }, {
      includeAccountAccess: true,
      limit: 1,
      offset: 0,
      ordered: false,
    });

    return records[0];
  }

  async getTicketAccessRecordById(input: {
    globalAccess: boolean;
    subUserId: number;
    ticketId: number;
    uid: number;
  }): Promise<TicketAccessRecord | undefined> {
    const row = await this.buildFilteredTicketQuery({
      globalAccess: input.globalAccess,
      page: 1,
      pageSize: 1,
      subUserId: input.subUserId,
      ticketIds: [input.ticketId],
      uid: input.uid,
      view: "visible",
    })
      .select([
        "ticket.anchor_message_id as anchor_message_id",
        "ticket.assignee_sub_user_id as assignee_sub_user_id",
        "ticket.conversation_id as conversation_id",
        "ticket.created_by_sub_user_id as created_by_sub_user_id",
        "ticket.id as ticket_id",
        "ticket.session_id as session_id",
        "ticket.source_type as source_type",
      ])
      .select((expressionBuilder) =>
        expressionBuilder
          .case()
          .when(this.buildAccountAccessExists(expressionBuilder, {
            globalAccess: input.globalAccess,
            page: 1,
            pageSize: 1,
            subUserId: input.subUserId,
            uid: input.uid,
            view: "visible",
          }))
          .then(1)
          .else(0)
          .end()
          .as("has_account_access"),
      )
      .limit(1)
      .executeTakeFirst();

    if (!row) {
      return undefined;
    }

    return {
      anchorMessageId: toNullableId(row.anchor_message_id),
      assigneeSubUserId: toNullableId(row.assignee_sub_user_id),
      conversationId: String(row.conversation_id),
      createdBySubUserId: toNullableId(row.created_by_sub_user_id),
      hasAccountAccess: Number(row.has_account_access) === 1,
      sessionId: toNullableId(row.session_id),
      sourceType: row.source_type === "ai" ? "ai" : "manual",
      ticketId: String(row.ticket_id),
    };
  }

  async getTicketDeleteRecordById(input: {
    ticketId: number;
    uid: number;
  }): Promise<TicketDeleteRecord | undefined> {
    const row = await this.db
      .selectFrom("xy_wap_embed_session_action_item")
      .select(["created_by_sub_user_id", "source_type", "status"])
      .where("uid", "=", input.uid)
      .where("id", "=", input.ticketId)
      .executeTakeFirst();
    if (!row) return undefined;
    return {
      createdBySubUserId: toNullableId(row.created_by_sub_user_id),
      sourceType: row.source_type === "ai" ? "ai" : "manual",
      status: normalizePersistenceStatus(row.status),
    };
  }

  async listTicketActivities(input: {
    beforeActivityId?: number;
    limit: number;
    ticketId: number;
    uid: number;
  }): Promise<TicketActivityRecordPage> {
    let query = this.buildTicketActivityQuery()
      .where("activity.uid", "=", input.uid)
      .where("activity.ticket_id", "=", input.ticketId);

    if (input.beforeActivityId !== undefined) {
      query = query.where("activity.id", "<", input.beforeActivityId);
    }

    const rows = await query
      .orderBy("activity.id", "desc")
      .limit(input.limit + 1)
      .execute();
    const hasMore = rows.length > input.limit;
    const items = rows
      .slice(0, input.limit)
      .map((row) => mapTicketActivityRow(row));

    return {
      hasMore,
      items,
      nextCursor: hasMore ? items.at(-1)?.activityId ?? null : null,
    };
  }

  async updateTicket(input: {
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
      priority?: TicketPriority;
      status?: string;
      title?: string;
    };
  }) {
    return this.db.transaction().execute(async (transaction) => {
      const values = {
        ...(input.values.assigneeSubUserId !== undefined
          ? { assignee_sub_user_id: input.values.assigneeSubUserId }
          : {}),
        ...(input.values.canceledAt !== undefined ? { canceled_at: input.values.canceledAt } : {}),
        ...(input.values.canceledBySubUserId !== undefined
          ? { canceled_by_sub_user_id: input.values.canceledBySubUserId }
          : {}),
        ...(input.values.completedAt !== undefined
          ? { completed_at: input.values.completedAt }
          : {}),
        ...(input.values.completedBySubUserId !== undefined
          ? { completed_by_sub_user_id: input.values.completedBySubUserId }
          : {}),
        ...(input.values.description !== undefined
          ? { description: input.values.description }
          : {}),
        ...(input.values.dueAt !== undefined ? { due_at: input.values.dueAt } : {}),
        ...(input.values.priority !== undefined ? { priority: input.values.priority } : {}),
        ...(input.values.status !== undefined ? { status: input.values.status } : {}),
        ...(input.values.title !== undefined ? { title: input.values.title } : {}),
      };
      let update = transaction
        .updateTable("xy_wap_embed_session_action_item")
        .set(values)
        .where("uid", "=", input.uid)
        .where("id", "=", input.ticketId)
        .where("status", "!=", "deleted");

      if (input.expectedStatuses?.length) {
        update = update.where("status", "in", input.expectedStatuses);
      }
      if (input.enforceWriteAccess) {
        update = update.where((expressionBuilder) =>
          expressionBuilder.or([
            expressionBuilder("assignee_sub_user_id", "=", input.operatorSubUserId),
            expressionBuilder.and([
              expressionBuilder("source_type", "=", "manual"),
              expressionBuilder("created_by_sub_user_id", "=", input.operatorSubUserId),
            ]),
          ]),
        );
      }

      const result = await update.executeTakeFirst();

      if (Number(result.numUpdatedRows) !== 1) {
        return false;
      }

      await insertActivities(transaction, {
        activities: input.activities,
        operatorSubUserId: input.operatorSubUserId,
        ticketId: input.ticketId,
        uid: input.uid,
      });
      return true;
    });
  }

  async deleteTicket(input: {
    createdBySubUserId: number;
    ticketId: number;
    uid: number;
  }) {
    return this.db.transaction().execute(async (transaction) => {
      const result = await transaction
        .updateTable("xy_wap_embed_session_action_item")
        .set({ status: "deleted" })
        .where("uid", "=", input.uid)
        .where("id", "=", input.ticketId)
        .where("source_type", "=", "manual")
        .where("created_by_sub_user_id", "=", input.createdBySubUserId)
        .where("status", "!=", "deleted")
        .executeTakeFirst();
      if (Number(result.numUpdatedRows) !== 1) return false;
      await insertActivities(transaction, {
        activities: [{ activityType: "deleted" }],
        operatorSubUserId: input.createdBySubUserId,
        ticketId: input.ticketId,
        uid: input.uid,
      });
      return true;
    });
  }

  async claimTicket(input: { assigneeSubUserId: number; ticketId: number; uid: number }) {
    return this.db.transaction().execute(async (transaction) => {
      const result = await transaction
        .updateTable("xy_wap_embed_session_action_item")
        .set({
          assignee_sub_user_id: input.assigneeSubUserId,
        })
        .where("uid", "=", input.uid)
        .where("id", "=", input.ticketId)
        .where("status", "!=", "deleted")
        .where("assignee_sub_user_id", "is", null)
        .executeTakeFirst();

      if (Number(result.numUpdatedRows) !== 1) {
        return false;
      }

      await insertActivities(transaction, {
        activities: [
          { activityType: "assignee_changed", detail: { after: input.assigneeSubUserId, before: null } },
        ],
        operatorSubUserId: input.assigneeSubUserId,
        ticketId: input.ticketId,
        uid: input.uid,
      });
      return true;
    });
  }

  async addTicketComment(input: {
    content: string;
    enforceWriteAccess: boolean;
    operatorSubUserId: number;
    ticketId: number;
    uid: number;
  }): Promise<TicketActivityRecord | undefined> {
    const activityId = await this.db.transaction().execute(async (transaction) => {
      let update = transaction
        .updateTable("xy_wap_embed_session_action_item")
        .set({
          update_time: new Date(),
        })
        .where("uid", "=", input.uid)
        .where("id", "=", input.ticketId)
        .where("status", "!=", "deleted");

      if (input.enforceWriteAccess) {
        update = update.where((expressionBuilder) =>
          expressionBuilder.or([
            expressionBuilder("assignee_sub_user_id", "=", input.operatorSubUserId),
            expressionBuilder.and([
              expressionBuilder("source_type", "=", "manual"),
              expressionBuilder("created_by_sub_user_id", "=", input.operatorSubUserId),
            ]),
          ]),
        );
      }

      const updateResult = await update.executeTakeFirst();
      if (Number(updateResult.numUpdatedRows) !== 1) {
        return undefined;
      }

      const insert = await transaction
        .insertInto("xy_wap_embed_ticket_activity")
        .values({
          activity_type: "comment_added",
          content: input.content,
          detail_json: null,
          operator_sub_user_id: input.operatorSubUserId,
          operator_type: "sub_user",
          ticket_id: input.ticketId,
          uid: input.uid,
        })
        .executeTakeFirstOrThrow();
      return Number(insert.insertId);
    });

    if (activityId == null) {
      return undefined;
    }
    const row = await this.buildTicketActivityQuery()
      .where("activity.uid", "=", input.uid)
      .where("activity.ticket_id", "=", input.ticketId)
      .where("activity.id", "=", activityId)
      .executeTakeFirst();
    const activity = row ? mapTicketActivityRow(row) : undefined;

    if (!activity) {
      throw new Error("TICKET_ACTIVITY_NOT_FOUND_AFTER_INSERT");
    }
    return activity;
  }

  private buildTicketActivityQuery() {
    return this.db
      .selectFrom("xy_wap_embed_ticket_activity as activity")
      .leftJoin("xy_wap_embed_sub_user as operator", (join) =>
        join
          .onRef("operator.id", "=", "activity.operator_sub_user_id")
          .onRef("operator.uid", "=", "activity.uid"),
      )
      .select([
        "activity.id as activity_id",
        "activity.activity_type as activity_type",
        "activity.content as content",
        "activity.create_time as create_time",
        "activity.detail_json as detail_json",
        "activity.operator_sub_user_id as operator_sub_user_id",
        "activity.operator_type as operator_type",
        "activity.ticket_id as ticket_id",
        "operator.name as operator_display_name",
      ]);
  }

  private buildFilteredTicketQuery(input: ResolvedTicketListRepositoryInput): TicketBaseQuery {
    let query = this.db
      .selectFrom("xy_wap_embed_session_action_item as ticket")
      .innerJoin("xy_wap_embed_conversation as conversation", (join) =>
        join
          .onRef("conversation.id", "=", "ticket.conversation_id")
          .onRef("conversation.uid", "=", "ticket.uid"),
      )
      .where("ticket.uid", "=", input.uid)
      .where("ticket.status", "!=", "deleted");

    query = this.applyView(query, input);

    if (input.conversationIds) {
      query = input.conversationIds.length === 0
        ? query.where(sql<boolean>`FALSE`)
        : query.where("ticket.conversation_id", "in", input.conversationIds);
    }
    if (input.ticketIds) {
      query = input.ticketIds.length === 0
        ? query.where(sql<boolean>`FALSE`)
        : query.where("ticket.id", "in", input.ticketIds);
    }
    if (input.ticketId != null) {
      query = query.where("ticket.id", "=", input.ticketId);
    }
    if (input.assigneeSubUserId) {
      query = query.where("ticket.assignee_sub_user_id", "=", input.assigneeSubUserId);
    }
    if (input.ownerAccountId) {
      const ownerAccountId = input.ownerAccountId;
      query = query.where((expressionBuilder) =>
        expressionBuilder.exists(
          expressionBuilder
            .selectFrom("xy_wap_embed_user_seat as owner_filter_seat")
            .select(sql<number>`1`.as("one"))
            .whereRef("owner_filter_seat.uid", "=", "conversation.uid")
            .whereRef("owner_filter_seat.platform", "=", "conversation.platform")
            .whereRef("owner_filter_seat.third_userid", "=", "conversation.third_userid")
            .where("owner_filter_seat.id", "=", ownerAccountId),
        ),
      );
    }
    if (input.priority) {
      query = query.where("ticket.priority", "=", input.priority);
    }
    if (input.sourceType) {
      query = query.where("ticket.source_type", "=", input.sourceType);
    }
    if (input.statuses?.length) {
      query = query.where("ticket.status", "in", input.statuses);
    } else if (input.status) {
      query = input.status === "canceled"
        ? query.where("ticket.status", "in", ["canceled", "dismissed", "expired"])
        : query.where("ticket.status", "=", input.status);
    }
    if (input.createdFrom != null) {
      query = query.where("ticket.create_time", ">=", new Date(input.createdFrom));
    }
    if (input.createdTo != null) {
      query = query.where("ticket.create_time", "<=", new Date(input.createdTo));
    }

    query = this.applyDueScope(query, input.dueScope);

    const titleSearch = input.titleSearch?.trim();
    if (titleSearch) {
      query = query.where("ticket.title", "like", `%${titleSearch}%`);
    }

    return query;
  }

  private applyView(query: TicketBaseQuery, input: ResolvedTicketListRepositoryInput): TicketBaseQuery {
    if (input.view === "assigned_to_me_active") {
      return query
        .where("ticket.assignee_sub_user_id", "=", input.subUserId)
        .where("ticket.status", "in", ["open", "in_progress"]);
    }
    if (input.view === "assigned_to_me") {
      return query.where("ticket.assignee_sub_user_id", "=", input.subUserId);
    }
    if (input.view === "reception") {
      return query.where((expressionBuilder) =>
        this.buildAccountAccessPredicate(expressionBuilder, input),
      );
    }
    if (input.view === "created_by_me") {
      return query
        .where("ticket.created_by_sub_user_id", "=", input.subUserId)
        .where("ticket.source_type", "=", "manual");
    }
    if (input.view === "all" && input.globalAccess) {
      return query;
    }
    if (input.globalAccess) {
      return query;
    }

    return query.where((expressionBuilder) =>
      expressionBuilder.or([
        expressionBuilder("ticket.assignee_sub_user_id", "=", input.subUserId),
        expressionBuilder("ticket.created_by_sub_user_id", "=", input.subUserId),
        this.buildAccountAccessPredicate(expressionBuilder, input),
      ]),
    );
  }

  private async resolveListInput(
    input: TicketListRepositoryInput,
  ): Promise<ResolvedTicketListRepositoryInput> {
    if (!this.requiresAccountAccessResolution(input)) {
      return input;
    }

    return {
      ...input,
      accountAccessIdentities: await this.listAccountAccessIdentities(input),
    };
  }

  private requiresAccountAccessResolution(input: TicketListRepositoryInput) {
    return (input.view === "reception" || !input.globalAccess)
      && input.view !== "assigned_to_me_active"
      && input.view !== "assigned_to_me"
      && input.view !== "created_by_me";
  }

  private async listAccountAccessIdentities(input: Pick<TicketListRepositoryInput, "subUserId" | "uid">) {
    const rows = await this.db
      .selectFrom("xy_wap_embed_user_seat_sub_relation as relation")
      .innerJoin("xy_wap_embed_user_seat as access_seat", (join) =>
        join
          .onRef("access_seat.id", "=", "relation.user_seat_id")
          .onRef("access_seat.uid", "=", "relation.uid")
          .onRef("access_seat.platform", "=", "relation.platform"),
      )
      .select([
        "access_seat.platform as platform",
        "access_seat.third_userid as third_userid",
      ])
      .distinct()
      .where("relation.uid", "=", input.uid)
      .where("relation.sub_id", "=", input.subUserId)
      .execute();

    return rows
      .map((row) => ({
        platform: Number(row.platform),
        thirdUserId: row.third_userid,
      }))
      .filter((row) => Number.isSafeInteger(row.platform) && row.thirdUserId.length > 0);
  }

  private buildAccountAccessPredicate(
    expressionBuilder: ExpressionBuilder<TicketQueryDatabase, "conversation" | "ticket">,
    input: ResolvedTicketListRepositoryInput,
  ) {
    return input.accountAccessIdentities == null
      ? this.buildAccountAccessExists(expressionBuilder, input)
      : this.buildAccountAccessIdentityFilter(input.accountAccessIdentities);
  }

  private buildAccountAccessIdentityFilter(identities: TicketAccountAccessIdentity[]) {
    if (identities.length === 0) {
      return sql<boolean>`FALSE`;
    }

    const tuples = identities.map((identity) =>
      sql`(${identity.platform}, ${identity.thirdUserId})`,
    );
    return sql<boolean>`(
      ${sql.ref("conversation.platform")},
      ${sql.ref("conversation.third_userid")}
    ) IN (${sql.join(tuples)})`;
  }

  private buildAccountAccessExists(
    expressionBuilder: ExpressionBuilder<TicketQueryDatabase, "conversation" | "ticket">,
    input: TicketListRepositoryInput,
  ) {
    return expressionBuilder.exists(
      expressionBuilder
        .selectFrom("xy_wap_embed_user_seat_sub_relation as relation")
        .innerJoin("xy_wap_embed_user_seat as access_seat", (join) =>
          join
            .onRef("access_seat.id", "=", "relation.user_seat_id")
            .onRef("access_seat.uid", "=", "relation.uid")
            .onRef("access_seat.platform", "=", "relation.platform"),
        )
        .select(sql<number>`1`.as("one"))
        .whereRef("access_seat.uid", "=", "conversation.uid")
        .whereRef("access_seat.platform", "=", "conversation.platform")
        .whereRef("access_seat.third_userid", "=", "conversation.third_userid")
        .where("relation.uid", "=", input.uid)
        .where("relation.sub_id", "=", input.subUserId),
    );
  }

  private applyDueScope(query: TicketBaseQuery, dueScope: TicketListRepositoryInput["dueScope"]) {
    if (dueScope === "overdue") {
      return query
        .where("ticket.status", "in", ["open", "in_progress"])
        .where("ticket.due_at", "<", sql<Date>`CURRENT_TIMESTAMP`);
    }
    if (dueScope === "today") {
      return query
        .where("ticket.status", "in", ["open", "in_progress"])
        .where("ticket.due_at", ">=", sql<Date>`CURRENT_DATE`)
        .where("ticket.due_at", "<", sql<Date>`DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY)`);
    }
    if (dueScope === "next_7_days") {
      return query
        .where("ticket.status", "in", ["open", "in_progress"])
        .where("ticket.due_at", ">=", sql<Date>`CURRENT_TIMESTAMP`)
        .where("ticket.due_at", "<", sql<Date>`DATE_ADD(CURRENT_DATE, INTERVAL 8 DAY)`);
    }
    if (dueScope === "none") {
      return query.where("ticket.due_at", "is", null);
    }

    return query;
  }

  private async hydrateTicketPage(uid: number, rows: TicketPageRow[]) {
    if (rows.length === 0) {
      return new Map<string, Omit<TicketHydrationRow, "ticket_id">>();
    }

    const platforms = uniqueNumbers(rows.map((row) => Number(row.conversation_platform)));
    const customerIds = uniqueStrings(rows.map((row) => row.conversation_third_external_userid));
    const ownerIds = uniqueStrings(rows.map((row) => row.conversation_third_userid));
    const subUserIds = uniqueNumbers(rows.flatMap((row) => [
      row.assignee_sub_user_id == null ? undefined : Number(row.assignee_sub_user_id),
      row.created_by_sub_user_id == null ? undefined : Number(row.created_by_sub_user_id),
    ]));

    const [contacts, seats, subUsers] = await Promise.all([
      customerIds.length === 0
        ? []
        : this.db
            .selectFrom("xy_wap_embed_contact")
            .select(["platform", "third_external_userid", "name", "avatar"])
            .where("uid", "=", uid)
            .where("platform", "in", platforms)
            .where("third_external_userid", "in", customerIds)
            .where("biz_status", "=", 1)
            .execute(),
      ownerIds.length === 0
        ? []
        : this.db
            .selectFrom("xy_wap_embed_user_seat")
            .select(["id", "platform", "third_userid", "third_user_name", "third_avatar"])
            .where("uid", "=", uid)
            .where("platform", "in", platforms)
            .where("third_userid", "in", ownerIds)
            .execute(),
      subUserIds.length === 0
        ? []
        : this.db
            .selectFrom("xy_wap_embed_sub_user")
            .select(["id", "name"])
            .where("uid", "=", uid)
            .where("id", "in", subUserIds)
            .execute(),
    ]);

    const contactsByIdentity = new Map(contacts.map((contact) => [
      ticketPartyKey(contact.platform, contact.third_external_userid),
      contact,
    ]));
    const seatsByIdentity = new Map(seats.map((seat) => [
      ticketPartyKey(seat.platform, seat.third_userid),
      seat,
    ]));
    const subUsersById = new Map(subUsers.map((subUser) => [Number(subUser.id), subUser]));

    return new Map(rows.map((row) => {
      const contact = contactsByIdentity.get(ticketPartyKey(
        row.conversation_platform,
        row.conversation_third_external_userid,
      ));
      const seat = seatsByIdentity.get(ticketPartyKey(
        row.conversation_platform,
        row.conversation_third_userid,
      ));
      const assignee = row.assignee_sub_user_id == null
        ? undefined
        : subUsersById.get(Number(row.assignee_sub_user_id));
      const creator = row.created_by_sub_user_id == null
        ? undefined
        : subUsersById.get(Number(row.created_by_sub_user_id));

      return [String(row.ticket_id), {
        assignee_display_name: assignee?.name ?? null,
        created_by_display_name: creator?.name ?? null,
        customer_avatar_url: contact?.avatar ?? null,
        customer_name: contact?.name ?? null,
        owner_account_avatar_url: seat?.third_avatar ?? null,
        owner_account_id: seat?.id ?? null,
        owner_account_name: seat?.third_user_name ?? null,
      }];
    }));
  }
}

const emptyTicketHydration: Omit<TicketHydrationRow, "ticket_id"> = {
  assignee_display_name: null,
  created_by_display_name: null,
  customer_avatar_url: null,
  customer_name: null,
  owner_account_avatar_url: null,
  owner_account_id: null,
  owner_account_name: null,
};

function ticketPartyKey(platform: number | string, thirdPartyId: string) {
  return `${String(platform)}:${thirdPartyId}`;
}

function uniqueNumbers(values: Array<number | undefined>) {
  return [...new Set(values.filter((value): value is number => value != null))];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function mapTicketRecord(row: TicketQueryRow): TicketRecord {
  return {
    anchorMessageId: toNullableId(row.anchor_message_id),
    assigneeDisplayName: row.assignee_display_name,
    assigneeSubUserId: toNullableId(row.assignee_sub_user_id),
    canceledAt: toNullableTimestamp(row.canceled_at),
    completedAt: toNullableTimestamp(row.completed_at),
    conversationId: String(row.conversation_id),
    createdAt: toTimestamp(row.create_time),
    createdByDisplayName: row.created_by_display_name,
    createdBySubUserId: toNullableId(row.created_by_sub_user_id),
    customerAvatarUrl: row.customer_avatar_url,
    customerName: row.customer_name ?? "",
    description: row.description,
    dueAt: toNullableTimestamp(row.due_at),
    hasAccountAccess: Number(row.has_account_access) === 1,
    ownerAccountAvatarUrl: row.owner_account_avatar_url,
    ownerAccountId: row.owner_account_id == null ? "" : String(row.owner_account_id),
    ownerAccountName: row.owner_account_name ?? "",
    overdue: Number(row.overdue) === 1,
    priority: normalizePriority(row.priority),
    sessionId: toNullableId(row.session_id),
    snapshotId: toNullableId(row.snapshot_id),
    sourceType: row.source_type === "ai" ? "ai" : "manual",
    status: row.status,
    ticketId: String(row.ticket_id),
    title: row.title,
    updatedAt: toTimestamp(row.update_time),
  };
}

function normalizePriority(value: string) {
  return value === "low" || value === "high" ? value : "medium";
}

function normalizePersistenceStatus(value: string): TicketDeleteRecord["status"] {
  if (value === "deleted") return "deleted";
  if (value === "in_progress" || value === "done") return value;
  if (value === "canceled" || value === "dismissed" || value === "expired") {
    return "canceled";
  }
  return "open";
}

function toNullableId(value: number | string | null) {
  return value == null ? null : String(value);
}

function toTimestamp(value: Date | string) {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function toNullableTimestamp(value: Date | string | null) {
  if (value == null) {
    return null;
  }
  const timestamp = toTimestamp(value);

  return timestamp > 0 ? timestamp : null;
}

function toNonNegativeNumber(value: number | string | bigint | undefined) {
  const number = Number(value ?? 0);

  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function toNullablePositiveNumber(value: number | string | null) {
  if (value == null) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

async function insertActivities(
  transaction: Transaction<Database>,
  input: {
    activities: TicketMutationActivity[];
    operatorSubUserId: number;
    ticketId: number;
    uid: number;
  },
) {
  if (input.activities.length === 0) {
    return;
  }

  await transaction
    .insertInto("xy_wap_embed_ticket_activity")
    .values(input.activities.map((activity) => ({
      activity_type: activity.activityType,
      content: activity.content ?? null,
      detail_json: activity.detail == null ? null : JSON.stringify(activity.detail),
      operator_sub_user_id: input.operatorSubUserId,
      operator_type: "sub_user",
      ticket_id: input.ticketId,
      uid: input.uid,
    })))
    .execute();
}

function normalizeActivityType(value: string): TicketActivity["activityType"] {
  const types: TicketActivity["activityType"][] = [
    "created",
    "comment_added",
    "status_changed",
    "assignee_changed",
    "priority_changed",
    "due_at_changed",
    "content_updated",
  ];

  return types.includes(value as TicketActivity["activityType"])
    ? value as TicketActivity["activityType"]
    : "content_updated";
}

function mapTicketActivityRow(row: TicketActivityQueryRow): TicketActivityRecord {
  return {
    activityId: String(row.activity_id),
    activityType: normalizeActivityType(row.activity_type),
    content: row.content,
    createdAt: toTimestamp(row.create_time),
    detail: normalizeDetail(row.detail_json),
    operatorDisplayName: row.operator_display_name,
    operatorSubUserId: toNullableId(row.operator_sub_user_id),
    operatorType: row.operator_type === "ai" || row.operator_type === "system"
      ? row.operator_type
      : "sub_user",
    ticketId: String(row.ticket_id),
  };
}

function normalizeDetail(value: unknown): Record<string, unknown> | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed != null && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
  return typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
