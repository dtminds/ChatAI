import type {
  WorkbenchConversationDeleteResponse,
  WorkbenchConversationListResponse,
  WorkbenchSeatChangeDto,
  WorkbenchSeatDto,
  WorkbenchConversationChangeDto,
  WorkbenchConversationPinResponse,
  WorkbenchConversationReadResponse,
  WorkbenchConversationUnpinResponse,
  WorkbenchConversationUnreadResponse,
  WorkbenchConversationSummaryDto,
  WorkbenchGroupMembersResponse,
  WorkbenchHistoryMessagePageDto,
  WorkbenchHistoryMessageQuery,
  WorkbenchSubUserDto,
  WorkbenchMessageDto,
  WorkbenchMessageFileDownloadResponse,
  WorkbenchMessagePageDto,
  WorkbenchMessageStatus,
  WorkbenchPollRequest,
  WorkbenchPollResponse,
  WorkbenchSmartReplyAttachmentsRequest,
  WorkbenchSmartReplyAttachmentsResponse,
  WorkbenchSmartReplyGeneralAnswerRequest,
  WorkbenchSmartReplyGeneralAnswerResponse,
  WorkbenchSmartReplyMakeShorterRequest,
  WorkbenchSmartReplyMakeShorterResponse,
  WorkbenchSmartReplySendAnswerRequest,
  WorkbenchSmartReplySendAnswerResponse,
  WorkbenchSmartReplyPollRequest,
  WorkbenchSmartReplyPollResponse,
  WorkbenchKnowledgePageRequest,
  WorkbenchKnowledgePageResponse,
  WorkbenchKnowledgeConfigRequest,
  WorkbenchKnowledgeConfigResponse,
  WorkbenchKnowledgeDocPageRequest,
  WorkbenchKnowledgeDocPageResponse,
  WorkbenchKnowledgeFaqAddRequest,
  WorkbenchKnowledgeFaqAddResponse,
  WorkbenchSmartHeartbeatRequest,
  WorkbenchSmartHeartbeatResponse,
  WorkbenchSmartReplyTextModerationRequest,
  WorkbenchSmartReplyTextModerationResponse,
  WorkbenchSendMessagePayload,
  WorkbenchSendMessageResponse,
  WorkbenchSidebarIframeParamsRequest,
  WorkbenchTakeOverSeatResponse,
  WorkbenchUploadCredentialResponse,
  WorkbenchVoicePlaybackConfirmRequest,
  WorkbenchVoicePlaybackConfirmResponse,
} from "@chatai/contracts";
import { NotFoundError } from "../../src/shared/errors.js";

type WorkbenchEvent =
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
    };

type MemoryWorkbenchState = {
  seats: WorkbenchSeatDto[];
  conversationsBySeat: Record<string, WorkbenchConversationSummaryDto[]>;
  groupMembersByConversationId: Record<string, WorkbenchGroupMembersResponse>;
  subUser: WorkbenchSubUserDto;
  events: WorkbenchEvent[];
  messagesByConversationId: Record<string, WorkbenchMessageDto[]>;
  nextId: number;
  version: number;
};

const CURRENT_SUB_USER_ID = "sub-user-001";
const INITIAL_VERSION = 1284;

const seatAvatarDrcUrl =
  "http://wework.qpic.cn/wwhead/duc2TvpEgSTewUnFO43HZ22H445fU0MTybfXZqjldjWlOArMJOM2GNsH3CUWyOuESHYdY5oHPhk/60";
const seatAvatarNdtUrl =
  "http://wework.qpic.cn/bizmail/GNtOLFv4zDw4EZia6Xg0YYvxibVQLtqfia5aRx5spGwaIm2vHgicBiarTuQ/60";
const customerAvatarUrl =
  "http://wx.qlogo.cn/mmhead/mOW261WJzibt0Sve4EmicjZbjRVJTuAYYHKCSNMriasW9CUOVVG9fsxicEeGrIuXnzkrbdgoAx7CEZI/64";
const customerAvatarRuiUrl =
  "http://wx.qlogo.cn/mmhead/5kc3roGJvWsakhB3k2hHcwC5eib6c9ialcF49rCibSQnz8/64";
const customerAvatarPlusUrl =
  "http://wx.qlogo.cn/mmhead/PiajxSqBRaEKoAfO0HnN90OicIskcZnJAeuFZ6zy6vErDJ1IeRzBtnXg/64";
const customerAvatarGroupUrl =
  "http://wx.qlogo.cn/mmhead/Q3auHgzwzM6CpFt8WP7GR5bh4xIwzjnaYTjhkNO0znVzMmcATUR4wg/64";
