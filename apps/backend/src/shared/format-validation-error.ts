import type { FastifyError } from "fastify";

const REQUEST_FIELD_LABELS: Record<string, string> = {
  description: "链接描述",
  fileName: "文件名称",
  title: "链接标题",
  groupId: "分组",
  messageId: "消息",
  bizType: "素材类型",
  collectionId: "素材",
};

type ValidationIssue = NonNullable<FastifyError["validation"]>[number];

export function formatValidationErrorMessage(error: FastifyError) {
  const issue = error.validation?.[0];

  if (!issue) {
    return "请求参数有误";
  }

  const field = readValidationField(issue);

  if (issue.keyword === "maxLength" && typeof issue.params?.limit === "number") {
    return `${field}不能超过 ${issue.params.limit} 个字符`;
  }

  if (issue.keyword === "minLength" && typeof issue.params?.limit === "number") {
    return `${field}不能少于 ${issue.params.limit} 个字符`;
  }

  if (issue.keyword === "required") {
    return `缺少必填项：${field}`;
  }

  if (issue.keyword === "pattern") {
    return `${field}格式不正确`;
  }

  return "请求参数有误";
}

function readValidationField(issue: ValidationIssue) {
  const instancePath = issue.instancePath.replace(/^\//, "").trim();

  if (instancePath) {
    const fieldName = instancePath.split("/").pop() ?? instancePath;

    return REQUEST_FIELD_LABELS[fieldName] ?? fieldName;
  }

  const missingProperty =
    typeof issue.params?.missingProperty === "string"
      ? issue.params.missingProperty
      : undefined;

  if (missingProperty) {
    return REQUEST_FIELD_LABELS[missingProperty] ?? missingProperty;
  }

  return "参数";
}
