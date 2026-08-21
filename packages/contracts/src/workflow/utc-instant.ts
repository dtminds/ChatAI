import { Type } from "@sinclair/typebox";

const WORKFLOW_UTC_INSTANT_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d)(?:\.\d{1,9})?Z$/;

export const WorkflowUtcInstantSchema = Type.Transform(Type.String({
  pattern: WORKFLOW_UTC_INSTANT_PATTERN.source,
}))
  .Decode(requireWorkflowUtcInstant)
  .Encode(requireWorkflowUtcInstant);

export function normalizeWorkflowUtcInstant(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = WORKFLOW_UTC_INSTANT_PATTERN.exec(value);
  if (!match) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const normalized = parsed.toISOString();
  return normalized.slice(0, 19) === match[1] ? normalized : null;
}

function requireWorkflowUtcInstant(value: string): string {
  const normalized = normalizeWorkflowUtcInstant(value);
  if (normalized === null) throw new Error("Invalid Workflow UTC Instant");
  return normalized;
}
