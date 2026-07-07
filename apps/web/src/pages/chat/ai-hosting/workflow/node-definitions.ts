import {
  AiChat02Icon,
  Clock01Icon,
  Coupon01Icon,
  GitBranchIcon,
  Message01Icon,
  Rocket01Icon,
  TagsIcon,
  Target01Icon,
  UserSwitchIcon,
} from "@hugeicons/core-free-icons";
import type {
  InsertableMarketingNodeKind,
  MarketingNodeKind,
  MarketingWorkflowNode,
  WorkflowVariables,
} from "./types";

export const nodeVisuals: Record<
  MarketingNodeKind,
  {
    accentClassName: string;
    icon: typeof Rocket01Icon;
    label: string;
  }
> = {
  action: {
    accentClassName: "bg-sky-500/12 text-sky-700 ring-sky-500/20",
    icon: Message01Icon,
    label: "动作",
  },
  ai: {
    accentClassName: "bg-violet-500/12 text-violet-700 ring-violet-500/20",
    icon: AiChat02Icon,
    label: "AI",
  },
  branch: {
    accentClassName: "bg-amber-500/12 text-amber-700 ring-amber-500/20",
    icon: GitBranchIcon,
    label: "条件",
  },
  goal: {
    accentClassName: "bg-emerald-500/12 text-emerald-700 ring-emerald-500/20",
    icon: Target01Icon,
    label: "目标",
  },
  trigger: {
    accentClassName: "bg-rose-500/12 text-rose-700 ring-rose-500/20",
    icon: Rocket01Icon,
    label: "触发",
  },
  wait: {
    accentClassName: "bg-indigo-500/12 text-indigo-700 ring-indigo-500/20",
    icon: Clock01Icon,
    label: "等待",
  },
};

export const agentOptions = [
  {
    description: "商品咨询、活动解释、搭配推荐",
    knowledge: "护肤知识库、活动政策",
    name: "护肤小助理",
  },
  {
    description: "订单异常、退换货、投诉安抚",
    knowledge: "售后知识库、服务规则",
    name: "售后小助理",
  },
  {
    description: "高意向客户识别、优惠引导",
    knowledge: "直播活动、会员权益",
    name: "转化小助理",
  },
] as const;

export const paletteItems = [
  {
    description: "按天、小时或固定窗口延迟触达",
    icon: Clock01Icon,
    id: "wait",
    label: "等待",
  },
  {
    description: "按标签、行为、会话意图分支",
    icon: GitBranchIcon,
    id: "branch",
    label: "条件分支",
  },
  {
    description: "发送私域消息、优惠券或打标签",
    icon: Coupon01Icon,
    id: "action",
    label: "营销动作",
  },
  {
    description: "启用指定 Agent，接管后续会话",
    icon: AiChat02Icon,
    id: "ai",
    label: "AI 接待",
  },
] as const satisfies Array<{
  description: string;
  icon: typeof Rocket01Icon;
  id: InsertableMarketingNodeKind;
  label: string;
}>;

export const actionOptions = [
  {
    icon: Message01Icon,
    label: "发送消息",
    summary: "发送欢迎语和活动卡片",
    type: "message",
  },
  {
    icon: Coupon01Icon,
    label: "发优惠券",
    summary: "新人券 · 满 199 减 30",
    type: "coupon",
  },
  {
    icon: TagsIcon,
    label: "打标签",
    summary: "打上高意向会员标签",
    type: "tag",
  },
  {
    icon: UserSwitchIcon,
    label: "分配客服",
    summary: "转给会员运营组",
    type: "handoff",
  },
] as const;

export function getNodeVariables(node: MarketingWorkflowNode): WorkflowVariables {
  return {
    inputs: [
      {
        name: "customer.profile",
        type: "object",
        value: node.data.audience ?? "上游客户画像",
      },
      {
        name: "journey.currentNode",
        type: "string",
        value: node.data.title,
      },
    ],
    outputs: [
      {
        name: `${node.data.kind}.result`,
        type: "object",
        value: node.data.metric,
      },
      {
        name: "journey.next",
        type: "string",
        value: node.data.kind === "goal" ? "退出旅程" : "进入下一节点",
      },
    ],
  };
}

