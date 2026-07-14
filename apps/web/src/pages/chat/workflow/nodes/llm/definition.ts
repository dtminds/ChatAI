import { AiMagicIcon } from "@hugeicons/core-free-icons";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";

export const llmNodeDefinition = createStandardNodeDefinition({
  accentClassName: "bg-neutral-950 text-white ring-neutral-950/20",
  accentRgb: "10 10 10",
  badge: "ai",
  description: "调用大模型生成结构化结果",
  icon: AiMagicIcon,
  kind: "llm",
  label: "大模型",
  metric: "待配置模型任务",
  paletteGroup: "data",
  sort: 40,
});
