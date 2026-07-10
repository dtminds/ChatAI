import { UserSwitchIcon } from "@hugeicons/core-free-icons";
import { createActionNodeDefinition } from "../action-definition-factory";

export const handoffNodeDefinition = createActionNodeDefinition({
  accentClassName: "bg-violet-600 text-white ring-violet-600/20",
  accentRgb: "124 58 237",
  description: "将客户转交给人工或指定团队",
  icon: UserSwitchIcon,
  kind: "handoff",
  label: "转人工",
  metric: "待配置接管目标",
  sort: 60,
  summary: "配置人工接管规则",
});
