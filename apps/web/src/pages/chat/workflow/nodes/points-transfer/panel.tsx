import { useMemo, useState } from "react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { WorkflowSettingsSection } from "../../panels/settings-section";
import type { NodeSettingsProps } from "../../panels/types";
import { WorkflowVariablePicker } from "../../workflow-variable-picker";
import {
  getAvailableVariablesForNode,
  getWorkflowVariableDisplayLabel,
  resolveWorkflowVariable,
} from "../../workflow-variables";
import {
  getPointsTransferNodePatch,
  isPointsTransferOrderNumberVariable,
  normalizePointsTransferSelector,
} from "./config";

export function PointsTransferConfig({
  edges,
  node,
  nodes,
  onNodeChange,
}: NodeSettingsProps<"points-transfer">) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const selector = normalizePointsTransferSelector(node.data.orderNumberSelector);
  const availableVariables = useMemo(
    () => getAvailableVariablesForNode(node.id, nodes, edges)
      .filter((variable) => isPointsTransferOrderNumberVariable(variable.valueType)),
    [edges, node.id, nodes],
  );
  const selectedVariable = selector
    ? resolveWorkflowVariable(availableVariables, selector)
    : undefined;
  const hasInvalidInput = Boolean(selector && !selectedVariable);

  return (
    <WorkflowSettingsSection title="节点输入">
      <WorkflowVariablePicker
        onOpenChange={setPickerOpen}
        onSelect={(variable) => {
          onNodeChange(getPointsTransferNodePatch(variable.selector));
          setPickerOpen(false);
        }}
        open={pickerOpen}
        variables={availableVariables}
      >
        <Button
          aria-label="订单号"
          className="h-10 w-full justify-between rounded-[8px] px-3 font-normal"
          type="button"
          variant="outline"
        >
          <span className={selectedVariable ? "truncate" : "truncate text-muted-foreground"}>
            {selectedVariable
              ? getWorkflowVariableDisplayLabel(selectedVariable)
              : hasInvalidInput ? "原节点输出不可用" : "请选择订单号"}
          </span>
          <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.8} />
        </Button>
      </WorkflowVariablePicker>
    </WorkflowSettingsSection>
  );
}
