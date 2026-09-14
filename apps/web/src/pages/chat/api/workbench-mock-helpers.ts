import {
  seedAccounts,
  seedConversations,
  seedGroupMembersByConversationId,
  seedMessages,
} from "@/pages/chat/mock-data";
import {
  type WorkbenchConversationDeleteResponse,
  type WorkbenchSeatChangeDto,
  type WorkbenchSeatDto,
  type WorkbenchConversationChangeDto,
  type WorkbenchConversationSummaryDto,
  type WorkbenchHistoryMessageQuery,
  type WorkbenchHistoryMessageScope,
  type WorkbenchGroupMembersResponse,
  type WorkbenchSubUserDto,
  type WorkbenchMessageDto,
  type WorkbenchMessageStatus,
  type WorkbenchMessageUpdateEventDto,
  type WorkbenchSendMessagePayload,
  MATERIAL_COLLECTION_BIZ_TYPE,
  type MaterialCollectionBizType,
  type WorkbenchMaterialCollectionCreateRequest,
  type WorkbenchMaterialCollectionGroupDto,
  type WorkbenchMaterialCollectionItemDto,
  type WorkbenchQuickReplyCategoryDto,
  type WorkbenchQuickReplyDto,
  buildMaterialFileContentJson,
  buildMaterialH5ContentJson,
  buildMaterialImageContentJson,
  buildMaterialMiniProgramContentJson,
  buildMaterialVideoContentJson,
  isOwnVideoMaterialUrl,
  resolveMaterialFileCollectFields,
  resolveMaterialH5CollectFields,
  resolveMaterialImageCollectFields,
  resolveMaterialMiniProgramCollectFields,
  resolveMaterialVideoCollectFields,
} from "@chatai/contracts";
import type {
  ChatMode,
  FileMessageContent,
  Message,
  VideoMessageContent,
} from "@/pages/chat/chat-types";

export type WorkbenchEvent =
  | {
      version: number;
      type: "seat";
      payload: WorkbenchSeatChangeDto;
    }
  | {
      version: number;
      type: "conversation";
      payload: WorkbenchConversationChangeDto;
    }
  | {
      version: number;
      type: "message";
      payload: WorkbenchMessageDto;
    }
  | {
      version: number;
      type: "message-update";
      payload: WorkbenchMessageUpdateEventDto;
    };

export type MockState = {
  seats: WorkbenchSeatDto[];
  conversationsByAccount: Record<string, WorkbenchConversationSummaryDto[]>;
  subUser: WorkbenchSubUserDto;
  events: WorkbenchEvent[];
  groupMembersByConversationId: Record<string, WorkbenchGroupMembersResponse["items"]>;
  materialGroups: WorkbenchMaterialCollectionGroupDto[];
  materialItems: WorkbenchMaterialCollectionItemDto[];
  messagesByConversationId: Record<string, WorkbenchMessageDto[]>;
  nextId: number;
  quickReplyCategories: WorkbenchQuickReplyCategoryDto[];
  quickReplies: WorkbenchQuickReplyDto[];
  version: number;
};

export const CURRENT_SUB_USER_ID = "sub-user-001";
const INITIAL_VERSION = 1_778_400_000_000;
const MOCK_SEAT_UNREAD_COUNTS: Record<string, number> = {
  drc: 13,
  ndt: 1,
};

type MockHistoryCursor = {
  anchorSeq?: number;
  direction?: "next" | "prev";
};

export function filterMockHistoryMessages(
  state: MockState,
  conversationId: string,
  messages: WorkbenchMessageDto[],
  options?: WorkbenchHistoryMessageQuery,
) {
  const conversation = findConversation(state, conversationId);

  return messages.filter((message) => {
    if (!matchesMockHistoryScope(message, options?.scope)) {
      return false;
    }

    if (options?.day && !matchesMockHistoryDay(message, options.day)) {
      return false;
    }

    if (options?.senderId && !matchesMockHistorySender(conversation, message, options.senderId)) {
      return false;
    }

    return true;
  });
}

function matchesMockHistoryScope(
  message: WorkbenchMessageDto,
  scope: WorkbenchHistoryMessageScope | undefined,
) {
  if (!scope || scope === "all") {
    return true;
  }

  if (scope === "file") {
    return message.contentType === "file";
  }

  if (scope === "media") {
    return message.contentType === "image" || message.contentType === "video";
  }

  if (scope === "h5") {
    return message.contentType === "h5";
  }

  return message.contentType === "mini-program";
}

function matchesMockHistoryDay(message: WorkbenchMessageDto, day: string) {
  const createdAt = message.createdAt ?? 0;

  if (createdAt <= 0) {
    return false;
  }

  const date = new Date(createdAt);
  const localDay = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

  return localDay === day;
}

function matchesMockHistorySender(
  conversation: WorkbenchConversationSummaryDto | undefined,
  message: WorkbenchMessageDto,
  senderId: string,
) {
  const candidateSenderIds = new Set<string>([
    message.thirdFromId ?? "",
    message.thirdUserId ?? "",
    message.thirdExternalUserId ?? "",
  ]);

  if (conversation?.mode === "single") {
    if (message.senderType === "customer") {
      candidateSenderIds.add(conversation.thirdExternalUserId ?? "");
    }

    if (message.senderType === "agent") {
      candidateSenderIds.add(conversation.thirdUserId ?? "");
    }
  }

  return candidateSenderIds.has(senderId);
}

export function normalizeHistoryLimit(limit?: number) {
  if (limit == null || !Number.isFinite(limit) || limit <= 0) {
    return 30;
  }

  return Math.min(100, Math.floor(limit));
}

export function decodeMockHistoryCursor(cursor?: string): MockHistoryCursor | undefined {
  if (!cursor) {
    return undefined;
  }

  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as MockHistoryCursor;
  } catch {
    return undefined;
  }
}

