import { GitBranchIcon } from "@hugeicons/core-free-icons";
import type { WorkflowNode } from "../../types";
import {
  createDefaultBranchPaths,
  getWorkflowBranchPaths,
  normalizeWorkflowBranchPaths,
} from "../../branch-paths";
import type { WorkflowNodeDefinition } from "../definition-types";
import {
  branchNodeLayout,
  createBranchSourceHandles,
  createCatalogIssue,
  createDefaultOutputVariables,
  createDefaultTargetHandles,
  createNodeData,
  hasText,
  pickDefinedWorkflowConfig,
  sourceNodeKinds,
  targetNodeKinds,
} from "../definition-shared";

export const branchNodeDefinition: WorkflowNodeDefinition<"branch"> = {
  availableNextKinds: targetNodeKinds,
  availablePrevKinds: sourceNodeKinds,
  canDelete: true,
  canDuplicate: true,
  canInsertAfter: true,
  canRename: true,
  cardClassName: "workflow-node-card-branch",
  configSections: [
    {
      fields: [
        {
          getValue: (data) => data.branchRule ?? "",
          id: "workflow-branch-rule",
          kind: "textarea",
          label: "条件表达式",
          minRows: 5,
          toPatch: (value) => ({
            branchRule: value,
            metric: value ? "2 条分支" : "未配置分支",
            status: value ? "ready" : "warning",
          }),
          validation: {
            required: {
              code: "branch-rule-required",
              message: "条件分支需要配置条件表达式",
            },
          },
        },
      ],
      id: "branch-rule",
      title: "分支条件",
    },
  ],
  createDefaultData: () =>
    createNodeData("branch", 1, {
      branchPaths: createDefaultBranchPaths(),
      branchRule: "",
      label: "条件",
      metric: "未配置分支",
      status: "warning",
      summary: "按客户标签、行为或会话意图拆分路径",
      title: "条件分支",
    }),
  createExecutionConfig: (data) => pickDefinedWorkflowConfig({
    branchPaths: data.branchPaths,
    branchRule: data.branchRule,
  }),
  description: "按标签、行为、会话意图分支",
  insertable: true,
  kind: "branch",
  layout: branchNodeLayout,
  paletteGroup: "logic",
  paletteLabel: "条件分支",
  schemaVersion: 1,
  getOutputVariables: createDefaultOutputVariables,
  sanitizeData: (data) => ({
    ...data,
    branchPaths: normalizeWorkflowBranchPaths(data.branchPaths),
  }),
  getSourceHandles: createBranchSourceHandles,
  getTargetHandles: createDefaultTargetHandles,
  sort: 20,
  validate: validateBranchNode,
  visual: {
    accentClassName: "bg-amber-600 text-white ring-amber-600/20",
    accentRgb: "217 119 6",
    icon: GitBranchIcon,
    label: "条件",
  },
};

function validateBranchNode(node: WorkflowNode<"branch">) {
  const issues = [];
  const branchPaths = getWorkflowBranchPaths(node.data);

  if (branchPaths.some((path) => !hasText(path.label))) {
    issues.push(createCatalogIssue("branch-path-label-required", "条件分支路径需要填写分支名称"));
  }

  return issues;
}
