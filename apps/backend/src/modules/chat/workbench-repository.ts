import {
  GROUP_MEMBER_TYPE,
  type WorkbenchGroupMemberDto,
  type WorkbenchGroupMembersResponse,
  type WorkbenchConversationCursorDto,
  type WorkbenchConversationListResponse,
  type WorkbenchHistoryMessagePageDto,
  type WorkbenchHistoryMessageQuery,
  type WorkbenchHistoryMessageScope,
  type WorkbenchMessageQueryByIdsResponse,
  type WorkbenchMessagePageDto,
  type WorkbenchMessageUpdateEventDto,
} from "@chatai/contracts";
import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import { BadRequestError } from "../../shared/errors.js";
import {
  isRecord,
  normalizeMediaAssetUrl,
  parseJsonRecord,
  readRecordNumber,
  readRecordString,
} from "./workbench-content-utils.js";
import {
  buildMissingQuotedMessagePreview,
  buildQuotedMessagePreview,
  getQuoteMessageAuditId,
  getGroupMemberHydrationKey,
  hydrateMessageRows,
  mapConversationRow,
  mapMessageRow,
  mapSeatRow,
  readDownloadStatus,
  type ConversationRow,
  type MessageHydrationSources,
  type MessageRow,
  type MessageRowQuotePreview,
  type SeatRow,
} from "./workbench-mappers.js";
const BIZ_STATUS_HIDDEN = 0;
const BIZ_STATUS_ACTIVE = 1;
const CHAT_TYPE_SINGLE = 1;
const CHAT_TYPE_GROUP = 2;
const DEFAULT_CONVERSATION_LIST_LIMIT = 500;
const MAX_CONVERSATION_LIST_LIMIT = 1000;
const DEFAULT_POLL_CONVERSATION_CHANGE_LIMIT = 200;
const MAX_POLL_CONVERSATION_CHANGE_LIMIT = 500;
const DEFAULT_HISTORY_MESSAGE_LIMIT = 30;
const MAX_HISTORY_MESSAGE_LIMIT = 100;
const GROUP_MEMBER_SORT_RANK = {
  [GROUP_MEMBER_TYPE.OWNER]: 0,
  [GROUP_MEMBER_TYPE.ADMIN]: 1,
  [GROUP_MEMBER_TYPE.NORMAL]: 2,
} as const;

export type ConversationLookup = {
  id: string;
  platform: number;
  seatId: string;
  seatHostSubUserId?: string;
  seatUnreadCount: number;
  thirdExternalUserId?: string;
  thirdGroupId?: string;
  thirdUserId: string;
  uid: number;
  unreadCount: number;
};

export type SeatOperateScope = {
  platform: number;
  seatId: string;
  thirdUserId: string;
  uid: number;
};

export type ConversationListCursor = WorkbenchConversationCursorDto;

export type ChangedConversationListResult = {
  hasMore: boolean;
  items: WorkbenchConversationListResponse["items"];
  nextVersion: number;
};

export type MessageUpdateEventListResult = Array<
  WorkbenchMessageUpdateEventDto & {
    eventTime: number;
  }
>;

type HistoryMessageCursor = {
  anchorId: string;
  direction: "next" | "prev";
  filters: HistoryMessageCursorFilters;
};

type HistoryMessageCursorFilters = {
  conversationId: string;
  day?: string;
  scope: WorkbenchHistoryMessageScope;
  senderId?: string;
};

type ConversationPageRow = Omit<
  ConversationRow,
  | "customer_avatar"
  | "customer_name"
  | "group_avatar"
  | "group_name"
  | "last_message_content"
  | "last_message_type"
> & {
  last_audit_info_id: number | string | null;
};

type ConversationHydrationSources = {
  bindsByThirdExternalId: Map<string, { remark: string | null }>;
  contactsByThirdExternalId: Map<
    string,
    {
      avatar: string | null;
      bizStatus: number | null;
      name: string | null;
      realName: string | null;
    }
  >;
  groupsByThirdGroupId: Map<
    string,
    { avatar: string | null; bizStatus: number | null; name: string | null }
  >;
  lastMessagesById: Map<string, { content: string | null; msgtype: string | null }>;
};

