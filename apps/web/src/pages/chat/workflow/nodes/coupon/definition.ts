import { Coupon01Icon } from "@hugeicons/core-free-icons";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";

export const couponNodeDefinition = createStandardNodeDefinition({
  accentClassName: "bg-rose-500 text-white ring-rose-500/20",
  accentRgb: "244 63 94",
  description: "向客户发放优惠券",
  icon: Coupon01Icon,
  kind: "coupon",
  label: "发券",
  metric: "待配置优惠券",
  paletteGroup: "benefit",
  sort: 130,
  summary: "配置需要发放的优惠券",
});
