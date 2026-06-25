import {
  GROUP_MEMBER_TYPE,
  MATERIAL_COLLECTION_BIZ_TYPE,
  QUICK_REPLY_SCOPE_TYPE,
  type MaterialCollectionBizType,
  type QuickReplyScopeType,
  type WorkbenchGroupMemberDto,
  type WorkbenchGroupMembersResponse,
  type WorkbenchConversationCursorDto,
  type WorkbenchConversationListResponse,
  type WorkbenchHistoryMessagePageDto,
  type WorkbenchHistoryMessageQuery,
  type WorkbenchHistoryMessageScope,
  type WorkbenchMessageQueryBySeqsResponse,
  type WorkbenchMessagePageDto,
  type WorkbenchChatRecordDetailResponse,
  type WorkbenchMessageUpdateEventDto,
  type WorkbenchSeatDto,
  type WorkbenchCustomerListResponse,
  type WorkbenchCustomerLastConversationDto,
  type WorkbenchCustomerSeatRelationDto,
  type WorkbenchCustomerRelationConversationDto,
  type WorkbenchCustomerSummaryDto,
  type WorkbenchMaterialCollectionGroupDto,
  type WorkbenchMaterialCollectionItemDto,
  type WorkbenchQuickReplyCategoryDto,
  type WorkbenchQuickReplyDto,
  type WorkbenchSearchContactResultDto,
  type WorkbenchSearchGroupResultDto,
  type WorkbenchSearchResponseDto,
  type WorkbenchConversationSummaryDto,
  normalizeQuickReplyAttachments,
  type WorkbenchQuickReplyAttachment,
} from "@chatai/contracts";
import { sql, type Kysely } from "kysely";
import type { CachePort } from "../../cache/cache-port.js";
import { buildCacheKeys } from "../../cache/keys.js";
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
import {
  comparePositiveIdValues,
  uniquePositiveNumbers,
} from "../../shared/id-utils.js";
import {
  mapMaterialCollectionItem,
  type MaterialCollectionRow,
} from "./material-collection-mappers.js";
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
const DEFAULT_CUSTOMER_LIST_LIMIT = 50;
const MAX_CUSTOMER_LIST_LIMIT = 100;
const QUICK_REPLY_SORT_UPDATE_BATCH_SIZE = 500;
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
  thirdGroupName?: string;
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

