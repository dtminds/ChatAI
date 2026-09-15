import { MarketingIcon } from "@hugeicons/core-free-icons";
import {
  WORKFLOW_MARKETING_MESSAGE_WAIT_MIN_BY_UNIT,
  WORKFLOW_MARKETING_MESSAGE_WAIT_MAX_BY_UNIT,
} from "@chatai/contracts";
import type { WorkflowNodeDefinition } from "../definition-types";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";
import { getMarketingMessageMetric, isMarketingMessageWait, normalizeMarketingMessageWait, normalizeMarketingPlan } from "./config";

const base = createStandardNodeDefinition({
  accentClassName: "bg-cyan-600 text-white",
  accentRgb: "8 145 178",
  description: "使用企微官方群发接口、或短信群发通道批量进行营销触达",
  icon: MarketingIcon,
  kind: "marketing-message",
  label: "群发触达",
  metric: "未选择触达任务",
  paletteGroup: "message",
  sort: 105,
});

export const marketingMessageNodeDefinition: WorkflowNodeDefinition<"marketing-message"> = {
  ...base,
  createDefaultData: () => ({ ...base.createDefaultData(), status: "warning", wait: { mode: "none" } }),
  getOutputVariables: () => [{
    description: "设置等待时，到期后会自动查询并输出实际触达结果；未设置等待时，该值仅表示任务下发成功，不代表实际触达了用户",
    key: "pushSuccess",
    label: "触达结果",
    usages: ["variable"],
    valueType: { kind: "boolean" },
  }],
  sanitizeData: (data) => {
    const plan = normalizeMarketingPlan(data.plan);
    const wait = normalizeMarketingMessageWait(data.wait);
    const next = { ...data, wait, metric: getMarketingMessageMetric(plan), status: plan ? "ready" as const : "warning" as const };
    if (plan) next.plan = plan;
    else delete next.plan;
    return next;
  },
  validate: (node) => {
    const plan = normalizeMarketingPlan(node.data.plan);
    const wait = node.data.wait;
    const normalizedWait = normalizeMarketingMessageWait(wait);
    const waitValidationMessage = normalizedWait.mode === "fixed"
      ? `等待时长需为 ${WORKFLOW_MARKETING_MESSAGE_WAIT_MIN_BY_UNIT[normalizedWait.unit]}-${WORKFLOW_MARKETING_MESSAGE_WAIT_MAX_BY_UNIT[normalizedWait.unit]} ${normalizedWait.unit === "minute" ? "分钟" : "小时"}`
      : "等待策略配置异常";
    return [
      ...(!plan ? [{ code: "marketing-message-plan-required", message: "需选择触达任务", severity: "warning" as const, source: "config" as const }] : []),
      ...(!isMarketingMessageWait(wait)
        ? [{ code: "marketing-message-wait-invalid", message: waitValidationMessage, severity: "warning" as const, source: "config" as const }]
        : []),
    ];
  },
};
