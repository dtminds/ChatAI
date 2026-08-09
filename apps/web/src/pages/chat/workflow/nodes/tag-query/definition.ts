import { UserSearch01Icon } from "@hugeicons/core-free-icons";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";

export const tagQueryNodeDefinition = createStandardNodeDefinition({
  accentClassName: "bg-teal-600 text-white ring-teal-600/20",
  accentRgb: "13 148 136",
  description: "查询客户当前标签供后续节点使用",
  icon: UserSearch01Icon,
  kind: "tag-query",
  label: "标签查询",
  metric: "待配置查询标签",
  paletteGroup: "data",
  sort: 70,
});
