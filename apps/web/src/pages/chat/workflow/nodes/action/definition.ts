import { Message01Icon } from "@hugeicons/core-free-icons";
import type { WorkflowNodeData, WorkflowNode } from "../../types";
import {
  actionOptions,
  defaultActionOption,
} from "../../node-options";
import type { WorkflowNodeDefinition } from "../definition-types";
import {
  createCatalogIssue,
  createDefaultOutputVariables,
  createDefaultSourceHandles,
  createDefaultTargetHandles,
  createNodeData,
  hasText,
  pickDefinedWorkflowConfig,
  sourceNodeKinds,
  standardNodeLayout,
  targetNodeKinds,
} from "../definition-shared";

export const actionNodeDefinition: WorkflowNodeDefinition = {
  availableNextKinds: targetNodeKinds,
  availablePrevKinds: sourceNodeKinds,
  canDelete: true,
  canDuplicate: true,
  canInsertAfter: true,
  configSections: [
    {
      fields: [
        {
          columns: 2,
          getOptions: () =>
            actionOptions.map((option) => ({
              description: option.summary,
              icon: option.icon,
              label: option.label,
              value: option.type,
            })),
          getValidationValue: (data) => data.actionType,
          getValue: (data) => data.actionType ?? defaultActionOption.type,
          id: "workflow-action-type",
          kind: "option-cards",
          label: "动作类型",
          toPatch: (value, _data, option) => ({
            actionType: value as WorkflowNodeData["actionType"],
            label: option.label,
            metric: option.description ?? "",
            status: "ready",
            summary: option.description ?? "",
            title: option.label,
          }),
          validation: {
            required: {
              code: "action-type-required",
              message: "营销动作需要选择动作类型",
            },
          },
        },
      ],
      id: "action-type",
      title: "动作类型",
    },
  ],
  createDefaultData: () =>
    createNodeData("action", {
      actionType: defaultActionOption.type,
      label: "营销动作",
      metric: defaultActionOption.summary,
      summary: "发放新人专属优惠券",
      title: defaultActionOption.label,
    }),
  createExecutionConfig: (data) => pickDefinedWorkflowConfig({
    actionType: data.actionType,
  }),
  description: "发送私域消息、优惠券或打标签",
  insertable: true,
  kind: "action",
  layout: standardNodeLayout,
  paletteGroup: "engagement",
  paletteLabel: "营销动作",
  getOutputVariables: createDefaultOutputVariables,
  getSourceHandles: createDefaultSourceHandles,
  getTargetHandles: createDefaultTargetHandles,
  sort: 30,
  validate: validateActionNode,
  visual: {
    accentClassName: "bg-sky-600 text-white ring-sky-600/20",
    accentRgb: "2 132 199",
    icon: Message01Icon,
    label: "动作",
  },
};

function validateActionNode(node: WorkflowNode) {
  if (!hasText(node.data.actionType)) {
    return [];
  }

  if (!actionOptions.some((option) => option.type === node.data.actionType)) {
    return [createCatalogIssue("action-type-unsupported", "营销动作类型不受支持")];
  }

  return [];
}
