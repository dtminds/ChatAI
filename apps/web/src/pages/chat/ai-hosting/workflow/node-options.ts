import {
  AiChat02Icon,
  Coupon01Icon,
  Message01Icon,
  TagsIcon,
  UserSwitchIcon,
} from "@hugeicons/core-free-icons";

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

export const defaultAgentOption = agentOptions[0];
export const defaultActionOption = actionOptions[1];
export const aiNodeIcon = AiChat02Icon;
