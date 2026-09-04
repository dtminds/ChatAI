import type { WorkflowNodeUiBinding } from "../ui-types";
import { createWorkflowVariableReferenceSummarySegments } from "../../workflow-node-summary";
import { resolveWorkflowVariable } from "../../workflow-variables";
import { normalizeOrderBindSelector } from "./config";
import { OrderBindConfig } from "./panel";

export const orderBindNodeUi: WorkflowNodeUiBinding<"order-bind"> = {
  body: {
    getFields: (data) => {
      const selector = normalizeOrderBindSelector(data.orderNumberSelector);
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
  settings: { component: OrderBindConfig, kind: "custom" },
};
