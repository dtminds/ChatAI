import type {
  WorkflowEntryEventType,
} from "@chatai/contracts";
import type { WorkflowDraftSaveStatus } from "../workflow-repository-types";
import type {
  WorkflowEdge,
  WorkflowNodeConfigPatch,
  WorkflowNode,
  WorkflowNodeKind,
} from "../types";
import type { WorkflowManagedAccountResource } from "../workflow-managed-account-resource";

export type WorkflowNodeSettingsResources = {
  managedAccounts?: WorkflowManagedAccountResource;
};

export type NodeSettingsProps<TKind extends WorkflowNodeKind = WorkflowNodeKind> = {
  allowedEntryEventTypes?: readonly WorkflowEntryEventType[];
  edges: WorkflowEdge[];
  node: WorkflowNode<TKind>;
  nodes: WorkflowNode[];
  onNodeChange: (patch: WorkflowNodeConfigPatch<TKind>) => void;
  resources?: WorkflowNodeSettingsResources;
  testContext?: WorkflowNodeTestContext;
};

export type WorkflowNodeTestContext = {
  draftVersion: number;
  saveState: WorkflowDraftSaveStatus;
  workflowId: string;
};
