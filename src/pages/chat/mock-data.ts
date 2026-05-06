import type { Account, Conversation, CustomerProfile, Message } from "@/pages/chat/chat-types";

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

export const seedConversations: Record<string, Conversation[]> = {
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
      status: "claimed",
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
      status: "follow-up",
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
      status: "public",
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
      status: "claimed",
      priority: "low",
    },
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
      status: "claimed",
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
      status: "follow-up",
      priority: "low",
    },
  ],
};

export const seedMessages: Record<string, Message[]> = {
  "conv-001": [
    {
      id: "msg-001",
      conversationId: "conv-001",
      role: "system",
      author: "系统",
      content: {
        type: "system",
        text: "会话已由 德瑞可-小可 领取，后续消息将同步至当前工作台。",
      },
      sentAt: "2026-04-11 15:32:00",
      status: "read",
    },
    {
      id: "msg-002",
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
      status: "read",
    },
    {
      id: "msg-003",
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
      id: "msg-004",
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
      id: "msg-005",
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
      status: "read",
    },
    {
      id: "msg-006",
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
      status: "read",
    },
    {
      id: "msg-007",
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
      status: "read",
    },
    {
      id: "msg-008",
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
      status: "read",
    },
    {
      id: "msg-009",
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
      status: "read",
    },
    {
      id: "msg-010",
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
      status: "read",
    },
  ],
  "conv-002": [
    {
      id: "msg-011",
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
      status: "read",
    },
  ],
  "conv-003": [
    {
      id: "msg-012",
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
      status: "read",
    },
  ],
  "conv-004": [
    {
      id: "msg-013",
      conversationId: "conv-004",
      role: "system",
      author: "系统",
      content: {
        type: "system",
        text: "群聊占位数据，后续可在轮询模型稳定后单独扩展。",
      },
      sentAt: "2026-04-11 09:44:38",
      status: "read",
    },
  ],
  "conv-005": [
    {
      id: "msg-014",
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
      status: "read",
    },
  ],
  "conv-006": [
    {
      id: "msg-015",
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

function createSvgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.trim())}`;
}

export const seedCustomerProfiles: Record<string, CustomerProfile> = {
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
