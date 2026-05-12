import {
  GROUP_MEMBER_TYPE,
  type WorkbenchGroupMemberDto,
  type WorkbenchGroupMembersResponse,
  type WorkbenchMessagePageDto,
} from "@chatai/contracts";
import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import {
  getGroupMemberHydrationKey,
  hydrateMessageRows,
  mapConversationRow,
  mapMessageRow,
  mapSeatRow,
  type ConversationRow,
  type MessageHydrationSources,
  type MessageRow,
  type SeatRow,
} from "./workbench-mappers.js";
const BIZ_STATUS_ACTIVE = 1;
const CHAT_TYPE_GROUP = 2;
const GROUP_MEMBER_SORT_RANK = {
  [GROUP_MEMBER_TYPE.OWNER]: 0,
  [GROUP_MEMBER_TYPE.ADMIN]: 1,
  [GROUP_MEMBER_TYPE.NORMAL]: 2,
} as const;

export type ConversationLookup = {
  id: string;
  seatId: string;
};

export class WorkbenchRepository {
  constructor(private readonly db: Kysely<Database>) {}

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

  async listConversations(seatId: string) {
    const seatNumericId = parseMySqlId(seatId);

    if (seatNumericId == null) {
      return [];
    }

    const seat = await this.getSeatRecord(seatNumericId);

    if (!seat) {
      return [];
    }

    const rows = await this.db
      .selectFrom("xy_wap_embed_conversation as conversation")
      .leftJoin("xy_wap_embed_msg_audit_info as last_message", (join) =>
        join
          .onRef("last_message.id", "=", "conversation.last_audit_info_id")
          .onRef("last_message.uid", "=", "conversation.uid")
          .onRef("last_message.platform", "=", "conversation.platform"),
      )
      .leftJoin("xy_wap_embed_contact as contact", (join) =>
        join
          .onRef("contact.third_external_userid", "=", "conversation.third_external_userid")
          .onRef("contact.uid", "=", "conversation.uid")
          .onRef("contact.platform", "=", "conversation.platform"),
      )
      .leftJoin("xy_wap_embed_customer_bind_relation as bind", (join) =>
        join
          .onRef("bind.third_external_userid", "=", "conversation.third_external_userid")
          .onRef("bind.third_userid", "=", "conversation.third_userid")
          .onRef("bind.uid", "=", "conversation.uid")
          .onRef("bind.platform", "=", "conversation.platform"),
      )
      .select([
        "conversation.id as id",
        "conversation.chat_type as chat_type",
        "conversation.third_userid as third_userid",
        "conversation.third_external_userid as third_external_userid",
        "conversation.third_group_id as third_group_id",
        "conversation.unread_cnt as unread_cnt",
        "conversation.last_msgtime as last_msgtime",
        "conversation.pinned_time as pinned_time",
        "last_message.content as last_message_content",
        "last_message.msgtype as last_message_type",
        "contact.avatar as customer_avatar",
      ])
      .select((expressionBuilder) => [
        expressionBuilder.val(seatNumericId).as("seat_id"),
        expressionBuilder.val(null).as("group_avatar"),
        expressionBuilder.val(null).as("group_name"),
        expressionBuilder.fn
          .coalesce("bind.remark", "contact.real_name", "contact.name")
          .as("customer_name"),
      ])
      .where("conversation.uid", "=", seat.uid)
      .where("conversation.platform", "=", seat.platform)
      .where("conversation.third_userid", "=", seat.third_userid)
      .where("conversation.biz_status", "=", 1)
      .orderBy("conversation.pinned_time", "desc")
      .orderBy("conversation.last_msgtime", "desc")
      .execute();

    const conversationRows = rows.map((row) => row as ConversationRow);
    const groupsByThirdGroupId = await this.getConversationGroups(
      conversationRows,
      seat.uid,
      seat.platform,
    );

    return conversationRows.map((row) =>
      mapConversationRow({
        ...row,
        group_avatar:
          groupsByThirdGroupId.get(row.third_group_id)?.avatar ?? row.group_avatar,
        group_name: groupsByThirdGroupId.get(row.third_group_id)?.name ?? row.group_name,
      }),
    );
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
      .select(["conversation.id as id", "seat.id as seat_id"])
      .where("conversation.id", "=", conversationNumericId)
      .where("conversation.biz_status", "=", 1)
      .executeTakeFirst();

    return row
      ? {
          id: String(row.id),
          seatId: String(row.seat_id),
        }
      : undefined;
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
        "message.revoke_status as revoke_status",
      ])
      .select((expressionBuilder) => [
        expressionBuilder.val(conversation.conversation_id).as("conversation_id"),
        expressionBuilder.val(conversation.seat_id).as("seat_id"),
        expressionBuilder
          .val(conversation.conversation_external_id)
          .as("conversation_external_id"),
        expressionBuilder.val(conversation.conversation_group_id).as("conversation_group_id"),
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
    const visibleRows = rawRows.filter((row) => !isHiddenMessageRow(row));
    const messageRows = visibleRows.reverse();
    const hydrationSources = await this.getMessageHydrationSources(
      messageRows,
      conversation.uid,
      conversation.platform,
    );

    return {
      filteredCount: rawRows.length - visibleRows.length,
      hasMore: rows.length > options.limit,
      messages: hydrateMessageRows(messageRows, hydrationSources).map((row) =>
        mapMessageRow(row),
      ),
      nextBeforeSeq: rawRows.length > 0 ? toNumber(rawRows.at(-1)?.id) : undefined,
      scannedCount: rawRows.length,
    };
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

  private async getMessageHydrationSources(
    rows: MessageRow[],
    uid: number,
    platform: number,
  ): Promise<MessageHydrationSources> {
    const groupMemberIds = uniqueNonEmpty(
      rows
        .filter((row) => row.chat_type === 2)
        .map((row) => row.third_from_id || row.third_user_id),
    );
    const groupIds = uniqueNonEmpty(
      rows
        .filter((row) => row.chat_type === 2)
        .map((row) => row.third_group_id || row.conversation_group_id),
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
      groupMemberIds.length
        ? this.db
            .selectFrom("xy_wap_embed_group_member as member")
            .innerJoin("xy_wap_embed_group_seat as group_seat", (join) =>
              join
                .onRef("group_seat.id", "=", "member.group_seat_id")
                .onRef("group_seat.uid", "=", "member.uid")
                .onRef("group_seat.platform", "=", "member.platform"),
            )
            .select([
              "member.third_userid as third_userid",
              "member.avatar as avatar",
              "member.name as name",
              "member.nickname as nickname",
              "group_seat.third_group_id as third_group_id",
            ])
            .where("member.uid", "=", uid)
            .where("member.platform", "=", platform)
            .where("member.third_userid", "in", groupMemberIds)
            .where("member.biz_status", "=", 1)
            .where("group_seat.third_group_id", "in", groupIds)
            .where("group_seat.biz_status", "=", 1)
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
          getGroupMemberHydrationKey(member.third_group_id, member.third_userid),
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

function isHiddenMessageRow(row: MessageRow) {
  if (row.msgtype === "revoke") {
    return true;
  }

  if (row.msgtype !== "system") {
    return false;
  }

  return parseSystemMessageEventType(row.content) === "revoke";
}

function parseSystemMessageEventType(rawContent: string | null) {
  if (!rawContent) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(rawContent);
    return isRecord(parsed) && typeof parsed.type === "string" ? parsed.type : undefined;
  } catch {
    return undefined;
  }
}

function toNumber(value: number | string | null | undefined) {
  if (value == null) {
    return undefined;
  }

  const numberValue = typeof value === "number" ? value : Number(value);

  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function parseMySqlId(value: string) {
  if (!/^[1-9]\d*$/.test(value)) {
    return undefined;
  }

  const numeric = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    return undefined;
  }

  return numeric;
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