const customerAvatarXiaoyuUrl =
  "http://wx.qlogo.cn/mmhead/DoiajoZ3WVG6gOj80wYnYvb63wkempRp9licrvrymnbJk/64";
const customerAvatarSleepUrl =
  "http://wx.qlogo.cn/mmhead/6XFhg7ldObwgEHpMMpKicrLCNW2PgeAJFb4kRg3P5jn4dWbDceQ7kibA/64";

export type MemoryWorkbenchService = ReturnType<typeof createMemoryWorkbenchService>;

export function createMemoryWorkbenchService() {
  const state = buildInitialState();

  return {
    deleteConversation(
      _subUserId: string,
      conversationId: string,
    ): WorkbenchConversationDeleteResponse {
      return removeConversation(state, conversationId);
    },
    getSeats(_subUserId: string) {
      return clone(state.seats);
    },
    getConversations(
      _subUserId: string,
      seatId: string,
      options?: { cursor?: string; limit?: number; mode?: "single" | "group" },
    ): WorkbenchConversationListResponse {
      const snapshotAt = Date.now();
      const limit = options?.limit ?? 500;
      const conversations = sortConversations(state.conversationsBySeat[seatId] ?? [])
        .filter((conversation) => options?.mode == null || conversation.mode === options.mode)
        .slice(0, limit);

      return {
        hasMore: false,
        items: clone(conversations),
        snapshotAt,
      };
    },
    getMe(_subUserId: string) {
      return clone(state.subUser);
    },
    async getSidebarIframeParams(_subUserId: string, _input: WorkbenchSidebarIframeParamsRequest) {
      throw new NotFoundError(
        "SIDEBAR_TUSE_CRYPTO_NOT_FOUND",
        "侧栏加密配置不存在或未启用",
      );
    },
    getMessages(
      _subUserId: string,
      conversationId: string,
      options?: { beforeSeq?: number; limit?: number },
    ) {
      const messages = [...(state.messagesByConversationId[conversationId] ?? [])].sort(
        (left, right) => left.seq - right.seq,
      );
      const beforeSeq = options?.beforeSeq;
      const limit = options?.limit ?? 30;
      if (limit <= 0) {
        return {
          filteredCount: 0,
          hasMore: false,
          messages: [],
          scannedCount: 0,
        } satisfies WorkbenchMessagePageDto;
      }

      const candidateMessages =
        beforeSeq == null
          ? messages
          : messages.filter((message) => message.seq < beforeSeq);
      const scannedMessages =
        sliceLatest(candidateMessages, limit + 1).slice(-limit);
      return {
        filteredCount: 0,
        hasMore: candidateMessages.length > limit,
        messages: clone(scannedMessages),
        nextBeforeSeq: scannedMessages[0]?.seq,
        scannedCount: scannedMessages.length,
      } satisfies WorkbenchMessagePageDto;
    },
    async getHistoryMessages(
      subUserId: string,
      conversationId: string,
      options?: WorkbenchHistoryMessageQuery,
    ): Promise<WorkbenchHistoryMessagePageDto> {
      const page = this.getMessages(subUserId, conversationId, {
        beforeSeq: undefined,
        limit: options?.limit ?? 30,
      });

      return {
        hasNext: false,
        hasPrev: false,
        messages: page.messages,
      };
    },
    getGroupMembers(
      _subUserId: string,
      conversationId: string,
    ): WorkbenchGroupMembersResponse {
      const response = state.groupMembersByConversationId[conversationId];

      if (!response) {
        throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
      }

      return clone(response);
    },
    getUploadCredential(
      _subUserId: string,
      conversationId: string,
    ): WorkbenchUploadCredentialResponse {
      const conversation = findConversation(state, conversationId);

      if (!conversation) {
        throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
      }

      return {
        allowPerfixs: ["chat-images/"],
        bucket: "mock-bucket-1250000000",
        credentials: {
          sessionToken: "mock-session-token",
          tmpSecretId: "mock-tmp-secret-id",
          tmpSecretKey: "mock-tmp-secret-key",
          token: "mock-token",
        },
        expiration: "2026-05-13T12:00:00Z",
        expiredTime: 1778673600,
        region: "ap-guangzhou",
        requestId: "mock-upload-credential-request",
        startTime: 1778670000,
      };
    },
    downloadMessageFile(
      _subUserId: string,
      conversationId: string,
      messageId: string,
    ): WorkbenchMessageFileDownloadResponse {
      const conversation = findConversation(state, conversationId);

      if (!conversation) {
        throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
      }

      return {
        messageId,
        status: "accepted",
      };
    },
    confirmVoicePlaybackReady(
      _subUserId: string,
      input: WorkbenchVoicePlaybackConfirmRequest,
    ): WorkbenchVoicePlaybackConfirmResponse {
      const conversation = findConversation(state, input.conversationId);

      if (!conversation) {
        throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
      }

      state.messagesByConversationId[input.conversationId] = (
        state.messagesByConversationId[input.conversationId] ?? []
      ).map((item) =>
        item.seq === input.messageSeq && item.contentType === "voice"
          ? {
              ...item,
              content: {
                ...item.content,
                playbackUrl: input.playbackUrl,
                transFileUrl: input.playbackUrl,
                transFileUrlPersisted: true,
              },
            }
          : item,
      );

      return {
        messageSeq: input.messageSeq,
        playbackUrl: input.playbackUrl,
        transFileUrlPersisted: true,
      };
    },
    markConversationRead(
      _subUserId: string,
      conversationId: string,
    ): WorkbenchConversationReadResponse {
      const conversation = findConversation(state, conversationId);

      if (!conversation) {
        throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
      }

      const nextConversation = {
        ...conversation,
        unreadCount: 0,
      };

      upsertConversation(state, nextConversation);
      setSeatUnreadCount(
        state,
        nextConversation.seatId,
        Math.max(0, getSeatUnreadCountValue(state, nextConversation.seatId) - conversation.unreadCount),
      );
      syncSeatLastMessageTime(state, nextConversation.seatId);
      pushConversationEvent(state, nextConversation);
      pushSeatEvent(state, nextConversation.seatId);

      return {
        seatId: nextConversation.seatId,
        seatUnreadCount: getSeatUnreadCountValue(state, nextConversation.seatId),
        conversationId,
        unreadCount: 0,
      };
    },
    markConversationUnread(
      _subUserId: string,
      conversationId: string,
    ): WorkbenchConversationUnreadResponse {
      const conversation = findConversation(state, conversationId);

      if (!conversation) {
        throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
      }

      const nextConversation = {
        ...conversation,
        unreadCount: 1,
      };

      upsertConversation(state, nextConversation);
      setSeatUnreadCount(
        state,
        nextConversation.seatId,
        Math.max(0, getSeatUnreadCountValue(state, nextConversation.seatId) + 1 - conversation.unreadCount),
      );
      syncSeatLastMessageTime(state, nextConversation.seatId);
      pushConversationEvent(state, nextConversation);
      pushSeatEvent(state, nextConversation.seatId);

      return {
        seatId: nextConversation.seatId,
        seatUnreadCount: getSeatUnreadCountValue(state, nextConversation.seatId),
        conversationId,
        unreadCount: 1,
      };
    },
    pinConversation(
      _subUserId: string,
      conversationId: string,
    ): WorkbenchConversationPinResponse {
      return setConversationPinned(state, conversationId, true);
    },
    poll(_subUserId: string, request: WorkbenchPollRequest): WorkbenchPollResponse {
      const relevantEvents = state.events.filter((event) => event.version > request.sinceVersion);
      const seatUpdateCursor = request.seatUpdateCursor ?? request.sinceVersion;
      const seatUpdateEvents = collapseLatest(
        state.events.filter(
          (event): event is Extract<WorkbenchEvent, { type: "seat" }> =>
            event.type === "seat" && event.version > seatUpdateCursor,
        ),
        (event) => event.payload.seatId,
      );
      const seatChanges = seatUpdateEvents.map((event) => event.payload);
      const conversationChanges = collapseLatest(
        relevantEvents.filter(
          (event): event is Extract<WorkbenchEvent, { type: "conversation" }> =>
            event.type === "conversation" &&
            event.payload.seatId === request.currentSeatId,
        ),
        (event) => event.payload.conversationId,
      ).map((event) => event.payload);
      const activeConversationMessages = relevantEvents
        .filter(
          (event): event is Extract<WorkbenchEvent, { type: "message" }> =>
            event.type === "message" &&
            event.payload.conversationId === request.activeConversationId &&
            event.payload.seq > (request.activeMessageSeq ?? 0),
        )
        .map((event) => event.payload);

      return {
        seatChanges: clone(seatChanges),
        activeConversationMessages: clone(activeConversationMessages),
        conversationChanges: clone(conversationChanges),
        nextSeatUpdateCursor: getNextMemoryEventCursor(seatUpdateCursor, seatUpdateEvents),
        nextVersion: state.version,
      };
    },
    pollSmartReplies(
      _subUserId: string,
      _request: WorkbenchSmartReplyPollRequest,
    ): WorkbenchSmartReplyPollResponse {
      return { suggestions: [] };
    },
    requestSmartReplyGeneralAnswer(
      _subUserId: string,
      _request: WorkbenchSmartReplyGeneralAnswerRequest,
    ): WorkbenchSmartReplyGeneralAnswerResponse {
      return { suggestion: null };
    },
    requestSmartReplyMakeShorter(
      _subUserId: string,
      _request: WorkbenchSmartReplyMakeShorterRequest,
    ): WorkbenchSmartReplyMakeShorterResponse {
      return { content: _request.content.trim() || "更短的话术" };
    },
    sendSmartReplyAnswer(
      _subUserId: string,
      _request: WorkbenchSmartReplySendAnswerRequest,
    ): WorkbenchSmartReplySendAnswerResponse {
      return { ok: true };
    },
    listKnowledgePage(
      _subUserId: string,
      _request: WorkbenchKnowledgePageRequest,
    ): WorkbenchKnowledgePageResponse {
      return {
        list: [
          {
            id: "ks-default",
            name: "默认知识集",
          },
        ],
      };
    },
    getKnowledgeConfig(
      _subUserId: string,
      _request: WorkbenchKnowledgeConfigRequest,
    ): WorkbenchKnowledgeConfigResponse {
      return {
        config: {
          automaticCheckIllegalWords: 0,
        },
      };
    },
    listKnowledgeDocPage(
      _subUserId: string,
      _request: WorkbenchKnowledgeDocPageRequest,
    ): WorkbenchKnowledgeDocPageResponse {
      return {
        list: [
          {
            id: "faq-default",
            name: "默认 FAQ",
          },
        ],
      };
    },
    addKnowledgeFaq(
      _subUserId: string,
      request: WorkbenchKnowledgeFaqAddRequest,
    ): WorkbenchKnowledgeFaqAddResponse {
      return {
        docId: request.docId,
      };
    },
    sendSmartHeartbeat(
      _subUserId: string,
      _request: WorkbenchSmartHeartbeatRequest,
    ): WorkbenchSmartHeartbeatResponse {
      return { ok: true };
    },
    checkSmartReplyTextModeration(
      _subUserId: string,
      request: WorkbenchSmartReplyTextModerationRequest,
    ): WorkbenchSmartReplyTextModerationResponse {
      const demoWords = ["太好用了", "最好", "第一", "极致"];
      const words = demoWords.filter((word) => request.content.includes(word));

      if (words.length === 0) {
        return { result: null };
      }

      return {
        result: {
          categoryLabel: "广告法_通用禁用极限词",
          words,
        },
      };
    },
    listSmartReplyAttachments(
      _subUserId: string,
      request: WorkbenchSmartReplyAttachmentsRequest,
    ): WorkbenchSmartReplyAttachmentsResponse {
      return {
        attachments: request.ids.flatMap((id) => {
          const numericId = Number.parseInt(id, 10);

          if (!Number.isSafeInteger(numericId) || numericId <= 0) {
            return [];
          }

          return [
            {
              fileName: `素材-${id}`,
              fileType: 1,
              id: numericId,
            },
          ];
        }),
      };
    },
    sendMessage(
      _subUserId: string,
      payload: WorkbenchSendMessagePayload,
    ): WorkbenchSendMessageResponse {
      const conversation = findConversation(state, payload.conversationId);

      if (!conversation || conversation.seatId !== payload.seatId) {
        throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
      }

      const now = Date.now();
      const segments = getPayloadSegments(payload);
      const outcome = resolveSendOutcome(state, payload.seatId, segments);
      let hasAppliedQuote = false;
      const backendMessages = segments.map((segment, index) => {
        const messageId = `msg-server-${state.nextId++}`;
        const nextSeq = getNextMessageSeq(state, payload.conversationId) + index;
        const quoteForSegment =
          !hasAppliedQuote && segment.type === "text" ? payload.quote : undefined;
        hasAppliedQuote = hasAppliedQuote || Boolean(quoteForSegment);

        return {
          seatId: payload.seatId,
          clientMessageId: buildSegmentClientMessageId(payload.clientMessageId, index),
          content: buildPayloadSegmentContent(segment, quoteForSegment),
          contentType: quoteForSegment ? "quote" : segment.type,
          conversationId: payload.conversationId,
          createdAt: now + index,
          customerId: conversation.customerId,
          failReason: outcome.reason,
          messageId,
          optNo: messageId,
          senderType: "agent" as const,
          seq: nextSeq,
          status: outcome.status,
        } satisfies WorkbenchMessageDto;
      });

      const messages = state.messagesByConversationId[payload.conversationId] ?? [];
      state.messagesByConversationId[payload.conversationId] = [
        ...messages,
        ...backendMessages,
      ];

      const nextConversation = {
        ...conversation,
        lastMessage: getPayloadPreview(segments),
        lastMessageTime: now,
      };

      upsertConversation(state, nextConversation);
      syncSeatLastMessageTime(state, payload.seatId);
      pushConversationEvent(state, nextConversation);
      pushSeatEvent(state, payload.seatId);
      backendMessages.forEach((message) => {
        pushMessageEvent(state, message);
      });

      return {
        clientMessageId: payload.clientMessageId,
        messageId: backendMessages[0]?.messageId ?? payload.clientMessageId,
        messages: backendMessages.map((message) => ({
          clientMessageId: message.clientMessageId ?? payload.clientMessageId,
          messageId: message.messageId,
          optNo: message.optNo,
          status: "accepted" as const,
        })),
        status: "accepted",
      };
    },
    takeOverSeat(_subUserId: string, seatId: string): WorkbenchTakeOverSeatResponse {
      const seat = findSeat(state, seatId);

      if (!seat) {
        throw new NotFoundError("ACCOUNT_NOT_FOUND", "账号不存在");
      }

      const nextSeat = {
        ...seat,
        hostSubUserId: CURRENT_SUB_USER_ID,
      };

      state.seats = state.seats.map((item) =>
        item.seatId === seatId ? nextSeat : item,
      );
      pushSeatEvent(state, seatId);

      return { seat: clone(nextSeat) };
    },
    unpinConversation(
      _subUserId: string,
      conversationId: string,
    ): WorkbenchConversationUnpinResponse {
      return setConversationPinned(state, conversationId, false);
    },
  };
}

