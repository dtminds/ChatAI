import type {
  WorkflowChatCompletionPort,
  WorkflowChatCompletionRequest,
} from "@chatai/workflow-runtime";

export class FakeChatCompletionAdapter implements WorkflowChatCompletionPort {
  readonly calls: WorkflowChatCompletionRequest[] = [];

  constructor(
    private readonly executeImpl: WorkflowChatCompletionPort["execute"],
  ) {}

  async execute(request: WorkflowChatCompletionRequest) {
    this.calls.push(request);
    return this.executeImpl(request);
  }
}
