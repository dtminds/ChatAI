export type InsightRange = "today" | "7d" | "30d";
export type InsightMode = "all" | "single" | "group";
export type InsightRiskLevel = "all" | "high" | "medium" | "low";
export type InsightIntent =
  | "all"
  | "after_sale.refund"
  | "after_sale.return"
  | "logistics.delay"
  | "pre_sale.purchase_intent"
  | "promotion.coupon"
  | "product.quality";

export type InsightFilters = {
  intent: InsightIntent;
  mode: InsightMode;
  range: InsightRange;
  riskLevel: InsightRiskLevel;
  seatId: string;
};

export type InsightEvidence = {
  id: string;
  sender: string;
  senderType: "customer" | "agent";
  time: string;
  text: string;
};

export type PriorityQueueItem = {
  id: string;
  action: string;
  conversationId: string;
  conversationName: string;
  customerName: string;
  evidence: InsightEvidence[];
  intent: Exclude<InsightIntent, "all">;
  intentLabel: string;
  lastCustomerMessageAt: string;
  mode: Exclude<InsightMode, "all">;
  productName: string;
  riskLevel: Exclude<InsightRiskLevel, "all">;
  seatId: string;
  seatName: string;
  summary: string;
};

export type ProductInsight = {
  id: string;
  afterSaleCount: number;
  evidence: InsightEvidence[];
  faqOpportunity: string;
  mentionCount: number;
  name: string;
  negativeCount: number;
  purchaseIntentCount: number;
  topIssue: string;
};

export type AfterSaleInsight = {
  id: string;
  count: number;
  evidence: InsightEvidence[];
  label: string;
  riskCount: number;
  trend: "up" | "flat" | "down";
};

export type IntentInsight = {
  count: number;
  label: string;
  type: Exclude<InsightIntent, "all">;
};

export type InsightOverview = {
  afterSaleConversations: number;
  customerMessages: number;
  highIntentCustomers: number;
  highRiskConversations: number;
  negativeRate: number;
  pendingActions: number;
  totalConversations: number;
};

export type InsightDemoData = {
  afterSales: AfterSaleInsight[];
  generatedAt: string;
  overview: InsightOverview;
  priorityQueue: PriorityQueueItem[];
  products: ProductInsight[];
};

export type FilteredInsightData = InsightDemoData & {
  intentBreakdown: IntentInsight[];
};

const evidence = {
  refundCoat: [
    {
      id: "msg-1001",
      sender: "林女士",
      senderType: "customer",
      time: "10:18",
      text: "这件白色羽绒服袖口线头很多，我不想换了，麻烦直接退款",
    },
    {
      id: "msg-1002",
      sender: "客服小周",
      senderType: "agent",
      time: "10:21",
      text: "您拍一下袖口问题，我们帮您加急登记售后",
    },
  ],
  vipGroup: [
    {
      id: "msg-2011",
      sender: "安安",
      senderType: "customer",
      time: "11:04",
      text: "群里好几个人都说赠品没收到，直播间说下单就送的，为什么我的没有",
    },
    {
      id: "msg-2012",
      sender: "Mia",
      senderType: "customer",
      time: "11:07",
      text: "我也少了洗护小样，再不处理我去订单里差评",
    },
  ],
  logistics: [
    {
      id: "msg-3010",
      sender: "陈先生",
      senderType: "customer",
      time: "09:42",
      text: "订单三天还没揽收，明天生日送人用，今天必须给我一个准信",
    },
  ],
  purchase: [
    {
      id: "msg-4102",
      sender: "团购负责人-阿敏",
      senderType: "customer",
      time: "14:32",
      text: "如果 30 套都按直播价，能不能再多送一套旅行装？可以的话今天就定",
    },
  ],
  coupon: [
    {
      id: "msg-5102",
      sender: "周周",
      senderType: "customer",
      time: "15:16",
      text: "优惠券领了不能用，页面显示门槛不满足，但我已经买到 399 了",
    },
  ],
} satisfies Record<string, InsightEvidence[]>;

