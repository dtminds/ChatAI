import { GitBranchIcon } from "@hugeicons/core-free-icons";
import { WORKFLOW_BRANCH_NODE_WIDTH } from "../../constants";
import type { WorkflowNode } from "../../types";
import {
  createDefaultBranchPaths,
  getWorkflowBranchEstimatedHeight,
  getWorkflowBranchPaths,
  isWorkflowBranchConditionComplete,
  normalizeWorkflowBranchPaths,
  WORKFLOW_BRANCH_CONDITION_MAX,
  WORKFLOW_BRANCH_CONDITION_MIN,
  WORKFLOW_BRANCH_PATH_MAX,
  WORKFLOW_BRANCH_PATH_MIN,
} from "../../branch-paths";
import type { WorkflowNodeDefinition } from "../definition-types";
import {
  createBranchSourceHandles,
  createCatalogIssue,
  createDefaultTargetHandles,
  createNodeData,
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
  configSections: [],
  createDefaultData: () => createNodeData("branch", 1, {
    branchPaths: createDefaultBranchPaths(),
    label: "条件分支",
    metric: "待配置条件分支",
    status: "warning",
    title: "条件分支",
  }),
  createExecutionConfig: (data) => ({
    branchPaths: normalizeWorkflowBranchPaths(data.branchPaths),
  }),
  description: "根据前序变量按顺序匹配分支",
  getEstimatedHeight: getWorkflowBranchEstimatedHeight,
  getOutputVariables: () => [
    {
      key: "matchedPathId",
      label: "命中分支ID",
      type: "string",
      usages: ["variable"],
    },
    {
      key: "matchedPathLabel",
      label: "命中分支名称",
      type: "string",
      usages: ["variable"],
    },
  ],
  getSourceHandles: createBranchSourceHandles,
  getTargetHandles: createDefaultTargetHandles,
  insertable: true,
  kind: "branch",
  layout: {
    estimatedHeight: 146,
    width: WORKFLOW_BRANCH_NODE_WIDTH,
  },
  paletteGroup: "flow",
  paletteLabel: "条件分支",
  sanitizeData: (data) => {
    const branchPaths = normalizeWorkflowBranchPaths(data.branchPaths);
    const configured = branchPaths
      .filter((path) => !path.isDefault)
      .every((path) => path.conditions.every((condition) => Boolean(condition.selector)));
    return {
      ...data,
      branchPaths,
      metric: `${branchPaths.length - 1} 个条件分支`,
      status: configured ? "ready" : "warning",
    };
  },
  schemaVersion: 1,
  sort: 20,
  validate: validateBranchNode,
  visual: {
    accentClassName: "bg-amber-500 text-white ring-amber-500/20",
    accentRgb: "245 158 11",
    icon: GitBranchIcon,
    label: "条件分支",
  },
};

function validateBranchNode(
  node: WorkflowNode<"branch">,
  context: Parameters<NonNullable<WorkflowNodeDefinition<"branch">["validate"]>>[1],
) {
  const issues = [];
  const paths = getWorkflowBranchPaths(node.data);
  const conditionalPaths = paths.filter((path) => !path.isDefault);
  const variables = context.availableVariables.filter((variable) => variable.type !== "object");

  if (
    conditionalPaths.length < WORKFLOW_BRANCH_PATH_MIN
    || conditionalPaths.length > WORKFLOW_BRANCH_PATH_MAX
  ) {
    issues.push(createCatalogIssue(
      "branch-path-count-invalid",
      `条件分支数量需要为 ${WORKFLOW_BRANCH_PATH_MIN}-${WORKFLOW_BRANCH_PATH_MAX} 个`,
    ));
  }
  if (conditionalPaths.some((path) =>
    path.conditions.length < WORKFLOW_BRANCH_CONDITION_MIN
    || path.conditions.length > WORKFLOW_BRANCH_CONDITION_MAX,
  )) {
    issues.push(createCatalogIssue(
      "branch-condition-count-invalid",
      `每个分支需要配置 ${WORKFLOW_BRANCH_CONDITION_MIN}-${WORKFLOW_BRANCH_CONDITION_MAX} 条条件`,
    ));
  }
  if (conditionalPaths.some((path) =>
    path.conditions.some((condition) => !isWorkflowBranchConditionComplete(condition, variables)),
  )) {
    issues.push(createCatalogIssue("branch-condition-invalid", "条件分支存在未完成或不可用的条件"));
  }

  return issues;
}
