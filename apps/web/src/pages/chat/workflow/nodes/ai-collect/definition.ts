import { AiUserIcon } from "@hugeicons/core-free-icons";
import type { WorkflowNodeDefinition } from "../definition-types";
import {
  createCatalogIssue,
  createDefaultTargetHandles,
  createNodeData,
  sourceNodeKinds,
  targetNodeKinds,
} from "../definition-shared";
import { resolveWorkflowVariable } from "../../workflow-variables";
import {
  AI_COLLECT_COMPLETED_HANDLE_ID,
  AI_COLLECT_FIELD_MAX_COUNT,
  AI_COLLECT_FIELD_MIN_COUNT,
  AI_COLLECT_FIELD_NAME_MAX_LENGTH,
  AI_COLLECT_INCOMPLETE_HANDLE_ID,
  AI_COLLECT_INSTRUCTION_MAX_LENGTH,
  AI_COLLECT_MAX_FOLLOW_UP_COUNT,
  AI_COLLECT_OPENING_MESSAGE_MAX_LENGTH,
  AI_COLLECT_TIMEOUT_MAX_BY_UNIT,
  AI_COLLECT_TIMEOUT_MIN_BY_UNIT,
  createAiCollectField,
  getAiCollectMetric,
  getAiCollectOutputDefinitions,
  getAiCollectStatus,
  normalizeAiCollectFields,
  normalizeAiCollectInputSelector,
  normalizeAiCollectMaxFollowUpCount,
  normalizeAiCollectOpeningMessage,
  normalizeAiCollectTimeout,
} from "./config";

