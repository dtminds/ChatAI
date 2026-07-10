import { Coupon01Icon } from "@hugeicons/core-free-icons";
import { createActionNodeDefinition } from "../action-definition-factory";

export const couponNodeDefinition = createActionNodeDefinition({
  accentClassName: "bg-rose-600 text-white ring-rose-600/20",
  accentRgb: "225 29 72",
  description: "向客户发放优惠券",
  icon: Coupon01Icon,
  kind: "coupon",
  label: "发放优惠券",
  metric: "待配置优惠券",
  sort: 50,
  summary: "配置需要发放的优惠券",
});
