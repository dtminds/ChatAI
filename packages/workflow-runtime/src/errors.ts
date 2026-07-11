export class WorkflowRuntimeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 409,
  ) {
    super(message);
    this.name = "WorkflowRuntimeError";
  }
}
