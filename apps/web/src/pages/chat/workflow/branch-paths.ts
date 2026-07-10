import { WORKFLOW_BRANCH_FIRST_HANDLE_TOP, WORKFLOW_BRANCH_HANDLE_ROW_GAP } from "./constants";
import type {
  BranchNodeData,
  WorkflowBranchPath,
} from "./types";

let workflowBranchPathIdSequence = 0;

export const defaultBranchPaths = [
  { id: "branch-high", label: "高意向客户", operator: "IF", title: "CASE 1" },
  { id: "branch-normal", label: "普通客户", operator: "ELIF", title: "CASE 2" },
  { id: "branch-default", isDefault: true, label: "默认路径", operator: "ELSE", title: "CASE 3" },
] satisfies WorkflowBranchPath[];

export function createDefaultBranchPaths(): WorkflowBranchPath[] {
  return defaultBranchPaths.map((path) => ({ ...path }));
}

export function createWorkflowBranchPathId(
  paths: WorkflowBranchPath[] = [],
) {
  const existingIds = new Set(paths.map((path) => path.id));
  let candidate = "";

  do {
    workflowBranchPathIdSequence += 1;
    candidate = `branch-${workflowBranchPathIdSequence.toString(36)}`;
  } while (existingIds.has(candidate));

  return candidate;
}

export function getWorkflowBranchPaths(
  data?: Pick<BranchNodeData, "branchPaths">,
): WorkflowBranchPath[] {
  return normalizeWorkflowBranchPaths(data?.branchPaths);
}

export function normalizeWorkflowBranchPaths(
  paths?: WorkflowBranchPath[],
): WorkflowBranchPath[] {
  if (!Array.isArray(paths) || paths.length === 0) {
    return createDefaultBranchPaths();
  }

  const seenIds = new Set<string>();
  const validPaths = paths.filter((path) => {
    if (!isValidBranchPath(path) || seenIds.has(path.id)) {
      return false;
    }

    seenIds.add(path.id);
    return true;
  });

  if (validPaths.length === 0) {
    return createDefaultBranchPaths();
  }

  const nonDefaultPaths = validPaths.filter((path) => !path.isDefault);
  const defaultPath = validPaths.find((path) => path.isDefault)
    ?? defaultBranchPaths.find((path) => path.isDefault)!;
  const normalizedNonDefaultPaths = nonDefaultPaths.length > 0
    ? nonDefaultPaths
    : [defaultBranchPaths[0]];

  return [
    ...normalizedNonDefaultPaths.map((path, index) => ({
      ...path,
      isDefault: undefined,
      operator: index === 0 ? "IF" as const : "ELIF" as const,
      title: `CASE ${index + 1}`,
    })),
    {
      ...defaultPath,
      isDefault: true,
      operator: "ELSE",
      title: `CASE ${normalizedNonDefaultPaths.length + 1}`,
    },
  ];
}

export function addWorkflowBranchPath(
  paths: WorkflowBranchPath[] | undefined,
  id = createWorkflowBranchPathId(paths),
): WorkflowBranchPath[] {
  const normalizedPaths = normalizeWorkflowBranchPaths(paths);
  const defaultPath = normalizedPaths.find((path) => path.isDefault)!;
  const nonDefaultPaths = normalizedPaths.filter((path) => !path.isDefault);

  return normalizeWorkflowBranchPaths([
    ...nonDefaultPaths,
    {
      id,
      label: `新分支 ${nonDefaultPaths.length + 1}`,
      operator: "ELIF",
      title: `CASE ${nonDefaultPaths.length + 1}`,
    },
    defaultPath,
  ]);
}

export function renameWorkflowBranchPath(
  paths: WorkflowBranchPath[] | undefined,
  pathId: string,
  label: string,
): WorkflowBranchPath[] {
  return normalizeWorkflowBranchPaths(paths).map((path) =>
    path.id === pathId
      ? {
          ...path,
          label,
        }
      : path,
  );
}

export function removeWorkflowBranchPath(
  paths: WorkflowBranchPath[] | undefined,
  pathId: string,
): WorkflowBranchPath[] {
  const normalizedPaths = normalizeWorkflowBranchPaths(paths);
  const targetPath = normalizedPaths.find((path) => path.id === pathId);
  const nonDefaultPathCount = normalizedPaths.filter((path) => !path.isDefault).length;

  if (!targetPath || targetPath.isDefault || nonDefaultPathCount <= 1) {
    return normalizedPaths;
  }

  return normalizeWorkflowBranchPaths(normalizedPaths.filter((path) => path.id !== pathId));
}

export function moveWorkflowBranchPath(
  paths: WorkflowBranchPath[] | undefined,
  pathId: string,
  direction: "down" | "up",
): WorkflowBranchPath[] {
  const normalizedPaths = normalizeWorkflowBranchPaths(paths);
  const nonDefaultPaths = normalizedPaths.filter((path) => !path.isDefault);
  const defaultPath = normalizedPaths.find((path) => path.isDefault)!;
  const pathIndex = nonDefaultPaths.findIndex((path) => path.id === pathId);
  const targetIndex = direction === "up" ? pathIndex - 1 : pathIndex + 1;

  if (
    pathIndex < 0
    || targetIndex < 0
    || targetIndex >= nonDefaultPaths.length
  ) {
    return normalizedPaths;
  }

  const nextNonDefaultPaths = [...nonDefaultPaths];
  [nextNonDefaultPaths[pathIndex], nextNonDefaultPaths[targetIndex]] = [
    nextNonDefaultPaths[targetIndex],
    nextNonDefaultPaths[pathIndex],
  ];

  return normalizeWorkflowBranchPaths([...nextNonDefaultPaths, defaultPath]);
}

export function getBranchPathIndex(
  data: Pick<BranchNodeData, "branchPaths"> | undefined,
  sourceHandle?: string | null,
) {
  const paths = getWorkflowBranchPaths(data);
  const index = paths.findIndex((path) => path.id === sourceHandle);

  return index >= 0 ? index : 0;
}

export function getBranchPathLabel(
  data: Pick<BranchNodeData, "branchPaths"> | undefined,
  sourceHandle?: string | null,
) {
  return getWorkflowBranchPaths(data).find((path) => path.id === sourceHandle)?.label;
}

export function getBranchPathTop(
  data: Pick<BranchNodeData, "branchPaths"> | undefined,
  sourceHandle?: string,
) {
  return WORKFLOW_BRANCH_FIRST_HANDLE_TOP
    + getBranchPathIndex(data, sourceHandle) * WORKFLOW_BRANCH_HANDLE_ROW_GAP;
}

export function getDefaultBranchPathId(
  data?: Pick<BranchNodeData, "branchPaths">,
) {
  return getWorkflowBranchPaths(data)[0]?.id;
}

function isValidBranchPath(value: WorkflowBranchPath) {
  return Boolean(value.id);
}
