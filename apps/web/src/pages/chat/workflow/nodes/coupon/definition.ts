import { CouponPercentIcon } from "@hugeicons/core-free-icons";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";
import type { WorkflowNodeDefinition } from "../definition-types";
import { WORKFLOW_COUPON_MAX_NUMBER } from "@chatai/contracts";

const base = createStandardNodeDefinition({
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

export const couponNodeDefinition: WorkflowNodeDefinition<"coupon"> = {
  ...base,
  createDefaultData: () => ({ ...base.createDefaultData(), number: 1, status: "warning" }),
  sanitizeData: data => ({ ...data, number: Number.isInteger(data.number)
    ? Math.min(WORKFLOW_COUPON_MAX_NUMBER, Math.max(1, data.number)) : 1 }),
  validate: node => node.data.coupon && Number.isInteger(node.data.number)
    && node.data.number >= 1 && node.data.number <= WORKFLOW_COUPON_MAX_NUMBER ? [] : [{
      code: "coupon-config-required", message: "请选择优惠券并设置1–5张发放数量", severity: "warning", source: "config",
    }],
};
