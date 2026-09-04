import type { WorkflowNodeUiBinding } from "../ui-types";
import { createWorkflowVariableReferenceSummarySegments } from "../../workflow-node-summary";
import { resolveWorkflowVariable } from "../../workflow-variables";
import { normalizeOrderConversionSelector } from "./config";
import { OrderConversionConfig } from "./panel";

export const orderConversionNodeUi: WorkflowNodeUiBinding<"order-conversion"> = {
  body: {
    getFields: (data) => {
      const selector = normalizeOrderConversionSelector(data.orderNumberSelector);
      const selectedVariable = selector
        ? resolveWorkflowVariable(data.availableVariables ?? [], selector)
        : undefined;

      return [{
        id: "input",
        label: "输入",
        value: selectedVariable
          ? {
              items: createWorkflowVariableReferenceSummarySegments(selectedVariable),
              kind: "segments" as const,
            }
          : {
              kind: "empty" as const,
              text: selector ? "原节点输出不可用" : undefined,
            },
      }];
    },
    kind: "fields",
  },
  settings: { component: OrderConversionConfig, kind: "custom" },
};
