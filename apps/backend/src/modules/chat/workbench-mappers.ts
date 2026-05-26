import type {
  WorkbenchConversationSummaryDto,
  WorkbenchMessageContentType,
  WorkbenchMessageDto,
  WorkbenchMessageFileDownloadStatus,
  WorkbenchQuotedMessagePreviewDto,
  WorkbenchSeatDto,
} from "@chatai/contracts";
import {
  isRecord,
  normalizeMediaAssetUrl,
  readRecordNumber,
  readRecordString,
} from "./workbench-content-utils.js";

export type SeatRow = {
  avatar: string | null;
  host_sub_id: number | string | null;
  id: number | string;
  is_online: number | null;
  last_message_time: Date | number | string | null;
  third_user_name: string;
  third_userid: string;
  unread_count: number | string | null;
};

export type ConversationRow = {
  biz_status?: number | string | null;
  chat_type: number;
  create_time?: Date | number | string | null;
  customer_avatar: string | null;
  customer_name: string | null;
  group_avatar: string | null;
  group_name: string | null;
  id: number | string;
  last_message_content: string | null;
  last_message_type: string | null;
  last_msgtime: Date | number | string | null;
  pinned_time: number | string;
  seat_id: number | string;
  third_external_userid: string;
  third_group_id: string;
  third_userid: string;
  unread_cnt: number | string;
  verified?: number | string | null;
};

export type MessageRow = {
  chat_type: number;
  content: string | null;
  conversation_external_id: string;
  conversation_group_id: string;
  conversation_group_seat_id?: number | string | null;
  conversation_id: number | string;
  from_type: number | null;
  id: number | string;
  msgid: string;
  msgtime: Date | number | string;
  msgtype: string;
  opt_no: string | null;
  revoke_status?: number | string | null;
  seat_id: number | string;
  sender_avatar?: string;
  sender_name?: string;
  status?: number | string | null;
  third_external_id: string | null | undefined;
  third_from_id: string | null | undefined;
  third_group_id: string | null | undefined;
  third_user_id: string | null | undefined;
};

export type MessageRowQuotePreview = WorkbenchQuotedMessagePreviewDto;

export type MessageHydrationSources = {
  contactsByThirdExternalId: Map<
    string,
    {
      avatar: string | null;
      name: string | null;
      realName: string | null;
    }
  >;
  groupMembersByGroupAndThirdUserId: Map<
    string,
    {
      avatar: string | null;
      name: string | null;
      nickname: string | null;
    }
  >;
  seatsByThirdUserId: Map<
    string,
    {
      avatar: string | null;
      name: string | null;
    }
  >;
};

const UNSUPPORTED_MESSAGE_DISPLAY_TEXT = "[暂不支持显示该消息]";
const PLAYABLE_MEDIA_HOST = "b5.bokr.com.cn";
const SOURCE_VOICE_PREFIXES = ["/s5/voice/", "/s5/msg/"] as const;
const PLAYABLE_VOICE_PREFIX = "/s5/playable-voice/";

export function mapSeatRow(row: SeatRow): WorkbenchSeatDto {
  const seatName = row.third_user_name || "未命名席位";
  const hostSubUserId = normalizeOptionalId(row.host_sub_id);

  return {
    avatar: row.avatar ?? "",
    description: "",
    hostSubUserId,
    lastMessageTime: toOptionalTimestamp(row.last_message_time),
    loginStatus: row.is_online === 1 ? "online" : "offline",
    name: seatName,
    operatorName: seatName,
    phone: "",
    seatId: String(row.id),
    thirdUserId: row.third_userid,
    unreadCount: toNumber(row.unread_count),
  };
}

