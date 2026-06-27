import type {
  Account,
  Conversation,
  CustomerProfile,
  GroupMember,
  Message,
} from "@/pages/chat/chat-types";

type SeedConversation = Omit<Conversation, "conversationAIHostingSwitch"> &
  Partial<Pick<Conversation, "conversationAIHostingSwitch">>;

function withDefaultAIHostingSwitch(conversations: SeedConversation[]): Conversation[] {
  return conversations.map((conversation) => ({
    ...conversation,
    conversationAIHostingSwitch: conversation.conversationAIHostingSwitch ?? false,
  }));
}

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
const agentAvatarUrl = accountAvatarDrcUrl;
const agentAvatarNdtUrl = accountAvatarNdtUrl;
const phoneScreenshotImageUrl = createPhoneScreenshotDataUrl();
const spreadsheetImageUrl = createSpreadsheetDataUrl();
const h5CardPreviewImageUrl = createH5CardPreviewDataUrl();
const miniProgramCoverImageUrl = createMiniProgramCoverDataUrl();
const horizontalVideoCoverImageUrl = createHorizontalVideoCoverDataUrl();
const verticalVideoCoverImageUrl = createVerticalVideoCoverDataUrl();

const starCloudCustomerNames = [
  "星云-星光 (星光)",
  "星云小助手 (星云小助手（问题优先发群里）)",
  "星云-云翎 (星云-云翎)",
  "星云-云梦 (云梦)",
  "星云-星语 (星语（问题优先发群里）)",
  "星云-云翼 (云翼)",
  "星云-星瑞 (星瑞)",
  "马星",
] as const;

const starCloudGroupNames = [
  "【外部】星云有客&企业微信沟通 (19)",
  "星云-企业微信沟通 (8)",
  "星云合伙人 (3)",
  "星云产品&项目周会群 (14)",
  "星云业务管理周会群 (7)",
  "星云有客&企业微信 (17)",
  "星云标准化产品-Core (10)",
  "星云售后答疑群 (22)",
  "星云渠道增长群 (16)",
  "星云私域研习社班班群 (31)",
  "星云客户成功协作群 (12)",
  "星云咨询管理群 (9)",
] as const;

const starCloudAvatarUrls = [
  customerAvatarUrl,
  customerAvatarRuiUrl,
  customerAvatarPlusUrl,
  customerAvatarXiaoyuUrl,
  customerAvatarSleepUrl,
  customerAvatarGroupUrl,
] as const;

const starCloudCustomerConversations = starCloudCustomerNames.map((name, index) =>
  createStarCloudConversation({
    index,
    mode: "single",
    name,
  }),
);

const starCloudGroupConversations = starCloudGroupNames.map((name, index) =>
  createStarCloudConversation({
    index,
    mode: "group",
    name,
  }),
);

const starCloudConversations = [
  ...starCloudCustomerConversations,
  ...starCloudGroupConversations,
];

const starCloudCustomerProfiles = Object.fromEntries(
  starCloudConversations.map((conversation, index) => [
    conversation.customerId,
    createStarCloudCustomerProfile(conversation, index),
  ]),
) as Record<string, CustomerProfile>;

export const seedAccounts: Account[] = [
  {
    id: "drc",
    name: "德瑞可",
    avatarUrl: accountAvatarDrcUrl,
    operator: "小可",
    description: "私域客户管理",
    phone: "13296712905",
    metrics: {
      totalCustomers: 235,
      activeCustomers: 18,
      agents: 4,
      stores: 3,
    },
    tone: "linear-gradient(135deg, rgba(74,144,255,0.95), rgba(107,188,255,0.78))",
  },
  {
    id: "ndt",
    name: "念都堂",
    avatarUrl: accountAvatarNdtUrl,
    operator: "尚青",
    description: "门店社群维护",
    phone: "18104084782",
    metrics: {
      totalCustomers: 232,
      activeCustomers: 11,
      agents: 3,
      stores: 1,
    },
    tone: "linear-gradient(135deg, rgba(255,151,89,0.95), rgba(255,200,118,0.75))",
  },
];

