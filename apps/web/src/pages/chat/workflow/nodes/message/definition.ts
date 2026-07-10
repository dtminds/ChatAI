import { Message01Icon } from "@hugeicons/core-free-icons";
import { createActionNodeDefinition } from "../action-definition-factory";

export const messageNodeDefinition = createActionNodeDefinition({
  accentClassName: "bg-sky-600 text-white ring-sky-600/20",
  accentRgb: "2 132 199",
  description: "向客户发送营销消息",
  icon: Message01Icon,
  kind: "message",
  label: "发送消息",
  metric: "待配置消息内容",
  sort: 30,
  summary: "配置客户触达消息",
});