export const insightDemoData: InsightDemoData = {
  generatedAt: "2026-06-01 15:30",
  overview: {
    afterSaleConversations: 6,
    customerMessages: 1284,
    highIntentCustomers: 18,
    highRiskConversations: 4,
    negativeRate: 12,
    pendingActions: 9,
    totalConversations: 312,
  },
  priorityQueue: [
    {
      id: "risk-1",
      action: "先安抚，再确认退款路径",
      conversationId: "c-1001",
      conversationName: "林女士",
      customerName: "林女士",
      evidence: evidence.refundCoat,
      intent: "after_sale.refund",
      intentLabel: "退款",
      lastCustomerMessageAt: "10:18",
      mode: "single",
      productName: "白色羽绒服",
      riskLevel: "high",
      seatId: "seat-1",
      seatName: "杭州 1 号客服",
      summary: "客户明确拒绝换货并要求退款，情绪偏负面，需避免升级为差评",
    },
    {
      id: "risk-2",
      action: "核对赠品规则并群内统一回复",
      conversationId: "g-2001",
      conversationName: "VIP 老客福利群",
      customerName: "VIP 老客福利群",
      evidence: evidence.vipGroup,
      intent: "product.quality",
      intentLabel: "少件/赠品争议",
      lastCustomerMessageAt: "11:07",
      mode: "group",
      productName: "洗护小样赠品",
      riskLevel: "high",
      seatId: "seat-2",
      seatName: "私域群客服",
      summary: "群内多人反馈赠品漏发，已有差评表达，适合主管介入统一口径",
    },
    {
      id: "risk-3",
      action: "催仓并给出最晚揽收时间",
      conversationId: "c-3001",
      conversationName: "陈先生",
      customerName: "陈先生",
      evidence: evidence.logistics,
      intent: "logistics.delay",
      intentLabel: "催发货",
      lastCustomerMessageAt: "09:42",
      mode: "single",
      productName: "生日礼盒套装",
      riskLevel: "medium",
      seatId: "seat-1",
      seatName: "杭州 1 号客服",
      summary: "客户有明确送礼时限，物流延迟可能导致退款或投诉",
    },
    {
      id: "risk-4",
      action: "给团购报价并确认赠品成本",
      conversationId: "g-4001",
      conversationName: "企业团购咨询群",
      customerName: "团购负责人-阿敏",
      evidence: evidence.purchase,
      intent: "pre_sale.purchase_intent",
      intentLabel: "批量采购",
      lastCustomerMessageAt: "14:32",
      mode: "group",
      productName: "旅行装套组",
      riskLevel: "low",
      seatId: "seat-3",
      seatName: "团购客服",
      summary: "客户表达当天可定，属于高意向线索，建议尽快报价",
    },
    {
      id: "risk-5",
      action: "核查优惠券门槛并补偿解释",
      conversationId: "c-5001",
      conversationName: "周周",
      customerName: "周周",
      evidence: evidence.coupon,
      intent: "promotion.coupon",
      intentLabel: "优惠券不可用",
      lastCustomerMessageAt: "15:16",
      mode: "single",
      productName: "满 399 活动",
      riskLevel: "medium",
      seatId: "seat-1",
      seatName: "杭州 1 号客服",
      summary: "客户到达活动金额但无法使用优惠券，可能是商品范围或叠加规则问题",
    },
    {
      id: "risk-6",
      action: "确认退货地址并提示寄回要求",
      conversationId: "c-6001",
      conversationName: "许女士",
      customerName: "许女士",
      evidence: [
        {
          id: "msg-6001",
          sender: "许女士",
          senderType: "customer",
          time: "13:08",
          text: "尺码偏小，想退货，吊牌还在，地址发我一下",
        },
      ],
      intent: "after_sale.return",
      intentLabel: "退货",
      lastCustomerMessageAt: "13:08",
      mode: "single",
      productName: "法式针织裙",
      riskLevel: "low",
      seatId: "seat-2",
      seatName: "私域群客服",
      summary: "客户退货条件清晰，快速给出流程可降低来回沟通",
    },
  ],
  products: [
    {
      id: "product-1",
      afterSaleCount: 7,
      evidence: evidence.refundCoat,
      faqOpportunity: "补充袖口做工和退换政策说明",
      mentionCount: 86,
      name: "白色羽绒服",
      negativeCount: 5,
      purchaseIntentCount: 14,
      topIssue: "做工/线头",
    },
    {
      id: "product-2",
      afterSaleCount: 4,
      evidence: evidence.vipGroup,
      faqOpportunity: "直播赠品发放规则需要统一话术",
      mentionCount: 64,
      name: "洗护小样赠品",
      negativeCount: 9,
      purchaseIntentCount: 2,
      topIssue: "漏发/少件",
    },
    {
      id: "product-3",
      afterSaleCount: 2,
      evidence: evidence.purchase,
      faqOpportunity: "团购阶梯价和赠品规则可沉淀",
      mentionCount: 41,
      name: "旅行装套组",
      negativeCount: 1,
      purchaseIntentCount: 11,
      topIssue: "团购优惠",
    },
    {
      id: "product-4",
      afterSaleCount: 5,
      evidence: [
        {
          id: "msg-7001",
          sender: "小叶",
          senderType: "customer",
          time: "12:20",
          text: "针织裙 M 码腰围是不是偏小？我平时 27 腰怕穿不上",
        },
      ],
      faqOpportunity: "尺码表需要增加腰围和弹力说明",
      mentionCount: 37,
      name: "法式针织裙",
      negativeCount: 3,
      purchaseIntentCount: 8,
      topIssue: "尺码偏小",
    },
  ],
  afterSales: [
    {
      id: "after-sale-1",
      count: 3,
      evidence: evidence.refundCoat,
      label: "退款",
      riskCount: 2,
      trend: "up",
    },
    {
      id: "after-sale-2",
      count: 2,
      evidence: [
        {
          id: "msg-6020",
          sender: "许女士",
          senderType: "customer",
          time: "13:08",
          text: "尺码偏小，想退货，吊牌还在，地址发我一下",
        },
      ],
      label: "退货",
      riskCount: 0,
      trend: "flat",
    },
    {
      id: "after-sale-3",
      count: 5,
      evidence: evidence.vipGroup,
      label: "少件/漏发",
      riskCount: 2,
      trend: "up",
    },
    {
      id: "after-sale-4",
      count: 4,
      evidence: evidence.logistics,
      label: "物流延迟",
      riskCount: 1,
      trend: "up",
    },
  ],
};

