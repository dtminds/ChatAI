import { AiBrain04Icon } from "@hugeicons/core-free-icons";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";

export const aiIntentNodeDefinition = createStandardNodeDefinition({
  accentClassName: "bg-blue-600 text-white ring-blue-600/20",
  accentRgb: "37 99 235",
  badge: "ai",
  description: "使用 AI 判断客户意图并输出结果",
  icon: AiBrain04Icon,
  kind: "ai-intent",
  label: "意图识别",
  metric: "待配置意图范围",
  paletteGroup: "flow",
  sort: 30,
  summary: "配置需要识别的客户意图",
});