export function mapConversationRow(
  row: ConversationRow,
): WorkbenchConversationSummaryDto {
  const mode = row.chat_type === 2 ? "group" : "single";
  const customerId =
    mode === "group" ? row.third_group_id : row.third_external_userid;
  const customerName =
    mode === "group"
      ? row.group_name || row.third_group_id || "未命名群聊"
      : row.customer_name || row.third_external_userid || "微信客户";
  const customerAvatar =
    mode === "group" ? row.group_avatar ?? "" : row.customer_avatar ?? "";

  return {
    bizStatus: row.biz_status == null ? 0 : toNumber(row.biz_status),
    conversationId: String(row.id),
    createdAt: toOptionalTimestamp(row.create_time),
    customerAvatar,
    customerId,
    customerName,
    isPinned: toNumber(row.pinned_time) > 0 ? true : undefined,
    lastMessage: formatMessagePreview(row.last_message_type, row.last_message_content),
    lastMessageTime: toOptionalTimestamp(row.last_msgtime),
    mode,
    priority: "medium",
    seatId: String(row.seat_id),
    thirdExternalUserId: row.third_external_userid || undefined,
    thirdGroupId: row.third_group_id || undefined,
    thirdUserId: row.third_userid,
    unreadCount: toNumber(row.unread_cnt),
    verified: row.verified == null ? undefined : toNumber(row.verified) === 1,
  };
}

export function mapMessageRow(
  row: MessageRow,
  quotePreview?: MessageRowQuotePreview,
): WorkbenchMessageDto {
  const mode = row.chat_type === 2 ? "group" : "single";
  const thirdExternalUserId =
    row.third_external_id || row.conversation_external_id || undefined;
  const thirdGroupId = row.third_group_id || row.conversation_group_id || undefined;
  const customerId =
    mode === "group"
      ? row.conversation_group_id || row.third_group_id || buildMissingCustomerId(row)
      : row.conversation_external_id || row.third_external_id || buildMissingCustomerId(row);

  return {
    content: parseMessageContent(row.msgtype, row.content, quotePreview),
    contentType: mapContentType(row.msgtype),
    conversationId: String(row.conversation_id),
    createdAt: toOptionalTimestamp(row.msgtime),
    customerId,
    isRevoked: toNumber(row.revoke_status ?? null) === 1 ? true : undefined,
    messageId: row.msgid,
    optNo: row.opt_no || undefined,
    seatId: String(row.seat_id),
    senderAvatar: row.sender_avatar ?? "",
    senderName: row.sender_name,
    senderType: mapSenderType(row),
    seq: toNumber(row.id),
    status: mapMessageStatus(row.status),
    thirdExternalUserId,
    thirdFromId: row.third_from_id || undefined,
    thirdGroupId,
    thirdUserId: row.third_user_id || undefined,
  };
}

export function hydrateMessageRows(
  rows: MessageRow[],
  sources: MessageHydrationSources,
): MessageRow[] {
  return rows.map((row) => {
    if (row.chat_type === 2) {
      const thirdFromId = row.third_from_id || row.third_user_id || undefined;
      const thirdGroupId =
        row.conversation_group_seat_id == null
          ? row.third_group_id || row.conversation_group_id
          : String(row.conversation_group_seat_id);
      const member = thirdFromId
        ? sources.groupMembersByGroupAndThirdUserId.get(
          getGroupMemberHydrationKey(thirdGroupId, thirdFromId),
        )
        : undefined;

      return {
        ...row,
        sender_avatar: member?.avatar ?? "",
        sender_name: member?.nickname || member?.name || thirdFromId || undefined,
      };
    }

    if (row.from_type === 1) {
      const thirdUserId = row.third_user_id || undefined;
      const seat = thirdUserId
        ? sources.seatsByThirdUserId.get(thirdUserId)
        : undefined;

      return {
        ...row,
        sender_avatar: seat?.avatar ?? "",
        sender_name: seat?.name || thirdUserId || undefined,
      };
    }

    if (row.from_type === 2) {
      const thirdExternalId = row.third_external_id || row.conversation_external_id;
      const contact = sources.contactsByThirdExternalId.get(thirdExternalId);

      return {
        ...row,
        sender_avatar: contact?.avatar ?? "",
        sender_name: contact?.realName || contact?.name || thirdExternalId || undefined,
      };
    }

    // from_type=3 is a group robot. Avatar hydration rules are intentionally deferred.
    return {
      ...row,
      sender_avatar: "",
    };
  });
}