const rawSeedConversations: Record<string, SeedConversation[]> = {
  drc: [
    {
      id: "conv-001",
      accountId: "drc",
      customerId: "cust-001",
      customerName: "丹阳草莓，得利市大樱桃",
      customerAvatarUrl,
      preview: "这是最新的权益清单截图，你帮我确认下。",
      updatedAt: "2026-04-14 19:18:32",
      quietFor: "9天没聊了",
      unread: 2,
      mode: "single",
      priority: "high",
      isPinned: true,
    },
    {
      id: "conv-002",
      accountId: "drc",
      customerId: "cust-002",
      customerName: "睿白鸽",
      customerAvatarUrl: customerAvatarRuiUrl,
      preview: "早餐能不能换成酸奶和坚果？",
      updatedAt: "2026-04-13 15:04:16",
      quietFor: "2天没聊了",
      unread: 0,
      mode: "single",
      priority: "medium",
    },
    {
      id: "conv-003",
      accountId: "drc",
      customerId: "cust-003",
      customerName: "+1.",
      customerAvatarUrl: customerAvatarPlusUrl,
      preview: "体重平台期了，今天想加一次有氧。",
      updatedAt: "2026-04-13 05:09:59",
      quietFor: "2天没聊了",
      unread: 4,
      mode: "single",
      priority: "medium",
    },
    {
      id: "conv-004",
      accountId: "drc",
      customerId: "cust-004",
      customerName: "营养群-4月减脂冲刺",
      customerAvatarUrl: customerAvatarGroupUrl,
      preview: "今天的打卡图请统一发到群公告下方。",
      updatedAt: "2026-04-11 09:44:38",
      quietFor: "4天没聊了",
      unread: 7,
      mode: "group",
      priority: "low",
      thirdUserId: "third-user-drc",
    },
    ...starCloudConversations,
  ],
  ndt: [
    {
      id: "conv-005",
      accountId: "ndt",
      customerId: "cust-005",
      customerName: "小宇._",
      customerAvatarUrl: customerAvatarXiaoyuUrl,
      preview: "好，那我今天先从晚餐控碳开始。",
      updatedAt: "2026-04-14 10:39:38",
      quietFor: "1天没聊了",
      unread: 1,
      mode: "single",
      priority: "medium",
    },
    {
      id: "conv-006",
      accountId: "ndt",
      customerId: "cust-006",
      customerName: "睡觉",
      customerAvatarUrl: customerAvatarSleepUrl,
      preview: "多喝水，明天继续打卡。",
      updatedAt: "2026-04-09 16:04:45",
      quietFor: "6天没聊了",
      unread: 0,
      mode: "single",
      priority: "low",
    },
  ],
};

export const seedConversations: Record<string, Conversation[]> = Object.fromEntries(
  Object.entries(rawSeedConversations).map(([accountId, conversations]) => [
    accountId,
    withDefaultAIHostingSwitch(conversations),
  ]),
);

export const seedGroupMembersByConversationId: Record<string, GroupMember[]> = {
  "conv-004": [
    {
      id: "member-001",
      displayName: "小林",
      avatarUrl: customerAvatarXiaoyuUrl,
      type: 1,
    },
    {
      id: "member-002",
      displayName: "睿白鸽",
      avatarUrl: customerAvatarRuiUrl,
      type: 0,
    },
    {
      id: "member-owner",
      displayName: "群主小可",
      avatarUrl: agentAvatarUrl,
      type: 2,
    },
    {
      id: "member-003",
      displayName: "丹阳草莓",
      avatarUrl: customerAvatarUrl,
      type: 0,
    },
    {
      id: "third-user-drc",
      displayName: "德瑞可-小可",
      avatarUrl: agentAvatarUrl,
      type: 0,
    },
    {
      id: "member-006",
      displayName: "缪勇飞 群昵称111",
      avatarUrl: customerAvatarGroupUrl,
      type: 0,
    },
    {
      id: "member-005",
      displayName: "睡觉",
      avatarUrl: customerAvatarSleepUrl,
      type: 0,
    },
  ],
};

