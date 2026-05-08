import type {
  WorkbenchAccountChangeDto,
  WorkbenchAccountDto,
  WorkbenchConversationChangeDto,
  WorkbenchConversationReadResponse,
  WorkbenchConversationSummaryDto,
  WorkbenchEmployeeDto,
  WorkbenchMessageDto,
  WorkbenchMessageStatus,
  WorkbenchMessageStatusChangeDto,
  WorkbenchPollRequest,
  WorkbenchPollResponse,
  WorkbenchSendMessagePayload,
  WorkbenchSendMessageResponse,
  WorkbenchTakeOverAccountResponse,
} from "@chatai/contracts";
import { NotFoundError } from "../../shared/errors.js";

type WorkbenchEvent =
  | {
      version: number;
      type: "account";
      payload: WorkbenchAccountChangeDto;
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
      type: "message-status";
      payload: WorkbenchMessageStatusChangeDto;
    };

type MemoryWorkbenchState = {
  accounts: WorkbenchAccountDto[];
  conversationsByAccount: Record<string, WorkbenchConversationSummaryDto[]>;
  employee: WorkbenchEmployeeDto;
  events: WorkbenchEvent[];
  messagesByConversationId: Record<string, WorkbenchMessageDto[]>;
  nextId: number;
  version: number;
};

const CURRENT_EMPLOYEE_ID = "emp-001";
const INITIAL_VERSION = 1284;

const accountAvatarDrcUrl =
  "http://wework.qpic.cn/wwhead/duc2TvpEgSTewUnFO43HZ22H445fU0MTybfXZqjldjWlOArMJOM2GNsH3CUWyOuESHYdY5oHPhk/60";
const accountAvatarNdtUrl =
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
    getAccounts() {
      return clone(state.accounts);
    },
    getConversations(accountId: string) {
      return clone(sortConversations(state.conversationsByAccount[accountId] ?? []));
    },
    getMe() {
      return clone(state.employee);
    },
    getMessages(conversationId: string, options?: { beforeSeq?: number; limit?: number }) {
      const messages = [...(state.messagesByConversationId[conversationId] ?? [])].sort(
        (left, right) => left.seq - right.seq,
      );
      const beforeSeq = options?.beforeSeq;
      const limit = options?.limit ?? 30;
      const visibleMessages =
        beforeSeq == null
          ? sliceLatest(messages, limit)
          : sliceLatest(
              messages.filter((message) => message.seq < beforeSeq),
              limit,
            );

      return clone(visibleMessages);
    },
    markConversationRead(conversationId: string): WorkbenchConversationReadResponse {
      const conversation = findConversation(state, conversationId);

      if (!conversation) {
        throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
      }

      const nextConversation = {
        ...conversation,
        unreadCount: 0,
      };

      upsertConversation(state, nextConversation);
      syncAccountUnread(state, nextConversation.accountId);
      pushConversationEvent(state, nextConversation);
      pushAccountEvent(state, nextConversation.accountId);

      return {
        accountId: nextConversation.accountId,
        accountUnreadCount: findAccount(state, nextConversation.accountId)?.unreadCount ?? 0,
        conversationId,
        unreadCount: 0,
      };
    },
    poll(request: WorkbenchPollRequest): WorkbenchPollResponse {
      const relevantEvents = state.events.filter((event) => event.version > request.sinceVersion);
      const accountChanges = collapseLatest(
        relevantEvents.filter(
          (event): event is Extract<WorkbenchEvent, { type: "account" }> =>
            event.type === "account",
        ),
        (event) => event.payload.accountId,
      ).map((event) => event.payload);
      const conversationChanges = collapseLatest(
        relevantEvents.filter(
          (event): event is Extract<WorkbenchEvent, { type: "conversation" }> =>
            event.type === "conversation" &&
            event.payload.accountId === request.currentAccountId,
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
      const messageStatusChanges = relevantEvents
        .filter(
          (event): event is Extract<WorkbenchEvent, { type: "message-status" }> =>
            event.type === "message-status",
        )
        .map((event) => event.payload);

      return {
        accountChanges: clone(accountChanges),
        activeConversationMessages: clone(activeConversationMessages),
        conversationChanges: clone(conversationChanges),
        messageStatusChanges: clone(messageStatusChanges),
        nextVersion: state.version,
      };
    },
    sendMessage(payload: WorkbenchSendMessagePayload): WorkbenchSendMessageResponse {
      const conversation = findConversation(state, payload.conversationId);

      if (!conversation) {
        throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
      }

      const messageId = `msg-server-${state.nextId++}`;
      const nextSeq = getNextMessageSeq(state, payload.conversationId);
      const now = Date.now();
      const outcome = resolveSendOutcome(state, payload.accountId, payload.content);
      const backendMessage = {
        accountId: payload.accountId,
        clientMessageId: payload.clientMessageId,
        content: {
          text: payload.content,
        },
        contentType: "text" as const,
        conversationId: payload.conversationId,
        createdAt: now,
        customerId: conversation.customerId,
        failReason: outcome.reason,
        messageId,
        senderType: "agent" as const,
        seq: nextSeq,
        status: outcome.status,
      } satisfies WorkbenchMessageDto;

      const messages = state.messagesByConversationId[payload.conversationId] ?? [];
      state.messagesByConversationId[payload.conversationId] = [...messages, backendMessage];

      const nextConversation = {
        ...conversation,
        lastMessage: payload.content,
        lastMessageTime: now,
      };

      upsertConversation(state, nextConversation);
      syncAccountUnread(state, payload.accountId);
      pushConversationEvent(state, nextConversation);
      pushAccountEvent(state, payload.accountId);
      pushMessageStatusEvent(state, {
        clientMessageId: payload.clientMessageId,
        conversationId: payload.conversationId,
        messageId,
        reason: outcome.reason,
        status: outcome.status,
      });

      return {
        clientMessageId: payload.clientMessageId,
        messageId,
        status: "accepted",
      };
    },
    takeOverAccount(accountId: string): WorkbenchTakeOverAccountResponse {
      const account = findAccount(state, accountId);

      if (!account) {
        throw new NotFoundError("ACCOUNT_NOT_FOUND", "账号不存在");
      }

      const nextAccount = {
        ...account,
        takenOverEmployeeId: CURRENT_EMPLOYEE_ID,
      };

      state.accounts = state.accounts.map((item) =>
        item.accountId === accountId ? nextAccount : item,
      );
      pushAccountEvent(state, accountId);

      return { account: clone(nextAccount) };
    },
  };
}