function encodeMockHistoryCursor(cursor: MockHistoryCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function sliceMockHistoryMessages(
  messages: WorkbenchMessageDto[],
  input: {
    cursor?: MockHistoryCursor;
    day?: string;
    limit: number;
  },
) {
  const { cursor, day, limit } = input;
  const direction = cursor?.direction ?? (day ? "next" : "prev");
  const anchorSeq = cursor?.anchorSeq;
  const anchorIndex =
    anchorSeq == null ? -1 : messages.findIndex((message) => message.seq === anchorSeq);

  let startIndex: number;

  if (anchorSeq == null) {
    startIndex = direction === "next" ? 0 : Math.max(0, messages.length - limit);
  } else if (direction === "next") {
    startIndex = Math.max(0, anchorIndex + 1);
  } else {
    startIndex = Math.max(0, anchorIndex - limit);
  }

  const pageMessages = messages.slice(startIndex, startIndex + limit);
  const hasPrev = startIndex > 0;
  const hasNext = startIndex + pageMessages.length < messages.length;

  return {
    hasNext,
    hasPrev,
    messages: pageMessages,
    nextCursor: hasNext
      ? encodeMockHistoryCursor({
          anchorSeq: pageMessages.at(-1)?.seq,
          direction: "next",
        })
      : undefined,
    prevCursor: hasPrev
      ? encodeMockHistoryCursor({
          anchorSeq: pageMessages[0]?.seq,
          direction: "prev",
        })
      : undefined,
  };
}

export function buildInitialState(): MockState {
  const conversationsByAccount = Object.fromEntries(
    Object.entries(seedConversations).map(([seatId, conversations]) => [
      seatId,
      sortConversations(
        conversations.map((conversation) => ({
          seatId: conversation.accountId,
          conversationId: conversation.id,
          bizStatus: conversation.bizStatus ?? 1,
          conversationAIHostingSwitch: conversation.conversationAIHostingSwitch,
          handoffMsgId: conversation.handoffMsgId,
          customerAvatar: conversation.customerAvatarUrl,
          customerBindType:
            conversation.mode === "single"
              ? conversation.customerBindType ?? 1
              : undefined,
          customerId: conversation.customerId,
          customerName: conversation.customerName,
          lastMessage: conversation.preview,
          lastMessageId: conversation.preview ? 1 : undefined,
          lastMessageTime: new Date(conversation.updatedAt.replace(" ", "T")).getTime(),
          isPinned: conversation.isPinned,
          mode: conversation.mode,
          priority: conversation.priority,
          replied: conversation.replied ?? true,
          unreadCount: conversation.unread,
          thirdUserId: `third-user-${seatId}`,
          ...(conversation.mode === "group"
            ? { thirdGroupId: `third-group-${conversation.id}` }
            : {}),
        })),
      ),
    ]),
  ) as Record<string, WorkbenchConversationSummaryDto[]>;

  const seats: WorkbenchSeatDto[] = seedAccounts.map((seat) => ({
    seatId: seat.id,
    avatar: seat.avatarUrl,
    description: seat.description,
    lastMessageTime: getAccountLastMessageTime(conversationsByAccount[seat.id] ?? []),
    loginStatus: "online",
    name: seat.name,
    operatorName: seat.operator,
    phone: seat.phone,
    hostSubUserId: seat.id === "drc" ? CURRENT_SUB_USER_ID : undefined,
    semiAutoAuth: true,
    semiAutoSwitch: true,
    seatAIAssistantEnabled: true,
    seatGroupAIHostingEnabled: true,
    seatGroupAIAssistantEnabled: true,
    unreadCount: seat.unreadCount ?? MOCK_SEAT_UNREAD_COUNTS[seat.id] ?? 0,
  }));

  const messagesByConversationId = Object.fromEntries(
    Object.entries(seedMessages).map(([conversationId, messages]) => [
      conversationId,
      messages.map((message, index) =>
        buildMessageDto({
          message,
          seq: index + 1,
        }),
      ),
    ]),
  ) as Record<string, WorkbenchMessageDto[]>;
  const groupMembersByConversationId = Object.fromEntries(
    Object.entries(seedGroupMembersByConversationId).map(([conversationId, members]) => [
      conversationId,
      members.map((member) => ({
        avatarUrl: member.avatarUrl ?? "",
        displayName: member.displayName,
        thirdUserId: member.id,
        type: member.type,
      })),
    ]),
  ) as MockState["groupMembersByConversationId"];

  return {
    seats,
    conversationsByAccount,
    subUser: {
      displayName: "林洒",
      subUserId: CURRENT_SUB_USER_ID,
    },
    events: [],
    groupMembersByConversationId,
    materialGroups: [
      {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        id: "mock-material-group-file",
        sort: 200,
        title: "常用文件",
      },
      {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM,
        id: "mock-material-group-mini-program",
        sort: 200,
        title: "常用小程序",
      },
      {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
        id: "mock-material-group-h5",
        sort: 200,
        title: "常用链接",
      },
      {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED,
        id: "mock-material-group-sphfeed",
        sort: 200,
        title: "常用视频号",
      },
      {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.IMAGE,
        id: "mock-material-group-image",
        sort: 200,
        title: "常用图片",
      },
      {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.VIDEO,
        id: "mock-material-group-video",
        sort: 200,
        title: "常用视频",
      },
    ],
    materialItems: buildInitialMaterialItems(messagesByConversationId),
    messagesByConversationId,
    nextId: 1,
    quickReplyCategories: [],
    quickReplies: [],
    version: INITIAL_VERSION,
  };
}

function buildInitialMaterialItems(
  messagesByConversationId: Record<string, WorkbenchMessageDto[]>,
): WorkbenchMaterialCollectionItemDto[] {
  return Object.values(messagesByConversationId)
    .flat()
    .flatMap((message) => {
      const bizType = getMaterialBizTypeForContentType(message.contentType);

      if (!bizType) {
        return [];
      }

      if (
        bizType === MATERIAL_COLLECTION_BIZ_TYPE.VIDEO &&
        !canMockCollectVideoMessage(message)
      ) {
        return [];
      }

      const groupId = getMockMaterialGroupId(bizType);

      return [
        {
          bizType,
          content: getMockMaterialSourceContentRecord(message, bizType),
          contentType: getMaterialContentType(bizType),
          groupId,
          id: `mock-material-${message.msgid}`,
          msgInfoId: getMockMessageInfoId(message),
          sort: (message.createdAt ?? 0) + bizType,
          title: getMaterialTitle(message),
        },
      ];
    })
    .sort(sortMaterialItems);
}

function buildMessageDto({
  message,
  seq,
}: {
  message: Message;
  seq: number;
}): WorkbenchMessageDto {
  const seatId = getSeatIdByConversationId(message.conversationId);
  const customerId = getCustomerIdByConversationId(message.conversationId);
  const isGroupConversation = isGroupConversationId(message.conversationId);

  return {
    seatId,
    content: buildContent(message),
    contentType: message.content.type,
    conversationId: message.conversationId,
    createdAt: new Date(message.sentAt.replace(" ", "T")).getTime(),
    customerId,
    failReason: message.failReason,
    isRevoked: message.isRevoked,
    msgid: message.msgid ?? message.uiMessageKey,
    rawMsgtype: getMockRawMsgtype(message.content.type),
    senderAvatar: message.role === "system" ? undefined : message.sender.avatarUrl,
    senderName: message.role === "system" ? undefined : message.sender.name,
    senderType: message.role,
    seq,
    status: normalizeBackendStatus(message.status),
    thirdFromId: message.role === "system"
      ? undefined
      : message.sender.groupMemberId ?? (isGroupConversation ? message.sender.id : undefined),
    thirdGroupId: isGroupConversation
      ? `third-group-${message.conversationId}`
      : undefined,
    thirdUserId: isGroupConversation
      ? `third-user-${seatId}`
      : undefined,
  };
}

export function buildMaterialItemFromMessage(
  state: MockState,
  message: WorkbenchMessageDto,
  request: WorkbenchMaterialCollectionCreateRequest,
): WorkbenchMaterialCollectionItemDto {
  const bizType = request.bizType;
  const contentType = getMaterialContentType(bizType);
  const groupId =
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION
      ? 0
      : String(request.groupId);

  return {
    bizType,
    content: getMockMaterialSourceContentRecord(message, bizType),
    contentType,
    groupId,
    id: `mock-material-${state.nextId++}`,
    msgInfoId: getMockMessageInfoId(message),
    sort: Date.now(),
    title: getMaterialTitle(message),
  };
}

export function buildFallbackMaterialItem(
  state: MockState,
  request: WorkbenchMaterialCollectionCreateRequest,
): WorkbenchMaterialCollectionItemDto {
  const contentType = getMaterialContentType(request.bizType);
  const groupId =
    request.bizType === MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION
      ? 0
      : String(request.groupId);
  const id = `mock-material-${state.nextId++}`;

  return {
    bizType: request.bizType,
    content: {},
    contentType,
    groupId,
    id,
    msgInfoId: readNumericIdString(request.msgInfoId) ?? id,
    sort: Date.now(),
    title: request.msgInfoId,
  };
}

export function getMockMessageInfoId(message: WorkbenchMessageDto) {
  return String(message.seq);
}

function readNumericIdString(value: string) {
  const normalized = value.trim();

  return /^[1-9]\d*$/.test(normalized) ? normalized : undefined;
}

function getMaterialBizTypeForContentType(
  contentType: WorkbenchMessageDto["contentType"],
): MaterialCollectionBizType | undefined {
  switch (contentType) {
    case "emotion":
      return MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION;
    case "image":
      return MATERIAL_COLLECTION_BIZ_TYPE.IMAGE;
    case "video":
      return MATERIAL_COLLECTION_BIZ_TYPE.VIDEO;
    case "file":
      return MATERIAL_COLLECTION_BIZ_TYPE.FILE;
    case "mini-program":
      return MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM;
    case "h5":
      return MATERIAL_COLLECTION_BIZ_TYPE.H5;
    case "sphfeed":
      return MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED;
    default:
      return undefined;
  }
}

function getMaterialContentType(
  bizType: MaterialCollectionBizType,
): WorkbenchMaterialCollectionItemDto["contentType"] {
  switch (bizType) {
    case MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION:
      return "emotion";
    case MATERIAL_COLLECTION_BIZ_TYPE.IMAGE:
      return "image";
    case MATERIAL_COLLECTION_BIZ_TYPE.VIDEO:
      return "video";
    case MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM:
      return "mini-program";
    case MATERIAL_COLLECTION_BIZ_TYPE.H5:
      return "h5";
    case MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED:
      return "sphfeed";
    case MATERIAL_COLLECTION_BIZ_TYPE.FILE:
      return "file";
  }
}

function getMockMaterialGroupId(bizType: MaterialCollectionBizType): string | 0 {
  switch (bizType) {
    case MATERIAL_COLLECTION_BIZ_TYPE.FILE:
      return "mock-material-group-file";
    case MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM:
      return "mock-material-group-mini-program";
    case MATERIAL_COLLECTION_BIZ_TYPE.H5:
      return "mock-material-group-h5";
    case MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED:
      return "mock-material-group-sphfeed";
    case MATERIAL_COLLECTION_BIZ_TYPE.IMAGE:
      return "mock-material-group-image";
    case MATERIAL_COLLECTION_BIZ_TYPE.VIDEO:
      return "mock-material-group-video";
    case MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION:
      return 0;
  }
}

function getMaterialContentRecord(message: WorkbenchMessageDto) {
  return isRecord(message.content) ? message.content : {};
}

export function getMaterialContentRecordFromItem(item: WorkbenchMaterialCollectionItemDto) {
  return isRecord(item.content) ? item.content : {};
}

function getMockMaterialSourceContentRecord(
  message: WorkbenchMessageDto,
  bizType: MaterialCollectionBizType,
) {
  const content = getMaterialContentRecord(message);

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.VIDEO) {
    const { coverImageUrl, videoUrl, ...restContent } = content;

    return {
      ...restContent,
      coverUrl: readString(coverImageUrl),
      fileUrl: readString(videoUrl),
    };
  }

  return content;
}

