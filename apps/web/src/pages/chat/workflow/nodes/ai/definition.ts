import { AiChat02Icon } from "@hugeicons/core-free-icons";
import type { WorkflowNode } from "../../types";
import {
  agentOptions,
  defaultAgentOption,
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

export const aiNodeDefinition: WorkflowNodeDefinition = {
  availableNextKinds: targetNodeKinds,
  availablePrevKinds: sourceNodeKinds,
  canDelete: true,
  canDuplicate: true,
  canInsertAfter: true,
  configSections: [
    {
      fields: [
        {
          columns: 1,
          getOptions: () =>
            agentOptions.map((agent) => ({
              description: agent.description,
              label: agent.name,
              value: agent.name,
            })),
          getValidationValue: (data) => data.agentName,
          getValue: (data) => data.agentName ?? defaultAgentOption.name,
          id: "workflow-agent",
          kind: "option-cards",
          label: "接待 Agent",
          toPatch: (value) => {
            const agent = agentOptions.find((option) => option.name === value) ?? defaultAgentOption;

            return {
              actionType: "ai",
              agentName: agent.name,
              label: "AI 接待",
              metric: agent.knowledge,
              status: "ready",
              summary: agent.name,
            };
          },
          validation: {
            required: {
              code: "ai-agent-required",
              message: "AI 接待需要绑定 Agent",
            },
          },
        },
        {
          getValue: (data) => data.handoffRule ?? "",
          id: "workflow-handoff-rule",
          kind: "textarea",
          label: "转人工条件",
          minRows: 4,
          toPatch: (value) => ({ handoffRule: value }),
        },
      ],
      id: "ai-reception",
      title: "AI 接待策略",
    },
  ],
  createDefaultData: () =>
    createNodeData("ai", {
      actionType: "ai",
      agentName: defaultAgentOption.name,
      handoffRule: "客户要求人工、投诉升级、识别到价格异议",
      label: "AI 接待",
      metric: defaultAgentOption.knowledge,
      summary: defaultAgentOption.name,
      title: "AI 接待",
    }),
  createExecutionConfig: (data) => pickDefinedWorkflowConfig({
    agentName: data.agentName,
    handoffRule: data.handoffRule,
  }),
  description: "启用指定 Agent，接管后续会话",
  insertable: true,
  kind: "ai",
  layout: standardNodeLayout,
  paletteGroup: "engagement",
  paletteLabel: "AI 接待",
  getOutputVariables: createDefaultOutputVariables,
  getSourceHandles: createDefaultSourceHandles,
  getTargetHandles: createDefaultTargetHandles,
  sort: 40,
  validate: validateAiNode,
  visual: {
    accentClassName: "bg-violet-600 text-white ring-violet-600/20",
    accentRgb: "124 58 237",
    icon: AiChat02Icon,
    label: "AI",
  },
};

function validateAiNode(node: WorkflowNode) {
  if (!hasText(node.data.agentName)) {
    return [];
  }

  if (!agentOptions.some((agent) => agent.name === node.data.agentName)) {
    return [createCatalogIssue("ai-agent-unsupported", "AI 接待绑定的 Agent 不可用")];
  }

  return [];
}