export const defaultInsightFilters: InsightFilters = {
  intent: "all",
  mode: "all",
  range: "today",
  riskLevel: "all",
  seatId: "all",
};

export const intentLabels: Record<Exclude<InsightIntent, "all">, string> = {
  "after_sale.refund": "退款",
  "after_sale.return": "退货",
  "logistics.delay": "催发货",
  "pre_sale.purchase_intent": "购买意向",
  "promotion.coupon": "优惠券",
  "product.quality": "商品/赠品问题",
};

export function filterInsightData(
  data: InsightDemoData,
  filters: InsightFilters,
): FilteredInsightData {
  const priorityQueue = data.priorityQueue.filter((item) => {
    if (filters.mode !== "all" && item.mode !== filters.mode) return false;
    if (filters.riskLevel !== "all" && item.riskLevel !== filters.riskLevel) return false;
    if (filters.intent !== "all" && item.intent !== filters.intent) return false;
    if (filters.seatId !== "all" && item.seatId !== filters.seatId) return false;
    return true;
  });

  const intentBreakdown = buildIntentBreakdown(data, priorityQueue, filters);
  const intentTotal = getIntentTotal(data, filters.intent);
  const highRiskConversations = getHighRiskTotal(data, priorityQueue, filters);
  const afterSaleConversations =
    filters.intent.startsWith("after_sale.") && filters.intent !== "all"
      ? intentTotal
      : priorityQueue.filter((item) => item.intent.startsWith("after_sale.")).length;
  const highIntentCustomers = priorityQueue.filter(
    (item) => item.intent === "pre_sale.purchase_intent",
  ).length;

  return {
    ...data,
    afterSales: filterAfterSales(data.afterSales, filters),
    intentBreakdown,
    overview: {
      ...data.overview,
      afterSaleConversations,
      highIntentCustomers,
      highRiskConversations,
      pendingActions: priorityQueue.length,
      totalConversations: priorityQueue.length,
    },
    priorityQueue,
    products: filterProducts(data.products, priorityQueue),
  };
}

function filterAfterSales(afterSales: AfterSaleInsight[], filters: InsightFilters) {
  if (filters.intent === "after_sale.refund") {
    return afterSales.filter((item) => item.label === "退款");
  }
  if (filters.intent === "after_sale.return") {
    return afterSales.filter((item) => item.label === "退货");
  }
  return afterSales;
}

function filterProducts(products: ProductInsight[], queue: PriorityQueueItem[]) {
  if (queue.length === 0) return [];
  const productNames = new Set(queue.map((item) => item.productName));
  return products.filter((product) => productNames.has(product.name));
}

function buildIntentBreakdown(
  data: InsightDemoData,
  queue: PriorityQueueItem[],
  filters: InsightFilters,
): IntentInsight[] {
  if (filters.intent === "after_sale.refund" || filters.intent === "after_sale.return") {
    const count = getIntentTotal(data, filters.intent);
    return [{ count, label: intentLabels[filters.intent], type: filters.intent }];
  }

  const counts = new Map<Exclude<InsightIntent, "all">, number>();
  for (const item of data.afterSales) {
    if (item.label === "退款") counts.set("after_sale.refund", item.count);
    if (item.label === "退货") counts.set("after_sale.return", item.count);
  }
  for (const item of queue) {
    if (item.intent.startsWith("after_sale.")) continue;
    counts.set(item.intent, (counts.get(item.intent) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([type, count]) => ({ count, label: intentLabels[type], type }))
    .sort((a, b) => b.count - a.count);
}

function getIntentTotal(data: InsightDemoData, intent: InsightIntent) {
  if (intent === "after_sale.refund") {
    return data.afterSales.find((item) => item.label === "退款")?.count ?? 0;
  }
  if (intent === "after_sale.return") {
    return data.afterSales.find((item) => item.label === "退货")?.count ?? 0;
  }
  return data.priorityQueue.filter((item) => intent === "all" || item.intent === intent).length;
}

function getHighRiskTotal(
  data: InsightDemoData,
  queue: PriorityQueueItem[],
  filters: InsightFilters,
) {
  if (filters.intent === "after_sale.refund") {
    return data.afterSales.find((item) => item.label === "退款")?.riskCount ?? 0;
  }
  if (filters.intent === "after_sale.return") {
    return data.afterSales.find((item) => item.label === "退货")?.riskCount ?? 0;
  }
  return queue.filter((item) => item.riskLevel === "high").length;
}