function canMockCollectVideoMessage(message: WorkbenchMessageDto) {
  if (message.contentType !== "video") {
    return false;
  }

  const content = getMaterialContentRecord(message);

  return (
    message.senderType === "agent" &&
    readString(content.downloadStatus) === "finished" &&
    readString(content.coverImageUrl).length > 0 &&
    readString(content.videoUrl).length > 0
  );
}

export function resolveMockMaterialCollect(
  message: WorkbenchMessageDto | undefined,
  request: WorkbenchMaterialCollectionCreateRequest,
):
  | { content: WorkbenchMaterialCollectionItemDto["content"]; title: string }
  | { errorMsg: string } {
  const rawContent = message
    ? JSON.stringify(getMockMaterialSourceContentRecord(message, request.bizType))
    : "{}";

  if (request.bizType === MATERIAL_COLLECTION_BIZ_TYPE.FILE) {
    const resolved = resolveMaterialFileCollectFields(rawContent, {
      fileName: request.fileName,
    });

    if ("errorMsg" in resolved) {
      return resolved;
    }

    return {
      content: JSON.parse(
        buildMaterialFileContentJson(rawContent, resolved),
      ) as WorkbenchMaterialCollectionItemDto["content"],
      title: resolved.fileName,
    };
  }

  if (request.bizType === MATERIAL_COLLECTION_BIZ_TYPE.H5) {
    const resolved = resolveMaterialH5CollectFields(rawContent, {
      description: request.description,
      title: request.title,
    });

    if ("errorMsg" in resolved) {
      return resolved;
    }

    return {
      content: JSON.parse(
        buildMaterialH5ContentJson(rawContent, resolved),
      ) as WorkbenchMaterialCollectionItemDto["content"],
      title: resolved.title,
    };
  }

  if (request.bizType === MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM) {
    const resolved = resolveMaterialMiniProgramCollectFields(rawContent, {
      title: request.title,
    });

    if ("errorMsg" in resolved) {
      return resolved;
    }

    return {
      content: JSON.parse(
        buildMaterialMiniProgramContentJson(rawContent, resolved),
      ) as WorkbenchMaterialCollectionItemDto["content"],
      title: resolved.title,
    };
  }

  if (request.bizType === MATERIAL_COLLECTION_BIZ_TYPE.IMAGE) {
    const resolved = resolveMaterialImageCollectFields(rawContent);

    if ("errorMsg" in resolved) {
      return resolved;
    }

    return {
      content: JSON.parse(
        buildMaterialImageContentJson(rawContent, resolved),
      ) as WorkbenchMaterialCollectionItemDto["content"],
      title: "图片",
    };
  }

  if (request.bizType === MATERIAL_COLLECTION_BIZ_TYPE.VIDEO) {
    const contentRecord = message
      ? getMockMaterialSourceContentRecord(message, request.bizType)
      : {};
    let rawContentForCollection = rawContent;
    let resolvedForCollection = resolveMaterialVideoCollectFields(rawContent, {
      title: request.title,
    });

    if (readString(contentRecord.downloadStatus) !== "finished") {
      return { errorMsg: "视频下载未完成，无法收录" };
    }

    const rawFileUrl = readString(contentRecord.fileUrl);

    if (rawFileUrl && !isOwnVideoMaterialUrl(rawFileUrl)) {
      const expireTime = readNumber(contentRecord.fileUrlExpireTime);

      if (expireTime === undefined || Date.now() > expireTime) {
        return { errorMsg: "视频下载地址已过期，无法收录" };
      }

      rawContentForCollection = buildMockTransferredVideoContent(rawContent);
      resolvedForCollection = resolveMaterialVideoCollectFields(
        rawContentForCollection,
        { title: request.title },
      );
    }

    if ("errorMsg" in resolvedForCollection) {
      return resolvedForCollection;
    }

    return {
      content: JSON.parse(
        buildMaterialVideoContentJson(rawContentForCollection, resolvedForCollection),
      ) as WorkbenchMaterialCollectionItemDto["content"],
      title: resolvedForCollection.title,
    };
  }

  return {
    content: message ? getMaterialContentRecord(message) : {},
    title: message ? getMaterialTitle(message) : request.msgInfoId,
  };
}

