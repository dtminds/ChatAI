import type { WorkflowNodeUiBinding } from "../ui-types";

export const couponNodeUi: WorkflowNodeUiBinding<"coupon"> = {
  body: {
    getFields: (data) => [
      {
        id: "coupon",
        label: "优惠券",
        value: data.metric.startsWith("待配置")
          ? { kind: "empty" }
          : { kind: "tag", text: data.metric, tone: "primary" },
      },
    ],
    kind: "fields",
  },
  settings: { kind: "schema", nodeKind: "coupon" },
};
