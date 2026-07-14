import { UserSwitchIcon } from "@hugeicons/core-free-icons";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";

export const handoffNodeDefinition = createStandardNodeDefinition({
  accentClassName: "bg-slate-600 text-white ring-slate-600/20",
  accentRgb: "71 85 105",
  description: "将客户转交给人工或指定团队",
  icon: UserSwitchIcon,
  kind: "handoff",
  label: "转人工",
  metric: "待配置接管目标",
  paletteGroup: "message",
  sort: 110,
  summary: "配置人工接管规则",
});