function getMaterialTitle(message: WorkbenchMessageDto) {
  const content = getMaterialContentRecord(message);

  if (message.contentType === "emotion") {
    return "表情";
  }

  if (message.contentType === "image") {
    return "图片";
  }

  if (message.contentType === "video") {
    return "";
  }

  return (
    readString(content.fileName) ||
    readString(content.title) ||
    readString(content.appName) ||
    message.msgid
  );
}

export function sortMaterialItems(
  left: WorkbenchMaterialCollectionItemDto,
  right: WorkbenchMaterialCollectionItemDto,
) {
  return right.sort - left.sort || right.id.localeCompare(left.id, "zh-Hans-CN");
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown) {
  const numericValue = typeof value === "number" ? value : Number(value);

  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildMockTransferredVideoContent(rawContent: string) {
  const resolved = resolveMaterialVideoCollectFields(rawContent);

  if ("errorMsg" in resolved) {
    return rawContent;
  }

  return buildMaterialVideoContentJson(rawContent, {
    coverUrl: resolved.coverUrl,
    fileUrl: "s5/msg/mock/transferred-video.mp4",
    title: resolved.title,
  });
}

function buildContent(message: Message) {
  switch (message.content.type) {
    case "system":
      return { text: message.content.text };
    case "revoke":
      return {
        revokeMsgId: message.content.revokeMsgId,
        revokeOriginMsgId: message.content.revokeOriginMsgId,
        text: message.content.text,
        type: "revoke",
      };
    case "text":
      return { text: message.content.text };
    case "voice":
      return {
        audioUrl: message.content.audioUrl,
        durationLabel: message.content.durationLabel,
      };
    case "image":
      return {
        alt: message.content.alt,
        downloadStatus: message.content.downloadStatus,
        fileUrl: message.content.imageUrl,
        fileSerialNo: message.content.fileSerialNo,
        height: message.content.height,
        width: message.content.width,
      };
    case "video":
      return {
        alt: message.content.alt,
        coverImageUrl: message.content.coverImageUrl,
        downloadStatus: message.content.downloadStatus,
        durationLabel: message.content.durationLabel,
        fileSerialNo: message.content.fileSerialNo,
        fileUrlExpireTime: message.content.fileUrlExpireTime,
        height: message.content.height,
        videoUrl: message.content.videoUrl,
        width: message.content.width,
      };
    case "file":
      return {
        downloadStatus: message.content.downloadStatus,
        extension: message.content.extension,
        fileName: message.content.fileName,
        fileSerialNo: message.content.fileSerialNo,
        fileSizeLabel: message.content.fileSizeLabel,
        fileUrl: message.content.fileUrl,
        sourceLabel: message.content.sourceLabel,
      };
    case "h5":
      return {
        description: message.content.description,
        previewImageUrl: message.content.previewImageUrl,
        sourceLabel: message.content.sourceLabel,
        title: message.content.title,
        url: message.content.url,
      };
    case "mini-program":
      return {
        appName: message.content.appName,
        coverImageUrl: message.content.coverImageUrl,
        logoUrl: message.content.logoUrl,
        sourceLabel: message.content.sourceLabel,
        title: message.content.title,
      };
    case "contact-card":
      return {
        avatarUrl: message.content.avatarUrl,
        company: message.content.company,
        contactSerialNo: message.content.contactSerialNo,
        groupSerialNo: message.content.groupSerialNo,
        name: message.content.name,
        sourceLabel: message.content.sourceLabel,
      };
    case "location":
      return {
        address: message.content.address,
        latitude: message.content.latitude,
        longitude: message.content.longitude,
        title: message.content.title,
        zoom: message.content.zoom,
      };
    case "sphfeed":
      return {
        description: message.content.description,
        imageUrl: message.content.imageUrl,
        sourceLabel: message.content.sourceLabel,
        title: message.content.title,
        url: message.content.url,
      };
    case "solitaire":
      return {
        createMemberSerialNo: message.content.createMemberSerialNo,
        example: message.content.example,
        items: message.content.items,
        tail: message.content.tail,
        title: message.content.title,
      };
    case "redpacket":
      return {
        description: message.content.description,
        title: message.content.title,
        totalAmount: message.content.totalAmount,
        totalCnt: message.content.totalCnt,
      };
    case "quote":
      return {
        quoteMsgId: message.content.quoteMsgId,
        quotedMessage: message.content.quotedMessage,
        text: message.content.text,
      };
    case "chatrecord":
      return {
        msgContent: message.content.msgContent,
        msgTitle: message.content.msgTitle,
        unsupportedDisplayText: message.content.unsupportedDisplayText,
      };
  }
}

function normalizeBackendStatus(status: Message["status"]): WorkbenchMessageStatus {
  switch (status) {
    case "pending":
      return "queued";
    case "sending":
      return "sending";
    case "initializing":
      return "initializing";
    case "failed":
      return "failed";
    case "sent":
    default:
      return "sent";
  }
}

function getSeatIdByConversationId(conversationId: string) {
  const conversation = Object.values(seedConversations)
    .flat()
    .find((item) => item.id === conversationId);

  return conversation?.accountId ?? "drc";
}

function getCustomerIdByConversationId(conversationId: string) {
  const conversation = Object.values(seedConversations)
    .flat()
    .find((item) => item.id === conversationId);

  return conversation?.customerId ?? "cust-001";
}

function isGroupConversationId(conversationId: string) {
  return Object.values(seedConversations)
    .flat()
    .some((item) => item.id === conversationId && item.mode === "group");
}

function getAccountLastMessageTime(conversations: WorkbenchConversationSummaryDto[]) {
  return conversations.reduce(
    (latest, conversation) => Math.max(latest, conversation.lastMessageTime ?? 0),
    0,
  );
}

export function findConversation(state: MockState, conversationId: string) {
  return Object.values(state.conversationsByAccount)
    .flat()
    .find((conversation) => conversation.conversationId === conversationId);
}

export function findAccount(state: MockState, seatId: string) {
  return state.seats.find((seat) => seat.seatId === seatId);
}

export function upsertConversation(state: MockState, nextConversation: WorkbenchConversationSummaryDto) {
  const currentConversations = state.conversationsByAccount[nextConversation.seatId] ?? [];
  state.conversationsByAccount[nextConversation.seatId] = sortConversations([
    nextConversation,
    ...currentConversations.filter(
      (conversation) => conversation.conversationId !== nextConversation.conversationId,
    ),
  ]);
}

export function setConversationPinned(
  state: MockState,
  conversationId: string,
  isPinned: boolean,
) {
  const conversation = findConversation(state, conversationId);

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const nextConversation = {
    ...conversation,
    isPinned: isPinned ? true : undefined,
  };

  upsertConversation(state, nextConversation);
  pushConversationEvent(state, {
    ...nextConversation,
    isPinned,
  });

  return {
    conversationId,
    isPinned,
    seatId: nextConversation.seatId,
  };
}

export function setConversationFullAuto(
  state: MockState,
  conversationId: string,
  enabled: boolean,
) {
  const conversation = findConversation(state, conversationId);

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const nextConversation = {
    ...conversation,
    conversationAIHostingSwitch: enabled,
    agentHostingStatus: enabled ? "thinking" : undefined,
  };

  upsertConversation(state, nextConversation);
  pushConversationEvent(state, nextConversation);

  return {
    conversationAIHostingSwitch: enabled,
    conversationId,
    seatId: nextConversation.seatId,
  };
}

export function removeConversation(
  state: MockState,
  conversationId: string,
): WorkbenchConversationDeleteResponse {
  const conversation = findConversation(state, conversationId);

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  state.conversationsByAccount[conversation.seatId] = (
    state.conversationsByAccount[conversation.seatId] ?? []
  ).filter((item) => item.conversationId !== conversationId);
  setAccountUnreadCount(
    state,
    conversation.seatId,
    Math.max(0, getAccountUnreadCountValue(state, conversation.seatId) - conversation.unreadCount),
  );
  syncAccountLastMessageTime(state, conversation.seatId);
  pushConversationRemoveEvent(state, conversation.seatId, conversationId);
  pushAccountEvent(state, conversation.seatId);

  return {
    conversationId,
    seatId: conversation.seatId,
  };
}

export function getAccountUnreadCountValue(state: MockState, seatId: string) {
  return findAccount(state, seatId)?.unreadCount ?? 0;
}

export function setAccountUnreadCount(
  state: MockState,
  seatId: string,
  unreadCount: number,
) {
  const seat = findAccount(state, seatId);

  if (!seat) {
    return;
  }

  seat.unreadCount = unreadCount;
  seat.singleUnreadCount = getModeUnreadCountValue(state, seatId, "single");
  seat.groupUnreadCount = getModeUnreadCountValue(state, seatId, "group");
}

function getModeUnreadCountValue(
  state: MockState,
  seatId: string,
  mode: ChatMode,
) {
  return (state.conversationsByAccount[seatId] ?? []).reduce(
    (total, conversation) =>
      conversation.mode === mode
        ? total + Math.max(0, conversation.unreadCount)
        : total,
    0,
  );
}

export function getAccountUnreadSummary(state: MockState, seatId: string) {
  const single = getModeUnreadCountValue(state, seatId, "single");
  const group = getModeUnreadCountValue(state, seatId, "group");

  return {
    group,
    single,
    total: single + group,
  };
}

export function syncAccountLastMessageTime(state: MockState, seatId: string) {
  const seat = findAccount(state, seatId);

  if (!seat) {
    return;
  }

  const conversations = state.conversationsByAccount[seatId] ?? [];
  seat.lastMessageTime = getAccountLastMessageTime(conversations);
}

export function pushAccountEvent(state: MockState, seatId: string) {
  const seat = findAccount(state, seatId);

  if (!seat) {
    return;
  }

  state.version = Math.max(state.version + 1, Date.now());
  state.events.push({
    payload: clone(seat),
    type: "seat",
    version: state.version,
  });
}

export function pushConversationEvent(state: MockState, conversation: WorkbenchConversationSummaryDto) {
  state.version = Math.max(state.version + 1, Date.now(), conversation.lastMessageTime ?? 0);
  state.events.push({
    payload: {
      ...conversation,
      type: "upsert",
    },
    type: "conversation",
    version: state.version,
  });
}

function pushConversationRemoveEvent(
  state: MockState,
  seatId: string,
  conversationId: string,
) {
  state.version = Math.max(state.version + 1, Date.now());
  state.events.push({
    payload: {
      conversationId,
      seatId,
      type: "remove",
    },
    type: "conversation",
    version: state.version,
  });
}

export function pushMessageEvent(state: MockState, message: WorkbenchMessageDto) {
  state.version = Math.max(state.version + 1, Date.now(), message.createdAt ?? 0);
  state.events.push({
    payload: message,
    type: "message",
    version: state.version,
  });
}

function pushMessageUpdateEvent(
  state: MockState,
  event: WorkbenchMessageUpdateEventDto,
) {
  state.version = Math.max(state.version + 1, Date.now());
  state.events.push({
    payload: event,
    type: "message-update",
    version: state.version,
  });
}

export function getNextMockEventCursor(
  currentCursor: number,
  events: Array<{
    version?: number;
  }>,
) {
  if (!Number.isFinite(currentCursor)) {
    return undefined;
  }

  return events.reduce(
    (latest, event) => Math.max(latest, event.version ?? currentCursor),
    currentCursor,
  );
}

export function revokeMessage(
  state: MockState,
  conversationId: string,
  messageSeq: number,
) {
  const messages = state.messagesByConversationId[conversationId] ?? [];
  const originalMessage = messages.find((message) =>
    message.seq === messageSeq,
  );

  if (!originalMessage) {
    return undefined;
  }

  const nextMessage = {
    ...originalMessage,
    isRevoked: true,
  };

  state.messagesByConversationId[conversationId] = messages.map((message) =>
    message.msgid === originalMessage.msgid ? nextMessage : message,
  );

  const revokeSignal = {
    content: {
      revokeMsgId: String(originalMessage.seq),
      revokeOriginMsgId: String(originalMessage.seq),
      type: "revoke",
    },
    contentType: "revoke",
    conversationId,
    createdAt: Date.now(),
    customerId: originalMessage.customerId,
    msgid: `revoke-${originalMessage.msgid}`,
    rawMsgtype: "revoke",
    seatId: originalMessage.seatId,
    senderType: "system" as const,
    seq: getNextMessageSeq(state, conversationId),
    status: "sent" as const,
  } satisfies WorkbenchMessageDto;

  state.messagesByConversationId[conversationId] = [
    ...state.messagesByConversationId[conversationId],
    revokeSignal,
  ];

  pushMessageUpdateEvent(state, {
    conversationId,
    eventId: state.version + 1,
    messageSeq: originalMessage.seq,
  });
  pushMessageEvent(state, revokeSignal);

  return originalMessage;
}

export function getNextMessageSeq(state: MockState, conversationId: string) {
  const messages = state.messagesByConversationId[conversationId] ?? [];

  return (messages.at(-1)?.seq ?? 0) + 1;
}

export function getPayloadSegments(payload: WorkbenchSendMessagePayload) {
  if (payload.segment) {
    return [payload.segment];
  }

  if (payload.segments?.length) {
    return payload.segments;
  }

  return [
    {
      text: payload.content ?? "",
      type: "text" as const,
    },
  ];
}

export function buildPayloadSegmentContent(
  state: MockState,
  segment: ReturnType<typeof getPayloadSegments>[number],
  quote?: WorkbenchSendMessagePayload["quote"],
) {
  if (quote && segment.type === "text") {
    return {
      quoteMsgId: quote.quoteMsgId,
      quotedMessage: quote.quotedMessage,
      text: segment.text,
    };
  }

  if (segment.type === "image") {
    const materialContent = segment.materialCollectionId
      ? getMockMaterialContentRecord(state, segment.materialCollectionId)
      : {};

    return {
      alt: segment.alt,
      fileUrl: readString(materialContent.fileUrl) || segment.url || segment.localUrl || "",
      height: segment.height,
      width: segment.width,
    };
  }

  if (segment.type === "emotion") {
    const materialContent = getMockMaterialContentRecord(state, segment.materialCollectionId);
    const fileUrl = readString(materialContent.fileUrl);

    return {
      alt: "自定义表情",
      fileUrl: fileUrl ?? "mock://material-expression",
    };
  }

  if (segment.type === "file") {
    const materialContent = segment.materialCollectionId
      ? getMockMaterialContentRecord(state, segment.materialCollectionId)
      : {};
    const fileName = readString(materialContent.fileName) || segment.fileName;
    const fileUrl = readString(materialContent.fileUrl) || segment.url;

    return {
      extension: readString(materialContent.extension) || segment.extension,
      fileName,
      fileSizeLabel: readString(materialContent.fileSizeLabel) || segment.fileSizeLabel || "",
      fileUrl,
      sourceLabel: "文件",
    };
  }

  if (segment.type === "h5") {
    const materialContent = segment.materialCollectionId
      ? getMockMaterialContentRecord(state, segment.materialCollectionId)
      : {};

    return {
      description:
        readString(materialContent.description) ||
        readString(materialContent.desc) ||
        segment.desc ||
        "",
      previewImageUrl:
        readString(materialContent.previewImageUrl) ||
        readString(materialContent.coverUrl) ||
        segment.coverUrl,
      sourceLabel: "链接",
      title: readString(materialContent.title) || segment.title,
      url:
        readString(materialContent.url) ||
        readString(materialContent.href) ||
        segment.href,
    };
  }

  if (segment.type === "weapp") {
    const materialContent = segment.materialCollectionId
      ? getMockMaterialContentRecord(state, segment.materialCollectionId)
      : {};

    return {
      appName: readString(materialContent.appName) || segment.appName || "小程序",
      coverImageUrl:
        readString(materialContent.coverImageUrl) ||
        readString(materialContent.imageUrl) ||
        segment.coverImageUrl,
      logoUrl: readString(materialContent.logoUrl) || segment.logoUrl,
      sourceLabel: readString(materialContent.sourceLabel) || segment.sourceLabel || "小程序",
      title: readString(materialContent.title) || segment.title || "小程序",
    };
  }

  if (segment.type === "sphfeed") {
    const materialContent = segment.materialCollectionId
      ? getMockMaterialContentRecord(state, segment.materialCollectionId)
      : {};

    return {
      description: readString(materialContent.description) || segment.description || "",
      imageUrl: readString(materialContent.imageUrl) || segment.imageUrl,
      sourceLabel: readString(materialContent.sourceLabel) || segment.sourceLabel || "视频号",
      title: readString(materialContent.title) || segment.title || "视频号",
      url: readString(materialContent.url) || segment.url,
    };
  }

  if (segment.type === "video") {
    const materialContent = segment.materialCollectionId
      ? getMockMaterialContentRecord(state, segment.materialCollectionId)
      : {};

    return {
      alt: "视频",
      coverImageUrl: readString(materialContent.coverUrl) || segment.coverUrl,
      durationLabel: "",
      videoUrl: readString(materialContent.fileUrl) || segment.url,
    };
  }

  if (segment.type === "text") {
    return {
      text: segment.text,
    };
  }

  return {
    text: "",
  };
}

function getMockMaterialContentRecord(state: MockState, materialCollectionId: string) {
  const item = state.materialItems.find((materialItem) => materialItem.id === materialCollectionId);

  return item ? getMaterialContentRecordFromItem(item) : {};
}

export function getPayloadSegmentContentType(
  segment: ReturnType<typeof getPayloadSegments>[number],
): WorkbenchMessageDto["contentType"] {
  if (segment.type === "emotion") {
    return "image";
  }

  if (segment.type === "weapp") {
    return "mini-program";
  }

  return segment.type;
}

export function getPayloadSegmentRawMsgtype(
  segment: ReturnType<typeof getPayloadSegments>[number],
) {
  return segment.type;
}

export function findMessageByIdOrSeq(
  state: MockState,
  conversationId: string,
  msgid: string | undefined,
  messageSeq: number,
) {
  const messages = state.messagesByConversationId[conversationId] ?? [];

  return messages.find(
    (message) =>
      (msgid && message.msgid === msgid) || message.seq === messageSeq,
  );
}

export function updateMessageDownloadContent(
  state: MockState,
  conversationId: string,
  messageSeq: number,
  patch: {
    downloadStatus: "ing" | "finished" | "failed";
    fileUrl?: string;
    fileUrlExpireTime?: number;
  },
) {
  const messages = state.messagesByConversationId[conversationId] ?? [];

  state.messagesByConversationId[conversationId] = messages.map((message) => {
    if (message.seq !== messageSeq || !isFileDownloadContent(message.content)) {
      return message;
    }

    return {
      ...message,
      content: {
        ...message.content,
        ...stripUndefinedFields(patch),
      },
    };
  });
}

export function updateVoicePlaybackContent(
  state: MockState,
  conversationId: string,
  messageSeq: number,
  patch: {
    playbackUrl: string;
    transFileUrl: string;
    transFileUrlPersisted: true;
  },
) {
  const messages = state.messagesByConversationId[conversationId] ?? [];

  state.messagesByConversationId[conversationId] = messages.map((message) => {
    if (message.seq !== messageSeq || message.contentType !== "voice") {
      return message;
    }

    return {
      ...message,
      content: {
        ...message.content,
        ...patch,
      },
    };
  });
}

export function updateVoiceTranscriptionContent(
  state: MockState,
  conversationId: string,
  messageSeq: number,
  patch: {
    transVoiceText: string;
  },
) {
  const messages = state.messagesByConversationId[conversationId] ?? [];

  state.messagesByConversationId[conversationId] = messages.map((message) => {
    if (message.seq !== messageSeq || message.contentType !== "voice") {
      return message;
    }

    return {
      ...message,
      content: {
        ...message.content,
        ...patch,
      },
    };
  });
}

function stripUndefinedFields<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined),
  ) as Partial<T>;
}

