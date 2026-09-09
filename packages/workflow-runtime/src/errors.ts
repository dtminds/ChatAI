export class WorkflowRuntimeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 409,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "WorkflowRuntimeError";
  }
}
