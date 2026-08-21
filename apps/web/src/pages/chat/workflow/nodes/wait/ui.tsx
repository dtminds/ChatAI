import type { WorkflowNodeUiBinding } from "../ui-types";
import { WaitConfig } from "./panel";

const waitUnitLabels = {
  day: "天",
  hour: "小时",
  minute: "分钟",
} as const;

export const waitNodeUi: WorkflowNodeUiBinding<"wait"> = {
  body: {
    getFields: (data) => [
      {
        id: "duration",
        label: "等待时间",
        value: {
          kind: "text",
          text: data.mode === "fixed-time"
            ? `${data.dayOffset} 天后的 ${data.time}，执行后续节点`
            : `${data.duration} ${waitUnitLabels[data.unit]}后，执行后续节点`,
        },
      },
    ],
    kind: "fields",
  },
  settings: { component: WaitConfig, kind: "custom" },
};
