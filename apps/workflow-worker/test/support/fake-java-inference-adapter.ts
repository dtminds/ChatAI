import type {
  WorkflowJavaInferencePort,
  WorkflowJavaInferenceRequest,
} from "@chatai/workflow-runtime";

export class FakeJavaInferenceAdapter implements WorkflowJavaInferencePort {
  readonly calls: WorkflowJavaInferenceRequest[] = [];

  constructor(
    private readonly executeImpl: WorkflowJavaInferencePort["execute"],
  ) {}

  async execute(request: WorkflowJavaInferenceRequest) {
    this.calls.push(request);
    return this.executeImpl(request);
  }
}
