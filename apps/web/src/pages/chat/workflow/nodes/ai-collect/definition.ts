import { AiUserIcon } from "@hugeicons/core-free-icons";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";

export const aiCollectNodeDefinition = createStandardNodeDefinition({
  accentClassName: "bg-emerald-600 text-white ring-emerald-600/20",
  accentRgb: "5 150 105",
  badge: "ai",
  description: "通过 AI 对话收集客户资料",
  icon: AiUserIcon,
  kind: "ai-collect",
  label: "资料收集",
  metric: "待配置收集字段",
  paletteGroup: "data",
  sort: 50,
});
