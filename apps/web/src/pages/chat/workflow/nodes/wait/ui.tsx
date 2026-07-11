import type { WorkflowNodeUiBinding } from "../ui-types";

const waitUnitLabels = {
  day: "天",
  hour: "小时",
  minute: "分钟",
} as const;

const waitHelp = () => (
  <div className="rounded-[10px] border bg-card p-3 text-xs leading-5 text-muted-foreground">
    客户进入等待后，将在设定时间结束时继续执行下一步
  </div>
);

export const waitNodeUi: WorkflowNodeUiBinding<"wait"> = {
  body: {
    getFields: (data) => [
      {
        id: "duration",
        label: "等待时间",
        value: {
          kind: "text",
          text: `${data.duration} ${waitUnitLabels[data.unit]}后，执行后续节点`,
        },
      },
    ],
    kind: "fields",
  },
  settings: {
    after: waitHelp,
    kind: "schema",
    nodeKind: "wait",
  },
};
