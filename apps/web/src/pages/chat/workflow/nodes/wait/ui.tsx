import type { WorkflowNodeUiBinding } from "../ui-types";

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
        value: data.delayDays === undefined
          ? { kind: "empty" }
          : {
              kind: "text",
              text: data.delayDays === 0
                ? "立即执行后续节点"
                : `${data.delayDays} 天后，执行后续节点`,
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
