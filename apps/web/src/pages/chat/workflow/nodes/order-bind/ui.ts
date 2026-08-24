import type { WorkflowNodeUiBinding } from "../ui-types";
import { normalizeOrderBindSelector } from "./config";
import { OrderBindConfig } from "./panel";

export const orderBindNodeUi: WorkflowNodeUiBinding<"order-bind"> = {
  body: {
    getFields: (data) => [{
      id: "order-number",
      label: "订单号",
      value: normalizeOrderBindSelector(data.orderNumberSelector)
        ? { kind: "text", text: "已选择订单号" }
        : { kind: "empty" },
    }],
    kind: "fields",
  },
  settings: { component: OrderBindConfig, kind: "custom" },
};
