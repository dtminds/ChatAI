export type WorkflowCompilationIssue = {
  code:
    | "cycle"
    | "duplicate-edge-id"
    | "duplicate-node-id"
    | "invalid-branch-outlet"
    | "invalid-edge"
    | "invalid-entry"
    | "invalid-node-config"
    | "invalid-terminal"
    | "max-depth"
    | "source-outlet-unconnected"
    | "source-outlet-used-multiple-times"
    | "unsupported-runtime-node"
    | "unreachable-node";
  edgeId?: string;
  message: string;
  nodeId?: string;
};

export class WorkflowCompilationError extends Error {
  readonly issues: WorkflowCompilationIssue[];

  constructor(issues: WorkflowCompilationIssue[]) {
    super("Workflow graph validation failed");
    this.name = "WorkflowCompilationError";
    this.issues = issues;
  }
}

export class WorkflowStateTransitionError extends Error {
  constructor(entity: "run" | "task", from: string, to: string) {
    super(`Invalid workflow ${entity} transition: ${from} -> ${to}`);
    this.name = "WorkflowStateTransitionError";
  }
}

export class WorkflowNodeExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowNodeExecutionError";
  }
}
