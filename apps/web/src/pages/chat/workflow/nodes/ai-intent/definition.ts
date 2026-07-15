import { AiBrain04Icon } from "@hugeicons/core-free-icons";
import type { WorkflowNodeDefinition } from "../definition-types";
import {
  createCatalogIssue,
  createDefaultTargetHandles,
  createNodeData,
  pickDefinedWorkflowConfig,
  sourceNodeKinds,
  targetNodeKinds,
} from "../definition-shared";
import {
  AI_INTENT_DESCRIPTION_MAX_LENGTH,
  AI_INTENT_FALLBACK_HANDLE_ID,
  AI_INTENT_MAX_COUNT,
  AI_INTENT_MIN_COUNT,
  AI_INTENT_PROMPT_MAX_LENGTH,
  createWorkflowIntentOption,
  getAiIntentEstimatedHeight,
  getAiIntentHandleId,
  getAiIntentHandleLabel,
  getAiIntentHandleTop,
  getAiIntentMetric,
  getAiIntentStatus,
  normalizeAiIntentAdvancedEnabled,
  normalizeAiIntentInputSelector,
  normalizeAiIntentOptions,
  normalizeAiIntentPrompt,
} from "./config";

export const aiIntentNodeDefinition: WorkflowNodeDefinition<"ai-intent"> = {
  availableNextKinds: targetNodeKinds,
  availablePrevKinds: sourceNodeKinds,
  canDelete: true,
  canDuplicate: true,
  canInsertAfter: true,
  canRename: true,
  configSections: [],
  createDefaultData: () => createNodeData("ai-intent", 1, {
    advancedEnabled: false,
    inputSelector: undefined,
    intents: [createWorkflowIntentOption()],
    label: "意图识别",
    metric: "待配置意图识别",
    prompt: "",
    status: "warning",
    title: "意图识别",
  }),
  createExecutionConfig: (data) => pickDefinedWorkflowConfig({
    fallback: { id: AI_INTENT_FALLBACK_HANDLE_ID },
    inputSelector: normalizeAiIntentInputSelector(data.inputSelector),
    intents: normalizeAiIntentOptions(data.intents).map((intent, index) => ({
      ...intent,
      modelCode: `I${index + 1}`,
    })),
    prompt: normalizeAiIntentAdvancedEnabled(data.advancedEnabled)
      ? normalizeAiIntentPrompt(data.prompt)
      : undefined,
  }),
  description: "使用 AI 将前序消息匹配到预设意图",
  getEstimatedHeight: getAiIntentEstimatedHeight,
  getOutputVariables: () => [
    {
      key: "matchedIntentId",
      label: "命中意图 ID",
      type: "string",
      usages: ["variable"],
    },
    {
      key: "matchedIntentDescription",
      label: "命中意图描述",
      type: "string",
      usages: ["variable"],
    },
    {
      key: "reason",
      label: "判断原因",
      type: "string",
      usages: ["variable"],
    },
  ],
  getSourceHandles: (data) => {
    const intentHandles = normalizeAiIntentOptions(data.intents).map((intent, index) => ({
      id: getAiIntentHandleId(intent.id),
      label: getAiIntentHandleLabel(intent.description),
      outletKind: "outcome" as const,
      top: getAiIntentHandleTop(index),
    }));

    return [
      ...intentHandles,
      {
        id: AI_INTENT_FALLBACK_HANDLE_ID,
        label: "其他意图",
        outletKind: "outcome" as const,
        top: getAiIntentHandleTop(intentHandles.length),
      },
    ];
  },
  getTargetHandles: createDefaultTargetHandles,
  insertable: true,
  kind: "ai-intent",
  layout: {
    estimatedHeight: 180,
    width: 320,
  },
  paletteGroup: "flow",
  paletteLabel: "意图识别",
  sanitizeData: (data) => {
    const nextData = {
      ...data,
      advancedEnabled: normalizeAiIntentAdvancedEnabled(data.advancedEnabled),
      inputSelector: normalizeAiIntentInputSelector(data.inputSelector),
      intents: normalizeAiIntentOptions(data.intents),
      prompt: normalizeAiIntentPrompt(data.prompt),
    };

    return {
      ...nextData,
      metric: getAiIntentMetric(nextData),
      status: getAiIntentStatus(nextData),
    };
  },
  schemaVersion: 1,
  sort: 30,
  validate: (node) => {
    const issues = [];
    const intents = normalizeAiIntentOptions(node.data.intents);
    const descriptions = intents.map((intent) => intent.description.trim());
    const rawIntents = Array.isArray(node.data.intents) ? node.data.intents : [];

    if (!normalizeAiIntentInputSelector(node.data.inputSelector)) {
      issues.push(createCatalogIssue("ai-intent-input-required", "意图识别需要选择输入"));
    }
    if (rawIntents.length < AI_INTENT_MIN_COUNT || rawIntents.length > AI_INTENT_MAX_COUNT) {
      issues.push(createCatalogIssue(
        "ai-intent-count-invalid",
        `意图数量需要为 ${AI_INTENT_MIN_COUNT}-${AI_INTENT_MAX_COUNT} 个`,
      ));
    }
    if (descriptions.some((description) => !description)) {
      issues.push(createCatalogIssue("ai-intent-description-required", "意图描述不能为空"));
    }
    if (rawIntents.some((intent) =>
      intent && typeof intent.description === "string"
      && intent.description.length > AI_INTENT_DESCRIPTION_MAX_LENGTH,
    )) {
      issues.push(createCatalogIssue(
        "ai-intent-description-too-long",
        `意图描述不能超过 ${AI_INTENT_DESCRIPTION_MAX_LENGTH} 字`,
      ));
    }
    if (new Set(descriptions).size !== descriptions.length) {
      issues.push(createCatalogIssue("ai-intent-description-duplicate", "意图描述不能重复"));
    }
    if (
      normalizeAiIntentAdvancedEnabled(node.data.advancedEnabled)
      &&
      typeof node.data.prompt === "string"
      && node.data.prompt.length > AI_INTENT_PROMPT_MAX_LENGTH
    ) {
      issues.push(createCatalogIssue(
        "ai-intent-prompt-too-long",
        `提示词不能超过 ${AI_INTENT_PROMPT_MAX_LENGTH} 字`,
      ));
    }

    return issues;
  },
  visual: {
    accentClassName: "bg-blue-600 text-white ring-blue-600/20",
    accentRgb: "37 99 235",
    badge: "ai",
    icon: AiBrain04Icon,
    label: "意图识别",
  },
};