function buildInitialState(): MemoryWorkbenchState {
  const conversationsByAccount = {
    drc: sortConversations([
      conversation("conv-001", "drc", "cust-001", "丹阳草莓，得利市大樱桃", customerAvatarUrl, "这是最新的权益清单截图，你帮我确认下。", "2026-04-14 19:18:32", 2, "single", "high", true),
      conversation("conv-002", "drc", "cust-002", "睿白鸽", customerAvatarRuiUrl, "早餐能不能换成酸奶和坚果？", "2026-04-13 15:04:16", 0, "single", "medium"),
      conversation("conv-003", "drc", "cust-003", "+1.", customerAvatarPlusUrl, "体重平台期了，今天想加一次有氧。", "2026-04-13 05:09:59", 4, "single", "medium"),
      conversation("conv-004", "drc", "cust-004", "营养群-4月减脂冲刺", customerAvatarGroupUrl, "今天的打卡图请统一发到群公告下方。", "2026-04-11 09:44:38", 7, "group", "low"),
    ]),
    ndt: sortConversations([
      conversation("conv-005", "ndt", "cust-005", "小宇._", customerAvatarXiaoyuUrl, "好，那我今天先从晚餐控碳开始。", "2026-04-14 10:39:38", 1, "single", "medium"),
      conversation("conv-006", "ndt", "cust-006", "睡觉", customerAvatarSleepUrl, "多喝水，明天继续打卡。", "2026-04-09 16:04:45", 0, "single", "low"),
    ]),
  } satisfies Record<string, WorkbenchConversationSummaryDto[]>;
  const accounts = [
    account("drc", "德瑞可", accountAvatarDrcUrl, "小可", "私域客户管理", "13296712905", "online", conversationsByAccount.drc, CURRENT_EMPLOYEE_ID),
    account("ndt", "念都堂", accountAvatarNdtUrl, "尚青", "门店社群维护", "18104084782", "online", conversationsByAccount.ndt),
  ];

  return {
    accounts,
    conversationsByAccount,
    employee: {
      displayName: "林洒",
      id: CURRENT_EMPLOYEE_ID,
    },
    events: [],
    messagesByConversationId: {
      "conv-001": [
        message("msg-002", "conv-001", "drc", "cust-001", "customer", "mini-program", { appName: "学好惊喜社", title: "预约直播抽秋天的第一杯奶茶", coverImageUrl: imagePlaceholder("mini-program"), sourceLabel: "小程序" }, "2026-04-11 15:32:40", 1, "read"),
        message("msg-003", "conv-001", "drc", "cust-001", "agent", "h5", { title: "5.0 版本新功能介绍", description: "智能搜索、智能总结、智能机器人全新发布", previewImageUrl: imagePlaceholder("h5"), sourceLabel: "H5 卡片" }, "2026-04-12 21:12:00", 2, "sent"),
        message("msg-004", "conv-001", "drc", "cust-001", "agent", "file", { fileName: "求未 AI 智能营销系统.pdf", fileSizeLabel: "6.10M", extension: "pdf", sourceLabel: "企业微信文件" }, "2026-04-13 09:10:00", 3, "sent"),
        message("msg-005", "conv-001", "drc", "cust-001", "customer", "text", { text: "Seedream 4.0 这张活动卡片我准备转给群里，你看标题会不会太满？" }, "2026-04-14 18:37:00", 4, "read"),
        message("msg-006", "conv-001", "drc", "cust-001", "customer", "text", { text: "我先截了个竖图版本给你看。" }, "2026-04-14 18:37:18", 5, "read"),
        message("msg-007", "conv-001", "drc", "cust-001", "customer", "image", { imageUrl: imagePlaceholder("phone"), alt: "手机截图", width: 300, height: 620 }, "2026-04-14 18:37:24", 6, "read"),
        message("msg-008", "conv-001", "drc", "cust-001", "customer", "voice", { durationLabel: "11\"" }, "2026-04-14 18:38:12", 7, "read"),
        message("msg-009", "conv-001", "drc", "cust-001", "customer", "text", { text: "这是最新的权益清单截图，你帮我确认下。" }, "2026-04-14 19:18:18", 8, "read"),
        message("msg-010", "conv-001", "drc", "cust-001", "customer", "image", { imageUrl: imagePlaceholder("sheet"), alt: "权益清单截图", width: 1180, height: 540 }, "2026-04-14 19:18:32", 9, "read"),
      ],
      "conv-002": [
        message("msg-011", "conv-002", "drc", "cust-002", "customer", "text", { text: "早餐能不能换成酸奶和坚果？" }, "2026-04-13 15:04:16", 1, "read"),
        message("msg-011-video-horizontal", "conv-002", "drc", "cust-002", "customer", "video", { videoUrl: "/mock/video/stage-recital.mp4", coverImageUrl: imagePlaceholder("video-horizontal"), alt: "舞台活动视频", durationLabel: "1:01", width: 640, height: 360 }, "2026-04-13 15:04:28", 2, "read"),
        message("msg-011-video-vertical", "conv-002", "drc", "cust-002", "customer", "video", { videoUrl: "/mock/video/lake-check.mp4", coverImageUrl: imagePlaceholder("video-vertical"), alt: "湖面竖版视频", durationLabel: "0:11", width: 360, height: 640 }, "2026-04-13 15:04:36", 3, "read"),
      ],
      "conv-003": [
        message("msg-012", "conv-003", "drc", "cust-003", "customer", "text", { text: "体重平台期了，今天想加一次有氧。" }, "2026-04-13 05:09:59", 1, "read"),
      ],
      "conv-004": [
        message("msg-013", "conv-004", "drc", "cust-004", "system", "system", { text: "群聊占位数据，后续可在轮询模型稳定后单独扩展。" }, "2026-04-11 09:44:38", 1, "read"),
      ],
      "conv-005": [
        message("msg-014", "conv-005", "ndt", "cust-005", "customer", "text", { text: "好，那我今天先从晚餐控碳开始。" }, "2026-04-14 10:39:38", 1, "read"),
      ],
      "conv-006": [
        message("msg-015", "conv-006", "ndt", "cust-006", "agent", "text", { text: "多喝水，明天继续打卡。" }, "2026-04-09 16:04:45", 1, "sent"),
      ],
    },
    nextId: 1,
    version: INITIAL_VERSION,
  };
}

