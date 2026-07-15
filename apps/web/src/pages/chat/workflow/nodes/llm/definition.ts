import { AiMagicIcon } from "@hugeicons/core-free-icons";
import type { WorkflowNodeDefinition } from "../definition-types";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";

const baseLlmNodeDefinition = createStandardNodeDefinition({
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

export const llmNodeDefinition: WorkflowNodeDefinition<"llm"> = {
  ...baseLlmNodeDefinition,
  getOutputVariables: () => [{
    key: "text",
    label: "生成文本",
    type: "string",
    usages: ["variable", "message-content"],
  }],
};
