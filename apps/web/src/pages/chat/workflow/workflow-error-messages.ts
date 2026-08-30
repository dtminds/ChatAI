import { normalizeWorkflowRepositoryError } from "./workflow-draft-service";

type WorkflowLifecycleAction = "enable" | "pause" | "resume" | "stop";

const GENERIC_OPERATION_ERROR = "操作失败，请稍后重试";

export function getWorkflowLifecycleErrorMessage(
  action: WorkflowLifecycleAction,
  error: unknown,
) {
  const repositoryError = normalizeWorkflowRepositoryError(error);
  if (repositoryError.apiCode === "WORKFLOW_ACTIVE_LIMIT_EXCEEDED") {
    return "最多同时运行 50 个工作流";
  }
  if (action === "enable" && repositoryError.code === "conflict") {
    return "请先在编辑页发布当前草稿";
  }
  if (repositoryError.code === "not-found") return "内容已不存在";
  if (repositoryError.code === "forbidden") return "没有操作权限";
  return GENERIC_OPERATION_ERROR;
}

export function getWorkflowReviewActionErrorMessage(error: unknown) {
  const repositoryError = normalizeWorkflowRepositoryError(error);
  if (repositoryError.apiCode === "WORKFLOW_REVIEW_RESOURCES_CHANGED") {
    return repositoryError.message;
  }
  if (repositoryError.code === "validation") return repositoryError.message;
  if (repositoryError.code === "conflict") {
    return "状态已变化，请刷新页面后重试";
  }
  if (repositoryError.code === "not-found") return "内容已不存在";
  if (repositoryError.code === "forbidden") return "没有操作权限";
  return GENERIC_OPERATION_ERROR;
}
