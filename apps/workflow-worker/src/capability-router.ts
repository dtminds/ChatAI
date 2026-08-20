import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import type {
  WorkflowCapabilityDefinition,
  WorkflowCapabilityExecutionBinding,
  WorkflowCapabilityKind,
  WorkflowCapabilityPort,
  WorkflowCapabilityRequest,
} from "@chatai/workflow-runtime";
import type { Static, TSchema } from "@sinclair/typebox";

export type WorkflowCapabilityRoute = {
  binding: WorkflowCapabilityExecutionBinding;
  port: WorkflowCapabilityPort;
};

export class WorkflowCapabilityRouter implements WorkflowCapabilityPort {
  readonly bindings: readonly WorkflowCapabilityExecutionBinding[];
  private readonly routes = new Map<string, WorkflowCapabilityPort>();

  constructor(routes: readonly WorkflowCapabilityRoute[]) {
    this.bindings = routes.map(route => route.binding);
    for (const route of routes) {
      const key = createRouteKey(route.binding.definition);
      if (this.routes.has(key)) {
        throw new Error(`Duplicate Workflow capability route: ${key}`);
      }
      this.routes.set(key, route.port);
    }
  }

  async execute<
    TCommandSchema extends TSchema,
    TResultSchema extends TSchema,
    TKind extends WorkflowCapabilityKind,
  >(
    definition: WorkflowCapabilityDefinition<TCommandSchema, TResultSchema, TKind>,
    request: WorkflowCapabilityRequest<Static<TCommandSchema>, TKind>,
  ): Promise<unknown> {
    const key = createRouteKey(definition);
    const port = this.routes.get(key);
    if (!port) {
      throw new WorkflowCapabilityExecutionError(
        "terminal",
        "WORKFLOW_CAPABILITY_UNSUPPORTED",
        "执行服务暂不可用，流程已停止",
        { diagnosticMessage: `Workflow capability route is unavailable: ${key}` },
      );
    }
    return port.execute(definition, request);
  }
}

function createRouteKey(definition: {
  capabilityKey: string;
  contractVersion: number;
  kind: WorkflowCapabilityKind;
}) {
  return `${definition.capabilityKey}@${definition.contractVersion}:${definition.kind}`;
}
