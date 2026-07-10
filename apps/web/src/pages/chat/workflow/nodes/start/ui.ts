import { StartConfig } from "./panel";
import type { WorkflowNodeUiBinding } from "../ui-types";

export const startNodeUi: WorkflowNodeUiBinding<"start"> = {
  body: {
    getFields: (data) => [
      {
        id: "hosting-accounts",
        label: "托管账号",
        value: data.hostingAccountSummary
          ? { kind: "text", text: data.hostingAccountSummary }
          : { kind: "empty" },
      },
      {
        id: "audience",
        label: "目标人群",
        value: data.audience
          ? { kind: "text", text: data.audience }
          : { kind: "empty" },
      },
      {
        id: "entry-limit",
        label: "限制次数",
        value: data.entryLimitSummary
          ? { kind: "text", text: data.entryLimitSummary }
          : { kind: "empty" },
      },
      {
        id: "send-window",
        label: "发送时段",
        value: data.sendWindow
          ? { kind: "text", text: data.sendWindow }
          : { kind: "empty" },
      },
    ],
    kind: "fields",
  },
  settings: {
    component: StartConfig,
    kind: "custom",
  },
};