export function getGroupMemberHydrationKey(thirdGroupId: string, thirdUserId: string) {
  return `${thirdGroupId}\u0000${thirdUserId}`;
}

function buildMissingCustomerId(row: MessageRow) {
  return `missing-customer:${row.conversation_id}:${row.msgid}`;
}

function mapSenderType(row: MessageRow): WorkbenchMessageDto["senderType"] {
  if (row.msgtype === "system" || row.msgtype === "revoke") {
    return "system";
  }

  if (row.from_type === 3) {
    return "system";
  }

  if (row.chat_type === 2) {
    const thirdFromId = (row.third_from_id || "").trim();
    const thirdUserId = (row.third_user_id || "").trim();

    return thirdFromId && thirdFromId === thirdUserId ? "agent" : "customer";
  }

  switch (row.from_type) {
    case 1:
      return "agent";
    case 2:
      return "customer";
    default:
      return "system";
  }
}

function mapContentType(msgtype: string): WorkbenchMessageContentType {
  switch (msgtype) {
    case "image":
      return "image";
    case "emotion":
      return "emotion";
    case "voice":
      return "voice";
    case "video":
      return "video";
    case "file":
      return "file";
    case "link":
      return "h5";
    case "card":
      return "contact-card";
    case "location":
      return "location";
    case "solitaire":
      return "solitaire";
    case "redpacket":
      return "redpacket";
    case "sphfeed":
      return "sphfeed";
    case "weapp":
      return "mini-program";
    case "quote":
      return "quote";
    case "revoke":
      return "revoke";
    case "system":
      return "system";
    case "text":
      return "text";
    default:
      return "text";
  }
}

