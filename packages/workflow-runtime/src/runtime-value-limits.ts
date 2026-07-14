export const WORKFLOW_NODE_OUTPUT_MAX_BYTES = 4 * 1024;
export const WORKFLOW_RUN_CONTEXT_MAX_BYTES = 128 * 1024;

type WorkflowRuntimeValueScope = "node-output" | "run-context";

export class WorkflowRuntimeValueError extends Error {
  constructor(
    readonly reason: "invalid" | "too-large",
    readonly scope: WorkflowRuntimeValueScope,
    readonly actualBytes: number | null,
    readonly limitBytes: number,
  ) {
    super(`Workflow ${scope} is ${reason}`);
    this.name = "WorkflowRuntimeValueError";
  }
}

export function assertWorkflowRuntimeValue(
  value: unknown,
  scope: WorkflowRuntimeValueScope,
  limitBytes: number,
) {
  try {
    assertJsonValue(value, new Set(), 0);
  } catch {
    throw new WorkflowRuntimeValueError("invalid", scope, null, limitBytes);
  }

  let json: string;
  try {
    json = JSON.stringify(value);
  } catch {
    throw new WorkflowRuntimeValueError("invalid", scope, null, limitBytes);
  }
  const actualBytes = Buffer.byteLength(json, "utf8");
  if (actualBytes > limitBytes) {
    throw new WorkflowRuntimeValueError("too-large", scope, actualBytes, limitBytes);
  }
  return actualBytes;
}

function assertJsonValue(value: unknown, ancestors: Set<object>, depth: number): void {
  if (depth > 32) throw new Error("JSON nesting is too deep");
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("JSON numbers must be finite");
    return;
  }
  if (typeof value !== "object") throw new Error("Value is not JSON-compatible");
  if (ancestors.has(value)) throw new Error("JSON value contains a cycle");

  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) throw new Error("Sparse arrays are not supported");
      assertJsonValue(value[index], ancestors, depth + 1);
    }
    ancestors.delete(value);
    return;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("Only plain JSON objects are supported");
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new Error("Symbol keys are not supported");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new Error("Only enumerable data properties are supported");
    }
    assertJsonValue(descriptor.value, ancestors, depth + 1);
  }
  ancestors.delete(value);
}
