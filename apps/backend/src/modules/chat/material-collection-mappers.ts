import {
  MATERIAL_COLLECTION_BIZ_TYPE,
  type MaterialCollectionBizType,
  type WorkbenchMaterialCollectionContentType,
  type WorkbenchMaterialCollectionItemDto,
  type WorkbenchMessageContentType,
} from "@chatai/contracts";
import type { Selectable } from "kysely";
import type { XyWapEmbedMaterialCollection } from "../../db/schema.js";
import { mapMessageRow, type MessageRow } from "./workbench-mappers.js";

export type MaterialCollectionRow = Selectable<XyWapEmbedMaterialCollection>;

export function getMaterialContentTypeForBizType(
  bizType: MaterialCollectionBizType,
): WorkbenchMaterialCollectionContentType | undefined {
  switch (bizType) {
    case MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION:
      return "emotion";
    case MATERIAL_COLLECTION_BIZ_TYPE.FILE:
      return "file";
    case MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM:
      return "mini-program";
    case MATERIAL_COLLECTION_BIZ_TYPE.H5:
      return "h5";
    default:
      return undefined;
  }
}

export function getMaterialBizTypeForMessageContentType(
  contentType: WorkbenchMessageContentType,
): MaterialCollectionBizType | undefined {
  switch (contentType) {
    case "emotion":
      return MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION;
    case "file":
      return MATERIAL_COLLECTION_BIZ_TYPE.FILE;
    case "mini-program":
      return MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM;
    case "h5":
      return MATERIAL_COLLECTION_BIZ_TYPE.H5;
    default:
      return undefined;
  }
}

export function mapMaterialCollectionItem(
  row: MaterialCollectionRow,
): WorkbenchMaterialCollectionItemDto {
  const bizType = toMaterialBizType(row.biz_type);
  const mappedMessage = mapMessageRow(buildMessageRow(row, bizType));
  const contentType = getMaterialContentTypeForBizType(bizType) ?? "file";
  const content = isRecord(mappedMessage.content) ? mappedMessage.content : {};
  const messageId = row.msgid;

  return {
    bizType,
    content,
    contentType,
    createdAt: toOptionalTimestamp(row.create_time),
    groupId: toGroupId(row.group_id),
    id: String(row.id),
    messageId,
    sort: toNumber(row.sort),
    title: resolveTitle(row.title, content, contentType, messageId),
    updatedAt: toOptionalTimestamp(row.update_time),
  };
}

function buildMessageRow(
  row: MaterialCollectionRow,
  bizType: MaterialCollectionBizType,
): MessageRow {
  return {
    chat_type: 1,
    content: row.content,
    conversation_external_id: "",
    conversation_group_id: "",
    conversation_id: 0,
    from_type: 2,
    id: row.id,
    msgid: row.msgid,
    msgtime: row.create_time,
    msgtype: getMsgTypeForBizType(bizType),
    opt_no: null,
    seat_id: 0,
    status: 1,
    third_external_id: null,
    third_from_id: null,
    third_group_id: null,
    third_user_id: null,
  };
}

function getMsgTypeForBizType(bizType: MaterialCollectionBizType) {
  switch (bizType) {
    case MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION:
      return "emotion";
    case MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM:
      return "weapp";
    case MATERIAL_COLLECTION_BIZ_TYPE.H5:
      return "link";
    case MATERIAL_COLLECTION_BIZ_TYPE.FILE:
    default:
      return "file";
  }
}

function toMaterialBizType(value: number): MaterialCollectionBizType {
  switch (value) {
    case MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION:
    case MATERIAL_COLLECTION_BIZ_TYPE.FILE:
    case MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM:
    case MATERIAL_COLLECTION_BIZ_TYPE.H5:
      return value;
    default:
      throw new Error(`Unsupported material collection biz type: ${value}`);
  }
}

function resolveTitle(
  rawTitle: string | null,
  content: Record<string, unknown>,
  contentType: WorkbenchMaterialCollectionContentType,
  messageId: string,
) {
  const title = rawTitle?.trim();

  if (title) {
    return title;
  }

  if (contentType === "mini-program") {
    return readString(content, "appName") || readString(content, "title") || messageId;
  }

  return (
    readString(content, "title") ||
    readString(content, "fileName") ||
    readString(content, "appName") ||
    messageId
  );
}

function toGroupId(value: number) {
  return value === 0 ? 0 : String(value);
}

function toOptionalTimestamp(value: Date | number | string | null | undefined) {
  if (value == null) {
    return undefined;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function toNumber(value: number | string | null | undefined) {
  const numericValue = Number(value ?? 0);

  return Number.isFinite(numericValue) ? numericValue : 0;
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
