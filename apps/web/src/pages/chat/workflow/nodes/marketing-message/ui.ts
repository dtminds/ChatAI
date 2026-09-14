import type { WorkflowNodeUiBinding } from "../ui-types";
import { normalizeMarketingMessageWait, normalizeMarketingPlan } from "./config";
import { MarketingMessageConfig } from "./panel";

export const marketingMessageNodeUi: WorkflowNodeUiBinding<"marketing-message"> = {
  body: {
    getFields: data => {
      const plan = normalizeMarketingPlan(data.plan);
      const wait = normalizeMarketingMessageWait(data.wait);
      return [
        { id: "plan", label: "触达任务", value: plan ? { kind: "text", text: plan.planName } : { kind: "empty" } },
        { id: "wait", label: "等待策略", value: { kind: "text", text: wait.mode === "none" ? "下发后立即执行" : `${wait.duration} ${wait.unit === "minute" ? "分钟" : "小时"}后执行后续节点` } },
      ];
    },
    kind: "fields",
  },
  settings: { component: MarketingMessageConfig, kind: "custom" },
};