function buildInitialState(): MemoryWorkbenchState {
  const conversationsBySeat = {
    drc: sortConversations([
      conversation("conv-001", "drc", "cust-001", "丹阳草莓，得利市大樱桃", customerAvatarUrl, "这是最新的权益清单截图，你帮我确认下。", "2026-04-14 19:18:32", 2, "single", "high", true),
      conversation("conv-002", "drc", "cust-002", "睿白鸽", customerAvatarRuiUrl, "早餐能不能换成酸奶和坚果？", "2026-04-13 15:04:16", 0, "single", "medium"),
      conversation("conv-003", "drc", "cust-003", "+1.", customerAvatarPlusUrl, "体重平台期了，今天想加一次有氧。", "2026-04-13 05:09:59", 4, "single", "medium"),
      conversation("conv-004", "drc", "cust-004", "营养群-4月减脂冲刺", customerAvatarGroupUrl, "今天的打卡图请统一发到群公告下方。", "2026-04-11 09:44:38", 7, "group", "low"),
      conversation("conv-revoke-only", "drc", "cust-revoke-only", "撤回测试", customerAvatarUrl, "[撤回消息]", "2026-04-10 10:01:00", 0, "single", "low"),
    ]),
    ndt: sortConversations([
      conversation("conv-005", "ndt", "cust-005", "小宇._", customerAvatarXiaoyuUrl, "好，那我今天先从晚餐控碳开始。", "2026-04-14 10:39:38", 1, "single", "medium"),
      conversation("conv-006", "ndt", "cust-006", "睡觉", customerAvatarSleepUrl, "多喝水，明天继续打卡。", "2026-04-09 16:04:45", 0, "single", "low"),
    ]),
  } satisfies Record<string, WorkbenchConversationSummaryDto[]>;
  const seats = [
    seat("drc", "德瑞可", seatAvatarDrcUrl, "小可", "私域客户管理", "13296712905", "online", conversationsBySeat.drc, 13, CURRENT_SUB_USER_ID),
    seat("ndt", "念都堂", seatAvatarNdtUrl, "尚青", "门店社群维护", "18104084782", "online", conversationsBySeat.ndt, 1),
  ];

  return {
    seats,
    conversationsBySeat,
    groupMembersByConversationId: {
      "conv-004": {
        conversationId: "conv-004",
        groupSeatId: "group-seat-conv-004",
        thirdGroupId: "third-group-conv-004",
        items: [
          {
            avatarUrl: customerAvatarGroupUrl,
            displayName: "群主小可",
            thirdUserId: "member-owner",
            type: 2,
          },
          {
            avatarUrl: customerAvatarXiaoyuUrl,
            displayName: "小林",
            thirdUserId: "member-admin",
            type: 1,
          },
          {
            avatarUrl: customerAvatarUrl,
            displayName: "丹阳草莓",
            thirdUserId: "member-user",
            type: 0,
          },
          {
            avatarUrl: customerAvatarRuiUrl,
            displayName: "睿白鸽",
            thirdUserId: "member-rui",
            type: 0,
          },
          {
            avatarUrl: seatAvatarDrcUrl,
            displayName: "德瑞可-小可",
            thirdUserId: "member-agent",
            type: 0,
          },
        ],
      },
    },
    subUser: {
      displayName: "林洒",
      subUserId: CURRENT_SUB_USER_ID,
    },
    events: [],
    messagesByConversationId: {
      "conv-001": [
        message("msg-002", "conv-001", "drc", "cust-001", "customer", "mini-program", { appName: "学好惊喜社", title: "预约直播抽秋天的第一杯奶茶", coverImageUrl: imagePlaceholder("mini-program"), sourceLabel: "小程序" }, "2026-04-11 15:32:40", 1, "sent"),
        message("msg-003", "conv-001", "drc", "cust-001", "agent", "h5", { title: "5.0 版本新功能介绍", description: "智能搜索、智能总结、智能机器人全新发布", previewImageUrl: imagePlaceholder("h5"), sourceLabel: "H5 卡片" }, "2026-04-12 21:12:00", 2, "sent"),
        message("msg-004", "conv-001", "drc", "cust-001", "agent", "file", { fileName: "求未 AI 智能营销系统.pdf", fileSizeLabel: "6.10M", extension: "pdf", sourceLabel: "企业微信文件" }, "2026-04-13 09:10:00", 3, "sent"),
        message("msg-005", "conv-001", "drc", "cust-001", "customer", "text", { text: "Seedream 4.0 这张活动卡片我准备转给群里，你看标题会不会太满？" }, "2026-04-14 18:37:00", 4, "sent"),
        message("msg-006", "conv-001", "drc", "cust-001", "customer", "text", { text: "我先截了个竖图版本给你看。" }, "2026-04-14 18:37:18", 5, "sent"),
        message("msg-007", "conv-001", "drc", "cust-001", "customer", "image", { imageUrl: imagePlaceholder("phone"), alt: "手机截图", width: 300, height: 620 }, "2026-04-14 18:37:24", 6, "sent"),
        message("msg-008", "conv-001", "drc", "cust-001", "customer", "voice", { durationLabel: "11\"" }, "2026-04-14 18:38:12", 7, "sent"),
        message("msg-009", "conv-001", "drc", "cust-001", "customer", "text", { text: "这是最新的权益清单截图，你帮我确认下。" }, "2026-04-14 19:18:18", 8, "sent"),
        message("msg-010", "conv-001", "drc", "cust-001", "customer", "image", { imageUrl: imagePlaceholder("sheet"), alt: "权益清单截图", width: 1180, height: 540 }, "2026-04-14 19:18:32", 9, "sent"),
      ],
      "conv-002": [
        message("msg-011", "conv-002", "drc", "cust-002", "customer", "text", { text: "早餐能不能换成酸奶和坚果？" }, "2026-04-13 15:04:16", 1, "sent"),
        message("msg-011-video-horizontal", "conv-002", "drc", "cust-002", "customer", "video", { videoUrl: "/mock/video/stage-recital.mp4", coverImageUrl: imagePlaceholder("video-horizontal"), alt: "舞台活动视频", durationLabel: "1:01", width: 640, height: 360 }, "2026-04-13 15:04:28", 2, "sent"),
        message("msg-011-video-vertical", "conv-002", "drc", "cust-002", "customer", "video", { videoUrl: "/mock/video/lake-check.mp4", coverImageUrl: imagePlaceholder("video-vertical"), alt: "湖面竖版视频", durationLabel: "0:11", width: 360, height: 640 }, "2026-04-13 15:04:36", 3, "sent"),
      ],
      "conv-003": [
        message("msg-012", "conv-003", "drc", "cust-003", "customer", "text", { text: "体重平台期了，今天想加一次有氧。" }, "2026-04-13 05:09:59", 1, "sent"),
      ],
      "conv-004": [
        message("msg-013", "conv-004", "drc", "cust-004", "system", "system", { text: "群聊占位数据，后续可在轮询模型稳定后单独扩展。" }, "2026-04-11 09:44:38", 1, "sent"),
      ],
      "conv-revoke-only": [
        message("msg-revoke-009", "conv-revoke-only", "drc", "cust-revoke-only", "system", "revoke", { revokeMsgId: "516", revokeOriginMsgId: "1022531", type: "revoke" }, "2026-04-10 10:00:00", 9, "sent"),
        message("msg-revoke-010", "conv-revoke-only", "drc", "cust-revoke-only", "system", "revoke", { revokeMsgId: "517", revokeOriginMsgId: "1022532", type: "revoke" }, "2026-04-10 10:01:00", 10, "sent"),
        message("msg-revoke-older", "conv-revoke-only", "drc", "cust-revoke-only", "customer", "text", { text: "更早的可展示消息" }, "2026-04-10 09:59:00", 8, "sent"),
      ],
      "conv-005": [
        message("msg-014", "conv-005", "ndt", "cust-005", "customer", "text", { text: "好，那我今天先从晚餐控碳开始。" }, "2026-04-14 10:39:38", 1, "sent"),
      ],
      "conv-006": [
        message("msg-015", "conv-006", "ndt", "cust-006", "agent", "text", { text: "多喝水，明天继续打卡。" }, "2026-04-09 16:04:45", 1, "sent"),
      ],
    },
    nextId: 1,
    version: INITIAL_VERSION,
  };
}

