import type { IconSvgElement } from "@hugeicons/react";
import { getWorkflowNodeContract } from "@chatai/contracts";
import type { WorkflowNodeData, WorkflowNodeKind } from "../types";
import type { WorkflowNodeDefinition, WorkflowNodePaletteGroupId } from "./definition-types";
import {
  compactNodeLayout,
  createDefaultSourceHandles,
  createDefaultTargetHandles,
  sourceNodeKinds,
  targetNodeKinds,
} from "./definition-shared";

type StandardNodeKind = Exclude<
  WorkflowNodeKind,
  "start" | "wait" | "wait-event" | "branch" | "message-query" | "ai-intent" | "end"
>;

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
      schemaVersion: getWorkflowNodeContract(kind).currentDraftSchemaVersion,
      status: "ready",
      title: label,
    }) as WorkflowNodeData<TKind>,
    description,
    insertable: true,
    kind,
    layout: compactNodeLayout,
    paletteGroup,
    paletteLabel: label,
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