function parseMessageContent(
  msgtype: string,
  rawContent: string | null,
  quotePreview?: MessageRowQuotePreview,
) {
  const parsed = parseContent(rawContent);

  if (msgtype === "quote") {
    return {
      quoteMsgId: readQuoteMsgId(parsed),
      quotedMessage: quotePreview,
      text: isRecord(parsed) ? readStringField(parsed, "content") : "",
    };
  }

  if (msgtype === "text") {
    if (typeof parsed === "object" && parsed && "text" in parsed) {
      return { text: String(parsed.text ?? "") };
    }

    return { text: String(parsed ?? "") };
  }

  if (msgtype === "system") {
    return { text: readSystemMessageText(parsed, rawContent) };
  }

  if (msgtype === "revoke") {
    return readRevokeMessageContent(parsed, rawContent);
  }

  switch (msgtype) {
    case "image":
    case "emotion":
      return {
        alt: "图片",
        imageUrl: normalizeMediaAssetUrl(readStringField(parsed, "fileUrl")),
      };
    case "voice":
      return {
        audioUrl: normalizeMediaAssetUrl(readStringField(parsed, "fileUrl")),
        durationLabel: "",
        ...buildVoiceTranscodeContent(parsed),
      };
    case "video":
      return {
        alt: "视频",
        coverImageUrl: normalizeMediaAssetUrl(readStringField(parsed, "coverUrl")),
        downloadStatus: readDownloadStatus(parsed),
        durationLabel: "",
        fileSerialNo: readStringField(parsed, "fileSerialNo"),
        fileUrlExpireTime: readNumberField(parsed, "fileUrlExpireTime"),
        videoUrl: normalizeMediaAssetUrl(readStringField(parsed, "fileUrl")),
      };
    case "file": {
      const fileName = readStringField(parsed, "fileName") || "未知文件";
      const extension = readStringField(parsed, "fileExt") || getFileExtension(fileName);

      return {
        downloadStatus: readDownloadStatus(parsed),
        extension,
        fileName,
        fileSerialNo: readStringField(parsed, "fileSerialNo"),
        fileSizeLabel: formatFileSize(readNumberField(parsed, "fileSize")),
        fileUrl: normalizeMediaAssetUrl(readStringField(parsed, "fileUrl")),
        sourceLabel: "文件",
      };
    }
    case "link":
      return {
        description:
          readStringField(parsed, "desc") || readStringField(parsed, "description"),
        previewImageUrl: normalizeMediaAssetUrl(
          readStringField(parsed, "coverUrl") || readStringField(parsed, "imageUrl"),
        ),
        sourceLabel: "链接",
        title: readStringField(parsed, "title") || formatMessagePreview(msgtype, rawContent),
        url: normalizeMediaAssetUrl(
          readStringField(parsed, "href") || readStringField(parsed, "linkUrl"),
        ),
      };
    case "card":
      return {
        avatarUrl: normalizeMediaAssetUrl(readStringField(parsed, "avatar")),
        company: readStringField(parsed, "company"),
        contactSerialNo: readStringField(parsed, "contactSerialNo"),
        groupSerialNo: readStringField(parsed, "groupSerialNo"),
        name: readStringField(parsed, "name") || "未知联系人",
        sourceLabel: "个人名片",
      };
    case "location":
      return {
        address: readStringField(parsed, "address"),
        latitude: readNumberField(parsed, "latitude"),
        longitude: readNumberField(parsed, "longitude"),
        title: readStringField(parsed, "title") || "位置",
        zoom: readNumberField(parsed, "zoom"),
      };
    case "sphfeed":
      return {
        description: readStringField(parsed, "description").trim(),
        imageUrl: normalizeMediaAssetUrl(readStringField(parsed, "imageUrl")),
        sourceLabel: "视频号",
        title: readStringField(parsed, "title") || "视频号",
        url: normalizeMediaAssetUrl(
          readStringField(parsed, "linkUrl") || readStringField(parsed, "url"),
        ),
      };
    case "solitaire":
      return {
        createMemberSerialNo: readStringField(parsed, "createMemberSerialNo"),
        example: readStringField(parsed, "example"),
        items: readSolitaireItems(parsed),
        tail: readStringField(parsed, "tail"),
        title: readStringField(parsed, "title") || formatMessagePreview(msgtype, rawContent),
      };
    case "redpacket":
      return {
        description: readStringField(parsed, "description"),
        title: readStringField(parsed, "title") || "红包",
        totalAmount: readNumberField(parsed, "totalAmount"),
        totalCnt: readNumberField(parsed, "totalCnt"),
      };
    case "weapp":
      return {
        appName: readStringField(parsed, "title") || "小程序",
        coverImageUrl: normalizeMediaAssetUrl(readStringField(parsed, "fileUrl")),
        logoUrl: normalizeMediaAssetUrl(readStringField(parsed, "logoUrl")),
        sourceLabel: "小程序",
        title: readStringField(parsed, "description") || "小程序",
      };
    default:
      if (!msgtype && !rawContent) {
        return {
          text: UNSUPPORTED_MESSAGE_DISPLAY_TEXT,
        };
      }

      return {
        text: formatMessagePreview(msgtype, rawContent),
      };
  }
}

function buildVoiceTranscodeContent(parsed: unknown) {
  const transFileUrl = normalizeMediaAssetUrl(readStringField(parsed, "transFileUrl"));
  const audioUrl = normalizeMediaAssetUrl(readStringField(parsed, "fileUrl"));
  const playbackUrl = transFileUrl || buildDerivedVoicePlaybackUrl(audioUrl);

  return {
    ...(playbackUrl ? { playbackUrl } : {}),
    transFileUrl,
    transFileUrlPersisted: Boolean(transFileUrl),
    transVoiceText: readStringField(parsed, "transVoiceText"),
  };
}

function buildDerivedVoicePlaybackUrl(rawUrl: string) {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return undefined;
  }

  if (url.protocol !== "https:" || url.hostname !== PLAYABLE_MEDIA_HOST) {
    return undefined;
  }

  const sourcePrefix = SOURCE_VOICE_PREFIXES.find((prefix) =>
    url.pathname.startsWith(prefix),
  );

  if (!sourcePrefix) {
    return undefined;
  }

  url.pathname = `${PLAYABLE_VOICE_PREFIX}${url.pathname.slice(sourcePrefix.length)}`
    .replace(/\.[^/.]+$/u, ".wav");
  url.search = "";
  url.hash = "";

  return url.toString();
}

