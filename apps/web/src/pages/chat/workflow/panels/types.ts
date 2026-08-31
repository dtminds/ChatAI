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
import type { WorkflowFriendAddWayResource } from "../workflow-friend-add-way-resource";
import type { WorkflowManagedAccountResource } from "../workflow-managed-account-resource";
import type { WorkflowCustomFieldResource } from "../workflow-custom-field-resource";

export type WorkflowNodeSettingsResources = {
  customFields?: WorkflowCustomFieldResource;
  friendAddWays?: WorkflowFriendAddWayResource;
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
  workflowId?: string;
};

export type WorkflowNodeTestContext = {
  draftVersion: number;
  saveState: WorkflowDraftSaveStatus;
  workflowId: string;
};
