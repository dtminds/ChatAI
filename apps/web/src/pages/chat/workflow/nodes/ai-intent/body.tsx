import { NodeFieldList } from "../node-field-list";
import type { NodeBodyProps } from "../types";
import {
  normalizeAiIntentInputSelector,
  normalizeAiIntentOptions,
} from "./config";
import {
  getWorkflowVariableDisplayLabel,
  resolveWorkflowVariable,
} from "../../workflow-variables";
import { cn } from "@/lib/utils";

export function AiIntentNodeBody({ data }: NodeBodyProps<"ai-intent">) {
  const selector = normalizeAiIntentInputSelector(data.inputSelector);
  const selectedInput = selector
    ? resolveWorkflowVariable(data.availableIntentInputs ?? [], selector)
    : undefined;
  const intents = normalizeAiIntentOptions(data.intents);

  return (
    <>
      <NodeFieldList
        fields={[
          {
            id: "input",
            label: "输入",
            value: selectedInput
              ? { kind: "text", text: getWorkflowVariableDisplayLabel(selectedInput) }
              : { kind: "empty" },
          },
        ]}
      />
      <span aria-label="意图识别出口" className="mx-4 mb-3 grid gap-1.5">
        {intents.map((intent) => (
          <span
            className="flex h-9 min-w-0 items-center rounded-lg bg-[var(--workflow-param-bg)] px-2.5 text-xs font-medium text-foreground"
            key={intent.id}
            title={intent.description || undefined}
          >
            <span className={cn(
              "truncate",
              !intent.description.trim() && "text-muted-foreground",
            )}>
              {intent.description || "未配置意图"}
            </span>
          </span>
        ))}
        <span className="flex h-9 items-center rounded-lg bg-[var(--workflow-param-bg)] px-2.5 text-xs font-medium text-foreground">
          其他意图
        </span>
      </span>
    </>
  );
}