function formatMessagePreview(msgtype: string | null, rawContent: string | null) {
  if (msgtype == null && !rawContent) {
    return "";
  }

  const parsed = parseContent(rawContent);

  if (msgtype === "text" || msgtype === "system") {
    return readSystemMessageText(parsed, rawContent);
  }

  switch (msgtype) {
    case "image":
      return "[图片]";
    case "voice":
      return "[语音]";
    case "video":
      return "[视频]";
    case "file":
      return "[文件]";
    case "link":
      return "[链接]";
    case "weapp":
      return "[小程序]";
    case "card":
      return "[名片]";
    case "emotion":
      return "[表情]";
    case "location":
      return "[位置]";
    case "redpacket":
      return "[红包]";
    case "sphfeed":
      return "[视频号]";
    case "revoke":
      return "[撤回消息]";
    case "solitaire":
      return "[群接龙]";
    case "chatrecord":
      return "[聊天记录]";
    case "quote":
      return "[引用消息]";
    default:
      return "[新消息]";
  }
}

function readSystemMessageText(parsed: unknown, rawContent: string | null) {
  if (isRecord(parsed)) {
    const text =
      readStringField(parsed, "text") ||
      readStringField(parsed, "content") ||
      readStringField(parsed, "unsupportedDisplayText") ||
      readStringField(parsed, "title");

    if (text) {
      return text;
    }

    return "";
  }

  if (typeof parsed === "string") {
    return parsed;
  }

  return rawContent ?? "";
}

function mapMessageStatus(status: number | string | null | undefined) {
  return toNumber(status ?? 1) === 0 ? "failed" : "sent";
}

function readRevokeMessageContent(parsed: unknown, rawContent: string | null) {
  if (!isRecord(parsed)) {
    return {
      text: formatMessagePreview("revoke", rawContent),
    };
  }

  return {
    revokeMsgId: readOptionalIdField(parsed, "revokeMsgId"),
    revokeOriginMsgId: readOptionalIdField(parsed, "revokeOriginMsgId"),
    text: readSystemMessageText(parsed, rawContent),
  };
}

export function getQuoteMessageAuditId(row: MessageRow) {
  if (row.msgtype !== "quote") {
    return undefined;
  }

  const quoteMsgId = readQuoteMsgId(parseContent(row.content));
  const numeric = Number(quoteMsgId);

  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : undefined;
}

export function buildQuotedMessagePreview(row: MessageRow): MessageRowQuotePreview {
  const mapped = mapMessageRow(row);
  const senderName = row.sender_name || getSenderFallbackName(row);

  switch (mapped.contentType) {
    case "revoke":
      return {
        contentType: "revoke",
        fallbackText: "[撤回消息]",
        senderName,
      };
    case "text":
      return {
        contentType: "text",
        senderName,
        text: String(mapped.content.text ?? ""),
      };
    case "image":
    case "emotion":
      return {
        contentType: mapped.contentType,
        imageUrl: readRecordString(mapped.content, "imageUrl"),
        senderName,
      };
    default: {
      const imageUrl = getPreviewImageUrl(mapped.content);
      const title = getPreviewTitle(mapped.content, mapped.contentType, row.content);

      return {
        contentType: mapped.contentType,
        ...(imageUrl ? { imageUrl } : {}),
        senderName,
        title,
      };
    }
  }
}

export function buildMissingQuotedMessagePreview(): MessageRowQuotePreview {
  return {
    contentType: "text",
    fallbackText: "引用消息不可用",
    senderName: "",
    text: "引用消息不可用",
  };
}

function readQuoteMsgId(value: unknown) {
  if (!isRecord(value)) {
    return "";
  }

  const field = value.quoteMsgId;

  if (typeof field === "number" && Number.isSafeInteger(field)) {
    return String(field);
  }

  return typeof field === "string" ? field.trim() : "";
}

