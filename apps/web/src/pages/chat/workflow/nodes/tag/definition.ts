import { TagsIcon } from "@hugeicons/core-free-icons";
import { createActionNodeDefinition } from "../action-definition-factory";

export const tagNodeDefinition = createActionNodeDefinition({
  accentClassName: "bg-emerald-600 text-white ring-emerald-600/20",
  accentRgb: "5 150 105",
  description: "为客户添加或移除标签",
  icon: TagsIcon,
  kind: "tag",
  label: "标签动作",
  metric: "待配置标签",
  sort: 40,
  summary: "配置客户标签变更",
});
