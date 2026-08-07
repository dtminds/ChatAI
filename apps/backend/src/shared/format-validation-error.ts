import type { FastifyError } from "fastify";

const REQUEST_FIELD_LABELS: Record<string, string> = {
  kbs: "知识库",
  select_sub_ids: "标签",
  tools: "工具",
  variables: "变量",
  description: "链接描述",
  fileName: "文件名称",
  query: "搜索关键词",
  title: "链接标题",
  groupId: "分组",
  messageId: "消息",
  bizType: "素材类型",
  collectionId: "素材",
};

const MAX_ITEMS_ACTIONS: Record<string, string> = {
  kbs: "添加",
  select_sub_ids: "选择",
  tools: "添加",
  variables: "添加",
};

type ValidationIssue = NonNullable<FastifyError["validation"]>[number];

export function formatValidationErrorMessage(error: FastifyError) {
  const issue = error.validation?.[0];

  if (!issue) {
    return "请求参数有误";
  }

  const field = readValidationField(issue);

  if (issue.keyword === "maxItems" && typeof issue.params?.limit === "number") {
    const fieldName = readValidationFieldName(issue);
    const action = MAX_ITEMS_ACTIONS[fieldName];

    if (action) {
      return `最多${action} ${issue.params.limit} 个${field}`;
    }
  }

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
  const fieldName = readValidationFieldName(issue);

  if (fieldName) {
    return REQUEST_FIELD_LABELS[fieldName] ?? fieldName;
  }

  return "参数";
}

function readValidationFieldName(issue: ValidationIssue) {
  const instancePath = issue.instancePath.replace(/^\//, "").trim();

  if (instancePath) {
    return instancePath.split("/").pop() ?? instancePath;
  }

  const missingProperty =
    typeof issue.params?.missingProperty === "string"
      ? issue.params.missingProperty
      : undefined;

  if (missingProperty) {
    return missingProperty;
  }

  return "";
}