function getSenderFallbackName(row: MessageRow) {
  if (row.chat_type === 2) {
    return row.third_from_id || row.third_user_id || "";
  }

  if (row.from_type === 1) {
    return row.third_user_id || "";
  }

  if (row.from_type === 2) {
    return row.third_external_id || row.conversation_external_id || "";
  }

  return "";
}

function getPreviewImageUrl(content: Record<string, unknown>) {
  return (
    readRecordString(content, "previewImageUrl") ||
    readRecordString(content, "coverImageUrl") ||
    readRecordString(content, "imageUrl") ||
    readRecordString(content, "avatarUrl")
  );
}

function getPreviewTitle(
  content: Record<string, unknown>,
  contentType: WorkbenchMessageContentType,
  rawContent: string | null,
) {
  return (
    readRecordString(content, "title") ||
    readRecordString(content, "name") ||
    readRecordString(content, "fileName") ||
    readRecordString(content, "appName") ||
    readRecordString(content, "address") ||
    formatMessagePreview(reverseMapContentType(contentType), rawContent)
  );
}

function reverseMapContentType(contentType: WorkbenchMessageContentType) {
  switch (contentType) {
    case "h5":
      return "link";
    case "mini-program":
      return "weapp";
    case "contact-card":
      return "card";
    default:
      return contentType;
  }
}

function parseContent(rawContent: string | null): unknown {
  const content = rawContent?.trim();

  if (!content) {
    return "";
  }

  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

function readStringField(value: unknown, key: string) {
  if (!isRecord(value)) {
    return "";
  }

  const field = value[key];

  return typeof field === "string" ? field : "";
}

function readOptionalIdField(value: unknown, key: string) {
  if (!isRecord(value)) {
    return "";
  }

  const field = value[key];

  if (typeof field === "number" && Number.isSafeInteger(field) && field > 0) {
    return String(field);
  }

  return typeof field === "string" ? field : "";
}

export function readDownloadStatus(
  value: unknown,
): WorkbenchMessageFileDownloadStatus | undefined {
  const status = readStringField(value, "downloadStatus");

  return status === "ing" || status === "finished" || status === "failed"
    ? status
    : undefined;
}

function readNumberField(value: unknown, key: string) {
  return isRecord(value) ? readRecordNumber(value, key) : undefined;
}

function readSolitaireItems(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return [];
  }

  return value.items.map((item) => {
    const itemRecord = isRecord(item) ? item : {};

    return {
      content: String(itemRecord.content ?? ""),
      memberSerialNo: readStringField(itemRecord, "memberSerialNo"),
      timestamp: readNumberField(itemRecord, "timestamp"),
    };
  });
}

function getFileExtension(fileName: string) {
  const lastSegment = fileName.split(/[\\/]/).pop() ?? "";
  const dotIndex = lastSegment.lastIndexOf(".");

  return dotIndex >= 0 && dotIndex < lastSegment.length - 1
    ? lastSegment.slice(dotIndex + 1).toLowerCase()
    : "";
}

function formatFileSize(size: number | undefined) {
  if (!size || size <= 0) {
    return "";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return unitIndex === 0
    ? `${Math.round(value)} ${units[unitIndex]}`
    : `${value.toFixed(2)} ${units[unitIndex]}`;
}

function normalizeOptionalId(value: number | string | null) {
  const id = String(value ?? "");

  return id && id !== "0" ? id : undefined;
}

function toNumber(value: number | string | null | undefined) {
  if (value == null || value === "") {
    return 0;
  }

  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : 0;
}

function toOptionalTimestamp(value: Date | number | string | null | undefined) {
  const timestamp = parseTimestamp(value);

  return timestamp && timestamp > 0 ? timestamp : undefined;
}

function parseTimestamp(value: Date | number | string | null | undefined) {
  if (value == null || value === "") {
    return undefined;
  }

  if (value instanceof Date) {
    const timestamp = value.getTime();

    return Number.isFinite(timestamp) ? timestamp : undefined;
  }

  const numeric = Number(value);

  if (Number.isFinite(numeric)) {
    return numeric;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? timestamp : undefined;
}