function getMockRawMsgtype(contentType: Message["content"]["type"]) {
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

export function isFileDownloadContent(
  content: WorkbenchMessageDto["content"],
): content is (FileMessageContent | VideoMessageContent) & Record<string, unknown> {
  return content.type === "file" || content.type === "video";
}

export function getPayloadPreview(segments: ReturnType<typeof getPayloadSegments>) {
  const firstTextSegment = segments.find((segment) => segment.type === "text");

  if (firstTextSegment?.text) {
    return firstTextSegment.text;
  }

  if (segments.some((segment) => segment.type === "image")) {
    return "[图片]";
  }

  if (segments.some((segment) => segment.type === "emotion")) {
    return "[表情]";
  }

  if (segments.some((segment) => segment.type === "file")) {
    return "[文件]";
  }

  if (segments.some((segment) => segment.type === "h5")) {
    return "[链接]";
  }

  if (segments.some((segment) => segment.type === "weapp")) {
    return "[小程序]";
  }

  return segments.some((segment) => segment.type === "sphfeed") ? "[视频号]" : "";
}

export function buildMockOptNo(messageId: number) {
  return `opt-${messageId}`;
}

export function resolveSendOutcome(
  state: MockState,
  seatId: string,
  segments: ReturnType<typeof getPayloadSegments>,
) {
  const seat = findAccount(state, seatId);
  const shouldFail =
    seat?.loginStatus === "offline" ||
    segments.some((segment) => segment.type === "text" && /\[fail\]/i.test(segment.text));

  if (shouldFail) {
    return {
      reason: seat?.loginStatus === "offline" ? "企微账号离线" : "模拟发送失败",
      status: "failed" as const,
    };
  }

  return {
    status: "sent" as const,
  };
}

export function sortConversations(conversations: WorkbenchConversationSummaryDto[]) {
  return [...conversations].sort(
    (left, right) =>
      Number(Boolean(right.isPinned)) - Number(Boolean(left.isPinned)) ||
      (right.lastMessageTime ?? 0) - (left.lastMessageTime ?? 0),
  );
}

export function sortQuickReplyEntries<T extends { id: string; sort: number }>(left: T, right: T) {
  return right.sort - left.sort || right.id.localeCompare(left.id);
}

export function getAppendQuickReplyCategorySort(
  categories: WorkbenchQuickReplyCategoryDto[],
  scopeType: WorkbenchQuickReplyCategoryDto["scopeType"],
  parentId: WorkbenchQuickReplyCategoryDto["parentId"],
) {
  return getSiblingBoundarySort(
    categories,
    (category) =>
      category.scopeType === scopeType && category.parentId === parentId,
    "append",
  );
}

export function getPrependQuickReplyCategorySort(
  categories: WorkbenchQuickReplyCategoryDto[],
  scopeType: WorkbenchQuickReplyCategoryDto["scopeType"],
  parentId: WorkbenchQuickReplyCategoryDto["parentId"],
) {
  return getSiblingBoundarySort(
    categories,
    (category) =>
      category.scopeType === scopeType && category.parentId === parentId,
    "prepend",
  );
}

export function getAppendQuickReplySort(
  quickReplies: WorkbenchQuickReplyDto[],
  scopeType: WorkbenchQuickReplyDto["scopeType"],
  categoryId: WorkbenchQuickReplyDto["categoryId"],
) {
  return getSiblingBoundarySort(
    quickReplies,
    (reply) =>
      reply.scopeType === scopeType && reply.categoryId === categoryId,
    "append",
  );
}

export function getPrependQuickReplySort(
  quickReplies: WorkbenchQuickReplyDto[],
  scopeType: WorkbenchQuickReplyDto["scopeType"],
  categoryId: WorkbenchQuickReplyDto["categoryId"],
) {
  return getSiblingBoundarySort(
    quickReplies,
    (reply) =>
      reply.scopeType === scopeType && reply.categoryId === categoryId,
    "prepend",
  );
}

function getSiblingBoundarySort<T extends { sort: number }>(
  items: T[],
  isSibling: (item: T) => boolean,
  placement: "append" | "prepend",
) {
  let boundarySort: number | undefined;

  for (const item of items) {
    if (!isSibling(item)) {
      continue;
    }

    boundarySort = boundarySort === undefined
      ? item.sort
      : placement === "append"
        ? Math.min(boundarySort, item.sort)
        : Math.max(boundarySort, item.sort);
  }

  if (boundarySort === undefined) {
    return Date.now();
  }

  return boundarySort + (placement === "append" ? -1 : 1);
}

export function assertSameQuickReplySortScope(currentIds: string[], submittedIds: string[]) {
  if (currentIds.length !== submittedIds.length) {
    throw new Error("排序数据已变化，请刷新后重试");
  }

  const submittedSet = new Set(submittedIds);

  if (
    submittedSet.size !== submittedIds.length ||
    !currentIds.every((id) => submittedSet.has(id))
  ) {
    throw new Error("排序数据已变化，请刷新后重试");
  }
}

export function collapseLatest<T>(
  items: T[],
  getKey: (item: T) => string,
) {
  const latestByKey = new Map<string, T>();

  for (const item of items) {
    latestByKey.set(getKey(item), item);
  }

  return [...latestByKey.values()];
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}
