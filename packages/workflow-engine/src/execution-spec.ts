import {
  WorkflowStoredExecutionSpecSchema,
  type WorkflowExecutionSpec,
} from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";

export function normalizeWorkflowExecutionSpec(
  spec: unknown,
): WorkflowExecutionSpec {
  if (!Value.Check(WorkflowStoredExecutionSpecSchema, spec)) {
    throw new Error("Stored Workflow Execution Spec must conform to schema version 3");
  }
  return structuredClone(spec);
}