export const seedMessages: Record<string, Message[]> = {
  "conv-001": [
    {
      uiMessageKey: "msg-002",
      msgid: "msg-002",
      conversationId: "conv-001",
      role: "customer",
      author: "丹阳草莓，得利市大樱桃",
      sender: {
        id: "sender-cust-001",
        name: "丹阳草莓，得利市大樱桃",
        avatarUrl: customerAvatarUrl,
      },
      content: {
        type: "mini-program",
        appName: "学好惊喜社",
        title: "预约直播抽秋天的第一杯奶茶",
        coverImageUrl: miniProgramCoverImageUrl,
        sourceLabel: "小程序",
      },
      sentAt: "2026-04-11 15:32:40",
      status: "sent",
    },
    {
      uiMessageKey: "msg-003",
      msgid: "msg-003",
      conversationId: "conv-001",
      role: "agent",
      author: "德瑞可-小可",
      sender: {
        id: "sender-agent-001",
        name: "德瑞可-小可",
        avatarUrl: agentAvatarUrl,
      },
      content: {
        type: "h5",
        title: "5.0 版本新功能介绍",
        description: "智能搜索、智能总结、智能机器人全新发布",
        previewImageUrl: h5CardPreviewImageUrl,
        sourceLabel: "H5 卡片",
      },
      sentAt: "2026-04-12 21:12:00",
      status: "sent",
    },
    {
      uiMessageKey: "msg-004",
      msgid: "msg-004",
      conversationId: "conv-001",
      role: "agent",
      author: "德瑞可-小可",
      sender: {
        id: "sender-agent-001",
        name: "德瑞可-小可",
        avatarUrl: agentAvatarUrl,
      },
      content: {
        type: "file",
        fileName: "求未 AI 智能营销系统.pdf",
        fileSizeLabel: "6.10M",
        extension: "pdf",
        sourceLabel: "企业微信文件",
      },
      sentAt: "2026-04-13 09:10:00",
      status: "sent",
    },
    {
      uiMessageKey: "msg-005",
      msgid: "msg-005",
      conversationId: "conv-001",
      role: "customer",
      author: "丹阳草莓，得利市大樱桃",
      sender: {
        id: "sender-cust-001",
        name: "丹阳草莓，得利市大樱桃",
        avatarUrl: customerAvatarUrl,
      },
      content: {
        type: "text",
        text: "Seedream 4.0 这张活动卡片我准备转给群里，你看标题会不会太满？",
      },
      sentAt: "2026-04-14 18:37:00",
      status: "sent",
    },
    {
      uiMessageKey: "msg-006",
      msgid: "msg-006",
      conversationId: "conv-001",
      role: "customer",
      author: "丹阳草莓，得利市大樱桃",
      sender: {
        id: "sender-cust-001",
        name: "丹阳草莓，得利市大樱桃",
        avatarUrl: customerAvatarUrl,
      },
      content: {
        type: "text",
        text: "我先截了个竖图版本给你看。",
      },
      sentAt: "2026-04-14 18:37:18",
      status: "sent",
    },
    {
      uiMessageKey: "msg-007",
      msgid: "msg-007",
      conversationId: "conv-001",
      role: "customer",
      author: "丹阳草莓，得利市大樱桃",
      sender: {
        id: "sender-cust-001",
        name: "丹阳草莓，得利市大樱桃",
        avatarUrl: customerAvatarUrl,
      },
      content: {
        type: "image",
        imageUrl: phoneScreenshotImageUrl,
        alt: "手机截图",
        width: 300,
        height: 620,
      },
      sentAt: "2026-04-14 18:37:24",
      status: "sent",
    },
    {
      uiMessageKey: "msg-008",
      msgid: "msg-008",
      conversationId: "conv-001",
      role: "customer",
      author: "丹阳草莓，得利市大樱桃",
      sender: {
        id: "sender-cust-001",
        name: "丹阳草莓，得利市大樱桃",
        avatarUrl: customerAvatarUrl,
      },
      content: {
        type: "voice",
        durationLabel: "11\"",
      },
      sentAt: "2026-04-14 18:38:12",
      status: "sent",
    },
    {
      uiMessageKey: "msg-009",
      msgid: "msg-009",
      conversationId: "conv-001",
      role: "customer",
      author: "丹阳草莓，得利市大樱桃",
      sender: {
        id: "sender-cust-001",
        name: "丹阳草莓，得利市大樱桃",
        avatarUrl: customerAvatarUrl,
      },
      content: {
        type: "text",
        text: "这是最新的权益清单截图，你帮我确认下。",
      },
      sentAt: "2026-04-14 19:18:18",
      status: "sent",
    },
    {
      uiMessageKey: "msg-010",
      msgid: "msg-010",
      conversationId: "conv-001",
      role: "customer",
      author: "丹阳草莓，得利市大樱桃",
      sender: {
        id: "sender-cust-001",
        name: "丹阳草莓，得利市大樱桃",
        avatarUrl: customerAvatarUrl,
      },
      content: {
        type: "image",
        imageUrl: spreadsheetImageUrl,
        alt: "权益清单截图",
        width: 1180,
        height: 540,
      },
      sentAt: "2026-04-14 19:18:32",
      status: "sent",
    },
  ],
  "conv-002": [
    {
      uiMessageKey: "msg-011",
      msgid: "msg-011",
      conversationId: "conv-002",
      role: "customer",
      author: "睿白鸽",
      sender: {
        id: "sender-cust-002",
        name: "睿白鸽",
        avatarUrl: customerAvatarRuiUrl,
      },
      content: {
        type: "text",
        text: "早餐能不能换成酸奶和坚果？",
      },
      sentAt: "2026-04-13 15:04:16",
      status: "sent",
    },
    {
      uiMessageKey: "msg-011-video-horizontal",
      msgid: "msg-011-video-horizontal",
      conversationId: "conv-002",
      role: "customer",
      author: "睿白鸽",
      sender: {
        id: "sender-cust-002",
        name: "睿白鸽",
        avatarUrl: customerAvatarRuiUrl,
      },
      content: {
        type: "video",
        videoUrl: "/mock/video/stage-recital.mp4",
        coverImageUrl: horizontalVideoCoverImageUrl,
        alt: "舞台活动视频",
        durationLabel: "1:01",
        width: 640,
        height: 360,
      },
      sentAt: "2026-04-13 15:04:28",
      status: "sent",
    },
    {
      uiMessageKey: "msg-011-video-vertical",
      msgid: "msg-011-video-vertical",
      conversationId: "conv-002",
      role: "customer",
      author: "睿白鸽",
      sender: {
        id: "sender-cust-002",
        name: "睿白鸽",
        avatarUrl: customerAvatarRuiUrl,
      },
      content: {
        type: "video",
        videoUrl: "/mock/video/lake-check.mp4",
        coverImageUrl: verticalVideoCoverImageUrl,
        alt: "湖面竖版视频",
        durationLabel: "0:11",
        width: 360,
        height: 640,
      },
      sentAt: "2026-04-13 15:04:36",
      status: "sent",
    },
  ],
  "conv-003": [
    {
      uiMessageKey: "msg-012",
      msgid: "msg-012",
      conversationId: "conv-003",
      role: "customer",
      author: "+1.",
      sender: {
        id: "sender-cust-003",
        name: "+1.",
        avatarUrl: customerAvatarPlusUrl,
      },
      content: {
        type: "text",
        text: "体重平台期了，今天想加一次有氧。",
      },
      sentAt: "2026-04-13 05:09:59",
      status: "sent",
    },
  ],
  "conv-004": [
    {
      uiMessageKey: "msg-013",
      msgid: "msg-013",
      conversationId: "conv-004",
      role: "system",
      author: "系统",
      content: {
        type: "system",
        text: "群聊占位数据，后续可在轮询模型稳定后单独扩展。",
      },
      sentAt: "2026-04-11 09:44:38",
      status: "sent",
    },
    {
      uiMessageKey: "msg-013-solitaire",
      msgid: "msg-013-solitaire",
      conversationId: "conv-004",
      role: "customer",
      author: "缪勇飞 群昵称111",
      sender: {
        groupMemberId: "member-006",
        id: "member-006",
        name: "缪勇飞 群昵称111",
        avatarUrl: customerAvatarGroupUrl,
      },
      content: {
        type: "solitaire",
        createMemberSerialNo: "7E3068915A444A58F73D7069C81A56F55194F219CF554649F1C4F9C615435A82",
        example: "例 就这样吧",
        items: [
          {
            content: "哼╭(╯^╰)╮",
            memberSerialNo: "7E3068915A444A58F73D7069C81A56F55194F219CF554649F1C4F9C615435A82",
            timestamp: 1778465705,
          },
          {
            content: "缪勇飞 群昵称111",
            memberSerialNo: "9AC41EA35455F6FFD1832E6EB0CD8C445194F219CF554649F1C4F9C615435A82",
            timestamp: 1778486143,
          },
        ],
        tail: "",
        title: "#接龙\n哈哈哈",
      },
      sentAt: "2026-05-11 16:31:00",
      status: "sent",
    },
  ],
  "conv-005": [
    {
      uiMessageKey: "msg-014",
      msgid: "msg-014",
      conversationId: "conv-005",
      role: "customer",
      author: "小宇._",
      sender: {
        id: "sender-cust-005",
        name: "小宇._",
        avatarUrl: customerAvatarXiaoyuUrl,
      },
      content: {
        type: "text",
        text: "好，那我今天先从晚餐控碳开始。",
      },
      sentAt: "2026-04-14 10:39:38",
      status: "sent",
    },
  ],
  "conv-006": [
    {
      uiMessageKey: "msg-015",
      msgid: "msg-015",
      conversationId: "conv-006",
      role: "agent",
      author: "念都堂-尚青",
      sender: {
        id: "sender-agent-006",
        name: "念都堂-尚青",
        avatarUrl: agentAvatarNdtUrl,
      },
      content: {
        type: "text",
        text: "多喝水，明天继续打卡。",
      },
      sentAt: "2026-04-09 16:04:45",
      status: "sent",
    },
  ],
};

