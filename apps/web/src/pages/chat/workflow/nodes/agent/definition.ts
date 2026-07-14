import { AiChat02Icon } from "@hugeicons/core-free-icons";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";

export const agentNodeDefinition = createStandardNodeDefinition({
  accentClassName: "bg-cyan-600 text-white ring-cyan-600/20",
  accentRgb: "8 145 178",
  badge: "ai",
  description: "将客户会话交由指定 Agent 处理",
  icon: AiChat02Icon,
  kind: "agent",
  label: "转 Agent",
  metric: "待配置 Agent",
  paletteGroup: "message",
  sort: 120,
  summary: "配置接管客户会话的 Agent",
});
