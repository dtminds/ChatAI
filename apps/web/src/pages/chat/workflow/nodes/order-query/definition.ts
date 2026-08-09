import { PackageSearch01Icon } from "@hugeicons/core-free-icons";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";

export const orderQueryNodeDefinition = createStandardNodeDefinition({
  accentClassName: "bg-orange-600 text-white ring-orange-600/20",
  accentRgb: "234 88 12",
  description: "查询客户订单信息供后续节点使用",
  icon: PackageSearch01Icon,
  kind: "order-query",
  label: "订单查询",
  metric: "待配置查询范围",
  paletteGroup: "data",
  sort: 60,
});