export class WorkbenchRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * 按子账号租户与平台关联 `xy_wap_embed_user_relation`，取涂色侧栏 AES 密钥与 IV。
   */
  async getEmbedUserRelationTuseSecrets(subUserId: string) {
    const subUserNumericId = parseMySqlId(subUserId);

    if (subUserNumericId == null) {
      return undefined;
    }

    const row = await this.db
      .selectFrom("xy_wap_embed_sub_user as sub")
      .innerJoin("xy_wap_embed_user_relation as rel", (join) =>
        join.onRef("rel.uid", "=", "sub.uid").onRef("rel.platform", "=", "sub.platform"),
      )
      .select(["rel.appid as appid", "rel.secret as secret", "rel.iv_parameter as iv_parameter"])
      .where("sub.id", "=", subUserNumericId)
      .where("sub.status", "=", 1)
      .where("rel.biz_status", "=", 1)
      .orderBy("rel.id", "asc")
      .executeTakeFirst();

    const secret = row?.secret?.trim();
    const ivParameter = row?.iv_parameter?.trim();
    const appId = row?.appid?.trim() ?? "";

    if (!secret || !ivParameter) {
      return undefined;
    }

    return { appId, ivParameter, secret };
  }

  async getSubUser(subUserId: string) {
    const subUserNumericId = parseMySqlId(subUserId);

    if (subUserNumericId == null) {
      return undefined;
    }

    const subUser = await this.db
      .selectFrom("xy_wap_embed_sub_user")
      .select(["id", "name"])
      .where("id", "=", subUserNumericId)
      .where("status", "=", 1)
      .executeTakeFirst();

    if (!subUser) {
      return undefined;
    }

    return {
      displayName: subUser.name,
      subUserId: String(subUser.id),
    };
  }

  async getQuoteContentBase64(input: {
    messageId: string;
    platform: number;
    uid: number;
  }) {
    const messageId = input.messageId.trim();

    if (!messageId) {
      return undefined;
    }

    const extend = await this.db
      .selectFrom("xy_wap_embed_msg_audit_info_extend")
      .select(["origin_data"])
      .where("msgid", "=", messageId)
      .where("platform", "=", input.platform)
      .where("uid", "=", input.uid)
      .executeTakeFirst();

    return readQuoteContentBase64(extend?.origin_data);
  }

  async getMessageFileDownloadStatus(input: {
    auditId: number;
    platform: number;
    uid: number;
  }) {
    if (!Number.isInteger(input.auditId) || input.auditId <= 0) {
      return undefined;
    }

    const row = await this.db
      .selectFrom("xy_wap_embed_msg_audit_info")
      .select(["content"])
      .where("id", "=", input.auditId)
      .where("uid", "=", input.uid)
      .where("platform", "=", input.platform)
      .executeTakeFirst();

    if (!row) {
      return undefined;
    }

    return readMessageFileDownloadStatus(row.content);
  }

  async listMessageUpdateEvents(
    conversationId: string,
    options: {
      afterCreateTime?: number;
      limit: number;
    },
  ): Promise<MessageUpdateEventListResult> {
    const conversationNumericId = parseMySqlId(conversationId);

    if (conversationNumericId == null || options.limit <= 0) {
      return [];
    }

    const conversation = await this.db
      .selectFrom("xy_wap_embed_conversation as conversation")
      .select(["conversation.id as conversation_id", "conversation.uid as uid", "conversation.platform as platform", "conversation.third_userid as third_userid", "conversation.third_external_userid as conversation_external_id", "conversation.third_group_id as conversation_group_id", "conversation.chat_type as chat_type"])
      .where("conversation.id", "=", conversationNumericId)
      .where("conversation.biz_status", "=", 1)
      .executeTakeFirst();

    if (!conversation) {
      return [];
    }

    let query = this.db
      .selectFrom("xy_wap_embed_broadcast_event as event")
      .select([
        "event.id as event_id",
        "event.create_time as create_time",
        "event.content as content",
      ])
      .where("event.uid", "=", conversation.uid)
      .where("event.platform", "=", conversation.platform)
      .where("event.category", "=", "conversation")
      .where("event.category_bind_id", "=", String(conversation.conversation_id))
      .where("event.event", "=", "message.update");

    if (options.afterCreateTime != null) {
      query = query.where(
        "event.create_time",
        ">",
        new Date(Math.max(0, options.afterCreateTime)),
      );
    }

    const rows = await query
      .orderBy("event.create_time", "asc")
      .orderBy("event.id", "asc")
      .limit(options.limit)
      .execute();
    return rows
      .map((row) => {
        const event = parseMessageUpdateEvent(String(row.content ?? ""));

        if (!event?.messageId) {
          return undefined;
        }

        return {
          conversationId,
          eventId: Number(row.event_id),
          eventTime: toTimestamp(row.create_time),
          messageId: event.messageId,
        };
      })
      .filter(
        (event): event is WorkbenchMessageUpdateEventDto & { eventTime: number } =>
          Boolean(event),
      );
  }

  async listMessagesByIds(
    conversationId: string,
    messageIds: string[],
  ): Promise<WorkbenchMessageQueryByIdsResponse> {
    const conversationNumericId = parseMySqlId(conversationId);
    const normalizedIds = uniqueNumbers(
      messageIds
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isSafeInteger(value) && value > 0),
    );

    if (conversationNumericId == null || !normalizedIds.length) {
      return { messages: [] };
    }

    const conversation = await this.db
      .selectFrom("xy_wap_embed_conversation as conversation")
      .innerJoin("xy_wap_embed_user_seat as seat", (join) =>
        join
          .onRef("seat.third_userid", "=", "conversation.third_userid")
          .onRef("seat.uid", "=", "conversation.uid")
          .onRef("seat.platform", "=", "conversation.platform"),
      )
      .select([
        "conversation.id as conversation_id",
        "conversation.chat_type as chat_type",
        "conversation.third_external_userid as conversation_external_id",
        "conversation.third_group_id as conversation_group_id",
        "conversation.third_userid as third_userid",
        "conversation.platform as platform",
        "seat.id as seat_id",
        "conversation.uid as uid",
      ])
      .select((expressionBuilder) => [
        expressionBuilder
          .selectFrom("xy_wap_embed_group_seat as group_seat")
          .select("group_seat.id")
          .whereRef("group_seat.third_group_id", "=", "conversation.third_group_id")
          .whereRef("group_seat.third_userid", "=", "conversation.third_userid")
          .whereRef("group_seat.uid", "=", "conversation.uid")
          .whereRef("group_seat.platform", "=", "conversation.platform")
          .as("group_seat_id"),
      ])
      .where("conversation.id", "=", conversationNumericId)
      .where("seat.biz_status", "=", 1)
      .where("conversation.biz_status", "=", 1)
      .executeTakeFirst();

    if (!conversation) {
      return { messages: [] };
    }

    let query = this.db
      .selectFrom("xy_wap_embed_msg_audit_info as message")
      .select([
        "message.id as id",
        "message.msgid as msgid",
        "message.chat_type as chat_type",
        "message.from_type as from_type",
        "message.third_user_id as third_user_id",
        "message.third_external_id as third_external_id",
        "message.third_from_id as third_from_id",
        "message.third_group_id as third_group_id",
        "message.content as content",
        "message.msgtype as msgtype",
        "message.msgtime as msgtime",
        "message.opt_no as opt_no",
        "message.revoke_status as revoke_status",
      ])
      .where("message.uid", "=", conversation.uid)
      .where("message.platform", "=", conversation.platform)
      .where("message.third_user_id", "=", conversation.third_userid)
      .where("message.id", "in", normalizedIds);

    if (conversation.chat_type === CHAT_TYPE_GROUP) {
      query = query.where("message.third_group_id", "=", conversation.conversation_group_id);
    } else {
      query = query.where(
        "message.third_external_id",
        "=",
        conversation.conversation_external_id,
      );
    }

    const rows = await query.execute();
    const messageRows = (rows as MessageRow[]).map((row) => ({
      ...row,
      conversation_group_seat_id: conversation.group_seat_id,
    }));
    const quotedRows = await this.getQuotedMessageRows(messageRows, conversation);
    const allRowsToHydrate = [...messageRows, ...quotedRows.fetchedRows];
    const hydrationSources = await this.getMessageHydrationSources(
      allRowsToHydrate,
      conversation.uid,
      conversation.platform,
      toNumber(conversation.group_seat_id),
    );
    const hydratedRows = hydrateMessageRows(messageRows, hydrationSources);
    const hydratedQuotedRows = hydrateMessageRows(
      quotedRows.fetchedRows,
      hydrationSources,
    );
    const currentQuoteRowsById = new Map(
      hydratedRows.map((row) => [toNumber(row.id), row] as const),
    );
    const fetchedQuoteRowsById = new Map(
      hydratedQuotedRows.map((row) => [toNumber(row.id), row] as const),
    );
    const quotePreviewsByRowId = this.buildQuotePreviewsByRowId(
      hydratedRows,
      currentQuoteRowsById,
      fetchedQuoteRowsById,
    );
    const messages = hydratedRows.map((row) =>
      mapMessageRow(
        {
          ...(row as MessageRow),
          chat_type: conversation.chat_type,
          conversation_external_id: conversation.conversation_external_id,
          conversation_group_seat_id: conversation.group_seat_id,
          conversation_group_id: conversation.conversation_group_id,
          conversation_id: conversation.conversation_id,
          seat_id: conversation.seat_id,
          third_external_id: row.third_external_id ?? undefined,
          third_from_id: row.third_from_id ?? undefined,
          third_group_id: row.third_group_id ?? undefined,
          third_user_id: row.third_user_id ?? undefined,
        },
        quotePreviewsByRowId.get(toNumber(row.id)),
      ),
    );

    return { messages };
  }

  async listSeats(subUserId: string) {
    const subUserNumericId = parseMySqlId(subUserId);

    if (subUserNumericId == null) {
      return [];
    }

    const rows = await this.db
      .selectFrom("xy_wap_embed_user_seat_sub_relation as relation")
      .innerJoin("xy_wap_embed_user_seat as seat", (join) =>
        join
          .onRef("seat.id", "=", "relation.user_seat_id")
          .onRef("seat.uid", "=", "relation.uid")
          .onRef("seat.platform", "=", "relation.platform"),
      )
      .leftJoin("xy_wap_embed_conversation as conversation", (join) =>
        join
          .onRef("conversation.third_userid", "=", "seat.third_userid")
          .onRef("conversation.uid", "=", "seat.uid")
          .onRef("conversation.platform", "=", "seat.platform")
          .on("conversation.biz_status", "=", 1),
      )
      .select((expressionBuilder) => [
        "seat.id as id",
        "seat.third_userid as third_userid",
        "seat.third_user_name as third_user_name",
        "seat.third_avatar as avatar",
        "seat.is_online as is_online",
        "seat.host_sub_id as host_sub_id",
        expressionBuilder.fn
          .coalesce(
            expressionBuilder.fn.sum<number>("conversation.unread_cnt"),
            expressionBuilder.val(0),
          )
          .as("unread_count"),
        expressionBuilder.fn.max("conversation.last_msgtime").as("last_message_time"),
      ])
      .where("relation.sub_id", "=", subUserNumericId)
      .where("seat.biz_status", "=", 1)
      .groupBy([
        "seat.id",
        "seat.third_userid",
        "seat.third_user_name",
        "seat.third_avatar",
        "seat.is_online",
        "seat.host_sub_id",
      ])
      .orderBy("last_message_time", "desc")
      .execute();

    return rows.map((row) => mapSeatRow(row as SeatRow));
  }

  async getSeat(seatId: string) {
    const seatNumericId = parseMySqlId(seatId);

    if (seatNumericId == null) {
      return undefined;
    }

    const rows = await this.db
      .selectFrom("xy_wap_embed_user_seat as seat")
      .leftJoin("xy_wap_embed_conversation as conversation", (join) =>
        join
          .onRef("conversation.third_userid", "=", "seat.third_userid")
          .onRef("conversation.uid", "=", "seat.uid")
          .onRef("conversation.platform", "=", "seat.platform")
          .on("conversation.biz_status", "=", 1),
      )
      .select((expressionBuilder) => [
        "seat.id as id",
        "seat.third_userid as third_userid",
        "seat.third_user_name as third_user_name",
        "seat.third_avatar as avatar",
        "seat.is_online as is_online",
        "seat.host_sub_id as host_sub_id",
        expressionBuilder.fn
          .coalesce(
            expressionBuilder.fn.sum<number>("conversation.unread_cnt"),
            expressionBuilder.val(0),
          )
          .as("unread_count"),
        expressionBuilder.fn.max("conversation.last_msgtime").as("last_message_time"),
      ])
      .where("seat.id", "=", seatNumericId)
      .where("seat.biz_status", "=", 1)
      .groupBy([
        "seat.id",
        "seat.third_userid",
        "seat.third_user_name",
        "seat.third_avatar",
        "seat.is_online",
        "seat.host_sub_id",
      ])
      .execute();

    return rows[0] ? mapSeatRow(rows[0] as SeatRow) : undefined;
  }

  async getSeatOperateScope(seatId: string): Promise<SeatOperateScope | undefined> {
    const seatNumericId = parseMySqlId(seatId);

    if (seatNumericId == null) {
      return undefined;
    }

    const seat = await this.getSeatRecord(seatNumericId);

    if (!seat) {
      return undefined;
    }

    return {
      platform: seat.platform,
      seatId: String(seat.id),
      thirdUserId: seat.third_userid,
      uid: seat.uid,
    };
  }

  async canAccessSeat(subUserId: string, seatId: string) {
    const subUserNumericId = parseMySqlId(subUserId);
    const seatNumericId = parseMySqlId(seatId);

    if (subUserNumericId == null || seatNumericId == null) {
      return false;
    }

    const relation = await this.db
      .selectFrom("xy_wap_embed_user_seat_sub_relation as relation")
      .innerJoin("xy_wap_embed_sub_user as sub_user", (join) =>
        join
          .onRef("sub_user.id", "=", "relation.sub_id")
          .onRef("sub_user.uid", "=", "relation.uid")
          .onRef("sub_user.platform", "=", "relation.platform"),
      )
      .innerJoin("xy_wap_embed_user_seat as seat", (join) =>
        join
          .onRef("seat.id", "=", "relation.user_seat_id")
          .onRef("seat.uid", "=", "relation.uid")
          .onRef("seat.platform", "=", "relation.platform"),
      )
      .select("relation.id")
      .where("relation.sub_id", "=", subUserNumericId)
      .where("relation.user_seat_id", "=", seatNumericId)
      .where("sub_user.status", "=", 1)
      .where("seat.biz_status", "=", 1)
      .executeTakeFirst();

    return Boolean(relation);
  }

  async listConversations(
    seatId: string,
    options?: {
      cursor?: ConversationListCursor;
      limit?: number;
      mode?: "single" | "group";
    },
  ): Promise<WorkbenchConversationListResponse> {
    const seatNumericId = parseMySqlId(seatId);

    if (seatNumericId == null) {
      return emptyConversationListPage(Date.now());
    }

    const seat = await this.getSeatRecord(seatNumericId);

    if (!seat) {
      return emptyConversationListPage(Date.now());
    }

    const limit = normalizeConversationListLimit(options?.limit);
    const snapshotAt = options?.cursor?.snapshotAt ?? Date.now();
    const cursor = options?.cursor;

    let query = this.db
      .selectFrom("xy_wap_embed_conversation as conversation")
      .select([
        "conversation.id as id",
        "conversation.chat_type as chat_type",
        "conversation.create_time as create_time",
        "conversation.last_audit_info_id as last_audit_info_id",
        "conversation.third_userid as third_userid",
        "conversation.third_external_userid as third_external_userid",
        "conversation.third_group_id as third_group_id",
        "conversation.unread_cnt as unread_cnt",
        "conversation.last_msgtime as last_msgtime",
        "conversation.pinned_time as pinned_time",
        "conversation.verified as verified",
      ])
      .select((expressionBuilder) => [
        expressionBuilder.val(seatNumericId).as("seat_id"),
      ])
      .where("conversation.uid", "=", seat.uid)
      .where("conversation.platform", "=", seat.platform)
      .where("conversation.third_userid", "=", seat.third_userid)
      .where("conversation.biz_status", "=", 1)
      .where("conversation.last_msgtime", "<=", snapshotAt);

    if (options?.mode) {
      query = query.where(
        "conversation.chat_type",
        "=",
        options.mode === "group" ? CHAT_TYPE_GROUP : CHAT_TYPE_SINGLE,
      );
    }

    if (cursor) {
      query = query.where((expressionBuilder) =>
        expressionBuilder.or([
          expressionBuilder("conversation.last_msgtime", "<", cursor.lastMsgTime),
          expressionBuilder.and([
            expressionBuilder("conversation.last_msgtime", "=", cursor.lastMsgTime),
            expressionBuilder("conversation.id", "<", asSchemaBigIntId(cursor.id)),
          ]),
        ]),
      )
        .orderBy("conversation.last_msgtime", "desc")
        .orderBy("conversation.id", "desc");
    } else {
      query = query
        .orderBy("conversation.pinned_time", "desc")
        .orderBy("conversation.last_msgtime", "desc")
        .orderBy("conversation.id", "desc")
        .limit(limit + 1);
    }

    if (cursor) {
      query = query.limit(limit + 1);
    }

    const rows = await query.execute();

    const pageRows = rows.slice(0, limit);
    const conversationRows = pageRows.map((row) => row as ConversationPageRow);
    const hydrationSources = await this.getConversationHydrationSources(
      conversationRows,
      seat.uid,
      seat.platform,
      seat.third_userid,
    );

    const items = this.mapHydratedConversationRows(conversationRows, hydrationSources);
    const lastRow = conversationRows.at(-1);

    return {
      hasMore: rows.length > limit,
      items,
      nextCursor:
        rows.length > limit && lastRow
          ? encodeConversationListCursor({
              id: String(lastRow.id),
              lastMsgTime: Number(lastRow.last_msgtime),
              snapshotAt,
            })
          : undefined,
      snapshotAt,
    };
  }

  async listChangedConversations(
    seatId: string,
    options: {
      limit: number;
      sinceLastMsgTime: number;
    },
  ): Promise<ChangedConversationListResult> {
    const seatNumericId = parseMySqlId(seatId);
    const snapshotAt = Date.now();

    if (seatNumericId == null) {
      return {
        hasMore: false,
        items: [],
        nextVersion: snapshotAt,
      };
    }

    const seat = await this.getSeatRecord(seatNumericId);

    if (!seat) {
      return {
        hasMore: false,
        items: [],
        nextVersion: snapshotAt,
      };
    }

    const limit = normalizePollConversationChangeLimit(options.limit);
    const rows = await this.db
      .selectFrom("xy_wap_embed_conversation as conversation")
      .select([
        "conversation.id as id",
        "conversation.chat_type as chat_type",
        "conversation.create_time as create_time",
        "conversation.last_audit_info_id as last_audit_info_id",
        "conversation.third_userid as third_userid",
        "conversation.third_external_userid as third_external_userid",
        "conversation.third_group_id as third_group_id",
        "conversation.unread_cnt as unread_cnt",
        "conversation.last_msgtime as last_msgtime",
        "conversation.pinned_time as pinned_time",
        "conversation.verified as verified",
      ])
      .select((expressionBuilder) => [
        expressionBuilder.val(seatNumericId).as("seat_id"),
      ])
      .where("conversation.uid", "=", seat.uid)
      .where("conversation.platform", "=", seat.platform)
      .where("conversation.third_userid", "=", seat.third_userid)
      .where("conversation.biz_status", "=", BIZ_STATUS_ACTIVE)
      .where("conversation.last_msgtime", ">", options.sinceLastMsgTime)
      .where("conversation.last_msgtime", "<=", snapshotAt)
      .orderBy("conversation.last_msgtime", "asc")
      .orderBy("conversation.id", "asc")
      .limit(limit + 1)
      .execute();

    if (rows.length > limit) {
      return {
        hasMore: true,
        items: [],
        nextVersion: snapshotAt,
      };
    }

    const pageRows = rows.slice(0, limit);
    const conversationRows = pageRows.map((row) => row as ConversationPageRow);
    const hydrationSources = await this.getConversationHydrationSources(
      conversationRows,
      seat.uid,
      seat.platform,
      seat.third_userid,
    );

    const items = this.mapHydratedConversationRows(conversationRows, hydrationSources);

    return {
      hasMore: rows.length > limit,
      items,
      nextVersion: snapshotAt,
    };
  }

  async getConversationLookup(conversationId: string): Promise<ConversationLookup | undefined> {
    const conversationNumericId = parseMySqlId(conversationId);

    if (conversationNumericId == null) {
      return undefined;
    }

    const row = await this.db
      .selectFrom("xy_wap_embed_conversation as conversation")
      .innerJoin("xy_wap_embed_user_seat as seat", (join) =>
        join
          .onRef("seat.third_userid", "=", "conversation.third_userid")
          .onRef("seat.uid", "=", "conversation.uid")
          .onRef("seat.platform", "=", "conversation.platform"),
      )
      .select([
        "conversation.id as id",
        "conversation.platform as platform",
        "conversation.third_external_userid as third_external_userid",
        "conversation.third_group_id as third_group_id",
        "conversation.third_userid as third_userid",
        "conversation.unread_cnt as unread_cnt",
        "conversation.uid as uid",
        "seat.host_sub_id as seat_host_sub_id",
        "seat.id as seat_id",
      ])
      .select((expressionBuilder) => [
        expressionBuilder
          .selectFrom("xy_wap_embed_conversation as unread_conversation")
          .select((subExpressionBuilder) =>
            subExpressionBuilder.fn
              .coalesce(
                subExpressionBuilder.fn.sum<number>("unread_conversation.unread_cnt"),
                subExpressionBuilder.val(0),
              )
              .as("seat_unread_count"),
          )
          .whereRef("unread_conversation.uid", "=", "conversation.uid")
          .whereRef("unread_conversation.platform", "=", "conversation.platform")
          .whereRef("unread_conversation.third_userid", "=", "conversation.third_userid")
          .where("unread_conversation.biz_status", "=", BIZ_STATUS_ACTIVE)
          .as("seat_unread_count"),
      ])
      .where("conversation.id", "=", conversationNumericId)
      .where("conversation.biz_status", "=", 1)
      .where("seat.biz_status", "=", BIZ_STATUS_ACTIVE)
      .executeTakeFirst();

    return row
      ? {
          id: String(row.id),
          platform: row.platform,
          seatId: String(row.seat_id),
          seatHostSubUserId:
            row.seat_host_sub_id == null || row.seat_host_sub_id <= 0
              ? undefined
              : String(row.seat_host_sub_id),
          seatUnreadCount: Number(row.seat_unread_count ?? 0),
          thirdExternalUserId: row.third_external_userid || undefined,
          thirdGroupId: row.third_group_id || undefined,
          thirdUserId: row.third_userid,
          uid: row.uid,
          unreadCount: Number(row.unread_cnt ?? 0),
        }
      : undefined;
  }

  async getSeatUnreadCountAfterMarkRead(input: {
    conversationId: string;
    platform: number;
    seatId: string;
    uid: number;
  }) {
    const conversationNumericId = parseMySqlId(input.conversationId);
    const seatNumericId = parseMySqlId(input.seatId);

    if (conversationNumericId == null || seatNumericId == null) {
      return 0;
    }

    const row = await this.db
      .selectFrom("xy_wap_embed_conversation")
      .select((expressionBuilder) =>
        expressionBuilder.fn
          .coalesce(
            expressionBuilder.fn.sum<number>("unread_cnt"),
            expressionBuilder.val(0),
          )
          .as("unread_count"),
      )
      .where("uid", "=", input.uid)
      .where("platform", "=", input.platform)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .where("id", "!=", conversationNumericId)
      .where("third_userid", "=", (expressionBuilder) =>
        expressionBuilder
          .selectFrom("xy_wap_embed_user_seat")
          .select("third_userid")
          .where("id", "=", seatNumericId)
          .where("uid", "=", input.uid)
          .where("platform", "=", input.platform)
          .where("biz_status", "=", BIZ_STATUS_ACTIVE),
      )
      .executeTakeFirst();

    return Number(row?.unread_count ?? 0);
  }

  async updateConversationPinned(input: {
    conversationId: string;
    isPinned: boolean;
    platform: number;
    uid: number;
  }) {
    const conversationNumericId = parseMySqlId(input.conversationId);

    if (conversationNumericId == null) {
      return;
    }

    await this.db
      .updateTable("xy_wap_embed_conversation")
      .set({
        pinned_time: input.isPinned ? Math.floor(Date.now() / 1000) : 0,
      })
      .where("id", "=", conversationNumericId)
      .where("uid", "=", input.uid)
      .where("platform", "=", input.platform)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .execute();
  }

  async hideConversation(input: {
    conversationId: string;
    platform: number;
    uid: number;
  }) {
    const conversationNumericId = parseMySqlId(input.conversationId);

    if (conversationNumericId == null) {
      return;
    }

    await this.db
      .updateTable("xy_wap_embed_conversation")
      .set({
        biz_status: BIZ_STATUS_HIDDEN,
      })
      .where("id", "=", conversationNumericId)
      .where("uid", "=", input.uid)
      .where("platform", "=", input.platform)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .execute();
  }

  async updateSeatHostSubUser(input: {
    platform: number;
    seatId: string;
    subUserId: string;
    uid: number;
  }) {
    const seatNumericId = parseMySqlId(input.seatId);
    const subUserNumericId = parseMySqlId(input.subUserId);

    if (seatNumericId == null || subUserNumericId == null) {
      return;
    }

    await this.db
      .updateTable("xy_wap_embed_user_seat")
      .set({
        host_sub_id: subUserNumericId,
      })
      .where("id", "=", seatNumericId)
      .where("uid", "=", input.uid)
      .where("platform", "=", input.platform)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .execute();
  }

  async listGroupMembers(conversationId: string): Promise<WorkbenchGroupMembersResponse | undefined> {
    const conversationNumericId = parseMySqlId(conversationId);

    if (conversationNumericId == null) {
      return undefined;
    }

    const conversation = await this.db
      .selectFrom("xy_wap_embed_conversation as conversation")
      .innerJoin("xy_wap_embed_group_seat as group_seat", (join) =>
        join
          .onRef("group_seat.third_group_id", "=", "conversation.third_group_id")
          .onRef("group_seat.uid", "=", "conversation.uid")
          .onRef("group_seat.platform", "=", "conversation.platform"),
      )
      .select([
        "conversation.id as conversation_id",
        "conversation.third_group_id as third_group_id",
        "conversation.uid as uid",
        "conversation.platform as platform",
        "group_seat.id as group_seat_id",
      ])
      .where("conversation.id", "=", conversationNumericId)
      .where("conversation.chat_type", "=", CHAT_TYPE_GROUP)
      .where("conversation.biz_status", "=", BIZ_STATUS_ACTIVE)
      .where("group_seat.biz_status", "=", BIZ_STATUS_ACTIVE)
      .executeTakeFirst();

    if (!conversation) {
      return undefined;
    }

    const rows = await this.db
      .selectFrom("xy_wap_embed_group_member as member")
      .select([
        "member.third_userid as third_user_id",
        "member.avatar as avatar_url",
        "member.name as name",
        "member.nickname as nickname",
        "member.type as type",
      ])
      .where("member.group_seat_id", "=", conversation.group_seat_id)
      .where("member.uid", "=", conversation.uid)
      .where("member.platform", "=", conversation.platform)
      .where("member.biz_status", "=", BIZ_STATUS_ACTIVE)
      .execute();

    const items = rows
      .map((row) => mapGroupMemberRow(row as GroupMemberRow))
      .sort(sortGroupMembers);

    return {
      conversationId: String(conversation.conversation_id),
      groupSeatId: String(conversation.group_seat_id),
      items,
      thirdGroupId: conversation.third_group_id,
    };
  }

  async listMessages(
    conversationId: string,
    options: {
      beforeSeq?: number;
      limit: number;
    },
  ): Promise<WorkbenchMessagePageDto> {
    const conversationNumericId = parseMySqlId(conversationId);

    if (conversationNumericId == null || options.limit <= 0) {
      return emptyMessagePage();
    }

    const conversation = await this.db
      .selectFrom("xy_wap_embed_conversation as conversation")
      .innerJoin("xy_wap_embed_user_seat as seat", (join) =>
        join
          .onRef("seat.third_userid", "=", "conversation.third_userid")
          .onRef("seat.uid", "=", "conversation.uid")
          .onRef("seat.platform", "=", "conversation.platform"),
      )
      .select([
        "conversation.id as conversation_id",
        "conversation.uid as uid",
        "conversation.platform as platform",
        "conversation.chat_type as chat_type",
        "conversation.third_external_userid as conversation_external_id",
        "conversation.third_group_id as conversation_group_id",
        "conversation.third_userid as third_userid",
        "seat.id as seat_id",
      ])
      .select((expressionBuilder) => [
        expressionBuilder
          .selectFrom("xy_wap_embed_group_seat as group_seat")
          .select("group_seat.id")
          .whereRef("group_seat.third_group_id", "=", "conversation.third_group_id")
          .whereRef("group_seat.third_userid", "=", "conversation.third_userid")
          .whereRef("group_seat.uid", "=", "conversation.uid")
          .whereRef("group_seat.platform", "=", "conversation.platform")
          .as("group_seat_id"),
      ])
      .where("conversation.id", "=", conversationNumericId)
      .where("conversation.biz_status", "=", 1)
      .executeTakeFirst();

    if (!conversation) {
      return emptyMessagePage();
    }

    let query = this.db
      .selectFrom("xy_wap_embed_msg_audit_info as message")
      .select([
        "message.id as id",
        "message.msgid as msgid",
        "message.chat_type as chat_type",
        "message.from_type as from_type",
        "message.third_user_id as third_user_id",
        "message.third_external_id as third_external_id",
        "message.third_from_id as third_from_id",
        "message.third_group_id as third_group_id",
        "message.content as content",
        "message.msgtype as msgtype",
        "message.msgtime as msgtime",
        "message.opt_no as opt_no",
        "message.revoke_status as revoke_status",
      ])
      .select((expressionBuilder) => [
        expressionBuilder.val(conversation.conversation_id).as("conversation_id"),
        expressionBuilder.val(conversation.seat_id).as("seat_id"),
        expressionBuilder
          .val(conversation.conversation_external_id)
          .as("conversation_external_id"),
        expressionBuilder.val(conversation.conversation_group_id).as("conversation_group_id"),
        expressionBuilder.val(conversation.group_seat_id).as("conversation_group_seat_id"),
      ])
      .where("message.uid", "=", conversation.uid)
      .where("message.platform", "=", conversation.platform)
      .where("message.third_user_id", "=", conversation.third_userid);

    if (conversation.chat_type === 2) {
      query = query.where("message.third_group_id", "=", conversation.conversation_group_id);
    } else {
      query = query.where(
        "message.third_external_id",
        "=",
        conversation.conversation_external_id,
      );
    }

    if (options.beforeSeq != null) {
      query = query.where("message.id", "<", options.beforeSeq);
    }

    const rows = await query
      .orderBy("message.id", "desc")
      .limit(options.limit + 1)
      .execute();

    const rawRows = rows.slice(0, options.limit) as MessageRow[];
    const messageRows = [...rawRows].reverse();
    const quotedRows = await this.getQuotedMessageRows(messageRows, conversation);
    const allRowsToHydrate = [...messageRows, ...quotedRows.fetchedRows];
    const hydrationSources = await this.getMessageHydrationSources(
      allRowsToHydrate,
      conversation.uid,
      conversation.platform,
      toNumber(conversation.group_seat_id),
    );
    const hydratedMessageRows = hydrateMessageRows(messageRows, hydrationSources);
    const hydratedFetchedQuoteRows = hydrateMessageRows(
      quotedRows.fetchedRows,
      hydrationSources,
    );
    const currentQuoteRowsById = new Map(
      hydratedMessageRows.map((row) => [toNumber(row.id), row] as const),
    );
    const fetchedQuoteRowsById = new Map(
      hydratedFetchedQuoteRows.map((row) => [toNumber(row.id), row] as const),
    );
    const quotePreviewsByRowId = this.buildQuotePreviewsByRowId(
      hydratedMessageRows,
      currentQuoteRowsById,
      fetchedQuoteRowsById,
    );

    return {
      filteredCount: 0,
      hasMore: rows.length > options.limit,
      messages: hydratedMessageRows.map((row) =>
        mapMessageRow(row, quotePreviewsByRowId.get(toNumber(row.id))),
      ),
      nextBeforeSeq: rawRows.length > 0 ? toNumber(rawRows.at(-1)?.id) : undefined,
      scannedCount: rawRows.length,
    };
  }

  async listHistoryMessages(
    conversationId: string,
    options: WorkbenchHistoryMessageQuery = {},
  ): Promise<WorkbenchHistoryMessagePageDto> {
    const conversationNumericId = parseMySqlId(conversationId);

    if (conversationNumericId == null) {
      return emptyHistoryMessagePage();
    }

    const limit = normalizeHistoryMessageLimit(options.limit);
    const scope = options.scope ?? "all";
    const filters: HistoryMessageCursorFilters = {
      conversationId,
      day: options.day,
      scope,
      senderId: options.senderId,
    };
    const hasCursor = options.cursor !== undefined;
    const cursor = hasCursor
      ? decodeHistoryMessageCursor(options.cursor ?? "")
      : undefined;

    if (hasCursor && (!cursor || !historyCursorFiltersEqual(cursor.filters, filters))) {
      throw new BadRequestError("INVALID_HISTORY_CURSOR", "历史消息分页游标无效");
    }

    const dayBounds = getLocalDayBounds(options.day);

    const conversation = await this.db
      .selectFrom("xy_wap_embed_conversation as conversation")
      .innerJoin("xy_wap_embed_user_seat as seat", (join) =>
        join
          .onRef("seat.third_userid", "=", "conversation.third_userid")
          .onRef("seat.uid", "=", "conversation.uid")
          .onRef("seat.platform", "=", "conversation.platform"),
      )
      .select([
        "conversation.id as conversation_id",
        "conversation.uid as uid",
        "conversation.platform as platform",
        "conversation.chat_type as chat_type",
        "conversation.third_external_userid as conversation_external_id",
        "conversation.third_group_id as conversation_group_id",
        "conversation.third_userid as third_userid",
        "seat.id as seat_id",
      ])
      .select((expressionBuilder) => [
        expressionBuilder
          .selectFrom("xy_wap_embed_group_seat as group_seat")
          .select("group_seat.id")
          .whereRef("group_seat.third_group_id", "=", "conversation.third_group_id")
          .whereRef("group_seat.third_userid", "=", "conversation.third_userid")
          .whereRef("group_seat.uid", "=", "conversation.uid")
          .whereRef("group_seat.platform", "=", "conversation.platform")
          .as("group_seat_id"),
      ])
      .where("conversation.id", "=", conversationNumericId)
      .where("conversation.biz_status", "=", BIZ_STATUS_ACTIVE)
      .where("seat.biz_status", "=", BIZ_STATUS_ACTIVE)
      .executeTakeFirst();

    if (!conversation) {
      return emptyHistoryMessagePage();
    }

    let query = this.db
      .selectFrom("xy_wap_embed_msg_audit_info as message")
      .select([
        "message.id as id",
        "message.msgid as msgid",
        "message.chat_type as chat_type",
        "message.from_type as from_type",
        "message.third_user_id as third_user_id",
        "message.third_external_id as third_external_id",
        "message.third_from_id as third_from_id",
        "message.third_group_id as third_group_id",
        "message.content as content",
        "message.msgtype as msgtype",
        "message.msgtime as msgtime",
        "message.opt_no as opt_no",
        "message.revoke_status as revoke_status",
      ])
      .select((expressionBuilder) => [
        expressionBuilder.val(conversation.conversation_id).as("conversation_id"),
        expressionBuilder.val(conversation.seat_id).as("seat_id"),
        expressionBuilder
          .val(conversation.conversation_external_id)
          .as("conversation_external_id"),
        expressionBuilder.val(conversation.conversation_group_id).as("conversation_group_id"),
        expressionBuilder.val(conversation.group_seat_id).as("conversation_group_seat_id"),
      ])
      .where("message.uid", "=", conversation.uid)
      .where("message.platform", "=", conversation.platform)
      .where("message.third_user_id", "=", conversation.third_userid);

    if (conversation.chat_type === CHAT_TYPE_GROUP) {
      query = query.where("message.third_group_id", "=", conversation.conversation_group_id);
    } else {
      query = query.where(
        "message.third_external_id",
        "=",
        conversation.conversation_external_id,
      );
    }

    const scopeMsgtypes = getHistoryScopeRawMsgtypes(scope);

    if (scopeMsgtypes.length === 1) {
      const msgtype = scopeMsgtypes[0] as string;
      query = query.where("message.msgtype", "=", msgtype);
    } else if (scopeMsgtypes.length > 1) {
      query = query.where("message.msgtype", "in", scopeMsgtypes);
    }

    if (options.senderId) {
      query = query.where("message.third_from_id", "=", options.senderId);
    }

    if (dayBounds) {
      query = query
        .where("message.msgtime", ">=", dayBounds.start)
        .where("message.msgtime", "<=", dayBounds.end);
    }

    const initialRecentPage = !dayBounds && !cursor;
    const orderDirection = initialRecentPage || cursor?.direction === "prev" ? "desc" : "asc";

    if (cursor) {
      query = query.where(
        "message.id",
        cursor.direction === "next" ? ">" : "<",
        asSchemaBigIntId(cursor.anchorId),
      );
    }

    const rows = await query
      .orderBy("message.id", orderDirection)
      .limit(limit + 1)
      .execute();

    const hasMoreInDirection = rows.length > limit;
    const pageRows = rows.slice(0, limit) as MessageRow[];
    const messageRows = orderDirection === "desc" ? pageRows.reverse() : pageRows;
    const quotedRows = await this.getQuotedMessageRows(messageRows, conversation);
    const allRowsToHydrate = [...messageRows, ...quotedRows.fetchedRows];
    const hydrationSources = await this.getMessageHydrationSources(
      allRowsToHydrate,
      conversation.uid,
      conversation.platform,
      toNumber(conversation.group_seat_id),
    );
    const hydratedMessageRows = hydrateMessageRows(messageRows, hydrationSources);
    const hydratedFetchedQuoteRows = hydrateMessageRows(
      quotedRows.fetchedRows,
      hydrationSources,
    );
    const currentQuoteRowsById = new Map(
      hydratedMessageRows.map((row) => [toNumber(row.id), row] as const),
    );
    const fetchedQuoteRowsById = new Map(
      hydratedFetchedQuoteRows.map((row) => [toNumber(row.id), row] as const),
    );
    const quotePreviewsByRowId = this.buildQuotePreviewsByRowId(
      hydratedMessageRows,
      currentQuoteRowsById,
      fetchedQuoteRowsById,
    );
    const firstRow = hydratedMessageRows[0];
    const lastRow = hydratedMessageRows.at(-1);
    const firstAnchorId = String(firstRow?.id ?? "");
    const lastAnchorId = String(lastRow?.id ?? "");
    const hasRows = hydratedMessageRows.length > 0;
    let hasNext = false;
    let hasPrev = false;

    if (cursor?.direction === "next") {
      hasNext = hasMoreInDirection;
      hasPrev = true;
    } else if (cursor?.direction === "prev") {
      hasNext = true;
      hasPrev = hasMoreInDirection;
    } else if (dayBounds) {
      hasNext = hasMoreInDirection;
    } else {
      hasPrev = hasMoreInDirection;
    }

    return {
      hasNext,
      hasPrev,
      messages: hydratedMessageRows.map((row) =>
        mapMessageRow(row, quotePreviewsByRowId.get(toNumber(row.id))),
      ),
      nextCursor: hasRows
        ? encodeHistoryMessageCursor({
            anchorId: lastAnchorId,
            direction: "next",
            filters,
          })
        : undefined,
      prevCursor: hasRows
        ? encodeHistoryMessageCursor({
            anchorId: firstAnchorId,
            direction: "prev",
            filters,
          })
        : undefined,
    };
  }

  private async getQuotedMessageRows(
    rows: MessageRow[],
    conversation: {
      chat_type: number;
      conversation_external_id: string;
      conversation_group_id: string;
      group_seat_id?: number | string | null;
      platform: number;
      third_userid: string;
      uid: number;
    },
  ) {
    const quoteIds = uniqueNumbers(rows.map(getQuoteMessageAuditId));
    const currentRowIds = new Set(rows.map((row) => toNumber(row.id)));
    const missingQuoteIds = quoteIds.filter((id) => !currentRowIds.has(id));

    if (!missingQuoteIds.length) {
      return { fetchedRows: [] as MessageRow[] };
    }

    let query = this.db
      .selectFrom("xy_wap_embed_msg_audit_info as message")
      .select([
        "message.id as id",
        "message.msgid as msgid",
        "message.chat_type as chat_type",
        "message.from_type as from_type",
        "message.third_user_id as third_user_id",
        "message.third_external_id as third_external_id",
        "message.third_from_id as third_from_id",
        "message.third_group_id as third_group_id",
        "message.content as content",
        "message.msgtype as msgtype",
        "message.msgtime as msgtime",
        "message.revoke_status as revoke_status",
      ])
      .select((expressionBuilder) => [
        expressionBuilder.val(0).as("conversation_id"),
        expressionBuilder.val(0).as("seat_id"),
        expressionBuilder
          .val(conversation.conversation_external_id)
          .as("conversation_external_id"),
        expressionBuilder.val(conversation.conversation_group_id).as("conversation_group_id"),
        expressionBuilder.val(conversation.group_seat_id ?? null).as("conversation_group_seat_id"),
      ])
      .where("message.id", "in", missingQuoteIds)
      .where("message.uid", "=", conversation.uid)
      .where("message.platform", "=", conversation.platform)
      .where("message.third_user_id", "=", conversation.third_userid);

    if (conversation.chat_type === CHAT_TYPE_GROUP) {
      query = query.where("message.third_group_id", "=", conversation.conversation_group_id);
    } else {
      query = query.where(
        "message.third_external_id",
        "=",
        conversation.conversation_external_id,
      );
    }

    return { fetchedRows: (await query.execute()) as MessageRow[] };
  }

  private buildQuotePreviewsByRowId(
    rows: MessageRow[],
    currentRowsById: Map<number | undefined, MessageRow>,
    fetchedRowsById: Map<number | undefined, MessageRow>,
  ) {
    const previews = new Map<number | undefined, MessageRowQuotePreview>();

    rows.forEach((row) => {
      const quoteId = getQuoteMessageAuditId(row);

      if (quoteId == null) {
        return;
      }

      const quotedRow = currentRowsById.get(quoteId) ?? fetchedRowsById.get(quoteId);
      previews.set(
        toNumber(row.id),
        quotedRow ? buildQuotedMessagePreview(quotedRow) : buildMissingQuotedMessagePreview(),
      );
    });

    return previews;
  }

  private async getSeatRecord(seatId: number) {
    return this.db
      .selectFrom("xy_wap_embed_user_seat")
      .select(["id", "uid", "platform", "third_userid"])
      .where("id", "=", seatId)
      .where("biz_status", "=", 1)
      .executeTakeFirst();
  }

  private async getConversationGroups(
    rows: ConversationRow[],
    uid: number,
    platform: number,
  ) {
    const groupIds = uniqueNonEmpty(
      rows.filter((row) => row.chat_type === 2).map((row) => row.third_group_id),
    );

    if (!groupIds.length) {
      return new Map<string, { avatar: string | null; name: string | null }>();
    }

    const groups = await this.db
      .selectFrom("xy_wap_embed_group_seat")
      .select(["third_group_id", "avatar", "name"])
      .where("uid", "=", uid)
      .where("platform", "=", platform)
      .where("third_group_id", "in", groupIds)
      .where("biz_status", "=", 1)
      .execute();

    return new Map(
      groups.map((group) => [
        group.third_group_id,
        {
          avatar: group.avatar,
          name: group.name,
        },
      ]),
    );
  }

  private async getConversationHydrationSources(
    rows: ConversationPageRow[],
    uid: number,
    platform: number,
    seatThirdUserId: string,
  ): Promise<ConversationHydrationSources> {
    const lastMessageIds = uniqueIds(
      rows.map((row) => row.last_audit_info_id),
    );
    const contactThirdExternalIds = uniqueNonEmpty(
      rows
        .filter((row) => row.chat_type !== CHAT_TYPE_GROUP)
        .map((row) => row.third_external_userid),
    );
    const groupIds = uniqueNonEmpty(
      rows
        .filter((row) => row.chat_type === CHAT_TYPE_GROUP)
        .map((row) => row.third_group_id),
    );

    const [lastMessages, contacts, binds, groups] = await Promise.all([
      lastMessageIds.length
        ? this.db
            .selectFrom("xy_wap_embed_msg_audit_info")
            .select(["id", "content", "msgtype"])
            .where("id", "in", asSchemaBigIntIds(lastMessageIds))
            .where("uid", "=", uid)
            .where("platform", "=", platform)
            .execute()
        : [],
      contactThirdExternalIds.length
        ? this.db
            .selectFrom("xy_wap_embed_contact")
            .select(["third_external_userid", "avatar", "name", "real_name", "biz_status"])
            .where("uid", "=", uid)
            .where("platform", "=", platform)
            .where("third_external_userid", "in", contactThirdExternalIds)
            .execute()
        : [],
      contactThirdExternalIds.length
        ? this.db
            .selectFrom("xy_wap_embed_customer_bind_relation")
            .select(["third_external_userid", "remark"])
            .where("uid", "=", uid)
            .where("platform", "=", platform)
            .where("third_userid", "=", seatThirdUserId)
            .where("third_external_userid", "in", contactThirdExternalIds)
            .where("biz_status", "=", 1)
            .execute()
        : [],
      groupIds.length
        ? this.db
            .selectFrom("xy_wap_embed_group_seat")
            .select(["third_group_id", "avatar", "name", "biz_status"])
            .where("uid", "=", uid)
            .where("platform", "=", platform)
            .where("third_userid", "=", seatThirdUserId)
            .where("third_group_id", "in", groupIds)
            .execute()
        : [],
    ]);

    return {
      bindsByThirdExternalId: new Map(
        binds.map((bind) => [
          bind.third_external_userid,
          {
            remark: bind.remark,
          },
        ]),
      ),
      contactsByThirdExternalId: new Map(
        contacts.map((contact) => [
          contact.third_external_userid,
          {
            avatar: contact.avatar,
            bizStatus: contact.biz_status,
            name: contact.name,
            realName: contact.real_name,
          },
        ]),
      ),
      groupsByThirdGroupId: new Map(
        groups.map((group) => [
          group.third_group_id,
          {
            avatar: group.avatar,
            bizStatus: group.biz_status,
            name: group.name,
          },
        ]),
      ),
      lastMessagesById: new Map(
        lastMessages.map((message) => [
          String(message.id),
          {
            content: message.content,
            msgtype: message.msgtype,
          },
        ]),
      ),
    };
  }

  private mapHydratedConversationRows(
    rows: ConversationPageRow[],
    hydrationSources: ConversationHydrationSources,
  ): WorkbenchConversationListResponse["items"] {
    return rows.map((row) => this.mapHydratedConversationRow(row, hydrationSources));
  }

  private mapHydratedConversationRow(
    row: ConversationPageRow,
    hydrationSources: ConversationHydrationSources,
  ): WorkbenchConversationListResponse["items"][number] {
    const lastMessage =
      row.last_audit_info_id != null
        ? hydrationSources.lastMessagesById.get(String(row.last_audit_info_id))
        : undefined;
    const contact = hydrationSources.contactsByThirdExternalId.get(row.third_external_userid);
    const bind = hydrationSources.bindsByThirdExternalId.get(row.third_external_userid);
    const group = hydrationSources.groupsByThirdGroupId.get(row.third_group_id);

    return mapConversationRow({
      ...row,
      biz_status:
        row.chat_type === CHAT_TYPE_GROUP
          ? (group?.bizStatus ?? null)
          : (contact?.bizStatus ?? null),
      customer_avatar: contact?.avatar ?? null,
      customer_name: bind?.remark ?? contact?.realName ?? contact?.name ?? null,
      group_avatar: group?.avatar ?? null,
      group_name: group?.name ?? null,
      last_message_content: lastMessage?.content ?? null,
      last_message_type: lastMessage?.msgtype ?? null,
    });
  }

  private async getMessageHydrationSources(
    rows: MessageRow[],
    uid: number,
    platform: number,
    groupSeatId?: number,
  ): Promise<MessageHydrationSources> {
    const groupMemberIds = uniqueNonEmpty(
      rows
        .filter((row) => row.chat_type === 2)
        .map((row) => row.third_from_id || row.third_user_id),
    );
    const seatThirdUserIds = uniqueNonEmpty(
      rows
        .filter((row) => row.chat_type !== 2 && row.from_type === 1)
        .map((row) => row.third_user_id),
    );
    const contactThirdExternalIds = uniqueNonEmpty(
      rows
        .filter((row) => row.chat_type !== 2 && row.from_type === 2)
        .map((row) => row.third_external_id || row.conversation_external_id),
    );

    const [groupMembers, seats, contacts] = await Promise.all([
      groupMemberIds.length && groupSeatId != null
        ? this.db
            .selectFrom("xy_wap_embed_group_member as member")
            .select([
              "member.third_userid as third_userid",
              "member.avatar as avatar",
              "member.name as name",
              "member.nickname as nickname",
            ])
            .where("member.group_seat_id", "=", groupSeatId)
            .where("member.uid", "=", uid)
            .where("member.platform", "=", platform)
            .where("member.third_userid", "in", groupMemberIds)
            .execute()
        : [],
      seatThirdUserIds.length
        ? this.db
            .selectFrom("xy_wap_embed_user_seat")
            .select(["third_userid", "third_avatar", "third_user_name"])
            .where("uid", "=", uid)
            .where("platform", "=", platform)
            .where("third_userid", "in", seatThirdUserIds)
            .where("biz_status", "=", 1)
            .execute()
        : [],
      contactThirdExternalIds.length
        ? this.db
            .selectFrom("xy_wap_embed_contact")
            .select(["third_external_userid", "avatar", "name", "real_name"])
            .where("uid", "=", uid)
            .where("platform", "=", platform)
            .where("third_external_userid", "in", contactThirdExternalIds)
            .where("biz_status", "=", 1)
            .execute()
        : [],
    ]);

    return {
      contactsByThirdExternalId: new Map(
        contacts.map((contact) => [
          contact.third_external_userid,
          {
            avatar: contact.avatar,
            name: contact.name,
            realName: contact.real_name,
          },
        ]),
      ),
      groupMembersByGroupAndThirdUserId: new Map(
        groupMembers.map((member) => [
          getGroupMemberHydrationKey(String(groupSeatId), member.third_userid),
          {
            avatar: member.avatar,
            name: member.name,
            nickname: member.nickname,
          },
        ]),
      ),
      seatsByThirdUserId: new Map(
        seats.map((seat) => [
          seat.third_userid,
          {
            avatar: seat.third_avatar,
            name: seat.third_user_name,
          },
        ]),
      ),
    };
  }
}

