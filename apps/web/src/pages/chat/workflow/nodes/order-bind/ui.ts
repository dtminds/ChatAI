import type { WorkflowNodeUiBinding } from "../ui-types";
import { normalizeOrderBindSelector } from "./config";
import { OrderBindConfig } from "./panel";

export const orderBindNodeUi: WorkflowNodeUiBinding<"order-bind"> = {
  body: {
    getFields: (data) => [
      {
        id: "input",
        label: "输入",
        value: normalizeOrderBindSelector(data.orderNumberSelector)
          ? { kind: "text", text: "已选择订单号" }
          : { kind: "empty" },
      },
      {
        id: "output",
        label: "输出",
        value: { kind: "text", text: "操作结果" },
      },
    ],
    kind: "fields",
  },
  settings: { component: OrderBindConfig, kind: "custom" },
};