export const aiCollectNodeDefinition: WorkflowNodeDefinition<"ai-collect"> = {
  availableNextKinds: targetNodeKinds,
  availablePrevKinds: sourceNodeKinds,
  canDelete: true,
  canDuplicate: true,
  canInsertAfter: true,
  canRename: true,
  configSections: [],
  createDefaultData: () => {
    const fields = [createAiCollectField()];
    return createNodeData("ai-collect", {
      fields,
      inputSelector: undefined,
      label: "资料收集",
      maxFollowUpCount: 3,
      metric: "智能体辅助 3 轮 · 1 个字段",
      openingMessage: "",
      status: "warning",
      timeout: { duration: 30, unit: "minute" },
      title: "资料收集",
    });
  },
  description: "从客户对话中提取所需资料，并在需要时通过 Agent 自然追问缺失信息",
  getOutputVariables: (node) => getAiCollectOutputDefinitions(node.data.fields),
  getSourceHandles: () => [
    {
      id: AI_COLLECT_COMPLETED_HANDLE_ID,
      isDefault: true,
      label: "已完成",
      outletKind: "outcome",
      top: 122,
    },
    {
      id: AI_COLLECT_INCOMPLETE_HANDLE_ID,
      label: "未完成",
      outletKind: "outcome",
      top: 164,
    },
  ],
  getTargetHandles: createDefaultTargetHandles,
  insertable: true,
  kind: "ai-collect",
  layout: {
    estimatedHeight: 220,
    width: 320,
  },
  ownsOutputConfiguration: true,
  paletteGroup: "data",
  paletteLabel: "资料收集",
  sanitizeData: (data) => {
    const nextData = {
      ...data,
      fields: normalizeAiCollectFields(data.fields),
      inputSelector: normalizeAiCollectInputSelector(data.inputSelector),
      maxFollowUpCount: normalizeAiCollectMaxFollowUpCount(data.maxFollowUpCount),
      openingMessage: normalizeAiCollectOpeningMessage(data.openingMessage),
      timeout: normalizeAiCollectTimeout(data.timeout),
    };
    return {
      ...nextData,
      metric: getAiCollectMetric(nextData),
      status: getAiCollectStatus(nextData),
    };
  },
  sort: 50,
  validate: (node, context) => {
    const issues = [];
    const maxFollowUpCount = normalizeAiCollectMaxFollowUpCount(node.data.maxFollowUpCount);
    const fields = normalizeAiCollectFields(node.data.fields);
    const inputSelector = normalizeAiCollectInputSelector(node.data.inputSelector);
    const names = fields.map(field => field.name.trim());
    const nonBlankNames = names.filter(Boolean);
    const rawFields = Array.isArray(node.data.fields) ? node.data.fields : [];

    if (maxFollowUpCount === 0 && !inputSelector) {
      issues.push(createCatalogIssue("ai-collect-input-required", "关闭智能体辅助时需要配置输入"));
    }
    if (inputSelector) {
      const variable = resolveWorkflowVariable(context.availableVariables, inputSelector);
      if (!variable?.usages?.includes("intent-input")) {
        issues.push(createCatalogIssue("ai-collect-input-invalid", "输入引用了不可用的前序节点输出"));
      }
    }
    if (rawFields.length < AI_COLLECT_FIELD_MIN_COUNT
      || rawFields.length > AI_COLLECT_FIELD_MAX_COUNT) {
      issues.push(createCatalogIssue(
        "ai-collect-field-count-invalid",
        `收集字段需要为 ${AI_COLLECT_FIELD_MIN_COUNT}-${AI_COLLECT_FIELD_MAX_COUNT} 个`,
      ));
    }
    if (names.some(name => !name)) {
      issues.push(createCatalogIssue("ai-collect-field-name-required", "字段名称不能为空"));
    }
    if (rawFields.some(field =>
      field && typeof field.name === "string"
      && field.name.length > AI_COLLECT_FIELD_NAME_MAX_LENGTH,
    )) {
      issues.push(createCatalogIssue(
        "ai-collect-field-name-too-long",
        `字段名称不能超过 ${AI_COLLECT_FIELD_NAME_MAX_LENGTH} 个字`,
      ));
    }
    if (new Set(nonBlankNames).size !== nonBlankNames.length) {
      issues.push(createCatalogIssue("ai-collect-field-name-duplicate", "字段名称不能重复"));
    }
    if (fields.some(field => !field.instruction.trim())) {
      issues.push(createCatalogIssue("ai-collect-instruction-required", "提取指引不能为空"));
    }
    if (rawFields.some(field =>
      field && typeof field.instruction === "string"
      && field.instruction.length > AI_COLLECT_INSTRUCTION_MAX_LENGTH,
    )) {
      issues.push(createCatalogIssue(
        "ai-collect-instruction-too-long",
        `提取指引不能超过 ${AI_COLLECT_INSTRUCTION_MAX_LENGTH} 字`,
      ));
    }
    if (typeof node.data.openingMessage === "string"
      && node.data.openingMessage.length > AI_COLLECT_OPENING_MESSAGE_MAX_LENGTH) {
      issues.push(createCatalogIssue(
        "ai-collect-opening-too-long",
        `开场白不能超过 ${AI_COLLECT_OPENING_MESSAGE_MAX_LENGTH} 字`,
      ));
    }
    if (!Number.isInteger(node.data.maxFollowUpCount)
      || node.data.maxFollowUpCount < 0
      || node.data.maxFollowUpCount > AI_COLLECT_MAX_FOLLOW_UP_COUNT) {
      issues.push(createCatalogIssue(
        "ai-collect-follow-up-count-invalid",
        `智能体辅助轮次需要为 0-${AI_COLLECT_MAX_FOLLOW_UP_COUNT} 轮`,
      ));
    }
    const timeout = normalizeAiCollectTimeout(node.data.timeout);
    if (maxFollowUpCount > 0
      && (!Number.isInteger(node.data.timeout?.duration)
        || node.data.timeout?.unit !== "minute" && node.data.timeout?.unit !== "hour"
        || node.data.timeout.duration < AI_COLLECT_TIMEOUT_MIN_BY_UNIT[timeout.unit]
        || node.data.timeout.duration > AI_COLLECT_TIMEOUT_MAX_BY_UNIT[timeout.unit])) {
      issues.push(createCatalogIssue("ai-collect-timeout-invalid", "最长等待时间需为 10 分钟至 24 小时"));
    }
    return issues;
  },
  visual: {
    accentClassName: "bg-emerald-600 text-white",
    accentRgb: "5 150 105",
    badge: "ai",
    icon: AiUserIcon,
    label: "资料收集",
  },
};