function createPhoneScreenshotDataUrl() {
  return createSvgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="300" height="620" viewBox="0 0 300 620" fill="none">
      <rect width="300" height="620" rx="28" fill="#f3f6fb" />
      <rect x="18" y="18" width="264" height="584" rx="22" fill="#ffffff" stroke="#d9e1ea" />
      <rect x="38" y="42" width="224" height="38" rx="12" fill="#2f7cff" opacity="0.92" />
      <rect x="38" y="102" width="168" height="16" rx="8" fill="#d7e4f4" />
      <rect x="38" y="132" width="196" height="13" rx="6.5" fill="#edf2f7" />
      <rect x="38" y="156" width="164" height="13" rx="6.5" fill="#edf2f7" />
      <rect x="38" y="188" width="224" height="116" rx="16" fill="#fbfcfe" stroke="#ebf0f5" />
      <rect x="52" y="210" width="92" height="10" rx="5" fill="#d9e1ea" />
      <rect x="52" y="232" width="176" height="10" rx="5" fill="#edf2f7" />
      <rect x="52" y="254" width="140" height="10" rx="5" fill="#edf2f7" />
      <circle cx="222" cy="246" r="38" fill="none" stroke="#ff745c" stroke-width="6" stroke-dasharray="8 9" />
      <path d="M78 338H222" stroke="#ced8e4" stroke-width="8" stroke-linecap="round" />
      <path d="M78 374H194" stroke="#e7edf3" stroke-width="8" stroke-linecap="round" />
      <path d="M78 410H228" stroke="#e7edf3" stroke-width="8" stroke-linecap="round" />
      <path d="M78 446H182" stroke="#e7edf3" stroke-width="8" stroke-linecap="round" />
      <rect x="38" y="504" width="224" height="64" rx="18" fill="#f5f7fb" />
      <text x="54" y="542" font-size="18" fill="#78879a" font-family="Arial, sans-serif">规则页截图</text>
    </svg>
  `);
}

function createSpreadsheetDataUrl() {
  return createSvgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1180" height="540" viewBox="0 0 1180 540" fill="none">
      <rect width="1180" height="540" rx="24" fill="#ffffff" />
      <rect x="20" y="20" width="1140" height="500" rx="18" fill="#f9fbfd" stroke="#dfe7ef" />
      <rect x="20" y="20" width="1140" height="56" rx="18" fill="#dff0e8" />
      <rect x="20" y="76" width="180" height="444" fill="#d5ebf8" />
      <rect x="20" y="76" width="1140" height="42" fill="#e6f3ea" />
      <rect x="200" y="118" width="220" height="68" fill="#3aa465" />
      <rect x="420" y="118" width="560" height="68" fill="#ffffff" />
      <rect x="980" y="118" width="180" height="68" fill="#ffffff" />
      <rect x="200" y="186" width="220" height="60" fill="#f6f6c1" />
      <rect x="420" y="186" width="560" height="60" fill="#ffffff" />
      <rect x="980" y="186" width="180" height="60" fill="#ffffff" />
      <rect x="200" y="246" width="220" height="60" fill="#f3efb7" />
      <rect x="420" y="246" width="560" height="60" fill="#ffffff" />
      <rect x="980" y="246" width="180" height="60" fill="#ffffff" />
      <rect x="200" y="306" width="220" height="60" fill="#f5f3c6" />
      <rect x="420" y="306" width="560" height="60" fill="#ffffff" />
      <rect x="980" y="306" width="180" height="60" fill="#ffffff" />
      <g stroke="#d5dfe8">
        <path d="M200 76V520" />
        <path d="M420 76V520" />
        <path d="M980 76V520" />
        <path d="M20 118H1160" />
        <path d="M20 186H1160" />
        <path d="M20 246H1160" />
        <path d="M20 306H1160" />
        <path d="M20 366H1160" />
        <path d="M20 426H1160" />
      </g>
      <g fill="#18212f" font-family="Arial, sans-serif">
        <text x="40" y="108" font-size="20" font-weight="700">需求名称</text>
        <text x="452" y="108" font-size="20" font-weight="700">需求描述</text>
        <text x="1012" y="108" font-size="20" font-weight="700">初步结论</text>
        <text x="40" y="160" font-size="18" font-weight="700">积分抵现</text>
        <text x="40" y="223" font-size="18" font-weight="700">运费险</text>
        <text x="40" y="283" font-size="18" font-weight="700">N 元 N 件</text>
        <text x="452" y="160" font-size="18">订单下单时有多少积分抵多少</text>
        <text x="452" y="223" font-size="18">需要通公网域下单一样</text>
        <text x="452" y="283" font-size="18">新的活动场景，如 99 元任选 3 件</text>
        <text x="1012" y="160" font-size="18">12月启动</text>
        <text x="1012" y="223" font-size="18">暂无计划</text>
        <text x="1012" y="283" font-size="18">H1 可做</text>
      </g>
    </svg>
  `);
}

