import type { ComponentType } from "react";
import type { WorkflowNodeKind } from "./types";
import { createSchemaNodeSettingsPanel } from "./panels/node-settings";
import { workflowNodeUiRegistry } from "./nodes/ui-registry";
import type { WorkflowNodeUiBinding } from "./nodes/ui-types";
import type { NodeSettingsProps } from "./panels/types";

export type { WorkflowNodeUiBinding } from "./nodes/ui-types";

type ResolvedWorkflowNodeUiBinding<TKind extends WorkflowNodeKind> = {
  body: WorkflowNodeUiBinding<TKind>["body"];
  settings: ComponentType<NodeSettingsProps<TKind>> | null;
};

type ResolvedWorkflowNodeUiBindingMap = {
  [TKind in WorkflowNodeKind]: ResolvedWorkflowNodeUiBinding<TKind>;
};

export const workflowNodeUiBindings = Object.fromEntries(
  (Object.keys(workflowNodeUiRegistry) as WorkflowNodeKind[]).map((kind) => [
    kind,
    resolveWorkflowNodeUiBindingForKind(kind),
  ]),
) as ResolvedWorkflowNodeUiBindingMap;

function resolveWorkflowNodeUiBindingForKind<TKind extends WorkflowNodeKind>(kind: TKind) {
  return resolveWorkflowNodeUiBinding(
    workflowNodeUiRegistry[kind] as unknown as WorkflowNodeUiBinding<TKind>,
  );
}

function resolveWorkflowNodeUiBinding<TKind extends WorkflowNodeKind>(
  binding: WorkflowNodeUiBinding<TKind>,
): ResolvedWorkflowNodeUiBinding<TKind> {
  return {
    body: binding.body,
    settings: resolveWorkflowNodeSettingsBinding(binding),
  };
}

function resolveWorkflowNodeSettingsBinding<TKind extends WorkflowNodeKind>(
  binding: WorkflowNodeUiBinding<TKind>,
): ComponentType<NodeSettingsProps<TKind>> | null {
  if (binding.settings.kind === "none") {
    return null;
  }

  if (binding.settings.kind === "custom") {
    return binding.settings.component;
  }

  return createSchemaNodeSettingsPanel(
    binding.settings.nodeKind,
    binding.settings.after,
  );
}
