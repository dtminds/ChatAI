import { TagsIcon } from "@hugeicons/core-free-icons";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";

export const tagNodeDefinition = createStandardNodeDefinition({
  accentClassName: "bg-emerald-500 text-white ring-emerald-500/20",
  accentRgb: "16 185 129",
  description: "为客户添加、移除或替换标签",
  icon: TagsIcon,
  kind: "tag",
  label: "客户打标",
  metric: "待配置标签",
  paletteGroup: "data",
  sort: 80,
});
