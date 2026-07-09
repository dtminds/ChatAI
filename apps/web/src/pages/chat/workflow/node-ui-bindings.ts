import type { WorkflowNodeKind } from "./types";
import { createSchemaNodeSettingsPanel } from "./panels/node-settings";
import { workflowNodeUiRegistry } from "./nodes/ui-registry";
import type { WorkflowNodeUiBinding } from "./nodes/ui-types";

export type { WorkflowNodeUiBinding } from "./nodes/ui-types";

export const workflowNodeUiBindings = Object.fromEntries(
  Object.entries(workflowNodeUiRegistry).map(([kind, binding]) => [
    kind,
    resolveWorkflowNodeUiBinding(binding),
  ]),
) as Record<WorkflowNodeKind, {
  body: WorkflowNodeUiBinding["body"];
  settings: ReturnType<typeof resolveWorkflowNodeSettingsBinding>;
}>;

function resolveWorkflowNodeUiBinding(binding: WorkflowNodeUiBinding) {
  return {
    body: binding.body,
    settings: resolveWorkflowNodeSettingsBinding(binding),
  };
}

function resolveWorkflowNodeSettingsBinding(binding: WorkflowNodeUiBinding) {
  if (binding.settings.kind === "custom") {
    return binding.settings.component;
  }

  return createSchemaNodeSettingsPanel(
    binding.settings.nodeKind,
    binding.settings.after,
  );
}