function seat(
  seatId: string,
  name: string,
  avatar: string,
  operatorName: string,
  description: string,
  phone: string,
  loginStatus: WorkbenchSeatDto["loginStatus"],
  conversations: WorkbenchConversationSummaryDto[],
  unreadCount: number,
  hostSubUserId?: string,
): WorkbenchSeatDto {
  return {
    seatId,
    avatar,
    description,
    lastMessageTime: getSeatLastMessageTime(conversations),
    loginStatus,
    name,
    operatorName,
    phone,
    hostSubUserId,
    unreadCount,
  };
}

function conversation(
  conversationId: string,
  seatId: string,
  customerId: string,
  customerName: string,
  customerAvatar: string,
  lastMessage: string,
  lastMessageTime: string,
  unreadCount: number,
  mode: WorkbenchConversationSummaryDto["mode"],
  priority: WorkbenchConversationSummaryDto["priority"],
  isPinned?: boolean,
): WorkbenchConversationSummaryDto {
  return {
    seatId,
    conversationId,
    custodyMode: "semi",
    customerAvatar,
    customerId,
    customerName,
    isPinned,
    lastMessage,
    lastMessageTime: toTimestamp(lastMessageTime),
    mode,
    priority,
    unreadCount,
  };
}

function message(
  messageId: string,
  conversationId: string,
  seatId: string,
  customerId: string,
  senderType: WorkbenchMessageDto["senderType"],
  contentType: WorkbenchMessageDto["contentType"],
  content: Record<string, unknown>,
  createdAt: string,
  seq: number,
  status: WorkbenchMessageStatus,
): WorkbenchMessageDto {
  return {
    seatId,
    content,
    contentType,
    conversationId,
    createdAt: toTimestamp(createdAt),
    customerId,
    messageId,
    senderType,
    seq,
    status,
  };
}

