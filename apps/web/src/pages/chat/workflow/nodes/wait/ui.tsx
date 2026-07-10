import { StandardNodeBody } from "../node-bodies";
import type { WorkflowNodeUiBinding } from "../ui-types";

const waitHelp = () => (
  <div className="rounded-[10px] border bg-card p-3 text-xs leading-5 text-muted-foreground">
    客户进入等待后，将在设定时间结束时继续执行下一步
  </div>
);

export const waitNodeUi: WorkflowNodeUiBinding<"wait"> = {
  body: StandardNodeBody,
  settings: {
    after: waitHelp,
    kind: "schema",
    nodeKind: "wait",
  },
};