function emptyMessagePage(): WorkbenchMessagePageDto {
  return {
    filteredCount: 0,
    hasMore: false,
    messages: [],
    scannedCount: 0,
  };
}

type ParsedMessageUpdateEvent = {
  messageId: string;
};

function parseMessageUpdateEvent(content: string): ParsedMessageUpdateEvent | undefined {
  try {
    const parsed: unknown = JSON.parse(content);

    if (!isRecord(parsed)) {
      return undefined;
    }

    const messageId = readRecordNumber(parsed, "messageId");

    if (!messageId) {
      return undefined;
    }

    return {
      messageId: String(messageId),
    };
  } catch {
    return undefined;
  }
}

function toTimestamp(value: Date | number | string | null | undefined) {
  if (value == null) {
    return 0;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
}
function emptyHistoryMessagePage(): WorkbenchHistoryMessagePageDto {
  return {
    hasNext: false,
    hasPrev: false,
    messages: [],
  };
}

function readQuoteContentBase64(rawOriginData: string | null | undefined) {
  if (!rawOriginData) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(rawOriginData);

    if (!isRecord(parsed)) {
      return undefined;
    }

    const value = parsed.quote_content_base64;

    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

function readMessageFileDownloadStatus(content: string | null) {
  const parsed = parseJsonRecord(content);

  if (!parsed) {
    return {};
  }

  return {
    downloadStatus: readDownloadStatus(parsed),
    fileSerialNo: readRecordString(parsed, "fileSerialNo") || undefined,
    fileUrlExpireTime: readRecordNumber(parsed, "fileUrlExpireTime"),
    fileUrl: normalizeMediaAssetUrl(readRecordString(parsed, "fileUrl")),
  };
}

function toNumber(value: number | string | null | undefined) {
  if (value == null) {
    return undefined;
  }

  const numberValue = typeof value === "number" ? value : Number(value);

  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function uniqueIds(values: Array<number | string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter((value) => /^[1-9]\d*$/.test(value)),
    ),
  );
}

function asSchemaBigIntId(value: string) {
  return value as unknown as number;
}

function asSchemaBigIntIds(values: string[]) {
  return values as unknown as number[];
}

function uniqueNumbers(values: Array<number | undefined>) {
  return Array.from(
    new Set(
      values.filter((value): value is number =>
        typeof value === "number" && Number.isSafeInteger(value) && value > 0,
      ),
    ),
  );
}

export function parseMySqlId(value: string) {
  if (!/^[1-9]\d*$/.test(value)) {
    return undefined;
  }

  const numeric = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    return undefined;
  }

  return numeric;
}

