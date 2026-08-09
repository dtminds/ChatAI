import type { Rocket01Icon } from "@hugeicons/core-free-icons";
import type { NodeConfigSection } from "../node-config-types";
import type {
  WorkflowNode,
  WorkflowNodeData,
  WorkflowNodeKind,
  WorkflowNodeValidationContext,
  WorkflowNodeValidationIssue,
  WorkflowNodeOutputDefinition,
} from "../types";
import type {
  WorkflowSourceHandleDefinition,
  WorkflowTargetHandleDefinition,
} from "../node-handle-definitions";

export type NodeVisual = {
  accentClassName: string;
  accentRgb: string;
  badge?: "ai";
  icon: typeof Rocket01Icon;
  label: string;
};

export type WorkflowNodePaletteGroupId = "benefit" | "data" | "flow" | "message";

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

export type WorkflowNodeMigrationContext<TKind extends WorkflowNodeKind> = {
  data: Partial<WorkflowNodeData<TKind>> & Pick<WorkflowNodeData<TKind>, "kind">;
  fromVersion: number;
  toVersion: number;
};

export type WorkflowNodeDefinition<TKind extends WorkflowNodeKind = WorkflowNodeKind> = {
  availableNextKinds: WorkflowNodeKind[];
  availablePrevKinds: WorkflowNodeKind[];
  canDelete: boolean;
  canDuplicate: boolean;
  canInsertAfter: boolean;
  canRename: boolean;
  cardClassName?: string;
  configSections: NodeConfigSection<TKind>[];
  createExecutionConfig: (data: WorkflowNodeData<TKind>) => Record<string, unknown>;
  createDefaultData: () => WorkflowNodeData<TKind>;
  description?: string;
  insertable: boolean;
  kind: TKind;
  layout: WorkflowNodeLayoutMetrics;
  migrateData?: (
    context: WorkflowNodeMigrationContext<TKind>,
  ) => Partial<WorkflowNodeData<TKind>>;
  paletteLabel?: string;
  paletteGroup?: WorkflowNodePaletteGroupId;
  role?: WorkflowNodeRole;
  sanitizeData?: (data: WorkflowNodeData<TKind>) => WorkflowNodeData<TKind>;
  schemaVersion: number;
  getOutputVariables?: (node: WorkflowNode<TKind>) => WorkflowNodeOutputDefinition[];
  getEstimatedHeight?: (data: WorkflowNodeData<TKind>) => number;
  getSourceHandles: (data: WorkflowNodeData<TKind>) => WorkflowSourceHandleDefinition[];
  getTargetHandles: (data: WorkflowNodeData<TKind>) => WorkflowTargetHandleDefinition[];
  ownsOutputConfiguration?: boolean;
  sort: number;
  validate?: (
    node: WorkflowNode<TKind>,
    context: WorkflowNodeValidationContext,
  ) => WorkflowNodeValidationIssue[];
  visual: NodeVisual;
};

export type AnyWorkflowNodeDefinition = {
  [TKind in WorkflowNodeKind]: WorkflowNodeDefinition<TKind>;
}[WorkflowNodeKind];
