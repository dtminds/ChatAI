import { Megaphone02Icon } from "@hugeicons/core-free-icons";
import { WORKFLOW_MARKETING_MESSAGE_WAIT_MAX_BY_UNIT } from "@chatai/contracts";
import type { WorkflowNodeDefinition } from "../definition-types";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";
import { getMarketingMessageMetric, isMarketingMessageWait, normalizeMarketingMessageWait, normalizeMarketingPlan } from "./config";

const base = createStandardNodeDefinition({
  accentClassName: "bg-cyan-600 text-white",
  accentRgb: "8 145 178",
  description: "下发指定触达任务，等待固定时长后查询一次推送结果",
  icon: Megaphone02Icon,
  kind: "marketing-message",
  label: "群发触达",
  metric: "未选择触达任务",
  paletteGroup: "message",
  sort: 105,
});

export const marketingMessageNodeDefinition: WorkflowNodeDefinition<"marketing-message"> = {
  ...base,
  createDefaultData: () => ({ ...base.createDefaultData(), status: "warning", wait: { duration: 1, unit: "minute" } }),
  getOutputVariables: () => [{
    description: "等待结束后查询到的聚合推送结果",
    key: "pushSuccess",
    label: "推送成功",
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
    const maximum = WORKFLOW_MARKETING_MESSAGE_WAIT_MAX_BY_UNIT[normalizedWait.unit];
    return [
      ...(!plan ? [{ code: "marketing-message-plan-required", message: "需选择触达任务", severity: "warning" as const, source: "config" as const }] : []),
      ...(!isMarketingMessageWait(wait)
        ? [{ code: "marketing-message-wait-invalid", message: `等待时长需为 1-${maximum}`, severity: "warning" as const, source: "config" as const }]
        : []),
    ];
  },
};