function normalizeConversationListLimit(value: number | undefined) {
  if (value == null || !Number.isSafeInteger(value) || value <= 0) {
    return DEFAULT_CONVERSATION_LIST_LIMIT;
  }

  return Math.min(value, MAX_CONVERSATION_LIST_LIMIT);
}

function normalizePollConversationChangeLimit(value: number | undefined) {
  if (value == null || !Number.isSafeInteger(value) || value <= 0) {
    return DEFAULT_POLL_CONVERSATION_CHANGE_LIMIT;
  }

  return Math.min(value, MAX_POLL_CONVERSATION_CHANGE_LIMIT);
}

function normalizeHistoryMessageLimit(value: number | undefined) {
  if (value == null || !Number.isSafeInteger(value) || value <= 0) {
    return DEFAULT_HISTORY_MESSAGE_LIMIT;
  }

  return Math.min(value, MAX_HISTORY_MESSAGE_LIMIT);
}

function emptyConversationListPage(snapshotAt: number): WorkbenchConversationListResponse {
  return {
    hasMore: false,
    items: [],
    snapshotAt,
  };
}

export function encodeConversationListCursor(cursor: ConversationListCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeConversationListCursor(value: string): ConversationListCursor | undefined {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;

    if (!isConversationListCursor(parsed)) {
      return undefined;
    }

    return parsed;
  } catch {
    return undefined;
  }
}