function account(
  accountId: string,
  name: string,
  avatar: string,
  operatorName: string,
  description: string,
  phone: string,
  loginStatus: WorkbenchAccountDto["loginStatus"],
  conversations: WorkbenchConversationSummaryDto[],
  takenOverEmployeeId?: string,
): WorkbenchAccountDto {
  return {
    accountId,
    avatar,
    description,
    lastMessageTime: getAccountLastMessageTime(conversations),
    loginStatus,
    name,
    operatorName,
    phone,
    takenOverEmployeeId,
    unreadCount: getAccountUnreadCount(conversations),
  };
}

function conversation(
  conversationId: string,
  accountId: string,
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
    accountId,
    conversationId,
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
  accountId: string,
  customerId: string,
  senderType: WorkbenchMessageDto["senderType"],
  contentType: WorkbenchMessageDto["contentType"],
  content: Record<string, unknown>,
  createdAt: string,
  seq: number,
  status: WorkbenchMessageStatus,
): WorkbenchMessageDto {
  return {
    accountId,
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
  return Object.values(state.conversationsByAccount)
    .flat()
    .find((conversation) => conversation.conversationId === conversationId);
}

function findAccount(state: MemoryWorkbenchState, accountId: string) {
  return state.accounts.find((account) => account.accountId === accountId);
}

function upsertConversation(
  state: MemoryWorkbenchState,
  nextConversation: WorkbenchConversationSummaryDto,
) {
  const currentConversations = state.conversationsByAccount[nextConversation.accountId] ?? [];
  state.conversationsByAccount[nextConversation.accountId] = sortConversations([
    nextConversation,
    ...currentConversations.filter(
      (conversation) => conversation.conversationId !== nextConversation.conversationId,
    ),
  ]);
}

function syncAccountUnread(state: MemoryWorkbenchState, accountId: string) {
  const account = findAccount(state, accountId);

  if (!account) {
    return;
  }

  const conversations = state.conversationsByAccount[accountId] ?? [];
  account.unreadCount = getAccountUnreadCount(conversations);
  account.lastMessageTime = getAccountLastMessageTime(conversations);
}

function pushAccountEvent(state: MemoryWorkbenchState, accountId: string) {
  const account = findAccount(state, accountId);

  if (!account) {
    return;
  }

  state.version += 1;
  state.events.push({
    payload: {
      accountId,
      lastMessageTime: account.lastMessageTime,
      unreadCount: account.unreadCount,
    },
    type: "account",
    version: state.version,
  });
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

function pushMessageStatusEvent(
  state: MemoryWorkbenchState,
  change: WorkbenchMessageStatusChangeDto,
) {
  state.version += 1;
  state.events.push({
    payload: change,
    type: "message-status",
    version: state.version,
  });
}

function getNextMessageSeq(state: MemoryWorkbenchState, conversationId: string) {
  const messages = state.messagesByConversationId[conversationId] ?? [];

  return (messages.at(-1)?.seq ?? 0) + 1;
}

function resolveSendOutcome(
  state: MemoryWorkbenchState,
  accountId: string,
  content: string,
) {
  const account = findAccount(state, accountId);
  const shouldFail = account?.loginStatus === "offline" || /\[fail\]/i.test(content);

  if (shouldFail) {
    return {
      reason: account?.loginStatus === "offline" ? "企微账号离线" : "模拟发送失败",
      status: "failed" as const,
    };
  }

  return {
    status: "sent" as const,
  };
}

function getAccountUnreadCount(conversations: WorkbenchConversationSummaryDto[]) {
  return conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);
}

function getAccountLastMessageTime(conversations: WorkbenchConversationSummaryDto[]) {
  return conversations.reduce(
    (latest, conversation) => Math.max(latest, conversation.lastMessageTime),
    0,
  );
}

function sortConversations(conversations: WorkbenchConversationSummaryDto[]) {
  return [...conversations].sort((left, right) => {
    if (Boolean(left.isPinned) !== Boolean(right.isPinned)) {
      return left.isPinned ? -1 : 1;
    }

    return right.lastMessageTime - left.lastMessageTime;
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
