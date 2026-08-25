import { useMemo } from "react";
import { WorkflowSettingsSection } from "../../panels/settings-section";
import type { NodeSettingsProps } from "../../panels/types";
import { WorkflowVariableSelect } from "../../workflow-variable-select";
import {
  getAvailableVariablesForNode,
} from "../../workflow-variables";
import {
  getOrderConversionNodePatch,
  isOrderConversionOrderNumberVariable,
  normalizeOrderConversionSelector,
} from "./config";

export function OrderConversionConfig({
  edges,
  node,
  nodes,
  onNodeChange,
}: NodeSettingsProps<"order-conversion">) {
  const selector = normalizeOrderConversionSelector(node.data.orderNumberSelector);
  const availableVariables = useMemo(
    () => getAvailableVariablesForNode(node.id, nodes, edges)
      .filter((variable) => isOrderConversionOrderNumberVariable(variable.valueType)),
    [edges, node.id, nodes],
  );
  return (
    <WorkflowSettingsSection title="节点输入">
      <WorkflowVariableSelect
        ariaLabel="订单号"
        buttonClassName="h-10 text-sm"
        invalidLabel="原节点输出不可用"
        onSelect={(variable) => {
          onNodeChange(getOrderConversionNodePatch(variable.selector));
        }}
        placeholder="请选择订单号"
        value={selector}
        variables={availableVariables}
      />
    </WorkflowSettingsSection>
  );
}