function encodeHistoryMessageCursor(cursor: HistoryMessageCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeHistoryMessageCursor(value: string): HistoryMessageCursor | undefined {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;

    if (!isHistoryMessageCursor(parsed)) {
      return undefined;
    }

    return parsed;
  } catch {
    return undefined;
  }
}

function isHistoryMessageCursor(value: unknown): value is HistoryMessageCursor {
  if (!isRecord(value)) {
    return false;
  }

  const { anchorId, direction, filters } = value;

  return (
    typeof anchorId === "string" &&
    /^[1-9]\d*$/.test(anchorId) &&
    (direction === "next" || direction === "prev") &&
    isHistoryMessageCursorFilters(filters)
  );
}

function isHistoryMessageCursorFilters(value: unknown): value is HistoryMessageCursorFilters {
  if (!isRecord(value)) {
    return false;
  }

  const { conversationId, day, scope, senderId } = value;

  return (
    typeof conversationId === "string" &&
    /^[1-9]\d*$/.test(conversationId) &&
    (day == null || typeof day === "string") &&
    isHistoryMessageScope(scope) &&
    (senderId == null || typeof senderId === "string")
  );
}

function isHistoryMessageScope(value: unknown): value is WorkbenchHistoryMessageScope {
  return (
    value === "all" ||
    value === "file" ||
    value === "media" ||
    value === "h5" ||
    value === "mini-program"
  );
}

