import type { IconSvgElement } from "@hugeicons/react";
import type { WorkflowNodeKind } from "../types";
import type { WorkflowNodeData } from "../types";
import type { WorkflowNodeDefinition, WorkflowNodePaletteGroupId } from "./definition-types";
import {
  createDefaultSourceHandles,
  createDefaultTargetHandles,
  compactNodeLayout,
  sourceNodeKinds,
  targetNodeKinds,
} from "./definition-shared";

type ActionNodeKind = Extract<WorkflowNodeKind, "message" | "tag" | "coupon" | "handoff">;

export function createActionNodeDefinition<TKind extends ActionNodeKind>({
  accentClassName,
  accentRgb,
  description,
  icon,
  kind,
  label,
  metric,
  paletteGroup = "engagement",
  sort,
  summary,
}: {
  accentClassName: string;
  accentRgb: string;
  description: string;
  icon: IconSvgElement;
  kind: TKind;
  label: string;
  metric: string;
  paletteGroup?: WorkflowNodePaletteGroupId;
  sort: number;
  summary: string;
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
      summary,
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
      icon,
      label,
    },
  };
}