function imagePlaceholder(label: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" rx="16" fill="#eef2f7"/><text x="24" y="96" font-family="Arial" font-size="20" fill="#64748b">${label}</text></svg>`,
  )}`;
}

function toTimestamp(value: string) {
  return new Date(value.replace(" ", "T")).getTime();
}

function findConversation(state: MemoryWorkbenchState, conversationId: string) {
  return Object.values(state.conversationsBySeat)
    .flat()
    .find((conversation) => conversation.conversationId === conversationId);
}

function findSeat(state: MemoryWorkbenchState, seatId: string) {
  return state.seats.find((seat) => seat.seatId === seatId);
}

function upsertConversation(
  state: MemoryWorkbenchState,
  nextConversation: WorkbenchConversationSummaryDto,
) {
  const currentConversations = state.conversationsBySeat[nextConversation.seatId] ?? [];
  state.conversationsBySeat[nextConversation.seatId] = sortConversations([
    nextConversation,
    ...currentConversations.filter(
      (conversation) => conversation.conversationId !== nextConversation.conversationId,
    ),
  ]);
}

function setConversationPinned(
  state: MemoryWorkbenchState,
  conversationId: string,
  isPinned: boolean,
) {
  const conversation = findConversation(state, conversationId);

  if (!conversation) {
    throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
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

function removeConversation(
  state: MemoryWorkbenchState,
  conversationId: string,
): WorkbenchConversationDeleteResponse {
  const conversation = findConversation(state, conversationId);

  if (!conversation) {
    throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
  }

  state.conversationsBySeat[conversation.seatId] = (
    state.conversationsBySeat[conversation.seatId] ?? []
  ).filter((item) => item.conversationId !== conversationId);
  setSeatUnreadCount(
    state,
    conversation.seatId,
    Math.max(0, getSeatUnreadCountValue(state, conversation.seatId) - conversation.unreadCount),
  );
  syncSeatLastMessageTime(state, conversation.seatId);
  pushConversationRemoveEvent(state, conversation.seatId, conversationId);
  pushSeatEvent(state, conversation.seatId);

  return {
    conversationId,
    seatId: conversation.seatId,
    seatUnreadCount: getSeatUnreadCountValue(state, conversation.seatId),
  };
}

function getSeatUnreadCountValue(state: MemoryWorkbenchState, seatId: string) {
  return findSeat(state, seatId)?.unreadCount ?? 0;
}

function setSeatUnreadCount(
  state: MemoryWorkbenchState,
  seatId: string,
  unreadCount: number,
) {
  const seat = findSeat(state, seatId);

  if (!seat) {
    return;
  }

  seat.unreadCount = unreadCount;
}

function syncSeatLastMessageTime(state: MemoryWorkbenchState, seatId: string) {
  const seat = findSeat(state, seatId);

  if (!seat) {
    return;
  }

  const conversations = state.conversationsBySeat[seatId] ?? [];
  seat.lastMessageTime = getSeatLastMessageTime(conversations);
}

function pushSeatEvent(state: MemoryWorkbenchState, seatId: string) {
  const seat = findSeat(state, seatId);

  if (!seat) {
    return;
  }

  state.version += 1;
  state.events.push({
    payload: {
      hostSubUserId: seat.hostSubUserId ?? null,
      seatId,
      lastMessageTime: seat.lastMessageTime,
      unreadCount: seat.unreadCount,
    },
    type: "seat",
    version: state.version,
  });
}

function getNextMemoryEventCursor(
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

function pushConversationEvent(
  state: MemoryWorkbenchState,
  conversation: WorkbenchConversationSummaryDto,
) {
  state.version += 1;
  state.events.push({
    payload: {
      ...conversation,
      type: "upsert",
    },
    type: "conversation",
    version: state.version,
  });
}

function pushMessageEvent(state: MemoryWorkbenchState, message: WorkbenchMessageDto) {
  state.version += 1;
  state.events.push({
    payload: message,
    type: "message",
    version: state.version,
  });
}

function pushConversationRemoveEvent(
  state: MemoryWorkbenchState,
  seatId: string,
  conversationId: string,
) {
  state.version += 1;
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

function getNextMessageSeq(state: MemoryWorkbenchState, conversationId: string) {
  const messages = state.messagesByConversationId[conversationId] ?? [];

  return (messages.at(-1)?.seq ?? 0) + 1;
}

function getPayloadSegments(payload: WorkbenchSendMessagePayload) {
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

function buildPayloadSegmentContent(
  segment: ReturnType<typeof getPayloadSegments>[number],
  quote?: WorkbenchSendMessagePayload["quote"],
) {
  if (quote && segment.type === "text") {
    return {
      quoteMsgId: quote.quoteMsgId,
      quotedMessageId: quote.quotedMessageId,
      quotedMessage: quote.quotedMessage,
      text: segment.text,
    };
  }

  if (segment.type === "image") {
    return {
      alt: segment.alt,
      height: segment.height,
      imageUrl: segment.url ?? segment.localUrl ?? "",
      width: segment.width,
    };
  }

  if (segment.type === "file") {
    return {
      extension: segment.extension,
      fileName: segment.fileName,
      fileSizeLabel: segment.fileSizeLabel ?? "",
      sourceLabel: "文件",
    };
  }

  return {
    text: segment.text,
  };
}

function getPayloadPreview(segments: ReturnType<typeof getPayloadSegments>) {
  const firstTextSegment = segments.find((segment) => segment.type === "text");

  if (firstTextSegment?.text) {
    return firstTextSegment.text;
  }

  if (segments.some((segment) => segment.type === "image")) {
    return "[图片]";
  }

  return segments.some((segment) => segment.type === "file") ? "[文件]" : "";
}

function buildSegmentClientMessageId(clientMessageId: string, index: number) {
  return index === 0 ? clientMessageId : `${clientMessageId}_${index + 1}`;
}

function resolveSendOutcome(
  state: MemoryWorkbenchState,
  seatId: string,
  segments: ReturnType<typeof getPayloadSegments>,
) {
  const seat = findSeat(state, seatId);
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

function getSeatLastMessageTime(conversations: WorkbenchConversationSummaryDto[]) {
  return conversations.reduce(
    (latest, conversation) => Math.max(latest, conversation.lastMessageTime ?? 0),
    0,
  );
}

function sortConversations(conversations: WorkbenchConversationSummaryDto[]) {
  return [...conversations].sort((left, right) => {
    if (Boolean(left.isPinned) !== Boolean(right.isPinned)) {
      return left.isPinned ? -1 : 1;
    }

    return (right.lastMessageTime ?? 0) - (left.lastMessageTime ?? 0);
  });
}

function sliceLatest<T>(items: T[], limit: number) {
  if (limit <= 0) {
    return [];
  }

  return items.slice(-limit);
}

function collapseLatest<T>(items: T[], getKey: (item: T) => string) {
  const latestByKey = new Map<string, T>();

  for (const item of items) {
    latestByKey.set(getKey(item), item);
  }

  return [...latestByKey.values()];
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
