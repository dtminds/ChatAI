import type {
  WorkflowCapabilityDefinition,
  WorkflowCapabilityPort,
  WorkflowCapabilityRequest,
} from "../../src/capability-port.js";

export class FakeWorkflowCapabilityAdapter implements WorkflowCapabilityPort {
  readonly calls: Array<{
    definition: WorkflowCapabilityDefinition;
    request: WorkflowCapabilityRequest<unknown>;
  }> = [];

  constructor(
    private readonly executeImpl: (
      definition: WorkflowCapabilityDefinition,
      request: WorkflowCapabilityRequest<unknown>,
    ) => Promise<unknown>,
  ) {}

  async execute(
    definition: WorkflowCapabilityDefinition,
    request: WorkflowCapabilityRequest<unknown>,
  ) {
    this.calls.push({ definition, request });
    return this.executeImpl(definition, request);
  }
}