function createH5CardPreviewDataUrl() {
  return createSvgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="168" height="168" viewBox="0 0 168 168" fill="none">
      <defs>
        <linearGradient id="card" x1="24" y1="16" x2="148" y2="152" gradientUnits="userSpaceOnUse">
          <stop stop-color="#d7e7ff" />
          <stop offset="1" stop-color="#f9e8f3" />
        </linearGradient>
      </defs>
      <rect width="168" height="168" rx="28" fill="url(#card)" />
      <circle cx="78" cy="84" r="34" stroke="#3d7cff" stroke-width="8" />
      <path d="M104 104L122 122" stroke="#8b59d9" stroke-width="8" stroke-linecap="round" />
      <circle cx="122" cy="52" r="6" fill="#ff7db6" />
      <path d="M126 34V46" stroke="#ff7db6" stroke-width="6" stroke-linecap="round" />
      <path d="M120 40H132" stroke="#ff7db6" stroke-width="6" stroke-linecap="round" />
    </svg>
  `);
}

function createMiniProgramCoverDataUrl() {
  return createSvgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640" fill="none">
      <defs>
        <linearGradient id="poster" x1="60" y1="44" x2="594" y2="598" gradientUnits="userSpaceOnUse">
          <stop stop-color="#fff6ea" />
          <stop offset="1" stop-color="#f5f8ff" />
        </linearGradient>
      </defs>
      <rect width="640" height="640" rx="44" fill="url(#poster)" />
      <circle cx="510" cy="136" r="54" fill="#ffd870" opacity="0.88" />
      <rect x="64" y="70" width="200" height="44" rx="22" fill="#ffffff" />
      <text x="94" y="100" font-size="24" fill="#e17b4f" font-family="Arial, sans-serif" font-weight="700">直播预约</text>
      <text x="66" y="190" font-size="54" fill="#1f2430" font-family="Arial, sans-serif" font-weight="700">秋天第一杯</text>
      <text x="66" y="260" font-size="54" fill="#1f2430" font-family="Arial, sans-serif" font-weight="700">奶茶福利</text>
      <rect x="66" y="314" width="224" height="26" rx="13" fill="#ffebdf" />
      <text x="84" y="333" font-size="18" fill="#c66a42" font-family="Arial, sans-serif">预约直播 / 到店提醒 / 抽奖</text>
      <rect x="388" y="348" width="166" height="184" rx="28" fill="#fff3d9" />
      <ellipse cx="471" cy="476" rx="70" ry="50" fill="#ffdf92" />
      <path d="M430 430C430 392 459 364 496 364C533 364 562 392 562 430V484H430V430Z" fill="#8f5cf7" opacity="0.12" />
      <circle cx="474" cy="440" r="56" fill="#f7a0b9" />
      <path d="M448 430C468 406 506 404 526 426" stroke="#72434d" stroke-width="8" stroke-linecap="round" />
      <circle cx="458" cy="446" r="6" fill="#5d3341" />
      <circle cx="498" cy="446" r="6" fill="#5d3341" />
      <path d="M458 472C470 482 488 482 500 472" stroke="#5d3341" stroke-width="7" stroke-linecap="round" />
    </svg>
  `);
}

