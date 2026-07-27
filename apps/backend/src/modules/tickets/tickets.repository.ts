import type { TicketPriority, TicketUser } from "@chatai/contracts";
import type {
  ExpressionBuilder,
  Kysely,
  Nullable,
  SelectQueryBuilder,
} from "kysely";
import { sql } from "kysely";
import type { Database } from "../../db/schema.js";
import type {
  TicketConversationIdentity,
  TicketCountRepositoryInput,
  TicketListRepositoryInput,
  TicketMessageCandidate,
  TicketRecord,
  TicketRecordPage,
  TicketSessionOptionPage,
} from "./tickets.types.js";

type TicketQueryDatabase = Database & {
  assignee: Nullable<Database["xy_wap_embed_sub_user"]>;
  contact: Nullable<Database["xy_wap_embed_contact"]>;
  conversation: Database["xy_wap_embed_conversation"];
  creator: Nullable<Database["xy_wap_embed_sub_user"]>;
  seat: Nullable<Database["xy_wap_embed_user_seat"]>;
  ticket: Database["xy_wap_embed_session_action_item"];
};

type TicketQueryTables = "assignee" | "contact" | "conversation" | "creator" | "seat" | "ticket";

type TicketQuery = SelectQueryBuilder<TicketQueryDatabase, TicketQueryTables, {}>;

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
  due_hint: string | null;
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
    const countRow = await this.buildFilteredTicketQuery(input)
      .select((expressionBuilder) =>
        expressionBuilder.fn.count<number>("ticket.id").distinct().as("total"),
      )
      .executeTakeFirst();
    const total = toNonNegativeNumber(countRow?.total);

    const rows = await this.buildFilteredTicketQuery(input)
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
        "ticket.due_hint as due_hint",
        "ticket.status as status",
        "ticket.create_time as create_time",
        "ticket.update_time as update_time",
        "ticket.completed_at as completed_at",
        "ticket.canceled_at as canceled_at",
        "seat.id as owner_account_id",
        "seat.third_user_name as owner_account_name",
        "seat.third_avatar as owner_account_avatar_url",
        "contact.name as customer_name",
        "contact.avatar as customer_avatar_url",
        "assignee.name as assignee_display_name",
        "creator.name as created_by_display_name",
      ])
      .select((expressionBuilder) =>
        expressionBuilder
          .case()
          .when(this.buildAccountAccessExists(expressionBuilder, input))
          .then(1)
          .else(0)
          .end()
          .as("has_account_access"),
      )
      .select(
        sql<number>`CASE
          WHEN ticket.status IN ('open', 'in_progress')
            AND ticket.due_at IS NOT NULL
            AND ticket.due_at < CURRENT_TIMESTAMP THEN 1
          ELSE 0
        END`.as("overdue"),
      )
      .orderBy(
        sql<number>`CASE
          WHEN ticket.status IN ('open', 'in_progress')
            AND ticket.due_at IS NOT NULL
            AND ticket.due_at < CURRENT_TIMESTAMP THEN 0
          WHEN ticket.status IN ('open', 'in_progress')
            AND ticket.due_at >= CURRENT_DATE
            AND ticket.due_at < DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY) THEN 1
          WHEN ticket.priority = 'high' THEN 2
          ELSE 3
        END`,
        "asc",
      )
      .orderBy("ticket.update_time", "desc")
      .orderBy("ticket.id", "desc")
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize)
      .execute() as TicketQueryRow[];

    return {
      items: rows.map(mapTicketRecord),
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
    };
  }

  async countTickets(input: TicketCountRepositoryInput) {
    let query = this.buildFilteredTicketQuery({
      ...input,
      page: 1,
      pageSize: 1,
    });

    if (input.statuses?.length) {
      query = query.where("ticket.status", "in", input.statuses);
    }

    const row = await query
      .select((expressionBuilder) =>
        expressionBuilder.fn.count<number>("ticket.id").distinct().as("total"),
      )
      .executeTakeFirst();

    return toNonNegativeNumber(row?.total);
  }

  async getConversationIdentity(uid: number, conversationId: number) {
    const row = await this.db
      .selectFrom("xy_wap_embed_conversation as conversation")
      .select([
        "conversation.id as conversation_id",
        "conversation.platform as platform",
        "conversation.third_external_userid as third_external_userid",
        "conversation.third_userid as third_userid",
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
      platform: Number(row.platform),
      thirdExternalUserId: row.third_external_userid ?? "",
      thirdUserId: row.third_userid,
    } satisfies TicketConversationIdentity;
  }

  async listCustomerConversationIds(input: {
    platform: number;
    thirdExternalUserId: string;
    uid: number;
  }) {
    const rows = await this.db
      .selectFrom("xy_wap_embed_conversation as conversation")
      .select("conversation.id")
      .where("conversation.uid", "=", input.uid)
      .where("conversation.platform", "=", input.platform)
      .where("conversation.third_external_userid", "=", input.thirdExternalUserId)
      .where("conversation.chat_type", "=", 1)
      .where("conversation.biz_status", "=", 1)
      .execute();

    return rows.map((row) => Number(row.id)).filter(Number.isSafeInteger);
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
    page: number;
    pageSize: number;
    uid: number;
  }): Promise<TicketSessionOptionPage> {
    const baseQuery = this.db
      .selectFrom("xy_wap_embed_logical_session as session")
      .where("session.uid", "=", input.uid)
      .where("session.conversation_id", "=", input.conversationId);
    const countRow = await baseQuery
      .select((expressionBuilder) => expressionBuilder.fn.count<number>("session.id").as("total"))
      .executeTakeFirst();
    const total = toNonNegativeNumber(countRow?.total);
    const rows = await baseQuery
      .leftJoin("xy_wap_embed_session_summary as summary", (join) =>
        join.onRef("summary.snapshot_id", "=", "session.current_snapshot_id"),
      )
      .select([
        "session.id as session_id",
        "session.started_at as started_at",
        "session.ended_at as ended_at",
        "session.status as status",
        "summary.session_title as session_title",
        "summary.summary_text as summary_text",
      ])
      .orderBy(
        sql<number>`COALESCE(session.ended_at, session.last_message_at, session.started_at)`,
        "desc",
      )
      .orderBy("session.id", "desc")
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize)
      .execute();

    return {
      items: rows.map((row) => ({
        endedAt: row.ended_at == null ? null : Number(row.ended_at),
        sessionId: String(row.session_id),
        startedAt: Number(row.started_at),
        status: row.status === "open" ? "open" : "ended",
        summary: row.summary_text || null,
        title: row.session_title || null,
      })),
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
    };
  }

  async listRecentMessageCandidates(input: {
    beforeMessageId?: number;
    conversation: TicketConversationIdentity;
    limit: number;
    uid: number;
  }): Promise<TicketMessageCandidate[]> {
    let query = this.db
      .selectFrom("xy_wap_embed_msg_audit_info as message")
      .select([
        "message.chat_type as chat_type",
        "message.content as content",
        "message.from_type as from_type",
        "message.id as id",
        "message.msgtime as msgtime",
        "message.msgtype as msgtype",
        "message.third_from_id as third_from_id",
        "message.third_user_id as third_user_id",
      ])
      .select(sql<number>`${input.conversation.conversationId}`.as("conversation_id"))
      .where("message.uid", "=", input.uid)
      .where("message.platform", "=", input.conversation.platform)
      .where("message.chat_type", "=", 1)
      .where("message.third_user_id", "=", input.conversation.thirdUserId)
      .where("message.third_external_id", "=", input.conversation.thirdExternalUserId);

    if (input.beforeMessageId != null) {
      query = query.where("message.id", "<", input.beforeMessageId);
    }

    return query
      .orderBy("message.id", "desc")
      .limit(input.limit)
      .execute() as Promise<TicketMessageCandidate[]>;
  }

  async listOpenSessionAssignments(input: {
    conversationId: number;
    sourceMessageIds: number[];
    uid: number;
  }) {
    if (input.sourceMessageIds.length === 0) {
      return [];
    }

    const rows = await this.db
      .selectFrom("xy_wap_embed_logical_session_message as session_message")
      .innerJoin("xy_wap_embed_logical_session as session", (join) =>
        join
          .onRef("session.id", "=", "session_message.session_id")
          .onRef("session.uid", "=", "session_message.uid"),
      )
      .select([
        "session_message.source_message_id as source_message_id",
        "session_message.session_id as session_id",
      ])
      .where("session_message.uid", "=", input.uid)
      .where("session_message.conversation_id", "=", input.conversationId)
      .where("session_message.source_message_id", "in", input.sourceMessageIds)
      .where("session.status", "=", "open")
      .execute();

    return rows.map((row) => ({
      sessionId: String(row.session_id),
      sourceMessageId: String(row.source_message_id),
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
          due_hint: null,
          priority: input.priority,
          session_id: input.sessionId,
          snapshot_id: null,
          source_type: "manual",
          status: "open",
          title: input.title,
          uid: input.uid,
          updated_by_sub_user_id: input.createdBySubUserId,
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

  async getTicketRecordById(input: {
    globalAccess: boolean;
    subUserId: number;
    ticketId: number;
    uid: number;
  }) {
    const page = await this.listTickets({
      globalAccess: input.globalAccess,
      page: 1,
      pageSize: 1,
      subUserId: input.subUserId,
      ticketIds: [input.ticketId],
      uid: input.uid,
      view: "visible",
    });

    return page.items[0];
  }

  private buildFilteredTicketQuery(input: TicketListRepositoryInput): TicketQuery {
    let query = this.db
      .selectFrom("xy_wap_embed_session_action_item as ticket")
      .innerJoin("xy_wap_embed_conversation as conversation", (join) =>
        join
          .onRef("conversation.id", "=", "ticket.conversation_id")
          .onRef("conversation.uid", "=", "ticket.uid"),
      )
      .leftJoin("xy_wap_embed_user_seat as seat", (join) =>
        join
          .onRef("seat.uid", "=", "conversation.uid")
          .onRef("seat.platform", "=", "conversation.platform")
          .onRef("seat.third_userid", "=", "conversation.third_userid"),
      )
      .leftJoin("xy_wap_embed_contact as contact", (join) =>
        join
          .onRef("contact.uid", "=", "conversation.uid")
          .onRef("contact.platform", "=", "conversation.platform")
          .onRef("contact.third_external_userid", "=", "conversation.third_external_userid"),
      )
      .leftJoin("xy_wap_embed_sub_user as assignee", (join) =>
        join
          .onRef("assignee.id", "=", "ticket.assignee_sub_user_id")
          .onRef("assignee.uid", "=", "ticket.uid"),
      )
      .leftJoin("xy_wap_embed_sub_user as creator", (join) =>
        join
          .onRef("creator.id", "=", "ticket.created_by_sub_user_id")
          .onRef("creator.uid", "=", "ticket.uid"),
      )
      .where("ticket.uid", "=", input.uid);

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
    if (input.assigneeSubUserId) {
      query = query.where("ticket.assignee_sub_user_id", "=", input.assigneeSubUserId);
    }
    if (input.ownerAccountId) {
      query = query.where("seat.id", "=", input.ownerAccountId);
    }
    if (input.priority) {
      query = query.where("ticket.priority", "=", input.priority);
    }
    if (input.sourceType) {
      query = query.where("ticket.source_type", "=", input.sourceType);
    }
    if (input.status) {
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

    const search = input.search?.trim();
    if (search) {
      const pattern = `%${search}%`;
      query = query.where((expressionBuilder) =>
        expressionBuilder.or([
          sql<boolean>`CAST(${expressionBuilder.ref("ticket.id")} AS CHAR) LIKE ${pattern}`,
          expressionBuilder("ticket.title", "like", pattern),
          expressionBuilder("contact.name", "like", pattern),
          expressionBuilder("contact.real_name", "like", pattern),
        ]),
      );
    }

    return query;
  }

  private applyView(query: TicketQuery, input: TicketListRepositoryInput): TicketQuery {
    if (input.view === "assigned_to_me") {
      return query.where("ticket.assignee_sub_user_id", "=", input.subUserId);
    }
    if (input.view === "reception") {
      return query.where((expressionBuilder) =>
        expressionBuilder.exists(
          expressionBuilder
            .selectFrom("xy_wap_embed_user_seat as reception_seat")
            .select(sql<number>`1`.as("one"))
            .whereRef("reception_seat.uid", "=", "conversation.uid")
            .whereRef("reception_seat.platform", "=", "conversation.platform")
            .whereRef("reception_seat.third_userid", "=", "conversation.third_userid")
            .where("reception_seat.host_sub_id", "=", input.subUserId),
        ),
      );
    }
    if (input.view === "unassigned") {
      return query
        .where("ticket.assignee_sub_user_id", "is", null)
        .where("ticket.status", "=", "open")
        .where((expressionBuilder) => this.buildAccountAccessExists(expressionBuilder, input));
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
        this.buildAccountAccessExists(expressionBuilder, input),
      ]),
    );
  }

  private buildAccountAccessExists(
    expressionBuilder: ExpressionBuilder<TicketQueryDatabase, TicketQueryTables>,
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

  private applyDueScope(query: TicketQuery, dueScope: TicketListRepositoryInput["dueScope"]) {
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
    dueHint: row.due_hint,
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

function toNullableId(value: number | string | null) {
  return value == null ? null : String(value);
}

function toTimestamp(value: Date | string) {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function toNullableTimestamp(value: Date | string | null) {
  return value == null ? null : toTimestamp(value);
}

function toNonNegativeNumber(value: number | string | bigint | undefined) {
  const number = Number(value ?? 0);

  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}
