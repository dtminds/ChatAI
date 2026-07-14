import { UserEdit01Icon } from "@hugeicons/core-free-icons";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";

export const customerUpdateNodeDefinition = createStandardNodeDefinition({
  accentClassName: "bg-blue-600 text-white ring-blue-600/20",
  accentRgb: "37 99 235",
  description: "更新客户资料字段",
  icon: UserEdit01Icon,
  kind: "customer-update",
  label: "修改客户资料",
  metric: "待配置资料字段",
  paletteGroup: "data",
  sort: 90,
  summary: "配置需要修改的客户资料",
});
