import { Progress } from "@/components/ui/progress";
import type { NodeSettingsProps } from "../../panels/types";
import { StandardNodeBody } from "../node-bodies";
import type { WorkflowNodeUiBinding } from "../ui-types";

const goalProgress = ({ node }: NodeSettingsProps) => {
  const conversion = node.data.conversion ?? 18.4;

  return (
    <Progress
      aria-label="目标达成进度"
      className="h-2"
      value={conversion * 4}
    />
  );
};

export const goalNodeUi: WorkflowNodeUiBinding = {
  body: StandardNodeBody,
  settings: {
    after: goalProgress,
    kind: "schema",
    nodeKind: "goal",
  },
};
