import type { IconSvgElement } from "@hugeicons/react";
import type { WorkflowNodeData, WorkflowNodeKind } from "../types";
import type { WorkflowNodeDefinition, WorkflowNodePaletteGroupId } from "./definition-types";
import {
  compactNodeLayout,
  createDefaultSourceHandles,
  createDefaultTargetHandles,
  sourceNodeKinds,
  targetNodeKinds,
} from "./definition-shared";

type StandardNodeKind = Exclude<WorkflowNodeKind, "start" | "wait" | "branch" | "message-query" | "end">;

export function createStandardNodeDefinition<TKind extends StandardNodeKind>({
  accentClassName,
  accentRgb,
  badge,
  description,
  icon,
  kind,
  label,
  metric,
  paletteGroup,
  sort,
}: {
  accentClassName: string;
  accentRgb: string;
  badge?: "ai";
  description: string;
  icon: IconSvgElement;
  kind: TKind;
  label: string;
  metric: string;
  paletteGroup: WorkflowNodePaletteGroupId;
  sort: number;
}): WorkflowNodeDefinition<TKind> {
  return {
    availableNextKinds: targetNodeKinds,
    availablePrevKinds: sourceNodeKinds,
    canDelete: true,
    canDuplicate: true,
    canInsertAfter: true,
    canRename: true,
    configSections: [],
    createDefaultData: () => ({
      kind,
      label,
      metric,
      schemaVersion: 1,
      status: "ready",
      title: label,
    }) as WorkflowNodeData<TKind>,
    createExecutionConfig: () => ({}),
    description,
    insertable: true,
    kind,
    layout: compactNodeLayout,
    paletteGroup,
    paletteLabel: label,
    schemaVersion: 1,
    getSourceHandles: createDefaultSourceHandles,
    getTargetHandles: createDefaultTargetHandles,
    sort,
    visual: {
      accentClassName,
      accentRgb,
      badge,
      icon,
      label,
    },
  };
}
