import type { Account, Conversation, CustomerProfile, Message } from "@/pages/chat/chat-types";

export const seedAccounts: Account[] = [
  {
    id: "drc",
    name: "德瑞可",
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
      preview: "我想知道，吃这个产品，饮食需要控制嘛",
      updatedAt: "2026-04-13 10:24:07",
      quietFor: "2天没聊了",
      unread: 2,
      mode: "single",
      status: "claimed",
      priority: "high",
    },
    {
      id: "conv-002",
      accountId: "drc",
      customerId: "cust-002",
      customerName: "睿白鸽",
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
      body: "会话已由 德瑞可-小可 领取，后续消息将同步至当前工作台。",
      sentAt: "2026-04-13 10:03:12",
      status: "read",
    },
    {
      id: "msg-002",
      conversationId: "conv-001",
      role: "customer",
      author: "丹阳草莓，得利市大樱桃",
      body: "我想知道。吃这个产品。饮食需要控制嘛",
      sentAt: "2026-04-13 10:08:54",
      status: "read",
    },
    {
      id: "msg-003",
      conversationId: "conv-001",
      role: "agent",
      author: "德瑞可-小可",
      body:
        "我们生酮饮食是不吃碳水主食的哈，优先吃足量绿叶蔬菜和优质蛋白（如鸡腿、鱼肉），避开米饭面条这类主食。如果菜里油水少，可以自带一小袋坚果或牛油果补充优质脂肪。",
      sentAt: "2026-04-13 10:24:07",
      status: "sent",
    },
    {
      id: "msg-004",
      conversationId: "conv-001",
      role: "customer",
      author: "丹阳草莓，得利市大樱桃",
      body: "明白了，那晚餐我把米饭换成鸡胸肉和生菜。",
      sentAt: "2026-04-13 10:32:41",
      status: "read",
    },
  ],
  "conv-002": [
    {
      id: "msg-005",
      conversationId: "conv-002",
      role: "customer",
      author: "睿白鸽",
      body: "早餐能不能换成酸奶和坚果？",
      sentAt: "2026-04-13 15:04:16",
      status: "read",
    },
  ],
  "conv-003": [
    {
      id: "msg-006",
      conversationId: "conv-003",
      role: "customer",
      author: "+1.",
      body: "体重平台期了，今天想加一次有氧。",
      sentAt: "2026-04-13 05:09:59",
      status: "read",
    },
  ],
  "conv-004": [
    {
      id: "msg-007",
      conversationId: "conv-004",
      role: "system",
      author: "系统",
      body: "群聊占位数据，后续可在轮询模型稳定后单独扩展。",
      sentAt: "2026-04-11 09:44:38",
      status: "read",
    },
  ],
  "conv-005": [
    {
      id: "msg-008",
      conversationId: "conv-005",
      role: "customer",
      author: "小宇._",
      body: "好，那我今天先从晚餐控碳开始。",
      sentAt: "2026-04-14 10:39:38",
      status: "read",
    },
  ],
  "conv-006": [
    {
      id: "msg-009",
      conversationId: "conv-006",
      role: "agent",
      author: "念都堂-尚青",
      body: "多喝水，明天继续打卡。",
      sentAt: "2026-04-09 16:04:45",
      status: "sent",
    },
  ],
};

export const seedCustomerProfiles: Record<string, CustomerProfile> = {
  "cust-001": {
    id: "cust-001",
    name: "丹阳草莓，得利市大樱桃",
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
