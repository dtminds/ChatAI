import type { WorkflowNodeUiBinding } from "../ui-types";
import { CouponConfig } from "./panel";

export const couponNodeUi: WorkflowNodeUiBinding<"coupon"> = {
  body: {
    getFields: (data) => [
      {
        id: "coupon-name",
        label: "优惠券",
        value: data.coupon ? { kind: "text", text: data.coupon.couponName } : { kind: "empty" },
      },
      {
        id: "coupon-content",
        label: "优惠内容",
        value: data.coupon
          ? { kind: "text", text: `${data.coupon.couponContent || "—"} · ${data.number} 张` }
          : { kind: "empty" },
      },
    ],
    kind: "fields",
  },
  settings: { component: CouponConfig, kind: "custom" },
};
