import type { WorkflowNodeUiBinding } from "../ui-types";
import { normalizePointsTransferSelector } from "./config";
import { PointsTransferConfig } from "./panel";

export const pointsTransferNodeUi: WorkflowNodeUiBinding<"points-transfer"> = {
  body: {
    getFields: (data) => [
      {
        id: "input",
        label: "输入",
        value: normalizePointsTransferSelector(data.orderNumberSelector)
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
  settings: { component: PointsTransferConfig, kind: "custom" },
};
