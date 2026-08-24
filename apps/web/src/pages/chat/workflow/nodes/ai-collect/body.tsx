import { NodeFieldList } from "../node-field-list";
import type { NodeBodyProps } from "../types";
import {
  normalizeAiCollectFields,
  normalizeAiCollectMaxFollowUpCount,
} from "./config";

export function AiCollectNodeBody({ data }: NodeBodyProps<"ai-collect">) {
  const fields = normalizeAiCollectFields(data.fields);
  const hasConfiguredField = fields.some(field => field.name.trim());
  const maxFollowUpCount = normalizeAiCollectMaxFollowUpCount(data.maxFollowUpCount);
  return (
    <>
      <NodeFieldList
        fields={[
          {
            id: "follow-up",
            label: "追问",
            value: {
              kind: "text",
              text: maxFollowUpCount === 0 ? "不追问" : `最多 ${maxFollowUpCount} 轮`,
            },
          },
          {
            id: "fields",
            label: "字段",
            value: hasConfiguredField
              ? {
                  items: fields.map(field => ({
                    text: field.name.trim() || "未配置",
                    tone: field.name.trim() && field.instruction.trim() ? "default" : "warning",
                  })),
                  kind: "tags",
                  singleLine: true,
                }
              : { kind: "empty" },
          },
        ]}
      />
      <span aria-label="资料收集出口" className="mx-4 mb-3 grid gap-1.5">
        <span className="flex h-9 items-center rounded-lg bg-[var(--workflow-param-bg)] px-2.5 text-xs font-medium text-foreground">
          已完成
        </span>
        <span className="flex h-9 items-center rounded-lg bg-[var(--workflow-param-bg)] px-2.5 text-xs font-medium text-foreground">
          未完成
        </span>
      </span>
    </>
  );
}
