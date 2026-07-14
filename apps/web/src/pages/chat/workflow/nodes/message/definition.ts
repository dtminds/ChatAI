import { Message01Icon } from "@hugeicons/core-free-icons";
import type { WorkflowNodeDefinition } from "../definition-types";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";
import { normalizeMessageContent } from "./content";

const baseMessageNodeDefinition = createStandardNodeDefinition({
  accentClassName: "bg-sky-500 text-white ring-sky-500/20",
  accentRgb: "14 165 233",
  description: "向客户发送营销消息",
  icon: Message01Icon,
  kind: "message",
  label: "消息发送",
  metric: "待配置消息内容",
  paletteGroup: "message",
  sort: 100,
  summary: "配置客户触达消息",
});

export const messageNodeDefinition: WorkflowNodeDefinition<"message"> = {
  ...baseMessageNodeDefinition,
  createDefaultData: () => ({
    ...baseMessageNodeDefinition.createDefaultData(),
    content: [],
  }),
  createExecutionConfig: (data) => ({
    content: normalizeMessageContent(data.content),
  }),
  sanitizeData: (data) => ({
    ...data,
    content: normalizeMessageContent(data.content),
  }),
};