function historyCursorFiltersEqual(
  left: HistoryMessageCursorFilters,
  right: HistoryMessageCursorFilters,
) {
  return (
    left.conversationId === right.conversationId &&
    left.day === right.day &&
    left.scope === right.scope &&
    left.senderId === right.senderId
  );
}

function getHistoryScopeRawMsgtypes(scope: WorkbenchHistoryMessageScope) {
  switch (scope) {
    case "file":
      return ["file"];
    case "media":
      return ["image", "video"];
    case "h5":
      return ["link"];
    case "mini-program":
      return ["weapp"];
    case "all":
      return [];
  }
}

function getLocalDayBounds(day: string | undefined) {
  if (!day) {
    return undefined;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);

  if (!match) {
    throw new BadRequestError("INVALID_HISTORY_DAY", "历史消息日期无效");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const startDate = new Date(year, month - 1, date, 0, 0, 0, 0);
  const endDate = new Date(year, month - 1, date, 23, 59, 59, 999);
  const isRoundTripValid =
    startDate.getFullYear() === year &&
    startDate.getMonth() === month - 1 &&
    startDate.getDate() === date;

  if (!isRoundTripValid || !Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
    throw new BadRequestError("INVALID_HISTORY_DAY", "历史消息日期无效");
  }

  return { end: endDate.getTime(), start: startDate.getTime() };
}

function isConversationListCursor(value: unknown): value is ConversationListCursor {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ConversationListCursor>;
  const { id, lastMsgTime, snapshotAt } = candidate;

  return (
    typeof id === "string" &&
    /^[1-9]\d*$/.test(id) &&
    Number.isSafeInteger(lastMsgTime) &&
    typeof lastMsgTime === "number" &&
    lastMsgTime >= 0 &&
    Number.isSafeInteger(snapshotAt) &&
    typeof snapshotAt === "number" &&
    snapshotAt >= 0
  );
}

type GroupMemberRow = {
  avatar_url: string | null;
  name: string | null;
  nickname: string | null;
  third_user_id: string;
  type: number | null;
};

function mapGroupMemberRow(row: GroupMemberRow): WorkbenchGroupMemberDto {
  return {
    avatarUrl: row.avatar_url ?? "",
    displayName: row.nickname?.trim() || row.name?.trim() || row.third_user_id,
    nickname: row.nickname?.trim() || undefined,
    thirdUserId: row.third_user_id,
    type: normalizeGroupMemberType(row.type),
  };
}

function normalizeGroupMemberType(value: number | null): WorkbenchGroupMemberDto["type"] {
  if (value === GROUP_MEMBER_TYPE.ADMIN || value === GROUP_MEMBER_TYPE.OWNER) {
    return value;
  }

  return GROUP_MEMBER_TYPE.NORMAL;
}

function sortGroupMembers(left: WorkbenchGroupMemberDto, right: WorkbenchGroupMemberDto) {
  const leftRank = getGroupMemberRank(left.type);
  const rightRank = getGroupMemberRank(right.type);

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  const leftName = left.displayName.localeCompare(right.displayName, "zh-Hans-CN");
  if (leftName !== 0) {
    return leftName;
  }

  return left.thirdUserId.localeCompare(right.thirdUserId, "zh-Hans-CN");
}

function getGroupMemberRank(type: WorkbenchGroupMemberDto["type"]) {
  return GROUP_MEMBER_SORT_RANK[type];
}
