import { NodeFieldList } from "../node-field-list";
import type { NodeBodyProps } from "../types";
import {
  aiCollectFieldTypeLabels,
  normalizeAiCollectFields,
  normalizeAiCollectMode,
} from "./config";

export function AiCollectNodeBody({ data }: NodeBodyProps<"ai-collect">) {
  const fields = normalizeAiCollectFields(data.fields);
  return (
    <NodeFieldList
      fields={[
        {
          id: "mode",
          label: "模式",
          value: {
            kind: "text",
            text: normalizeAiCollectMode(data.mode) === "extract-once" ? "单次提取" : "智能收集",
          },
        },
        {
          id: "fields",
          label: "字段",
          value: {
            items: fields.map(field => ({
              text: field.name.trim()
                ? `${field.name.trim()} · ${aiCollectFieldTypeLabels[field.type]}`
                : "未配置",
              tone: field.name.trim() && field.instruction.trim() ? "default" : "warning",
            })),
            kind: "tags",
            singleLine: true,
          },
        },
      ]}
    />
  );
}
