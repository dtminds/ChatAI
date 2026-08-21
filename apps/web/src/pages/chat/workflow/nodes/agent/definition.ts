import { BubbleChatSparkIcon } from "@hugeicons/core-free-icons";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";

export const agentNodeDefinition = createStandardNodeDefinition({
  accentClassName: "bg-neutral-950 text-white",
  accentRgb: "10 10 10",
  badge: "ai",
  description: "将客户会话交由指定 Agent 处理",
  icon: BubbleChatSparkIcon,
  kind: "agent",
  label: "转 Agent",
  metric: "待配置 Agent",
  paletteGroup: "message",
  sort: 120,
});
