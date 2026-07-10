import type { Rocket01Icon } from "@hugeicons/core-free-icons";
import type { NodeConfigSection } from "../node-config-types";
import type {
  WorkflowNode,
  WorkflowNodeData,
  WorkflowNodeKind,
  WorkflowNodeValidationContext,
  WorkflowNodeValidationIssue,
  WorkflowVariable,
} from "../types";
import type {
  WorkflowSourceHandleDefinition,
  WorkflowTargetHandleDefinition,
} from "../node-handle-definitions";

export type NodeVisual = {
  accentClassName: string;
  accentRgb: string;
  icon: typeof Rocket01Icon;
  label: string;
};

export type WorkflowNodePaletteGroupId = "engagement" | "flow" | "logic";

export type WorkflowNodePaletteGroup = {
  id: WorkflowNodePaletteGroupId;
  label: string;
  sort: number;
};

export type WorkflowNodeRole = "entry" | "terminal";

export type WorkflowNodeLayoutMetrics = {
  estimatedHeight: number;
  width: number;
};

export type WorkflowNodeDefinition = {
  availableNextKinds: WorkflowNodeKind[];
  availablePrevKinds: WorkflowNodeKind[];
  canDelete: boolean;
  canDuplicate: boolean;
  canInsertAfter: boolean;
  cardClassName?: string;
  configSections: NodeConfigSection[];
  createExecutionConfig: (data: WorkflowNodeData) => Record<string, unknown>;
  createDefaultData: () => WorkflowNodeData;
  description?: string;
  insertable: boolean;
  kind: WorkflowNodeKind;
  layout: WorkflowNodeLayoutMetrics;
  paletteLabel?: string;
  paletteGroup?: WorkflowNodePaletteGroupId;
  role?: WorkflowNodeRole;
  sanitizeData?: (data: WorkflowNodeData) => WorkflowNodeData;
  getOutputVariables?: (node: WorkflowNode) => WorkflowVariable[];
  getSourceHandles: (data: WorkflowNodeData) => WorkflowSourceHandleDefinition[];
  getTargetHandles: (data: WorkflowNodeData) => WorkflowTargetHandleDefinition[];
  sort: number;
  validate?: (
    node: WorkflowNode,
    context: WorkflowNodeValidationContext,
  ) => WorkflowNodeValidationIssue[];
  visual: NodeVisual;
};
