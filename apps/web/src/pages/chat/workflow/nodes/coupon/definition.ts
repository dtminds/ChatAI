import { CouponPercentIcon } from "@hugeicons/core-free-icons";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";

export const couponNodeDefinition = createStandardNodeDefinition({
  accentClassName: "bg-rose-500 text-white",
  accentRgb: "244 63 94",
  description: "向客户发放优惠券",
  icon: CouponPercentIcon,
  kind: "coupon",
  label: "发券",
  metric: "待配置优惠券",
  paletteGroup: "operate",
  sort: 130,
});
