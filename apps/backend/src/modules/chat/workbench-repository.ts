import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import {
  mapConversationRow,
  mapMessageRow,
  mapSeatRow,
  type ConversationRow,
  type MessageRow,
  type SeatRow,
} from "./workbench-mappers.js";

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
      .leftJoin("xy_wap_embed_group_seat as group_seat", (join) =>
        join
          .onRef("group_seat.third_group_id", "=", "conversation.third_group_id")
          .onRef("group_seat.third_userid", "=", "conversation.third_userid")
          .onRef("group_seat.uid", "=", "conversation.uid")
          .onRef("group_seat.platform", "=", "conversation.platform"),
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
        "group_seat.avatar as group_avatar",
        "group_seat.name as group_name",
      ])
      .select((expressionBuilder) => [
        expressionBuilder.val(seatNumericId).as("seat_id"),
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

    return rows.map((row) => mapConversationRow(row as ConversationRow));
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

  async listMessages(
    conversationId: string,
    options: {
      beforeSeq?: number;
      limit: number;
    },
  ) {
    const conversationNumericId = parseMySqlId(conversationId);

    if (conversationNumericId == null || options.limit <= 0) {
      return [];
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
      return [];
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
        "message.third_group_id as third_group_id",
        "message.content as content",
        "message.msgtype as msgtype",
        "message.msgtime as msgtime",
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
      .limit(options.limit)
      .execute();

    return rows.reverse().map((row) => mapMessageRow(row as MessageRow));
  }

  private async getSeatRecord(seatId: number) {
    return this.db
      .selectFrom("xy_wap_embed_user_seat")
      .select(["id", "uid", "platform", "third_userid"])
      .where("id", "=", seatId)
      .where("biz_status", "=", 1)
      .executeTakeFirst();
  }
}

function parseMySqlId(value: string) {
  const numeric = Number(value);

  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    return undefined;
  }

  return numeric;
}
