import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";

export function createCapabilityCommandError(code: string) {
  return (diagnosticMessage: string) => new WorkflowCapabilityExecutionError(
    "terminal",
    code,
    "执行所需数据不可用，流程已停止",
    { diagnosticMessage },
  );
}