export type SeatEventScope = {
  platform: number;
  seatIds: string[];
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

export type RevokeMessageLookup = {
  createdAt: number;
  isRevoked: boolean;
  senderType: "agent" | "customer" | "system";
  seq: number;
  status: "failed" | "sent";
};

export type SeatUpdateEventListResult = Array<
  {
    eventTime: number;
    seatId: string;
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
  bindRemarksByThirdExternalId: Map<string, string | null>;
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
    { avatar: string | null; bizStatus: number | null; name: string | null; remark: string | null }
  >;
  lastMessagesById: Map<string, { content: string | null; msgtype: string | null }>;
};

type SeatBaseRow = {
  avatar: string | null;
  biz_status: number | string | null;
  expire_time: number | string | null;
  host_sub_id: number | string | null;
  id: number | string;
  is_online: number | null;
  platform: number;
  third_user_name: string;
  third_userid: string;
  uid: number;
};

type SeatSummaryRow = SeatBaseRow & {
  last_message_time: Date | number | string | null;
  unread_count: number | string | null;
};

type SeatAggregateKeyRow = Pick<SeatBaseRow, "platform" | "third_userid" | "uid">;

type TenantScope = {
  platform: number;
  uid: number;
};

type SeatAccessSnapshot = {
  platform: number;
  seatIds: string[];
  uid: number;
  version: 1;
};

type SeatConversationAggregateRow = {
  last_msgtime: Date | number | string | null;
  platform: number;
  third_userid: string;
  unread_cnt: number | string | null;
  uid: number;
};

type CustomerListScope =
  | {
      cursor?: string;
      keyword?: string;
      limit?: number;
      platform?: number;
      scope: "all";
      uid?: number;
    }
  | {
      cursor?: string;
      keyword?: string;
      limit?: number;
      scope: "mine";
      seatIds?: string[];
      subUserId: string;
    };

type CustomerRow = {
  add_time: Date | number | string | null;
  avatar: string | null;
  bind_id: number | string;
  bind_status: number | null;
  bind_type: number | null;
  contact_status: number | null;
  description: string | null;
  gender: number | null;
  last_conversation_id: number | string | null;
  last_conversation_seat_avatar: string | null;
  last_conversation_seat_id: number | string | null;
  last_conversation_seat_name: string | null;
  last_message_time: Date | number | string | null;
  name: string | null;
  platform: number | string;
  real_name: string | null;
  seat_avatar: string | null;
  seat_id: number | string;
  seat_name: string | null;
  third_external_userid: string;
  third_userid: string;
  uid: number | string;
};

type CustomerContactPageRow = {
  avatar: string | null;
  biz_status: number | null;
  gender: number | null;
  name: string | null;
  platform: number | string;
  real_name: string | null;
  third_external_userid: string;
  uid: number | string;
  update_time: Date | string | number | null;
};

type CustomerLastMessageRow = {
  conversation_id: number | string | null;
  last_message_time: Date | number | string | null;
  platform: number | string;
  third_external_userid: string;
  third_userid: string;
  uid: number | string;
};

type CustomerLastConversationHydratedRow = CustomerLastMessageRow & {
  seat_avatar: string | null;
  seat_id: number | string | null;
  seat_name: string | null;
};

type CustomerRelationConversationRow = {
  last_message_time: Date | number | string | null;
  third_userid: string;
};

type CustomerListCursor = {
  thirdExternalUserId: string;
  updateTime: number;
};

type MineCustomerListCursor = {
  addTime: number;
  bindId: number;
};

type CustomerBindPageRow = {
  add_time: Date | number | string | null;
  bind_type: number | null;
  biz_status: number | null;
  description: string | null;
  id: number | string;
  platform: number | string;
  third_external_userid: string;
  third_userid: string;
  uid: number | string;
};

type CustomerSeatContext = {
  platform: number;
  seatId: string;
  seatAvatar: string;
  seatName: string;
  thirdUserId: string;
  uid: number;
};

type CustomerContactHydrationRow = {
  avatar: string | null;
  biz_status: number | null;
  gender: number | null;
  name: string | null;
  platform: number | string;
  real_name: string | null;
  third_external_userid: string;
  uid: number | string;
};

type CustomerSeatHydrationRow = {
  id: number | string;
  platform: number | string;
  third_avatar: string | null;
  third_user_name: string | null;
  third_userid: string;
  uid: number | string;
};

type ChatRecordDetailRow = {
  avatar: string | null;
  content: string | null;
  id: number | string;
  msgid: string;
  msgtime: Date | number | string;
  msgtype: string;
  name: string | null;
  status?: number | string | null;
};

type MaterialCollectionGroupRow = {
  biz_type: number;
  id: number | string;
  sort: number | string | null;
  title: string;
};

export type MaterialMessageLookup = {
  content: string | null;
  id: number | string;
  msgid: string;
  msgtime?: Date | number | string | null;
  msgtype: string;
  thirdUserId?: string;
  uid: number;
};

export type MaterialCollectionLookup = {
  bizStatus: number;
  id: string;
  item: WorkbenchMaterialCollectionItemDto;
};

export type MaterialCollectionScope = {
  bizType: number;
  subUid: number;
  thirdUserId?: string;
};

export type MaterialCollectionForwardLookup = {
  content: string;
  msgInfoId: string;
};

type QuickReplyCategoryRow = {
  id: number | bigint | string;
  parent_id: number | bigint | string;
  scope_type: number;
  sort: number | bigint | string;
  title: string;
};

type QuickReplyRow = {
  attachments: string | WorkbenchQuickReplyAttachment[] | null;
  category_id: number | bigint | string;
  content_text: string | null;
  create_time?: Date | string | number | null;
  id: number | bigint | string;
  label_color: string;
  label_text: string;
  scope_type: number;
  sort: number | bigint | string;
  update_time?: Date | string | number | null;
};

type QuickReplyCreateRowInput = {
  attachments: WorkbenchQuickReplyAttachment[];
  categoryId: string | 0;
  contentText: string;
  labelColor: string;
  labelText: string;
  sort: number;
};

type InsertResult = {
  id?: bigint | number | string | null;
  insertId?: bigint | number | string | null;
};

type UpdateResult = {
  affectedRows?: bigint | number;
  numAffectedRows?: bigint | number;
  numChangedRows?: bigint | number;
  numUpdatedRows?: bigint | number;
};

export class WorkbenchRepository {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly cache?: CachePort,
    private readonly cacheKeys: ReturnType<typeof buildCacheKeys> = buildCacheKeys("chatai:"),
  ) {}

  async listMaterialGroups(input: {
    bizType: number;
    subUserId: string;
    uid: number;
  }): Promise<WorkbenchMaterialCollectionGroupDto[]> {
    const rows = await this.db
      .selectFrom("xy_wap_embed_material_collection_group")
      .select(["id", "biz_type", "title", "sort"])
      .where("uid", "=", input.uid)
      .where("biz_type", "=", input.bizType)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .where("sub_uid", "in", getMaterialVisibleSubUids(input.bizType, input.subUserId))
      .orderBy("sort", "desc")
      .orderBy("id", "desc")
      .execute();

    return rows.map(mapMaterialCollectionGroupRow);
  }

  async countMaterialGroups(input: {
    bizType: number;
    subUserId: string;
    uid: number;
  }): Promise<number> {
    const result = await this.db
      .selectFrom("xy_wap_embed_material_collection_group")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("uid", "=", input.uid)
      .where("biz_type", "=", input.bizType)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .where("sub_uid", "in", getMaterialVisibleSubUids(input.bizType, input.subUserId))
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  }

  async listMaterialCollections(input: {
    bizType: number;
    groupId: string | 0;
    limit: number;
    offset: number;
    subUserId: string;
    thirdUserId?: string;
    uid: number;
  }): Promise<{ items: WorkbenchMaterialCollectionItemDto[]; total: number }> {
    const groupNumericId = parseMaterialGroupId(input.groupId);

    if (groupNumericId == null) {
      return {
        items: [],
        total: 0,
      };
    }

    const baseQuery = this.db
      .selectFrom("xy_wap_embed_material_collection")
      .where("uid", "=", input.uid)
      .where("biz_type", "=", input.bizType)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .where("sub_uid", "in", getMaterialVisibleSubUids(input.bizType, input.subUserId))
      .where("group_id", "=", groupNumericId);
    const scopedQuery = withMaterialCollectionThirdUserScope(
      baseQuery,
      input.bizType,
      input.thirdUserId,
    );
    const [rows, totalRow] = await Promise.all([
      scopedQuery
        .selectAll()
        .orderBy("sort", "desc")
        .orderBy("id", "desc")
        .limit(input.limit)
        .offset(input.offset)
        .execute(),
      scopedQuery
        .select((eb) => eb.fn.countAll().as("count"))
        .executeTakeFirst() as Promise<{ count: number | string | bigint } | undefined>,
    ]);

    return {
      items: rows.map((row) => mapMaterialCollectionItem(row as MaterialCollectionRow)),
      total: Number(totalRow?.count ?? 0),
    };
  }

  async findMaterialMessage(input: {
    msgInfoId: string;
    uid: number;
  }): Promise<MaterialMessageLookup | undefined> {
    const msgInfoNumericId = parseMySqlId(input.msgInfoId);

    if (msgInfoNumericId == null) {
      return undefined;
    }

    const row = await this.db
      .selectFrom("xy_wap_embed_msg_audit_info as message")
      .select([
        "message.id as id",
        "message.content as content",
        "message.msgid as msgid",
        "message.msgtime as msgtime",
        "message.msgtype as msgtype",
        "message.third_user_id as third_user_id",
        "message.uid as uid",
      ])
      .where("message.id", "=", msgInfoNumericId)
      .where("message.uid", "=", input.uid)
      .executeTakeFirst();

    if (!row) {
      return undefined;
    }

    return {
      content: row.content,
      id: row.id,
      msgid: row.msgid,
      msgtime: row.msgtime,
      msgtype: row.msgtype,
      thirdUserId: row.third_user_id ?? undefined,
      uid: row.uid,
    };
  }

  async findMaterialCollectionByMessage(input: {
    bizType: number;
    msgInfoId: string;
    subUid: number;
    thirdUserId?: string;
    uid: number;
  }): Promise<MaterialCollectionLookup | undefined> {
    const msgInfoNumericId = parseMySqlId(input.msgInfoId);

    if (msgInfoNumericId == null) {
      return undefined;
    }

    const query = this.db
      .selectFrom("xy_wap_embed_material_collection")
      .selectAll()
      .where("uid", "=", input.uid)
      .where("biz_type", "=", input.bizType)
      .where("sub_uid", "=", input.subUid)
      .where("msg_info_id", "=", msgInfoNumericId);
    const scopedQuery = withMaterialCollectionThirdUserScope(
      query,
      input.bizType,
      input.thirdUserId,
    );
    const row = await scopedQuery
      .executeTakeFirst();

    if (!row) {
      return undefined;
    }

    const materialRow = row as MaterialCollectionRow;

    return {
      bizStatus: toSafeNumber(materialRow.biz_status),
      id: String(materialRow.id),
      item: mapMaterialCollectionItem(materialRow),
    };
  }

  async findMaterialCollectionScope(input: {
    id: string;
    uid: number;
  }): Promise<MaterialCollectionScope | undefined> {
    const collectionNumericId = parseMySqlId(input.id);

    if (collectionNumericId == null) {
      return undefined;
    }

    const row = await this.db
      .selectFrom("xy_wap_embed_material_collection")
      .select(["biz_type", "sub_uid", "third_userid"])
      .where("id", "=", collectionNumericId)
      .where("uid", "=", input.uid)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .executeTakeFirst();

    if (!row) {
      return undefined;
    }

    return {
      bizType: toSafeNumber(row.biz_type),
      subUid: toSafeNumber(row.sub_uid),
      thirdUserId: row.third_userid ?? undefined,
    };
  }

  async findMaterialCollectionRecord(input: {
    id: string;
    subUid: number;
    uid: number;
  }): Promise<{ content: string; id: string } | undefined> {
    const collectionNumericId = parseMySqlId(input.id);

    if (collectionNumericId == null) {
      return undefined;
    }

    const row = await this.db
      .selectFrom("xy_wap_embed_material_collection")
      .select(["content", "id"])
      .where("id", "=", collectionNumericId)
      .where("uid", "=", input.uid)
      .where("sub_uid", "=", input.subUid)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .executeTakeFirst();

    if (!row) {
      return undefined;
    }

    return {
      content: typeof row.content === "string" ? row.content : "",
      id: String(row.id),
    };
  }

  async findMaterialCollectionForForward(input: {
    bizType: number;
    id: string;
    subUserId?: string;
    uid: number;
  }): Promise<MaterialCollectionForwardLookup | undefined> {
    const collectionNumericId = parseMySqlId(input.id);

    if (collectionNumericId == null) {
      return undefined;
    }

    const subUid =
      input.bizType === MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION
        ? parseMySqlId(input.subUserId ?? "")
        : 0;

    if (subUid == null) {
      return undefined;
    }

    const row = await this.db
      .selectFrom("xy_wap_embed_material_collection")
      .select(["content", "msg_info_id"])
      .where("id", "=", collectionNumericId)
      .where("uid", "=", input.uid)
      .where("biz_type", "=", input.bizType)
      .where("sub_uid", "=", subUid)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .executeTakeFirst();

    if (!row) {
      return undefined;
    }

    return {
      content: typeof row.content === "string" ? row.content : "",
      msgInfoId: String(row.msg_info_id),
    };
  }

  async updateMaterialCollectionContent(input: {
    content: string;
    id: string;
    subUid: number;
    title: string;
    uid: number;
  }) {
    await this.updateActiveMaterialCollection(input.id, input.uid, input.subUid, undefined, {
      content: input.content,
      title: input.title,
    });
  }

  async isMaterialGroupEmpty(input: {
    bizType: number;
    groupId: string;
    uid: number;
  }) {
    const groupNumericId = parseMySqlId(input.groupId);

    if (groupNumericId == null) {
      return true;
    }

    const row = await this.db
      .selectFrom("xy_wap_embed_material_collection")
      .select(["id"])
      .where("uid", "=", input.uid)
      .where("biz_type", "=", input.bizType)
      .where("group_id", "=", groupNumericId)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .executeTakeFirst();

    return !row;
  }

  async hasActiveMaterialGroup(input: {
    bizType: number;
    groupId: string;
    uid: number;
  }) {
    const groupNumericId = parseMySqlId(input.groupId);

    if (groupNumericId == null) {
      return false;
    }

    const row = await this.db
      .selectFrom("xy_wap_embed_material_collection_group")
      .select(["id"])
      .where("id", "=", groupNumericId)
      .where("uid", "=", input.uid)
      .where("biz_type", "=", input.bizType)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .where("sub_uid", "=", 0)
      .executeTakeFirst();

    return !!row;
  }

  async createMaterialCollection(input: {
    bizType: number;
    content: string | null;
    groupId: string | 0;
    msgInfoId: string;
    opSubUserId: string;
    sort: number;
    subUid: number;
    thirdUserId?: string;
    title: string;
    uid: number;
  }) {
    const groupNumericId = parseMaterialGroupId(input.groupId);
    const msgInfoNumericId = parseMySqlId(input.msgInfoId);
    const opSubUserNumericId = parseMySqlId(input.opSubUserId);

    if (
      groupNumericId == null ||
      msgInfoNumericId == null ||
      opSubUserNumericId == null
    ) {
      throw new BadRequestError(
        "INVALID_MATERIAL_COLLECTION_INPUT",
        "素材收录参数无效",
      );
    }

    let result: InsertResult;

    try {
      result = (await this.db
        .insertInto("xy_wap_embed_material_collection")
        .values({
          biz_status: BIZ_STATUS_ACTIVE,
          biz_type: input.bizType,
          content: input.content,
          group_id: groupNumericId,
          msg_info_id: msgInfoNumericId,
          op_sub_uid: opSubUserNumericId,
          sort: input.sort,
          sub_uid: input.subUid,
          ...(input.thirdUserId ? { third_userid: input.thirdUserId } : {}),
          title: input.title,
          uid: input.uid,
        })
        .executeTakeFirstOrThrow()) as InsertResult;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return "DUPLICATE";
      }

      throw error;
    }

    const insertedId = parseInsertedMySqlId(result);
    return insertedId == null ? undefined : String(insertedId);
  }

  async restoreMaterialCollection(input: {
    content: string | null;
    groupId: string | 0;
    id: string;
    msgInfoId: string;
    opSubUserId: string;
    sort: number;
    thirdUserId?: string;
    title: string;
    uid: number;
  }) {
    const collectionNumericId = parseMySqlId(input.id);
    const groupNumericId = parseMaterialGroupId(input.groupId);
    const msgInfoNumericId = parseMySqlId(input.msgInfoId);
    const opSubUserNumericId = parseMySqlId(input.opSubUserId);

    if (
      collectionNumericId == null ||
      groupNumericId == null ||
      msgInfoNumericId == null ||
      opSubUserNumericId == null
    ) {
      return;
    }

    await this.db
      .updateTable("xy_wap_embed_material_collection")
      .set({
        biz_status: BIZ_STATUS_ACTIVE,
        content: input.content,
        group_id: groupNumericId,
        msg_info_id: msgInfoNumericId,
        op_sub_uid: opSubUserNumericId,
        sort: input.sort,
        ...(input.thirdUserId ? { third_userid: input.thirdUserId } : {}),
        title: input.title,
      })
      .where("id", "=", collectionNumericId)
      .where("uid", "=", input.uid)
      .execute();
  }

  async deleteMaterialCollection(input: { id: string; subUid: number; thirdUserId?: string; uid: number }) {
    await this.updateActiveMaterialCollection(input.id, input.uid, input.subUid, input.thirdUserId, {
      biz_status: BIZ_STATUS_HIDDEN,
    });
  }

  async topMaterialCollection(input: { id: string; sort: number; subUid: number; thirdUserId?: string; uid: number }) {
    await this.updateActiveMaterialCollection(input.id, input.uid, input.subUid, input.thirdUserId, {
      sort: input.sort,
    });
  }

  async moveMaterialCollection(input: {
    groupId: string | 0;
    id: string;
    sort: number;
    subUid: number;
    thirdUserId?: string;
    uid: number;
  }) {
    const groupNumericId = parseMaterialGroupId(input.groupId);

    if (groupNumericId == null) {
      return;
    }

    await this.updateActiveMaterialCollection(input.id, input.uid, input.subUid, input.thirdUserId, {
      group_id: groupNumericId,
      sort: input.sort,
    });
  }

  async createMaterialGroup(input: {
    bizType: number;
    sort: number;
    subUid: number;
    title: string;
    uid: number;
  }) {
    const result = (await this.db
      .insertInto("xy_wap_embed_material_collection_group")
      .values({
        biz_status: BIZ_STATUS_ACTIVE,
        biz_type: input.bizType,
        sort: input.sort,
        sub_uid: input.subUid,
        title: input.title,
        uid: input.uid,
      })
      .executeTakeFirstOrThrow()) as InsertResult;

    const insertedId = parseInsertedMySqlId(result);
    return insertedId == null ? undefined : String(insertedId);
  }

  async renameMaterialGroup(input: { bizType: number; groupId: string; title: string; uid: number }) {
    await this.updateActiveMaterialGroup(input.groupId, input.uid, input.bizType, {
      title: input.title,
    });
  }

  async topMaterialGroup(input: { bizType: number; groupId: string; sort: number; uid: number }) {
    await this.updateActiveMaterialGroup(input.groupId, input.uid, input.bizType, {
      sort: input.sort,
    });
  }

  async deleteMaterialGroup(input: { bizType: number; groupId: string; uid: number }) {
    await this.updateActiveMaterialGroup(input.groupId, input.uid, input.bizType, {
      biz_status: BIZ_STATUS_HIDDEN,
    });
  }

  async listQuickReplyCategories(input: {
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }): Promise<WorkbenchQuickReplyCategoryDto[]> {
    const subUid = getQuickReplySubUid(input.scopeType, input.subUserId);

    if (subUid == null) {
      return [];
    }

    const rows = await this.db
      .selectFrom("xy_wap_embed_quick_reply_category")
      .select(["id", "parent_id", "scope_type", "sort", "title"])
      .where("uid", "=", input.uid)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .where("scope_type", "=", input.scopeType)
      .where("sub_uid", "=", subUid)
      .orderBy("sort", "desc")
      .orderBy("id", "desc")
      .execute();

    return rows.map((row) => mapQuickReplyCategoryRow(row as QuickReplyCategoryRow));
  }

  async listQuickReplies(input: {
    categoryId?: string | 0;
    keyword?: string;
    page: number;
    pageSize: number;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }): Promise<{ items: WorkbenchQuickReplyDto[]; total: number }> {
    const subUid = getQuickReplySubUid(input.scopeType, input.subUserId);

    if (subUid == null) {
      return {
        items: [],
        total: 0,
      };
    }

    let listQuery = this.db
      .selectFrom("xy_wap_embed_quick_reply")
      .selectAll()
      .where("uid", "=", input.uid)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .where("scope_type", "=", input.scopeType)
      .where("sub_uid", "=", subUid);
    let countQuery = this.db
      .selectFrom("xy_wap_embed_quick_reply")
      .select((eb) => eb.fn.countAll().as("count"))
      .where("uid", "=", input.uid)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .where("scope_type", "=", input.scopeType)
      .where("sub_uid", "=", subUid);

    if (input.categoryId !== undefined) {
      const categoryId = parseQuickReplyId(input.categoryId);

      if (categoryId == null) {
        return {
          items: [],
          total: 0,
        };
      }

      listQuery = listQuery.where("category_id", "=", categoryId);
      countQuery = countQuery.where("category_id", "=", categoryId);
    }

    if (input.keyword?.trim()) {
      const keyword = `%${input.keyword.trim()}%`;

      listQuery = listQuery.where((eb) =>
        eb.or([
          eb("content_text", "like", keyword),
          eb("label_text", "like", keyword),
        ]),
      );
      countQuery = countQuery.where((eb) =>
        eb.or([
          eb("content_text", "like", keyword),
          eb("label_text", "like", keyword),
        ]),
      );
    }

    const [rows, totalRow] = await Promise.all([
      listQuery
        .orderBy("sort", "desc")
        .orderBy("id", "desc")
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize)
        .execute(),
      countQuery.executeTakeFirst() as Promise<
        { count: number | string | bigint } | undefined
      >,
    ]);

    return {
      items: rows.map((row) => mapQuickReplyRow(row as QuickReplyRow)),
      total: Number(totalRow?.count ?? 0),
    };
  }

  async listQuickReplyCategoryContent(input: {
    categoryLimit: number;
    parentCategoryId: string;
    quickReplyLimit: number;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }): Promise<{
    categories: WorkbenchQuickReplyCategoryDto[];
    quickReplies: WorkbenchQuickReplyDto[];
    truncated: { categories: boolean; quickReplies: boolean };
  }> {
    const parentCategoryId = parseMySqlId(input.parentCategoryId);
    const subUid = getQuickReplySubUid(input.scopeType, input.subUserId);

    if (parentCategoryId == null || subUid == null) {
      return {
        categories: [],
        quickReplies: [],
        truncated: { categories: false, quickReplies: false },
      };
    }

    const categoryRows = await this.db
      .selectFrom("xy_wap_embed_quick_reply_category")
      .select(["id", "parent_id", "scope_type", "sort", "title"])
      .where("uid", "=", input.uid)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .where("scope_type", "=", input.scopeType)
      .where("sub_uid", "=", subUid)
      .where("parent_id", "=", parentCategoryId)
      .orderBy("sort", "desc")
      .orderBy("id", "desc")
      .limit(input.categoryLimit + 1)
      .execute();
    const categories = categoryRows
      .slice(0, input.categoryLimit)
      .map((row) => mapQuickReplyCategoryRow(row as QuickReplyCategoryRow));
    const categoryIds = categories
      .map((category) => parseMySqlId(category.id))
      .filter((id): id is number => id != null);

    if (categoryIds.length === 0) {
      return {
        categories,
        quickReplies: [],
        truncated: {
          categories: categoryRows.length > input.categoryLimit,
          quickReplies: false,
        },
      };
    }

    const quickReplyRows = await this.db
      .selectFrom("xy_wap_embed_quick_reply")
      .selectAll()
      .where("uid", "=", input.uid)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .where("scope_type", "=", input.scopeType)
      .where("sub_uid", "=", subUid)
      .where("category_id", "in", categoryIds)
      .orderBy("sort", "desc")
      .orderBy("id", "desc")
      .limit(input.quickReplyLimit + 1)
      .execute();

    return {
      categories,
      quickReplies: quickReplyRows
        .slice(0, input.quickReplyLimit)
        .map((row) => mapQuickReplyRow(row as QuickReplyRow)),
      truncated: {
        categories: categoryRows.length > input.categoryLimit,
        quickReplies: quickReplyRows.length > input.quickReplyLimit,
      },
    };
  }

  async createQuickReplyCategory(input: {
    opSubUserId: string;
    parentId: string | 0;
    scopeType: QuickReplyScopeType;
    sort: number;
    subUserId: string;
    title: string;
    uid: number;
  }) {
    const opSubUid = parseMySqlId(input.opSubUserId);
    const parentId = parseQuickReplyId(input.parentId);
    const subUid = getQuickReplySubUid(input.scopeType, input.subUserId);

    if (opSubUid == null || parentId == null || subUid == null) {
      throw new BadRequestError("INVALID_QUICK_REPLY_INPUT", "快捷话术参数无效");
    }

    const result = (await this.db
      .insertInto("xy_wap_embed_quick_reply_category")
      .values({
        biz_status: BIZ_STATUS_ACTIVE,
        op_sub_uid: opSubUid,
        parent_id: parentId,
        scope_type: input.scopeType,
        sort: input.sort,
        sub_uid: subUid,
        title: input.title,
        uid: input.uid,
      })
      .executeTakeFirstOrThrow()) as InsertResult;

    const insertedId = parseInsertedMySqlId(result);
    return insertedId == null ? undefined : String(insertedId);
  }

  async createQuickReply(input: {
    attachments: WorkbenchQuickReplyAttachment[];
    categoryId: string | 0;
    contentText: string;
    labelColor: string;
    labelText: string;
    opSubUserId: string;
    scopeType: QuickReplyScopeType;
    sort: number;
    subUserId: string;
    uid: number;
  }) {
    const categoryId = parseQuickReplyId(input.categoryId);
    const opSubUid = parseMySqlId(input.opSubUserId);
    const subUid = getQuickReplySubUid(input.scopeType, input.subUserId);

    if (categoryId == null || opSubUid == null || subUid == null) {
      throw new BadRequestError("INVALID_QUICK_REPLY_INPUT", "快捷话术参数无效");
    }

    const result = (await this.db
      .insertInto("xy_wap_embed_quick_reply")
      .values({
        attachments: JSON.stringify(input.attachments),
        biz_status: BIZ_STATUS_ACTIVE,
        category_id: categoryId,
        content_text: input.contentText,
        label_color: input.labelColor,
        label_text: input.labelText,
        op_sub_uid: opSubUid,
        scope_type: input.scopeType,
        sort: input.sort,
        sub_uid: subUid,
        uid: input.uid,
      })
      .executeTakeFirstOrThrow()) as InsertResult;

    const insertedId = parseInsertedMySqlId(result);
    return insertedId == null ? undefined : String(insertedId);
  }

  async batchCreateQuickReplies(input: {
    items: QuickReplyCreateRowInput[];
    opSubUserId: string;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    if (input.items.length === 0) {
      return;
    }

    const opSubUid = parseMySqlId(input.opSubUserId);
    const subUid = getQuickReplySubUid(input.scopeType, input.subUserId);

    if (opSubUid == null || subUid == null) {
      throw new BadRequestError("INVALID_QUICK_REPLY_INPUT", "快捷话术参数无效");
    }

    const values = input.items.map((item) => {
      const categoryId = parseQuickReplyId(item.categoryId);

      if (categoryId == null) {
        throw new BadRequestError("INVALID_QUICK_REPLY_INPUT", "快捷话术参数无效");
      }

      return {
        attachments: JSON.stringify(item.attachments),
        biz_status: BIZ_STATUS_ACTIVE,
        category_id: categoryId,
        content_text: item.contentText,
        label_color: item.labelColor,
        label_text: item.labelText,
        op_sub_uid: opSubUid,
        scope_type: input.scopeType,
        sort: item.sort,
        sub_uid: subUid,
        uid: input.uid,
      };
    });

    await this.db.insertInto("xy_wap_embed_quick_reply").values(values).execute();
  }

  async findQuickReplyCategoryScope(input: {
    categoryId: string;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }): Promise<{ parentId: string | 0 } | undefined> {
    const categoryId = parseMySqlId(input.categoryId);
    const subUid = getQuickReplySubUid(input.scopeType, input.subUserId);

    if (categoryId == null || subUid == null) {
      return undefined;
    }

    const row = await this.db
      .selectFrom("xy_wap_embed_quick_reply_category")
      .select(["parent_id"])
      .where("id", "=", categoryId)
      .where("uid", "=", input.uid)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .where("scope_type", "=", input.scopeType)
      .where("sub_uid", "=", subUid)
      .executeTakeFirst();

    if (!row) {
      return undefined;
    }

    const parentId = toSafeNumber(String(row.parent_id));
    return {
      parentId: parentId === 0 ? 0 : String(row.parent_id),
    };
  }

  async findQuickReplyScope(input: {
    quickReplyId: string;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }): Promise<{ categoryId: string | 0 } | undefined> {
    const quickReplyId = parseMySqlId(input.quickReplyId);
    const subUid = getQuickReplySubUid(input.scopeType, input.subUserId);

    if (quickReplyId == null || subUid == null) {
      return undefined;
    }

    const row = await this.db
      .selectFrom("xy_wap_embed_quick_reply")
      .select(["category_id"])
      .where("id", "=", quickReplyId)
      .where("uid", "=", input.uid)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .where("scope_type", "=", input.scopeType)
      .where("sub_uid", "=", subUid)
      .executeTakeFirst();

    if (!row) {
      return undefined;
    }

    const categoryId = toSafeNumber(String(row.category_id));
    return {
      categoryId: categoryId === 0 ? 0 : String(row.category_id),
    };
  }

  async findQuickReplyCategorySortBoundary(input: {
    boundary: "max" | "min";
    parentId: string | 0;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }): Promise<number | undefined> {
    const parentId = parseQuickReplyId(input.parentId);
    const subUid = getQuickReplySubUid(input.scopeType, input.subUserId);

    if (parentId == null || subUid == null) {
      return undefined;
    }

    const row = await this.db
      .selectFrom("xy_wap_embed_quick_reply_category")
      .select(["sort"])
      .where("uid", "=", input.uid)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .where("scope_type", "=", input.scopeType)
      .where("sub_uid", "=", subUid)
      .where("parent_id", "=", parentId)
      .orderBy("sort", input.boundary === "max" ? "desc" : "asc")
      .limit(1)
      .executeTakeFirst();

    return row ? toSafeNumber(String(row.sort)) : undefined;
  }

  async listActiveQuickReplyCategoryIds(input: {
    parentId: string | 0;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    return (await this.listActiveQuickReplyCategorySortItems(input)).map(
      (item) => item.id,
    );
  }

  async listActiveQuickReplyCategorySortItems(input: {
    parentId: string | 0;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    const parentId = parseQuickReplyId(input.parentId);
    const subUid = getQuickReplySubUid(input.scopeType, input.subUserId);

    if (parentId == null || subUid == null) {
      return [];
    }

    const rows = await this.db
      .selectFrom("xy_wap_embed_quick_reply_category")
      .select(["id", "sort"])
      .where("uid", "=", input.uid)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .where("scope_type", "=", input.scopeType)
      .where("sub_uid", "=", subUid)
      .where("parent_id", "=", parentId)
      .orderBy("sort", "desc")
      .orderBy("id", "desc")
      .execute();

    return rows.map((row) => ({
      id: String(row.id),
      sort: toSafeNumber(String(row.sort)) ?? 0,
    }));
  }

  async findQuickReplySortBoundary(input: {
    boundary: "max" | "min";
    categoryId: string | 0;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }): Promise<number | undefined> {
    const categoryId = parseQuickReplyId(input.categoryId);
    const subUid = getQuickReplySubUid(input.scopeType, input.subUserId);

    if (categoryId == null || subUid == null) {
      return undefined;
    }

    const row = await this.db
      .selectFrom("xy_wap_embed_quick_reply")
      .select(["sort"])
      .where("uid", "=", input.uid)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .where("scope_type", "=", input.scopeType)
      .where("sub_uid", "=", subUid)
      .where("category_id", "=", categoryId)
      .orderBy("sort", input.boundary === "max" ? "desc" : "asc")
      .limit(1)
      .executeTakeFirst();

    return row ? toSafeNumber(String(row.sort)) : undefined;
  }

  async listActiveQuickReplyIds(input: {
    categoryId: string | 0;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    return (await this.listActiveQuickReplySortItems(input)).map((item) => item.id);
  }

  async listActiveQuickReplySortItems(input: {
    categoryId: string | 0;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    const categoryId = parseQuickReplyId(input.categoryId);
    const subUid = getQuickReplySubUid(input.scopeType, input.subUserId);

    if (categoryId == null || subUid == null) {
      return [];
    }

    const rows = await this.db
      .selectFrom("xy_wap_embed_quick_reply")
      .select(["id", "sort"])
      .where("uid", "=", input.uid)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .where("scope_type", "=", input.scopeType)
      .where("sub_uid", "=", subUid)
      .where("category_id", "=", categoryId)
      .orderBy("sort", "desc")
      .orderBy("id", "desc")
      .execute();

    return rows.map((row) => ({
      id: String(row.id),
      sort: toSafeNumber(String(row.sort)) ?? 0,
    }));
  }

  async hasActiveQuickReplyCategory(input: {
    categoryId: string;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    const categoryId = parseMySqlId(input.categoryId);
    const subUid = getQuickReplySubUid(input.scopeType, input.subUserId);

    if (categoryId == null || subUid == null) {
      return false;
    }

    const row = await this.db
      .selectFrom("xy_wap_embed_quick_reply_category")
      .select(["id"])
      .where("id", "=", categoryId)
      .where("uid", "=", input.uid)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .where("scope_type", "=", input.scopeType)
      .where("sub_uid", "=", subUid)
      .executeTakeFirst();

    return !!row;
  }

  async isChildQuickReplyCategory(input: {
    categoryId: string;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    const categoryId = parseMySqlId(input.categoryId);
    const subUid = getQuickReplySubUid(input.scopeType, input.subUserId);

    if (categoryId == null || subUid == null) {
      return false;
    }

    const row = await this.db
      .selectFrom("xy_wap_embed_quick_reply_category")
      .select(["parent_id"])
      .where("id", "=", categoryId)
      .where("uid", "=", input.uid)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .where("scope_type", "=", input.scopeType)
      .where("sub_uid", "=", subUid)
      .executeTakeFirst();

    return Number(row?.parent_id ?? 0) !== 0;
  }

  async countChildQuickReplyCategories(input: {
    categoryId: string;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    const categoryId = parseMySqlId(input.categoryId);
    const subUid = getQuickReplySubUid(input.scopeType, input.subUserId);

    if (categoryId == null || subUid == null) {
      return 0;
    }

    const row = await this.db
      .selectFrom("xy_wap_embed_quick_reply_category")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("uid", "=", input.uid)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .where("scope_type", "=", input.scopeType)
      .where("sub_uid", "=", subUid)
      .where("parent_id", "=", categoryId)
      .executeTakeFirst();

    return Number(row?.count ?? 0);
  }

  async countQuickRepliesInCategory(input: {
    categoryId: string;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    const categoryId = parseMySqlId(input.categoryId);
    const subUid = getQuickReplySubUid(input.scopeType, input.subUserId);

    if (categoryId == null || subUid == null) {
      return 0;
    }

    const row = await this.db
      .selectFrom("xy_wap_embed_quick_reply")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("uid", "=", input.uid)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .where("scope_type", "=", input.scopeType)
      .where("sub_uid", "=", subUid)
      .where("category_id", "=", categoryId)
      .executeTakeFirst();

    return Number(row?.count ?? 0);
  }

  async countQuickRepliesUnderTopCategory(input: {
    categoryId: string | 0;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    const categoryId = parseQuickReplyId(input.categoryId);
    const subUid = getQuickReplySubUid(input.scopeType, input.subUserId);

    if (categoryId == null || subUid == null) {
      return 0;
    }

    const childRows = await this.db
      .selectFrom("xy_wap_embed_quick_reply_category")
      .select(["id"])
      .where("uid", "=", input.uid)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .where("scope_type", "=", input.scopeType)
      .where("sub_uid", "=", subUid)
      .where("parent_id", "=", categoryId)
      .execute();
    const childIds = childRows
      .map((row) => toSafeNumber(String(row.id)))
      .filter((id): id is number => id != null);

    if (childIds.length === 0) {
      return 0;
    }

    const row = await this.db
      .selectFrom("xy_wap_embed_quick_reply")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("uid", "=", input.uid)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .where("scope_type", "=", input.scopeType)
      .where("sub_uid", "=", subUid)
      .where("category_id", "in", childIds)
      .executeTakeFirst();

    return Number(row?.count ?? 0);
  }

  async updateQuickReply(input: {
    attachments: WorkbenchQuickReplyAttachment[];
    categoryId: string | 0;
    contentText: string;
    labelColor: string;
    labelText: string;
    quickReplyId: string;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    return this.updateActiveQuickReply(input.quickReplyId, input, {
      attachments: JSON.stringify(input.attachments),
      category_id: parseQuickReplyId(input.categoryId),
      content_text: input.contentText,
      label_color: input.labelColor,
      label_text: input.labelText,
    });
  }

  async moveQuickReplyCategory(input: {
    categoryId: string;
    parentId: string;
    scopeType: QuickReplyScopeType;
    sort: number;
    subUserId: string;
    uid: number;
  }) {
    return this.updateActiveQuickReplyCategory(input.categoryId, input, {
      parent_id: parseQuickReplyId(input.parentId),
      sort: input.sort,
    });
  }

  async sortQuickReplyCategories(input: {
    items: Array<{ categoryId: string; sort: number }>;
    parentId: string;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    const subUid = getQuickReplySubUid(input.scopeType, input.subUserId);
    const parentId = parseQuickReplyId(input.parentId);

    if (subUid == null || parentId == null) {
      return false;
    }

    const affectedRows = await updateSortInBatches({
      batchSize: QUICK_REPLY_SORT_UPDATE_BATCH_SIZE,
      idKey: "categoryId",
      items: input.items,
      runBatch: async (items) => {
        const ids = items
          .map((item) => parseMySqlId(item.categoryId))
          .filter((id): id is number => id != null);

        if (ids.length !== items.length) {
          return 0;
        }

        const result = (await this.db
          .updateTable("xy_wap_embed_quick_reply_category")
          .set({ sort: buildSortCaseExpression(items, "categoryId") })
          .where("uid", "=", input.uid)
          .where("biz_status", "=", BIZ_STATUS_ACTIVE)
          .where("scope_type", "=", input.scopeType)
          .where("sub_uid", "=", subUid)
          .where("parent_id", "=", parentId)
          .where("id", "in", ids)
          .execute()) as UpdateResult[];

        return getAffectedRows(result);
      },
    });

    return affectedRows === input.items.length;
  }

  async moveQuickReply(input: {
    categoryId: string;
    quickReplyId: string;
    scopeType: QuickReplyScopeType;
    sort: number;
    subUserId: string;
    uid: number;
  }) {
    return this.updateActiveQuickReply(input.quickReplyId, input, {
      category_id: parseQuickReplyId(input.categoryId),
      sort: input.sort,
    });
  }

  async sortQuickReplies(input: {
    categoryId: string;
    items: Array<{ quickReplyId: string; sort: number }>;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    const subUid = getQuickReplySubUid(input.scopeType, input.subUserId);
    const categoryId = parseQuickReplyId(input.categoryId);

    if (subUid == null || categoryId == null) {
      return false;
    }

    const affectedRows = await updateSortInBatches({
      batchSize: QUICK_REPLY_SORT_UPDATE_BATCH_SIZE,
      idKey: "quickReplyId",
      items: input.items,
      runBatch: async (items) => {
        const ids = items
          .map((item) => parseMySqlId(item.quickReplyId))
          .filter((id): id is number => id != null);

        if (ids.length !== items.length) {
          return 0;
        }

        const result = (await this.db
          .updateTable("xy_wap_embed_quick_reply")
          .set({ sort: buildSortCaseExpression(items, "quickReplyId") })
          .where("uid", "=", input.uid)
          .where("biz_status", "=", BIZ_STATUS_ACTIVE)
          .where("scope_type", "=", input.scopeType)
          .where("sub_uid", "=", subUid)
          .where("category_id", "=", categoryId)
          .where("id", "in", ids)
          .execute()) as UpdateResult[];

        return getAffectedRows(result);
      },
    });

    return affectedRows === input.items.length;
  }

  async topQuickReply(input: {
    quickReplyId: string;
    scopeType: QuickReplyScopeType;
    sort: number;
    subUserId: string;
    uid: number;
  }) {
    return this.updateActiveQuickReply(input.quickReplyId, input, {
      sort: input.sort,
    });
  }

  async bottomQuickReply(input: {
    quickReplyId: string;
    scopeType: QuickReplyScopeType;
    sort: number;
    subUserId: string;
    uid: number;
  }) {
    return this.updateActiveQuickReply(input.quickReplyId, input, {
      sort: input.sort,
    });
  }

  async deleteQuickReply(input: {
    quickReplyId: string;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    return this.updateActiveQuickReply(input.quickReplyId, input, {
      biz_status: BIZ_STATUS_HIDDEN,
    });
  }

  async renameQuickReplyCategory(input: {
    categoryId: string;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    title: string;
    uid: number;
  }) {
    return this.updateActiveQuickReplyCategory(input.categoryId, input, {
      title: input.title,
    });
  }

  async topQuickReplyCategory(input: {
    categoryId: string;
    scopeType: QuickReplyScopeType;
    sort: number;
    subUserId: string;
    uid: number;
  }) {
    return this.updateActiveQuickReplyCategory(input.categoryId, input, {
      sort: input.sort,
    });
  }

  async bottomQuickReplyCategory(input: {
    categoryId: string;
    scopeType: QuickReplyScopeType;
    sort: number;
    subUserId: string;
    uid: number;
  }) {
    return this.updateActiveQuickReplyCategory(input.categoryId, input, {
      sort: input.sort,
    });
  }

  async deleteQuickReplyCategory(input: {
    categoryId: string;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    return this.updateActiveQuickReplyCategory(input.categoryId, input, {
      biz_status: BIZ_STATUS_HIDDEN,
    });
  }

  private async updateActiveMaterialCollection(
    id: string,
    uid: number,
    subUid: number,
    thirdUserId: string | undefined,
    values: Record<string, unknown>,
  ) {
    const collectionNumericId = parseMySqlId(id);

    if (collectionNumericId == null) {
      return;
    }

    const query = this.db
      .updateTable("xy_wap_embed_material_collection")
      .set(values)
      .where("id", "=", collectionNumericId)
      .where("uid", "=", uid)
      .where("sub_uid", "=", subUid)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE);
    const scopedQuery = thirdUserId ? query.where("third_userid", "=", thirdUserId) : query;

    await scopedQuery
      .execute();
  }

  private async updateActiveMaterialGroup(
    groupId: string,
    uid: number,
    bizType: number,
    values: Record<string, unknown>,
  ) {
    const groupNumericId = parseMySqlId(groupId);

    if (groupNumericId == null) {
      return;
    }

    await this.db
      .updateTable("xy_wap_embed_material_collection_group")
      .set(values)
      .where("id", "=", groupNumericId)
      .where("uid", "=", uid)
      .where("biz_type", "=", bizType)
      .where("sub_uid", "=", 0)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .execute();
  }

  private async updateActiveQuickReply(
    quickReplyId: string,
    scope: {
      scopeType: QuickReplyScopeType;
      subUserId: string;
      uid: number;
    },
    values: Record<string, unknown>,
  ) {
    const quickReplyNumericId = parseMySqlId(quickReplyId);
    const subUid = getQuickReplySubUid(scope.scopeType, scope.subUserId);

    if (quickReplyNumericId == null || subUid == null) {
      return false;
    }

    const result = (await this.db
      .updateTable("xy_wap_embed_quick_reply")
      .set(values)
      .where("id", "=", quickReplyNumericId)
      .where("uid", "=", scope.uid)
      .where("scope_type", "=", scope.scopeType)
      .where("sub_uid", "=", subUid)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .execute()) as UpdateResult[];

    return getAffectedRows(result) > 0;
  }

  private async updateActiveQuickReplyCategory(
    categoryId: string,
    scope: {
      scopeType: QuickReplyScopeType;
      subUserId: string;
      uid: number;
    },
    values: Record<string, unknown>,
  ) {
    const categoryNumericId = parseMySqlId(categoryId);
    const subUid = getQuickReplySubUid(scope.scopeType, scope.subUserId);

    if (categoryNumericId == null || subUid == null) {
      return false;
    }

    const result = (await this.db
      .updateTable("xy_wap_embed_quick_reply_category")
      .set(values)
      .where("id", "=", categoryNumericId)
      .where("uid", "=", scope.uid)
      .where("scope_type", "=", scope.scopeType)
      .where("sub_uid", "=", subUid)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .execute()) as UpdateResult[];

    return getAffectedRows(result) > 0;
  }

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
      .select(["id", "name", "platform", "uid"])
      .where("id", "=", subUserNumericId)
      .where("status", "=", 1)
      .executeTakeFirst();

    if (!subUser) {
      return undefined;
    }

    return {
      displayName: subUser.name,
      platform: subUser.platform,
      subUserId: String(subUser.id),
      uid: subUser.uid,
    };
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

  async getMessageRawContent(input: {
    auditId: number;
    platform: number;
    thirdExternalUserId?: string;
    thirdGroupId?: string;
    thirdUserId: string;
    uid: number;
  }) {
    if (!Number.isInteger(input.auditId) || input.auditId <= 0) {
      return undefined;
    }

    let query = this.db
      .selectFrom("xy_wap_embed_msg_audit_info")
      .select(["content"])
      .where("id", "=", input.auditId)
      .where("uid", "=", input.uid)
      .where("platform", "=", input.platform)
      .where("third_user_id", "=", input.thirdUserId);

    if (input.thirdGroupId) {
      query = query.where("third_group_id", "=", input.thirdGroupId);
    } else if (input.thirdExternalUserId) {
      query = query.where("third_external_id", "=", input.thirdExternalUserId);
    } else {
      return undefined;
    }

    const row = await query.executeTakeFirst();

    return row?.content ?? undefined;
  }

  async getMessageForRevoke(input: {
    conversationId: string;
    messageSeq: number;
    platform: number;
    thirdExternalUserId?: string;
    thirdGroupId?: string;
    thirdUserId: string;
    uid: number;
  }): Promise<RevokeMessageLookup | undefined> {
    if (!Number.isSafeInteger(input.messageSeq) || input.messageSeq <= 0) {
      return undefined;
    }

    let query = this.db
      .selectFrom("xy_wap_embed_msg_audit_info as message")
      .select([
        "message.id as id",
        "message.chat_type as chat_type",
        "message.from_type as from_type",
        "message.msgtime as msgtime",
        "message.revoke_status as revoke_status",
        "message.status as status",
        "message.third_from_id as third_from_id",
        "message.third_user_id as third_user_id",
      ])
      .where("message.uid", "=", input.uid)
      .where("message.platform", "=", input.platform)
      .where("message.third_user_id", "=", input.thirdUserId);

    if (input.thirdGroupId) {
      query = query.where("message.third_group_id", "=", input.thirdGroupId);
    } else if (input.thirdExternalUserId) {
      query = query.where("message.third_external_id", "=", input.thirdExternalUserId);
    } else {
      return undefined;
    }

    query = query.where("message.id", "=", input.messageSeq);

    const row = await query.executeTakeFirst();

    if (!row) {
      return undefined;
    }

    const chatType = toNumber(row.chat_type) ?? 0;
    const seq = toNumber(row.id);

    if (seq == null) {
      return undefined;
    }

    return {
      createdAt: toTimestamp(row.msgtime),
      isRevoked: toNumber(row.revoke_status) === 1,
      senderType: mapRevokeSenderType({
        chatType,
        fromType: toNumber(row.from_type) ?? null,
        thirdFromId: row.third_from_id ?? undefined,
        thirdUserId: row.third_user_id ?? undefined,
      }),
      seq,
      status: toNumber(row.status) === 0 ? "failed" : "sent",
    };
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

    // message.update 低频，轮询 cursor 只按 create_time 推进，接受同秒事件超出 limit 时的边界取舍。
    const rows = await query
      .orderBy("event.create_time", "asc")
      .orderBy("event.id", "asc")
      .limit(options.limit)
      .execute();
    return rows
      .map((row) => {
        const event = parseMessageUpdateEvent(String(row.content ?? ""));

        if (!event?.messageSeq) {
          return undefined;
        }

        return {
          conversationId,
          eventId: Number(row.event_id),
          eventTime: toTimestamp(row.create_time),
          messageSeq: event.messageSeq,
        };
      })
      .filter(
        (event): event is WorkbenchMessageUpdateEventDto & { eventTime: number } =>
          Boolean(event),
      );
  }

  async listSeatUpdateEvents(
    input: {
      afterCreateTime?: number;
      limit: number;
      platform: number;
      seatIds: string[];
      uid: number;
    },
  ): Promise<SeatUpdateEventListResult> {
    const seatIds = uniqueIds(input.seatIds);

    if (!seatIds.length || input.limit <= 0) {
      return [];
    }

    let query = this.db
      .selectFrom("xy_wap_embed_broadcast_event as event")
      .select([
        "event.category_bind_id as category_bind_id",
        "event.create_time as create_time",
      ])
      .where("event.uid", "=", input.uid)
      .where("event.platform", "=", input.platform)
      .where("event.category", "=", "user-seat")
      .where("event.category_bind_id", "in", seatIds)
      .where("event.event", "=", "user-seat.update");

    if (input.afterCreateTime != null) {
      query = query.where(
        "event.create_time",
        ">",
        new Date(Math.max(0, input.afterCreateTime)),
      );
    }

    // user-seat.update 低频，轮询 cursor 只按 create_time 推进，接受同秒事件超出 limit 时的边界取舍。
    const rows = await query
      .orderBy("event.create_time", "asc")
      .orderBy("event.id", "asc")
      .limit(input.limit)
      .execute();

    return rows
      .map((row) => {
        const nextSeatId = String(row.category_bind_id ?? "").trim();

        if (!nextSeatId) {
          return undefined;
        }

        return {
          eventTime: toTimestamp(row.create_time),
          seatId: nextSeatId,
        };
      })
      .filter(
        (event): event is { eventTime: number; seatId: string } => Boolean(event),
      );
  }

  async getSeatEventScope(subUserId: string): Promise<SeatEventScope | undefined> {
    const subUserNumericId = parseMySqlId(subUserId);

    if (subUserNumericId == null) {
      return undefined;
    }

    const snapshot = await this.getSeatAccessSnapshot(subUserNumericId);

    if (!snapshot) {
      return undefined;
    }

    return {
      platform: snapshot.platform,
      seatIds: snapshot.seatIds,
      uid: snapshot.uid,
    };
  }

  async listMessagesBySeqs(
    conversationId: string,
    messageSeqs: number[],
  ): Promise<WorkbenchMessageQueryBySeqsResponse> {
    const conversationNumericId = parseMySqlId(conversationId);
    const normalizedSeqs = uniquePositiveNumbers(
      messageSeqs.filter((value) => Number.isSafeInteger(value) && value > 0),
    );

    if (conversationNumericId == null || !normalizedSeqs.length) {
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
        "message.status as status",
      ])
      .where("message.uid", "=", conversation.uid)
      .where("message.platform", "=", conversation.platform)
      .where("message.third_user_id", "=", conversation.third_userid)
      .where("message.id", "in", normalizedSeqs);

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

  async getChatRecordDetail(
    uid: number,
    platform: number,
    conversationId: string,
    messageSeq: number,
  ): Promise<WorkbenchChatRecordDetailResponse | undefined> {
    const conversationNumericId = parseMySqlId(conversationId);

    if (conversationNumericId == null) {
      return undefined;
    }

    const conversation = await this.db
      .selectFrom("xy_wap_embed_conversation as conversation")
      .select([
        "conversation.id as conversation_id",
        "conversation.chat_type as chat_type",
        "conversation.third_external_userid as conversation_external_id",
        "conversation.third_group_id as conversation_group_id",
        "conversation.third_userid as third_userid",
        "conversation.platform as platform",
        "conversation.uid as uid",
      ])
      .where("conversation.uid", "=", uid)
      .where("conversation.platform", "=", platform)
      .where("conversation.id", "=", conversationNumericId)
      .where("conversation.biz_status", "=", 1)
      .executeTakeFirst();

    if (!conversation) {
      return undefined;
    }

    let parentQuery = this.db
      .selectFrom("xy_wap_embed_msg_audit_info as message")
      .select([
        "message.id as id",
        "message.msgid as msgid",
        "message.msgtype as msgtype",
      ])
      .where("message.uid", "=", conversation.uid)
      .where("message.platform", "=", conversation.platform)
      .where("message.third_user_id", "=", conversation.third_userid)
      .where("message.id", "=", messageSeq);

    if (conversation.chat_type === CHAT_TYPE_GROUP) {
      parentQuery = parentQuery.where(
        "message.third_group_id",
        "=",
        conversation.conversation_group_id,
      );
    } else {
      parentQuery = parentQuery.where(
        "message.third_external_id",
        "=",
        conversation.conversation_external_id,
      );
    }

    const parentMessage = await parentQuery.executeTakeFirst();

    if (!parentMessage || parentMessage.msgtype !== "chatrecord") {
      return undefined;
    }

    const detailRows = await this.db
      .selectFrom("xy_wap_embed_msg_audit_chat_record as record")
      .select([
        "record.id as id",
        "record.msgid as msgid",
        "record.msg_info_id as msg_info_id",
        "record.name as name",
        "record.avatar as avatar",
        "record.content as content",
        "record.msgtype as msgtype",
        "record.msgtime as msgtime",
        "record.status as status",
      ])
      .where("record.msg_info_id", "=", messageSeq)
      .where("record.uid", "=", conversation.uid)
      .where("record.platform", "=", conversation.platform)
      .orderBy("record.msgtime", "asc")
      .orderBy("record.id", "asc")
      .execute() as ChatRecordDetailRow[];

    return {
      messageSeq,
      messages: detailRows.map((row) =>
        mapMessageRow({
          chat_type: conversation.chat_type,
          content: row.content,
          conversation_external_id: conversation.conversation_external_id,
          conversation_group_id: conversation.conversation_group_id,
          conversation_id: conversation.conversation_id,
          from_type: 2,
          id: row.id,
          msgid: `chatrecord:${messageSeq}:${row.id}`,
          msgtime: row.msgtime,
          msgtype: row.msgtype,
          opt_no: null,
          seat_id: 0,
          sender_avatar: row.avatar ?? "",
          sender_name: row.name ?? "",
          status: 1,
          third_external_id: conversation.conversation_external_id,
          third_from_id: row.name ?? "",
          third_group_id: conversation.conversation_group_id,
          third_user_id: conversation.third_userid,
        }),
      ),
    };
  }

  async listSeats(subUserId: string) {
    const subUserNumericId = parseMySqlId(subUserId);

    if (subUserNumericId == null) {
      return [];
    }

    const scope = await this.getSubUserTenantScope(subUserNumericId);

    if (!scope) {
      return [];
    }

    const seats = await this.db
      .selectFrom("xy_wap_embed_user_seat_sub_relation as relation")
      .innerJoin("xy_wap_embed_user_seat as seat", (join) =>
        join
          .onRef("seat.id", "=", "relation.user_seat_id")
          .onRef("seat.uid", "=", "relation.uid")
          .onRef("seat.platform", "=", "relation.platform"),
      )
      .select([
        "seat.id as id",
        "seat.uid as uid",
        "seat.platform as platform",
        "seat.third_userid as third_userid",
        "seat.third_user_name as third_user_name",
        "seat.third_avatar as avatar",
        "seat.is_online as is_online",
        "seat.expire_time as expire_time",
        "seat.biz_status as biz_status",
        "seat.host_sub_id as host_sub_id",
      ])
      .where("relation.sub_id", "=", subUserNumericId)
      .where("relation.uid", "=", scope.uid)
      .where("relation.platform", "=", scope.platform)
      .execute() as SeatBaseRow[];

    if (!seats.length) {
      return [];
    }

    const aggregateRows = await this.getSeatConversationAggregateRows(seats);
    const aggregatesBySeatThirdUserId = groupSeatConversationAggregates(aggregateRows);

    const hydratedSeats = seats
      .map((seat) =>
        withSeatConversationAggregate(seat, aggregatesBySeatThirdUserId),
      )
      .sort(sortSeatsByLastMessageTimeDesc);

    return hydratedSeats.map(mapSeatRow);
  }

  async listCustomers(input: CustomerListScope): Promise<WorkbenchCustomerListResponse> {
    const subUserNumericId =
      input.scope === "mine" ? parseMySqlId(input.subUserId) : undefined;
    const seatIds =
      input.scope === "mine"
        ? uniquePositiveNumbers(
            (input.seatIds ?? []).map((seatId) => parseMySqlId(seatId)),
          )
        : [];

    if (input.scope === "mine" && subUserNumericId == null) {
      return emptyCustomerListPage();
    }
    const scopedSubUserId = subUserNumericId ?? 0;

    if (input.scope === "mine") {
      return this.listMyCustomersFromBinds({
        cursor: input.cursor,
        keyword: input.keyword,
        limit: input.limit,
        seatIds,
        subUserId: scopedSubUserId,
      });
    }

    return this.listAllCustomersFromContact(input);
  }

  private async listMyCustomersFromBinds(input: {
    cursor?: string;
    keyword?: string;
    limit?: number;
    seatIds: number[];
    subUserId: number;
  }): Promise<WorkbenchCustomerListResponse> {
    const limit = normalizeCustomerListLimit(input.limit);
    const keyword = input.keyword?.trim();
    const cursor = input.cursor ? decodeMineCustomerListCursor(input.cursor) : undefined;
    const visibleSeats =
      input.seatIds.length > 0
        ? await this.listAccessibleSeatContexts(input.subUserId, input.seatIds)
        : await this.listAccessibleSeatContexts(input.subUserId);

    if (visibleSeats.length === 0) {
      return emptyCustomerListPage();
    }

    let query = this.db
      .selectFrom("xy_wap_embed_customer_bind_relation as bind")
      .select([
        "bind.add_time as add_time",
        "bind.bind_type as bind_type",
        "bind.biz_status as biz_status",
        "bind.description as description",
        "bind.id as id",
        "bind.third_external_userid as third_external_userid",
        "bind.third_userid as third_userid",
        "bind.uid as uid",
        "bind.platform as platform",
      ]);

    if (keyword) {
      const pattern = "%" + escapeLikeKeyword(keyword) + "%";
      query = query
        .innerJoin("xy_wap_embed_contact as contact", (join) =>
          join
            .onRef("contact.third_external_userid", "=", "bind.third_external_userid")
            .onRef("contact.uid", "=", "bind.uid")
            .onRef("contact.platform", "=", "bind.platform"),
        )
        .where((expressionBuilder) =>
          expressionBuilder.or([
            expressionBuilder("contact.name", "like", pattern),
            expressionBuilder("contact.real_name", "like", pattern),
            expressionBuilder("bind.remark", "like", pattern),
          ]),
        );
    }

    if (visibleSeats.length === 1) {
      const [seat] = visibleSeats;
      if (!seat) {
        return emptyCustomerListPage();
      }
      query = query
        .where("bind.uid", "=", seat.uid)
        .where("bind.platform", "=", seat.platform)
        .where("bind.third_userid", "=", seat.thirdUserId);
    } else {
      query = query
        .where("bind.uid", "=", visibleSeats[0]?.uid ?? 0)
        .where("bind.platform", "=", visibleSeats[0]?.platform ?? 0)
        .where(
          "bind.third_userid",
          "in",
          uniqueNonEmpty(visibleSeats.map((seat) => seat.thirdUserId)),
        );
    }

    if (cursor) {
      const cursorDate = new Date(cursor.addTime);
      query = query.where((expressionBuilder) =>
        expressionBuilder.or([
          expressionBuilder("bind.add_time", "<", asSchemaDate(cursorDate)),
          expressionBuilder.and([
            expressionBuilder("bind.add_time", "=", asSchemaDate(cursorDate)),
            expressionBuilder("bind.id", "<", asSchemaBigIntId(String(cursor.bindId))),
          ]),
        ]),
      );
    }

    query = query
      .orderBy("bind.add_time", "desc")
      .orderBy("bind.id", "desc")
      .limit(limit + 1);

    const rows = (await query.execute()) as CustomerBindPageRow[];
    const pageRows = rows.slice(0, limit);
    const customers = await this.hydrateCustomerBindRows(pageRows, {
      hydrateTenantRelations: true,
    });

    return {
      hasMore: rows.length > limit,
      items: customers,
      nextCursor:
        rows.length > limit && pageRows.at(-1)
          ? encodeMineCustomerListCursor({
              addTime: normalizeCursorTime(pageRows.at(-1)?.add_time),
              bindId: toNumber(pageRows.at(-1)?.id) ?? 0,
            })
          : undefined,
      total: customers.length,
    };
  }

  private async listAllCustomersFromContact(
    input: Extract<CustomerListScope, { scope: "all" }>,
  ): Promise<WorkbenchCustomerListResponse> {
    if (input.uid == null || input.platform == null) {
      return emptyCustomerListPage();
    }

    const limit = normalizeCustomerListLimit(input.limit);
    const keyword = input.keyword?.trim();
    const cursor = input.cursor ? decodeCustomerListCursor(input.cursor) : undefined;
    let query = this.db
      .selectFrom("xy_wap_embed_contact as contact")
      .select([
        "contact.avatar as avatar",
        "contact.biz_status as biz_status",
        "contact.gender as gender",
        "contact.name as name",
        "contact.platform as platform",
        "contact.real_name as real_name",
        "contact.third_external_userid as third_external_userid",
        "contact.uid as uid",
        "contact.update_time as update_time",
      ])
      .where("contact.uid", "=", input.uid)
      .where("contact.platform", "=", input.platform);

    if (keyword) {
      const pattern = "%" + escapeLikeKeyword(keyword) + "%";
      query = query.where((expressionBuilder) =>
        expressionBuilder.or([
          expressionBuilder("contact.name", "like", pattern),
          expressionBuilder("contact.real_name", "like", pattern),
          expressionBuilder("contact.third_external_userid", "like", pattern),
        ]),
      );
    }

    if (cursor) {
      const cursorDate = new Date(cursor.updateTime);
      query = query.where((expressionBuilder) =>
        expressionBuilder.or([
          expressionBuilder("contact.update_time", "<", cursorDate),
          expressionBuilder.and([
            expressionBuilder("contact.update_time", "=", cursorDate),
            expressionBuilder(
              "contact.third_external_userid",
              "<",
              cursor.thirdExternalUserId,
            ),
          ]),
        ]),
      );
    }

    query = query
      .orderBy("contact.update_time", "desc")
      .orderBy("contact.third_external_userid", "desc")
      .limit(limit + 1);

    const rows = (await query.execute()) as CustomerContactPageRow[];
    const pageRows = rows.slice(0, limit);
    const customerKeys = pageRows.map((row) => ({
      platform: toNumber(row.platform) ?? input.platform ?? 0,
      thirdExternalUserId: row.third_external_userid,
      uid: toNumber(row.uid) ?? input.uid ?? 0,
    }));
    const thirdExternalUserIds = uniqueNonEmpty(
      customerKeys.map((key) => key.thirdExternalUserId),
    );
    const relationCustomers = await this.listCustomerRelationRowsForKeys(
      input.uid,
      input.platform,
      thirdExternalUserIds,
    );
    const relationsByCustomerKey = new Map(
      relationCustomers.map((customer) => [customer.customerKey, customer]),
    );

    return {
      hasMore: rows.length > limit,
      items: pageRows.map((row) => {
        const uid = toNumber(row.uid) ?? input.uid ?? 0;
        const platform = toNumber(row.platform) ?? input.platform ?? 0;
        const customerKey = buildCustomerKey(uid, platform, row.third_external_userid);
        const relationCustomer = relationsByCustomerKey.get(customerKey);

        return {
          avatar: row.avatar ?? "",
          bizStatus: row.biz_status ?? 0,
          customerKey,
          gender: row.gender ?? null,
          name: row.name ?? "",
          platform,
          realName: row.real_name ?? "",
          relationCount: relationCustomer?.relationCount ?? 0,
          seatRelations: relationCustomer?.seatRelations ?? [],
          thirdExternalUserId: row.third_external_userid,
          uid,
        };
      }),
      nextCursor:
        rows.length > limit && pageRows.at(-1)
          ? encodeCustomerListCursor({
              thirdExternalUserId: pageRows.at(-1)?.third_external_userid ?? "",
              updateTime: normalizeCursorTime(pageRows.at(-1)?.update_time),
            })
          : undefined,
      total: pageRows.length,
    };
  }

  private async listAccessibleSeatContexts(
    subUserId: number,
    seatIds?: number[],
  ): Promise<CustomerSeatContext[]> {
    let seatQuery = this.db
      .selectFrom("xy_wap_embed_user_seat as seat")
      .innerJoin("xy_wap_embed_user_seat_sub_relation as relation", (join) =>
        join.onRef("relation.user_seat_id", "=", "seat.id"),
      )
      .select([
        "seat.id as id",
        "seat.uid as uid",
        "seat.platform as platform",
        "seat.third_userid as third_userid",
        "seat.third_avatar as third_avatar",
        "seat.third_user_name as third_user_name",
      ])
      .where("relation.sub_id", "=", subUserId);

    if (seatIds && seatIds.length > 0) {
      seatQuery = seatQuery.where(
        "seat.id",
        "in",
        asSchemaBigIntIds(seatIds.map((seatId) => String(seatId))),
      );
    }

    const seatRows = (await seatQuery.execute()) as CustomerSeatHydrationRow[];

    return seatRows
      .map((row) => {
        const uid = toNumber(row.uid);
        const platform = toNumber(row.platform);
        const seatId = toNumber(row.id);

        if (uid == null || platform == null || seatId == null) {
          return undefined;
        }

        return {
          platform,
          seatAvatar: row.third_avatar ?? "",
          seatId: String(seatId),
          seatName: row.third_user_name ?? "",
          thirdUserId: row.third_userid,
          uid,
        } satisfies CustomerSeatContext;
      })
      .filter((seat): seat is CustomerSeatContext => seat !== undefined);
  }

  private async hydrateCustomerBindRows(
    rows: CustomerBindPageRow[],
    options: { hydrateContacts?: boolean; hydrateTenantRelations?: boolean } = {},
  ): Promise<WorkbenchCustomerSummaryDto[]> {
    if (rows.length === 0) {
      return [];
    }

    const firstUid = toNumber(rows[0]?.uid) ?? 0;
    const firstPlatform = toNumber(rows[0]?.platform) ?? 0;
    const thirdExternalUserIds = uniqueNonEmpty(
      rows.map((row) => row.third_external_userid),
    );
    const thirdUserIds = uniqueNonEmpty(rows.map((row) => row.third_userid));
    const [contactRows, seatRows] = await Promise.all([
      options.hydrateContacts === false
        ? []
        : this.listCustomerContactRowsForKeys(
            firstUid,
            firstPlatform,
            thirdExternalUserIds,
          ),
      this.listCustomerSeatRowsForThirdUserIds(firstUid, firstPlatform, thirdUserIds),
    ]);
    const contactsByKey = new Map(
      contactRows.map((row) => [
        buildCustomerKey(
          toNumber(row.uid) ?? firstUid,
          toNumber(row.platform) ?? firstPlatform,
          row.third_external_userid,
        ),
        row,
      ]),
    );
    const seatsByThirdUserId = new Map(
      seatRows.map((row) => [row.third_userid, row]),
    );

    const customers = groupCustomerRows(
      rows.map((row): CustomerRow => {
        const uid = toNumber(row.uid) ?? firstUid;
        const platform = toNumber(row.platform) ?? firstPlatform;
        const contact = contactsByKey.get(
          buildCustomerKey(uid, platform, row.third_external_userid),
        );
        const seat = seatsByThirdUserId.get(row.third_userid);

        return {
          add_time: row.add_time,
          avatar: contact?.avatar ?? "",
          bind_id: row.id,
          bind_status: row.biz_status,
          bind_type: row.bind_type,
          contact_status: contact?.biz_status ?? 0,
          description: row.description,
          gender: contact?.gender ?? null,
          last_conversation_id: null,
          last_conversation_seat_avatar: null,
          last_conversation_seat_id: null,
          last_conversation_seat_name: null,
          last_message_time: null,
          name: contact?.name ?? "",
          platform,
          real_name: contact?.real_name ?? "",
          seat_avatar: seat?.third_avatar ?? "",
          seat_id: seat?.id ?? "",
          seat_name: seat?.third_user_name ?? "",
          third_external_userid: row.third_external_userid,
          third_userid: row.third_userid,
          uid,
        };
      }),
    );

    if (!options.hydrateTenantRelations) {
      return customers;
    }

    const relationCustomers = await this.listCustomerRelationRowsForKeys(
      firstUid,
      firstPlatform,
      thirdExternalUserIds,
    );
    const relationCustomersByKey = new Map(
      relationCustomers.map((customer) => [customer.customerKey, customer]),
    );

    return customers.map((customer) => {
      const relationCustomer = relationCustomersByKey.get(customer.customerKey);

      if (!relationCustomer) {
        return customer;
      }

      return {
        ...customer,
        relationCount: relationCustomer.relationCount,
        seatRelations: relationCustomer.seatRelations,
      };
    });
  }

  private async listCustomerContactRowsForKeys(
    uid: number,
    platform: number,
    thirdExternalUserIds: string[],
  ) {
    if (thirdExternalUserIds.length === 0) {
      return [];
    }

    return (await this.db
      .selectFrom("xy_wap_embed_contact as contact")
      .select([
        "contact.avatar as avatar",
        "contact.biz_status as biz_status",
        "contact.gender as gender",
        "contact.name as name",
        "contact.platform as platform",
        "contact.real_name as real_name",
        "contact.third_external_userid as third_external_userid",
        "contact.uid as uid",
      ])
      .where("contact.uid", "=", uid)
      .where("contact.platform", "=", platform)
      .where("contact.third_external_userid", "in", thirdExternalUserIds)
      .execute()) as CustomerContactHydrationRow[];
  }

  private async listCustomerSeatRowsForThirdUserIds(
    uid: number,
    platform: number,
    thirdUserIds: string[],
  ) {
    if (thirdUserIds.length === 0) {
      return [];
    }

    return (await this.db
      .selectFrom("xy_wap_embed_user_seat as seat")
      .select([
        "seat.id as id",
        "seat.uid as uid",
        "seat.platform as platform",
        "seat.third_userid as third_userid",
        "seat.third_avatar as third_avatar",
        "seat.third_user_name as third_user_name",
      ])
      .where("seat.uid", "=", uid)
      .where("seat.platform", "=", platform)
      .where("seat.third_userid", "in", thirdUserIds)
      .execute()) as CustomerSeatHydrationRow[];
  }

  private async listCustomerRelationRowsForKeys(
    uid: number,
    platform: number,
    thirdExternalUserIds: string[],
  ) {
    if (thirdExternalUserIds.length === 0) {
      return [];
    }

    const rows = (await this.db
      .selectFrom("xy_wap_embed_customer_bind_relation as bind")
      .select([
        "bind.add_time as add_time",
        "bind.bind_type as bind_type",
        "bind.biz_status as biz_status",
        "bind.description as description",
        "bind.id as id",
        "bind.third_external_userid as third_external_userid",
        "bind.third_userid as third_userid",
        "bind.uid as uid",
        "bind.platform as platform",
      ])
      .where("bind.uid", "=", uid)
      .where("bind.platform", "=", platform)
      .where("bind.third_external_userid", "in", thirdExternalUserIds)
      .execute()) as CustomerBindPageRow[];

    return this.hydrateCustomerBindRows(rows, { hydrateContacts: false });
  }

  async getCustomerLastConversation(input: {
    platform: number;
    thirdExternalUserId: string;
    uid: number;
  }): Promise<WorkbenchCustomerLastConversationDto | undefined> {
    const row = (await this.db
      .selectFrom("xy_wap_embed_conversation as conversation")
      .select([
        "conversation.uid as uid",
        "conversation.platform as platform",
        "conversation.third_external_userid as third_external_userid",
        "conversation.id as conversation_id",
        "conversation.last_msgtime as last_message_time",
        "conversation.third_userid as third_userid",
      ])
      .where("conversation.uid", "=", input.uid)
      .where("conversation.platform", "=", input.platform)
      .where("conversation.third_external_userid", "=", input.thirdExternalUserId)
      .orderBy("conversation.last_msgtime", "desc")
      .orderBy("conversation.id", "desc")
      .limit(1)
      .executeTakeFirst()) as CustomerLastMessageRow | undefined;

    if (!row) {
      return undefined;
    }

    const seatRows = await this.listCustomerSeatRowsForThirdUserIds(
      input.uid,
      input.platform,
      [row.third_userid],
    );
    const seat = seatRows[0];

    return mapCustomerLastConversation({
      ...row,
      seat_avatar: seat?.third_avatar ?? "",
      seat_id: seat?.id ?? null,
      seat_name: seat?.third_user_name ?? "",
    });
  }

  async listCustomerRelationConversations(input: {
    platform: number;
    thirdExternalUserId: string;
    thirdUserIds: string[];
    uid: number;
  }): Promise<WorkbenchCustomerRelationConversationDto[]> {
    const thirdUserIds = uniqueNonEmpty(input.thirdUserIds);

    if (thirdUserIds.length === 0) {
      return [];
    }

    const rows = (await this.db
      .selectFrom("xy_wap_embed_conversation as conversation")
      .select((expressionBuilder) => [
        "conversation.third_userid as third_userid",
        expressionBuilder.fn.max("conversation.last_msgtime").as("last_message_time"),
      ])
      .where("conversation.uid", "=", input.uid)
      .where("conversation.platform", "=", input.platform)
      .where("conversation.third_external_userid", "=", input.thirdExternalUserId)
      .where("conversation.third_userid", "in", thirdUserIds)
      .groupBy(["conversation.third_userid"])
      .execute()) as CustomerRelationConversationRow[];

    return rows.flatMap((row) => {
      const lastMessageTime =
        row.last_message_time == null
          ? undefined
          : normalizeCursorTime(row.last_message_time);

      return lastMessageTime == null
        ? []
        : [
            {
              lastMessageTime,
              thirdUserId: row.third_userid,
            },
          ];
    });
  }

  async getSeat(seatId: string) {
    const seatNumericId = parseMySqlId(seatId);

    if (seatNumericId == null) {
      return undefined;
    }

    const seat = await this.db
      .selectFrom("xy_wap_embed_user_seat")
      .select([
        "id",
        "uid",
        "platform",
        "third_userid",
        "third_user_name",
        "third_avatar as avatar",
        "is_online",
        "expire_time",
        "biz_status",
        "host_sub_id",
      ])
      .where("id", "=", seatNumericId)
      .executeTakeFirst() as SeatBaseRow | undefined;

    if (!seat) {
      return undefined;
    }

    const aggregateRows = await this.getSeatConversationAggregateRows([seat]);
    const aggregatesBySeatThirdUserId = groupSeatConversationAggregates(aggregateRows);

    return mapSeatRow(withSeatConversationAggregate(seat, aggregatesBySeatThirdUserId));
  }

  async getSeatsByIds(seatIds: string[]): Promise<WorkbenchSeatDto[]> {
    const normalizedSeatIds = asSchemaBigIntIds(uniqueIds(seatIds));

    if (!normalizedSeatIds.length) {
      return [];
    }

    const rows = await this.db
      .selectFrom("xy_wap_embed_user_seat as seat")
      .leftJoin("xy_wap_embed_conversation as conversation", (join) =>
        join
          .onRef("conversation.third_userid", "=", "seat.third_userid")
          .onRef("conversation.uid", "=", "seat.uid")
          .onRef("conversation.platform", "=", "seat.platform")
          .on("conversation.biz_status", "=", BIZ_STATUS_ACTIVE),
      )
      .select((expressionBuilder) => [
        "seat.id as id",
        "seat.third_userid as third_userid",
        "seat.third_user_name as third_user_name",
        "seat.third_avatar as avatar",
        "seat.is_online as is_online",
        "seat.expire_time as expire_time",
        "seat.biz_status as biz_status",
        "seat.host_sub_id as host_sub_id",
        expressionBuilder.fn
          .coalesce(
            expressionBuilder.fn.sum<number>("conversation.unread_cnt"),
            expressionBuilder.val(0),
          )
          .as("unread_count"),
        expressionBuilder.fn.max("conversation.last_msgtime").as("last_message_time"),
      ])
      .where("seat.id", "in", normalizedSeatIds)
      .groupBy([
        "seat.id",
        "seat.third_userid",
        "seat.third_user_name",
        "seat.third_avatar",
        "seat.is_online",
        "seat.expire_time",
        "seat.biz_status",
        "seat.host_sub_id",
      ])
      .execute();

    return rows.map((row) => mapSeatRow(row as SeatRow));
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

    const snapshot = await this.getSeatAccessSnapshot(subUserNumericId);

    return snapshot?.seatIds.includes(String(seatNumericId)) ?? false;
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
      .where("conversation.biz_status", "=", 1);

    if (options?.mode) {
      query = query.where(
        "conversation.chat_type",
        "=",
        options.mode === "group" ? CHAT_TYPE_GROUP : CHAT_TYPE_SINGLE,
      );
    }

    if (cursor) {
      // 会话列表的 cursor 只为未来分页预留，当前首屏不会传这个参数。
      // 这里保留 snapshot 上界是为了后续 cursor 页的稳定性，不影响首屏展示。
      query = query
        .where("conversation.last_msgtime", "<=", snapshotAt)
        .where((expressionBuilder) =>
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

  async getConversationLookup(
    conversationId: string,
    options: { activeOnly?: boolean } = {},
  ): Promise<ConversationLookup | undefined> {
    const conversationNumericId = parseMySqlId(conversationId);

    if (conversationNumericId == null) {
      return undefined;
    }

    let query = this.db
      .selectFrom("xy_wap_embed_conversation as conversation")
      .innerJoin("xy_wap_embed_user_seat as seat", (join) =>
        join
          .onRef("seat.third_userid", "=", "conversation.third_userid")
          .onRef("seat.uid", "=", "conversation.uid")
          .onRef("seat.platform", "=", "conversation.platform"),
      )
      .leftJoin("xy_wap_embed_group_seat as group_seat", (join) =>
        join
          .onRef("group_seat.third_group_id", "=", "conversation.third_group_id")
          .onRef("group_seat.third_userid", "=", "conversation.third_userid")
          .onRef("group_seat.uid", "=", "conversation.uid")
          .onRef("group_seat.platform", "=", "conversation.platform")
          .on("group_seat.biz_status", "=", BIZ_STATUS_ACTIVE),
      )
      .select([
        "conversation.id as id",
        "conversation.platform as platform",
        "conversation.third_external_userid as third_external_userid",
        "conversation.third_group_id as third_group_id",
        "conversation.third_userid as third_userid",
        "conversation.unread_cnt as unread_cnt",
        "conversation.uid as uid",
        "group_seat.name as group_name",
        "group_seat.remark as group_remark",
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
      .where("conversation.id", "=", conversationNumericId);

    if (options.activeOnly) {
      query = query.where("conversation.biz_status", "=", BIZ_STATUS_ACTIVE);
    }

    const row = await query.executeTakeFirst();

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
          thirdGroupName: row.third_group_id
            ? firstNonEmptyString(row.group_remark, row.group_name) ?? "未知群聊"
            : undefined,
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
          .where("platform", "=", input.platform),
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
      includeHiddenConversation?: boolean;
      limit: number;
    },
  ): Promise<
    WorkbenchMessagePageDto & {
      smartReplyEnabled?: boolean;
      smartReplyScope?: {
        chatType: number;
        thirdExternalId: string;
        thirdUserId: string;
        uid: number;
      };
    }
  > {
    const conversationNumericId = parseMySqlId(conversationId);

    if (conversationNumericId == null || options.limit <= 0) {
      return emptyMessagePage();
    }

    let conversationQuery = this.db
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
        "seat.assistant_id as assistant_id",
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
      .where("conversation.id", "=", conversationNumericId);

    if (!options.includeHiddenConversation) {
      conversationQuery = conversationQuery.where(
        "conversation.biz_status",
        "=",
        BIZ_STATUS_ACTIVE,
      );
    }

    const conversation = await conversationQuery.executeTakeFirst();

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
        "message.status as status",
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

    const thirdExternalId = (conversation.conversation_external_id || "").trim();
    const thirdUserId = (conversation.third_userid || "").trim();
    const uid = toNumber(conversation.uid) ?? 0;
    const smartReplyScope =
      conversation.chat_type === CHAT_TYPE_SINGLE && thirdExternalId && thirdUserId && uid > 0
        ? {
            chatType: CHAT_TYPE_SINGLE,
            thirdExternalId,
            thirdUserId,
            uid,
          }
        : undefined;

    return {
      filteredCount: 0,
      hasMore: rows.length > options.limit,
      messages: hydratedMessageRows.map((row) =>
        mapMessageRow(row, quotePreviewsByRowId.get(toNumber(row.id))),
      ),
      nextBeforeSeq: rawRows.length > 0 ? toNumber(rawRows.at(-1)?.id) : undefined,
      scannedCount: rawRows.length,
      smartReplyEnabled:
        smartReplyScope != null && (toNumber(conversation.assistant_id) ?? 0) > 0,
      smartReplyScope,
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
        "message.status as status",
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
    const quoteIds = uniquePositiveNumbers(rows.map(getQuoteMessageAuditId));
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
        "message.status as status",
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
      .executeTakeFirst();
  }

  private async getSubUserTenantScope(subUserId: number) {
    return this.db
      .selectFrom("xy_wap_embed_sub_user")
      .select(["uid", "platform"])
      .where("id", "=", subUserId)
      .where("status", "=", 1)
      .executeTakeFirst() as Promise<TenantScope | undefined>;
  }

  private async getSeatAccessSnapshot(subUserId: number): Promise<SeatAccessSnapshot | undefined> {
    const cacheKey = this.cacheKeys.seatAccess(subUserId);
    const cached = await this.readSeatAccessSnapshot(cacheKey);

    if (cached) {
      return cached;
    }

    const scope = await this.getSubUserTenantScope(subUserId);

    if (!scope) {
      return undefined;
    }

    const rows = await this.db
      .selectFrom("xy_wap_embed_user_seat_sub_relation as relation")
      .innerJoin("xy_wap_embed_user_seat as seat", (join) =>
        join
          .onRef("seat.id", "=", "relation.user_seat_id")
          .onRef("seat.uid", "=", "relation.uid")
          .onRef("seat.platform", "=", "relation.platform"),
      )
      .select([
        "relation.user_seat_id as seat_id",
      ])
      .where("relation.sub_id", "=", subUserId)
      .where("relation.uid", "=", scope.uid)
      .where("relation.platform", "=", scope.platform)
      .execute();
    const snapshot: SeatAccessSnapshot = {
      platform: scope.platform,
      seatIds: uniqueIds(rows.map((row) => row.seat_id)),
      uid: scope.uid,
      version: 1,
    };

    await this.cache?.set(cacheKey, JSON.stringify(snapshot), 600);

    return snapshot;
  }

  private async readSeatAccessSnapshot(key: string) {
    let cached: string | null | undefined;

    try {
      cached = await this.cache?.get(key);
    } catch {
      return undefined;
    }

    if (!cached) {
      return undefined;
    }

    try {
      const value = JSON.parse(cached) as Partial<SeatAccessSnapshot>;

      if (!value || typeof value !== "object") {
        return undefined;
      }

      if (
        value.version === 1 &&
        typeof value.uid === "number" &&
        Number.isFinite(value.uid) &&
        typeof value.platform === "number" &&
        Number.isFinite(value.platform) &&
        Array.isArray(value.seatIds) &&
        value.seatIds.every((seatId) => typeof seatId === "string")
      ) {
        return {
          platform: value.platform,
          seatIds: value.seatIds,
          uid: value.uid,
          version: 1,
        } satisfies SeatAccessSnapshot;
      }
    } catch {
      return undefined;
    }

    return undefined;
  }

  private async getSeatConversationAggregateRows(
    seats: SeatAggregateKeyRow[],
  ) {
    if (!seats.length) {
      return [];
    }

    const aggregateRowsByTenant = await Promise.all(
      groupSeatAggregateKeysByTenant(seats).map(
        ({ platform, thirdUserIds, uid }) =>
          this.db
            .selectFrom("xy_wap_embed_conversation")
            .select(["uid", "platform", "third_userid"])
            .select((expressionBuilder) => [
              expressionBuilder.fn
                .coalesce(
                  expressionBuilder.fn.sum<number>("unread_cnt"),
                  expressionBuilder.val(0),
                )
                .as("unread_cnt"),
              expressionBuilder.fn.max("last_msgtime").as("last_msgtime"),
            ])
            .where("uid", "=", uid)
            .where("platform", "=", platform)
            .where("third_userid", "in", thirdUserIds)
            .where("biz_status", "=", BIZ_STATUS_ACTIVE)
            .groupBy(["uid", "platform", "third_userid"])
            .execute() as Promise<SeatConversationAggregateRow[]>,
      ),
    );

    return aggregateRowsByTenant.flat();
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

    const [lastMessages, contacts, bindRelations, groups] = await Promise.all([
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
            .execute()
        : [],
      groupIds.length
        ? this.db
            .selectFrom("xy_wap_embed_group_seat")
            .select(["third_group_id", "avatar", "name", "remark", "biz_status"])
            .where("uid", "=", uid)
            .where("platform", "=", platform)
            .where("third_userid", "=", seatThirdUserId)
            .where("third_group_id", "in", groupIds)
            .execute()
        : [],
    ]);

    return {
      bindRemarksByThirdExternalId: new Map(
        bindRelations.map((bindRelation) => [
          bindRelation.third_external_userid,
          bindRelation.remark,
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
            remark: group.remark,
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
    const bindRemark = hydrationSources.bindRemarksByThirdExternalId.get(row.third_external_userid);
    const group = hydrationSources.groupsByThirdGroupId.get(row.third_group_id);

    return mapConversationRow({
      ...row,
      biz_status:
        row.chat_type === CHAT_TYPE_GROUP
          ? (group?.bizStatus ?? BIZ_STATUS_HIDDEN)
          : BIZ_STATUS_ACTIVE,
      customer_avatar: contact?.avatar ?? null,
      customer_name: firstNonEmptyString(bindRemark, contact?.name) ?? null,
      contact_original_name: firstNonEmptyString(contact?.name) ?? null,
      group_avatar: group?.avatar ?? null,
      group_name: firstNonEmptyString(group?.name) ?? null,
      group_remark: firstNonEmptyString(group?.remark) ?? null,
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

  async searchContacts(
    uid: number,
    platform: number,
    seatThirdUserId: string,
    keyword: string,
  ): Promise<WorkbenchSearchContactResultDto[]> {
    if (!keyword.trim()) {
      return [];
    }

    const escapedKeyword = escapeLikeKeyword(keyword);
    const pattern = "%" + escapedKeyword + "%";

    const rows = await this.db
      .selectFrom("xy_wap_embed_customer_bind_relation as bind")
      .innerJoin("xy_wap_embed_contact as contact", (join) =>
        join
          .onRef("contact.third_external_userid", "=", "bind.third_external_userid")
          .onRef("contact.uid", "=", "bind.uid")
          .onRef("contact.platform", "=", "bind.platform")
          .on("contact.biz_status", "=", BIZ_STATUS_ACTIVE),
      )
      .select([
        "contact.third_external_userid as thirdExternalUserId",
        "contact.name as name",
        "contact.real_name as realName",
        "contact.avatar as avatar",
        "bind.remark as remark",
      ])
      .where("bind.uid", "=", uid)
      .where("bind.platform", "=", platform)
      .where("bind.third_userid", "=", seatThirdUserId)
      .where("bind.biz_status", "=", BIZ_STATUS_ACTIVE)
      .where((eb) =>
        eb.or([
          eb("contact.name", "like", pattern),
          eb("contact.real_name", "like", pattern),
          eb("bind.remark", "like", pattern),
        ]),
      )
      .limit(100)
      .execute();

    return rows.map((row) => ({
      avatar: row.avatar,
      name: row.name,
      realName: row.realName,
      remark: row.remark ?? undefined,
      thirdExternalUserId: row.thirdExternalUserId,
    }));
  }

  async searchGroups(
    uid: number,
    platform: number,
    seatThirdUserId: string,
    keyword: string,
  ): Promise<WorkbenchSearchGroupResultDto[]> {
    if (!keyword.trim()) {
      return [];
    }

    const escapedKeyword = escapeLikeKeyword(keyword);
    const pattern = "%" + escapedKeyword + "%";

    const rows = await this.db
      .selectFrom("xy_wap_embed_group_seat")
      .select([
        "third_group_id as thirdGroupId",
        "name",
        "avatar",
        "remark",
      ])
      .where("uid", "=", uid)
      .where("platform", "=", platform)
      .where("third_userid", "=", seatThirdUserId)
      .where("biz_status", "=", BIZ_STATUS_ACTIVE)
      .where((eb) =>
        eb.or([
          eb("name", "like", pattern),
          eb("remark", "like", pattern),
        ]),
      )
      .limit(100)
      .execute();

    return rows.map((row) => ({
      thirdGroupId: row.thirdGroupId,
      name: row.name ?? undefined,
      avatar: row.avatar,
      remark: row.remark ?? undefined,
    }));
  }

  async getHydratedConversation(
    uid: number,
    platform: number,
    seatThirdUserId: string,
    conversationId: string,
  ): Promise<WorkbenchConversationSummaryDto | null> {
    const conversationNumericId = parseMySqlId(conversationId);

    if (conversationNumericId == null) {
      return null;
    }

    const seat = await this.db
      .selectFrom("xy_wap_embed_user_seat")
      .select("id")
      .where("uid", "=", uid)
      .where("platform", "=", platform)
      .where("third_userid", "=", seatThirdUserId)
      .executeTakeFirst();

    if (!seat) {
      return null;
    }

    const row = await this.db
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
        expressionBuilder.val(seat.id).as("seat_id"),
      ])
      .where("conversation.uid", "=", uid)
      .where("conversation.platform", "=", platform)
      .where("conversation.third_userid", "=", seatThirdUserId)
      .where("conversation.id", "=", conversationNumericId)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    const conversationRow = row as ConversationPageRow;
    const hydrationSources = await this.getConversationHydrationSources(
      [conversationRow],
      uid,
      platform,
      seatThirdUserId,
    );

    return this.mapHydratedConversationRow(conversationRow, hydrationSources);
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
  messageSeq: number;
};

function parseMessageUpdateEvent(content: string): ParsedMessageUpdateEvent | undefined {
  try {
    const parsed: unknown = JSON.parse(content);

    if (!isRecord(parsed)) {
      return undefined;
    }

    const messageSeq = readRecordNumber(parsed, "messageId");

    if (!messageSeq) {
      return undefined;
    }

    return {
      messageSeq,
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

function mapRevokeSenderType(input: {
  chatType: number;
  fromType: number | null;
  thirdFromId?: string;
  thirdUserId?: string;
}): "agent" | "customer" | "system" {
  if (input.fromType === 3) {
    return "system";
  }

  if (input.chatType === CHAT_TYPE_GROUP) {
    const thirdFromId = (input.thirdFromId || "").trim();
    const thirdUserId = (input.thirdUserId || "").trim();

    return thirdFromId && thirdFromId === thirdUserId ? "agent" : "customer";
  }

  if (input.fromType === 1) {
    return "agent";
  }

  if (input.fromType === 2) {
    return "customer";
  }

  return "system";
}

function emptyHistoryMessagePage(): WorkbenchHistoryMessagePageDto {
  return {
    hasNext: false,
    hasPrev: false,
    messages: [],
  };
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

function groupSeatConversationAggregates(rows: SeatConversationAggregateRow[]) {
  const aggregatesBySeatThirdUserId = new Map<
    string,
    { lastMessageTime: Date | number | string | null; unreadCount: number }
  >();

  for (const row of rows) {
    aggregatesBySeatThirdUserId.set(getSeatAggregateKey(row), {
      lastMessageTime: row.last_msgtime,
      unreadCount: toNumber(row.unread_cnt) ?? 0,
    });
  }

  return aggregatesBySeatThirdUserId;
}

function withSeatConversationAggregate(
  seat: SeatBaseRow,
  aggregatesBySeatThirdUserId: Map<
    string,
    { lastMessageTime: Date | number | string | null; unreadCount: number }
  >,
): SeatSummaryRow {
  const aggregate = aggregatesBySeatThirdUserId.get(getSeatAggregateKey(seat));

  return {
    ...seat,
    last_message_time: aggregate?.lastMessageTime ?? null,
    unread_count: aggregate?.unreadCount ?? 0,
  };
}

function getSeatAggregateKey(seat: SeatAggregateKeyRow) {
  return `${seat.uid}:${seat.platform}:${seat.third_userid}`;
}

function groupSeatAggregateKeysByTenant(seats: SeatAggregateKeyRow[]) {
  const thirdUserIdsByTenant = new Map<
    string,
    { platform: number; thirdUserIds: Set<string>; uid: number }
  >();

  for (const seat of seats) {
    if (
      !Number.isSafeInteger(seat.uid) ||
      seat.uid <= 0 ||
      !Number.isSafeInteger(seat.platform) ||
      seat.platform <= 0 ||
      !seat.third_userid
    ) {
      continue;
    }

    const key = `${seat.uid}:${seat.platform}`;
    const current = thirdUserIdsByTenant.get(key) ?? {
      platform: seat.platform,
      thirdUserIds: new Set<string>(),
      uid: seat.uid,
    };

    current.thirdUserIds.add(seat.third_userid);
    thirdUserIdsByTenant.set(key, current);
  }

  return Array.from(thirdUserIdsByTenant.values())
    .map((item) => ({
      platform: item.platform,
      thirdUserIds: Array.from(item.thirdUserIds),
      uid: item.uid,
    }))
    .filter((item) => item.thirdUserIds.length > 0);
}

function sortSeatsByLastMessageTimeDesc(left: SeatSummaryRow, right: SeatSummaryRow) {
  const timestampComparison = compareTimestamps(
    right.last_message_time,
    left.last_message_time,
  );

  if (timestampComparison !== 0) {
    return timestampComparison;
  }

  return comparePositiveIdValues(right.id, left.id);
}

function compareTimestamps(
  left: Date | number | string | null | undefined,
  right: Date | number | string | null | undefined,
) {
  return normalizeTimestamp(left) - normalizeTimestamp(right);
}

function normalizeTimestamp(value: Date | number | string | null | undefined) {
  if (value == null || value === "") {
    return 0;
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.getTime() : 0;
  }

  const numeric = Number(value);

  if (Number.isFinite(numeric)) {
    return numeric;
  }

  if (typeof value !== "string") {
    return 0;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? timestamp : 0;
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

function firstNonEmptyString(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = value?.trim();

    if (normalized) {
      return normalized;
    }
  }

  return undefined;
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

function asSchemaDate(value: Date) {
  return value as unknown as number;
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

function getMaterialVisibleSubUids(bizType: number, subUserId: string) {
  if (bizType !== MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION) {
    return [0];
  }

  const subUserNumericId = parseMySqlId(subUserId);

  return subUserNumericId == null ? [] : [subUserNumericId];
}

function withMaterialCollectionThirdUserScope<
  T extends { where: (column: string, operator: string, value: unknown) => T },
>(query: T, bizType: number, thirdUserId: string | undefined) {
  return bizType === MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED && thirdUserId
    ? query.where("third_userid", "=", thirdUserId)
    : query;
}

function getQuickReplySubUid(scopeType: QuickReplyScopeType, subUserId: string) {
  if (scopeType === QUICK_REPLY_SCOPE_TYPE.ENTERPRISE) {
    return 0;
  }

  if (scopeType !== QUICK_REPLY_SCOPE_TYPE.PERSONAL) {
    return undefined;
  }

  return parseMySqlId(subUserId);
}

function mapMaterialCollectionGroupRow(
  row: MaterialCollectionGroupRow,
): WorkbenchMaterialCollectionGroupDto {
  return {
    bizType: toMaterialCollectionBizType(row.biz_type),
    id: String(row.id),
    sort: toSafeNumber(row.sort),
    title: row.title,
  };
}

function toMaterialCollectionBizType(value: number): MaterialCollectionBizType {
  switch (value) {
    case MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION:
    case MATERIAL_COLLECTION_BIZ_TYPE.FILE:
    case MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM:
    case MATERIAL_COLLECTION_BIZ_TYPE.H5:
    case MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED:
    case MATERIAL_COLLECTION_BIZ_TYPE.IMAGE:
      return value;
    default:
      throw new Error(`Unsupported material collection biz type: ${value}`);
  }
}

function parseMaterialGroupId(groupId: string | 0) {
  return groupId === 0 || groupId === "0" ? 0 : parseMySqlId(groupId);
}

function parseQuickReplyId(id: string | 0) {
  return id === 0 || id === "0" ? 0 : parseMySqlId(id);
}

function mapQuickReplyCategoryRow(
  row: QuickReplyCategoryRow,
): WorkbenchQuickReplyCategoryDto {
  const parentId = toSafeNumber(String(row.parent_id));

  return {
    id: String(row.id),
    parentId: parentId === 0 ? 0 : String(row.parent_id),
    scopeType: row.scope_type as QuickReplyScopeType,
    sort: toSafeNumber(String(row.sort)),
    title: row.title,
  };
}

function mapQuickReplyRow(row: QuickReplyRow): WorkbenchQuickReplyDto {
  const categoryId = toSafeNumber(String(row.category_id));

  return {
    attachments: normalizeQuickReplyAttachments(parseQuickReplyAttachments(row.attachments)),
    categoryId: categoryId === 0 ? 0 : String(row.category_id),
    contentText: row.content_text ?? "",
    createdAt: toTimestamp(row.create_time),
    id: String(row.id),
    labelColor: row.label_color,
    labelText: row.label_text,
    scopeType: row.scope_type as QuickReplyScopeType,
    sort: toSafeNumber(String(row.sort)),
    updatedAt: toTimestamp(row.update_time),
  };
}

function parseQuickReplyAttachments(value: QuickReplyRow["attachments"]) {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value) {
    return [];
  }

  if (typeof value !== "string") {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseInsertedMySqlId(result: InsertResult) {
  const value = result.insertId ?? result.id;

  if (typeof value === "bigint") {
    return value > 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(value)
      : undefined;
  }

  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  }

  return typeof value === "string" ? parseMySqlId(value) : undefined;
}

function getAffectedRows(result: UpdateResult | UpdateResult[] | undefined): number {
  if (Array.isArray(result)) {
    return result.reduce((sum, item) => sum + getAffectedRows(item), 0);
  }

  if (!result || typeof result !== "object") {
    return 0;
  }

  const affectedRows =
    result.numAffectedRows ??
    result.numUpdatedRows ??
    result.numChangedRows ??
    result.affectedRows;

  if (typeof affectedRows === "bigint") {
    return Number(affectedRows);
  }

  return affectedRows ?? 0;
}

function toSafeNumber(value: number | string | null | undefined) {
  const numericValue = Number(value ?? 0);

  return Number.isFinite(numericValue) ? numericValue : 0;
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

function normalizeCustomerListLimit(value: number | undefined) {
  if (value == null || !Number.isSafeInteger(value) || value <= 0) {
    return DEFAULT_CUSTOMER_LIST_LIMIT;
  }

  return Math.min(value, MAX_CUSTOMER_LIST_LIMIT);
}

function emptyCustomerListPage(): WorkbenchCustomerListResponse {
  return {
    hasMore: false,
    items: [],
    total: 0,
  };
}

function encodeCustomerListCursor(cursor: CustomerListCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function encodeMineCustomerListCursor(cursor: MineCustomerListCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCustomerListCursor(value: string): CustomerListCursor | undefined {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;

    if (!isCustomerListCursor(parsed)) {
      return undefined;
    }

    return parsed;
  } catch {
    return undefined;
  }
}

function decodeMineCustomerListCursor(
  value: string,
): MineCustomerListCursor | undefined {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;

    if (!isMineCustomerListCursor(parsed)) {
      return undefined;
    }

    return parsed;
  } catch {
    return undefined;
  }
}

function isCustomerListCursor(value: unknown): value is CustomerListCursor {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.thirdExternalUserId === "string" &&
    value.thirdExternalUserId.trim().length > 0 &&
    typeof value.updateTime === "number" &&
    Number.isFinite(value.updateTime) &&
    value.updateTime >= 0
  );
}

function isMineCustomerListCursor(value: unknown): value is MineCustomerListCursor {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.addTime === "number" &&
    Number.isFinite(value.addTime) &&
    value.addTime >= 0 &&
    typeof value.bindId === "number" &&
    Number.isSafeInteger(value.bindId) &&
    value.bindId > 0
  );
}

function normalizeCursorTime(value: Date | number | string | null | undefined) {
  if (value instanceof Date) {
    return value.getTime();
  }

  const numberValue = toNumber(value);
  if (numberValue != null) {
    return numberValue;
  }

  const parsedTime =
    typeof value === "string" && value.trim() ? Date.parse(value) : Number.NaN;

  return Number.isFinite(parsedTime) ? parsedTime : 0;
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

function escapeLikeKeyword(keyword: string) {
  return keyword.replace(/[\\%_]/g, "\\$&");
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

function groupCustomerRows(rows: CustomerRow[]): WorkbenchCustomerSummaryDto[] {
  const customersByKey = new Map<string, WorkbenchCustomerSummaryDto>();

  for (const row of rows) {
    const uid = toNumber(row.uid) ?? 0;
    const platform = toNumber(row.platform) ?? 0;
    const customerKey = buildCustomerKey(uid, platform, row.third_external_userid);
    const relation = mapCustomerSeatRelation(row);
    const current =
      customersByKey.get(customerKey) ??
      {
        avatar: row.avatar ?? "",
        bizStatus: row.contact_status ?? 0,
        customerKey,
        lastConversation: mapCustomerLastConversation(row),
        lastMessageTime:
          row.last_message_time == null
            ? undefined
            : normalizeCursorTime(row.last_message_time),
        gender: row.gender ?? null,
        name: row.name ?? "",
        platform,
        realName: row.real_name ?? "",
        relationCount: 0,
        seatRelations: [],
        thirdExternalUserId: row.third_external_userid,
        uid,
      };

    if (!current.seatRelations.some((item) => item.bindId === relation.bindId)) {
      current.seatRelations.push(relation);
      current.relationCount = current.seatRelations.length;
    }

    const lastMessageTime =
      row.last_message_time == null
        ? undefined
        : normalizeCursorTime(row.last_message_time);
    if (lastMessageTime != null) {
      const lastConversation = mapCustomerLastConversation(row);
      if (
        lastConversation &&
        (current.lastMessageTime == null || lastMessageTime > current.lastMessageTime)
      ) {
        current.lastConversation = lastConversation;
      }
      current.lastMessageTime =
        current.lastMessageTime == null
          ? lastMessageTime
          : Math.max(current.lastMessageTime, lastMessageTime);
    }

    customersByKey.set(customerKey, current);
  }

  return [...customersByKey.values()];
}

function mapCustomerSeatRelation(row: CustomerRow): WorkbenchCustomerSeatRelationDto {
  const addTime =
    row.add_time == null ? undefined : normalizeCursorTime(row.add_time);
  const lastMessageTime =
    row.last_message_time == null
      ? undefined
      : normalizeCursorTime(row.last_message_time);

  return {
    ...(addTime == null ? {} : { addTime }),
    bindId: String(row.bind_id),
    bindStatus: row.bind_status ?? 0,
    bindType: row.bind_type ?? 0,
    ...(row.description == null ? {} : { description: row.description }),
    ...(lastMessageTime == null ? {} : { lastMessageTime }),
    seatAvatar: row.seat_avatar ?? "",
    seatId: String(row.seat_id),
    seatName: row.seat_name ?? "",
    thirdUserId: row.third_userid,
  };
}

function mapCustomerLastConversation(
  row: CustomerLastConversationHydratedRow | CustomerRow,
): WorkbenchCustomerLastConversationDto | undefined {
  const isLastMessageRow = "conversation_id" in row;
  const rawConversationId = isLastMessageRow
    ? row.conversation_id
    : row.last_conversation_id;
  const lastMessageTime =
    row.last_message_time == null
      ? undefined
      : normalizeCursorTime(row.last_message_time);
  const rawSeatId = isLastMessageRow ? row.seat_id : row.last_conversation_seat_id;

  if (rawConversationId == null || lastMessageTime == null || rawSeatId == null) {
    return undefined;
  }

  const seatAvatar = isLastMessageRow
    ? row.seat_avatar
    : row.last_conversation_seat_avatar;
  const seatName = isLastMessageRow
    ? row.seat_name
    : row.last_conversation_seat_name;

  return {
    conversationId: String(rawConversationId),
    lastMessageTime,
    seatAvatar: seatAvatar ?? "",
    seatId: String(rawSeatId),
    seatName: seatName ?? "",
  };
}

function buildCustomerKey(uid: number, platform: number, thirdExternalUserId: string) {
  return `${uid}:${platform}:${thirdExternalUserId}`;
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

function buildSortCaseExpression<
  T extends { sort: number },
  K extends keyof T,
>(items: T[], idKey: K) {
  const cases = items.map((item) => {
    const id = parseMySqlId(String(item[idKey]));

    return sql`when ${id} then ${item.sort}`;
  });

  return sql<number>`case id ${sql.join(cases, sql` `)} else sort end`;
}

async function updateSortInBatches<T>(input: {
  batchSize: number;
  idKey: keyof T;
  items: T[];
  runBatch: (items: T[]) => Promise<number>;
}) {
  let affectedRows = 0;

  for (let start = 0; start < input.items.length; start += input.batchSize) {
    const batch = input.items.slice(start, start + input.batchSize);
    affectedRows += await input.runBatch(batch);
  }

  return affectedRows;
}

function isDuplicateKeyError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const value = error as { code?: unknown; errno?: unknown };

  return value.code === "ER_DUP_ENTRY" || value.errno === 1062;
}