function createHorizontalVideoCoverDataUrl() {
  return createSvgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" fill="none">
      <rect width="640" height="360" fill="#10184f" />
      <rect width="640" height="180" fill="url(#stageGlow)" opacity="0.95" />
      <circle cx="416" cy="88" r="44" fill="#ff4fb8" opacity="0.72" />
      <circle cx="410" cy="90" r="24" fill="#ffe66d" opacity="0.75" />
      <rect y="244" width="640" height="116" fill="#26123d" />
      <path d="M54 298C122 260 174 267 244 300C310 331 382 332 452 304C506 282 560 282 626 309" stroke="#ff625e" stroke-width="16" stroke-linecap="round" opacity="0.8" />
      <path d="M88 304C164 276 238 276 320 306C402 335 490 322 592 290" stroke="#f8c35a" stroke-width="12" stroke-linecap="round" opacity="0.72" />
      <rect x="92" y="152" width="18" height="90" rx="9" fill="#18294d" />
      <circle cx="101" cy="136" r="17" fill="#d5a077" />
      <path d="M110 164C142 151 163 138 186 112" stroke="#f6d1a4" stroke-width="10" stroke-linecap="round" />
      <path d="M94 242L66 306" stroke="#141727" stroke-width="12" stroke-linecap="round" />
      <path d="M107 242L142 310" stroke="#141727" stroke-width="12" stroke-linecap="round" />
      <rect x="250" y="174" width="76" height="76" rx="10" fill="#f2efff" opacity="0.9" />
      <rect x="346" y="168" width="78" height="82" rx="10" fill="#ffe2ee" opacity="0.9" />
      <rect x="444" y="178" width="78" height="72" rx="10" fill="#fff2cc" opacity="0.9" />
      <rect x="548" y="182" width="58" height="68" rx="10" fill="#ffd8da" opacity="0.9" />
      <path d="M22 0H104L48 360H0V0Z" fill="#15151f" opacity="0.86" />
      <defs>
        <linearGradient id="stageGlow" x1="320" y1="0" x2="320" y2="180" gradientUnits="userSpaceOnUse">
          <stop stop-color="#143cff" />
          <stop offset="1" stop-color="#10184f" stop-opacity="0" />
        </linearGradient>
      </defs>
    </svg>
  `);
}

function createVerticalVideoCoverDataUrl() {
  return createSvgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="360" height="640" viewBox="0 0 360 640" fill="none">
      <rect width="360" height="640" fill="#d8eaca" />
      <rect width="360" height="230" fill="#ecf5dc" />
      <path d="M0 132C76 122 144 142 216 128C280 116 322 110 360 124V640H0V132Z" fill="#9fc7b0" opacity="0.55" />
      <path d="M0 248C58 236 112 260 176 248C244 236 292 214 360 230V640H0V248Z" fill="#7fb5a9" opacity="0.45" />
      <path d="M0 398C78 368 138 414 204 390C264 368 316 356 360 374V640H0V398Z" fill="#4b8f88" opacity="0.35" />
      <path d="M26 620C66 474 110 386 174 258" stroke="#dff0dc" stroke-width="6" stroke-linecap="round" opacity="0.45" />
      <path d="M128 640C164 520 206 394 264 248" stroke="#eaf6e4" stroke-width="5" stroke-linecap="round" opacity="0.42" />
      <ellipse cx="77" cy="242" rx="18" ry="8" fill="#e7ef9d" opacity="0.82" />
      <ellipse cx="154" cy="298" rx="16" ry="7" fill="#e8f2aa" opacity="0.86" />
      <ellipse cx="242" cy="330" rx="18" ry="8" fill="#edf7bc" opacity="0.82" />
      <ellipse cx="284" cy="446" rx="14" ry="6" fill="#edf7bc" opacity="0.76" />
      <ellipse cx="116" cy="452" rx="12" ry="6" fill="#e7ef9d" opacity="0.78" />
      <rect y="0" width="360" height="640" fill="url(#waterLight)" opacity="0.52" />
      <defs>
        <linearGradient id="waterLight" x1="40" y1="0" x2="320" y2="640" gradientUnits="userSpaceOnUse">
          <stop stop-color="#ffffff" stop-opacity="0.55" />
          <stop offset="0.42" stop-color="#ffffff" stop-opacity="0.08" />
          <stop offset="1" stop-color="#1a6f70" stop-opacity="0.28" />
        </linearGradient>
      </defs>
    </svg>
  `);
}

function createSvgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.trim())}`;
}

export const seedCustomerProfiles: Record<string, CustomerProfile> = {
  ...starCloudCustomerProfiles,
  "cust-001": {
    id: "cust-001",
    name: "丹阳草莓，得利市大樱桃",
    avatarUrl: customerAvatarUrl,
    persona: "轻食控碳客户",
    city: "南京",
    phone: "132 9671 2905",
    stage: "已成交 28 天",
    intentScore: 92,
    tags: ["饮食管理", "高意向", "需回访"],
    metrics: [
      {
        label: "最近打卡",
        value: "连续 7 天",
      },
      {
        label: "最近体重",
        value: "56.8kg",
      },
      {
        label: "复购倾向",
        value: "高",
      },
    ],
    tasks: [
      {
        id: "task-001",
        title: "今晚 21:00 前回收晚餐照片",
        status: "due",
      },
      {
        id: "task-002",
        title: "明天安排一次复购话术触达",
        status: "open",
      },
      {
        id: "task-003",
        title: "已同步禁忌食材清单",
        status: "done",
      },
    ],
    notes: [
      "对饮食限制接受度高，但希望得到更细的替代建议。",
      "适合推高蛋白套餐与一周食谱模板。",
      "下次回访时优先确认午餐执行情况。",
    ],
  },
  "cust-002": {
    id: "cust-002",
    name: "睿白鸽",
    avatarUrl: customerAvatarRuiUrl,
    persona: "早餐纠结型客户",
    city: "杭州",
    phone: "180 0000 0002",
    stage: "试用期第 3 天",
    intentScore: 74,
    tags: ["早餐管理", "新客"],
    metrics: [
      {
        label: "最近打卡",
        value: "连续 2 天",
      },
      {
        label: "睡眠",
        value: "6.5h",
      },
    ],
    tasks: [
      {
        id: "task-004",
        title: "发送早餐替换模板",
        status: "open",
      },
    ],
    notes: ["优先给具体食材清单，少给宏观原则。"],
  },
  "cust-003": {
    id: "cust-003",
    name: "+1.",
    avatarUrl: customerAvatarPlusUrl,
    persona: "平台期客户",
    city: "苏州",
    phone: "180 0000 0003",
    stage: "执行第 21 天",
    intentScore: 69,
    tags: ["平台期", "待跟进"],
    metrics: [
      {
        label: "最近体重",
        value: "63.5kg",
      },
    ],
    tasks: [
      {
        id: "task-005",
        title: "安排一次有氧调整建议",
        status: "due",
      },
    ],
    notes: ["沟通节奏稳定，适合发小目标型任务。"],
  },
  "cust-004": {
    id: "cust-004",
    name: "营养群-4月减脂冲刺",
    avatarUrl: customerAvatarGroupUrl,
    persona: "群聊会话",
    city: "线上",
    phone: "--",
    stage: "群运营",
    intentScore: 60,
    tags: ["群聊", "公告"],
    metrics: [
      {
        label: "群成员",
        value: "48",
      },
    ],
    tasks: [
      {
        id: "task-006",
        title: "整理群公告中的食谱链接",
        status: "open",
      },
    ],
    notes: ["群聊右侧信息区域用于放运营动作与群标签。"],
  },
  "cust-005": {
    id: "cust-005",
    name: "小宇._",
    avatarUrl: customerAvatarXiaoyuUrl,
    persona: "初期控碳客户",
    city: "上海",
    phone: "180 0000 0005",
    stage: "执行第 1 天",
    intentScore: 65,
    tags: ["新客", "需鼓励"],
    metrics: [
      {
        label: "最近打卡",
        value: "首日",
      },
    ],
    tasks: [
      {
        id: "task-007",
        title: "明日提醒上传早餐图",
        status: "open",
      },
    ],
    notes: ["反馈积极，可以逐步推每日模板。"],
  },
  "cust-006": {
    id: "cust-006",
    name: "睡觉",
    avatarUrl: customerAvatarSleepUrl,
    persona: "低活跃客户",
    city: "宁波",
    phone: "180 0000 0006",
    stage: "待唤醒",
    intentScore: 41,
    tags: ["沉默客户"],
    metrics: [
      {
        label: "最近会话",
        value: "6 天前",
      },
    ],
    tasks: [
      {
        id: "task-008",
        title: "安排唤醒脚本",
        status: "open",
      },
    ],
    notes: ["优先发短句提醒，不适合长话术。"],
  },
};

function createStarCloudConversation({
  index,
  mode,
  name,
}: {
  index: number;
  mode: Conversation["mode"];
  name: string;
}): SeedConversation {
  const isGroup = mode === "group";
  const displayIndex = String(index + 1).padStart(2, "0");
  const day = String(10 - Math.floor(index / 4)).padStart(2, "0");
  const hour = String(17 - (index % 6)).padStart(2, "0");
  const minute = String((index * 7) % 60).padStart(2, "0");

  return {
    accountId: "drc",
    customerAvatarUrl: starCloudAvatarUrls[index % starCloudAvatarUrls.length],
    customerId: `cust-starcloud-${isGroup ? "group" : "single"}-${displayIndex}`,
    customerName: name,
    id: `conv-starcloud-${isGroup ? "group" : "single"}-${displayIndex}`,
    mode,
    preview: isGroup
      ? "包含：星云-星光、星云小助手、星云-云翎、运营客服"
      : "客户成功部 / 运营客服",
    priority: index % 3 === 0 ? "high" : index % 3 === 1 ? "medium" : "low",
    quietFor: `${index + 1}天没聊了`,
    unread: index % 4,
    updatedAt: `2026-04-${day} ${hour}:${minute}:00`,
  };
}

function createStarCloudCustomerProfile(
  conversation: SeedConversation,
  index: number,
): CustomerProfile {
  const isGroup = conversation.mode === "group";

  return {
    avatarUrl: conversation.customerAvatarUrl,
    city: isGroup ? "线上" : ["杭州", "上海", "深圳", "广州"][index % 4],
    id: conversation.customerId,
    intentScore: isGroup ? 58 + (index % 4) * 6 : 64 + (index % 5) * 5,
    metrics: isGroup
      ? [
          {
            label: "群成员",
            value: `${8 + index * 3}`,
          },
          {
            label: "今日消息",
            value: `${12 + index}`,
          },
        ]
      : [
          {
            label: "最近会话",
            value: `${index + 1} 天前`,
          },
          {
            label: "跟进阶段",
            value: index % 2 === 0 ? "意向确认" : "方案沟通",
          },
        ],
    name: conversation.customerName,
    notes: isGroup
      ? ["用于验证群聊搜索结果展开状态。", "群运营动作暂以本地 mock 数据承载。"]
      : ["用于验证联系人搜索结果展开状态。", "客户资料暂以本地 mock 数据承载。"],
    persona: isGroup ? "星云群聊会话" : "星云客户样本",
    phone: isGroup ? "--" : `180 7700 ${String(index + 1).padStart(4, "0")}`,
    stage: isGroup ? "群运营" : index % 2 === 0 ? "新客跟进" : "复购培育",
    tags: isGroup ? ["群聊", "星云", "搜索样本"] : ["星云", "搜索样本"],
    tasks: [
      {
        id: `task-starcloud-${conversation.customerId}`,
        status: index % 3 === 0 ? "due" : "open",
        title: isGroup ? "检查群内待回复问题" : "补充客户跟进记录",
      },
    ],
  };
}
