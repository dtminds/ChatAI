import { NodeFieldList } from "../node-field-list";
import type { NodeBodyProps } from "../types";
import { getWorkflowAudienceFilterMetric, normalizeWorkflowAudienceGroup } from "./config";

export function AudienceFilterNodeBody({ data }: NodeBodyProps<"audience-filter">) {
  const group = normalizeWorkflowAudienceGroup(data.group);

  return (
    <>
      <NodeFieldList
        fields={[
          {
            id: "group",
            label: "按人群包筛选",
            value: {
              kind: "text",
              text: getWorkflowAudienceFilterMetric(group),
            },
          },
        ]}
      />
      <span aria-label="筛选结果" className="mx-4 mb-3 grid gap-1.5">
        <span className="flex h-9 items-center rounded-lg bg-[var(--workflow-param-bg)] px-2.5 text-xs font-medium text-foreground">
          符合
        </span>
        <span className="flex h-9 items-center rounded-lg bg-[var(--workflow-param-bg)] px-2.5 text-xs font-medium text-foreground">
          不符合
        </span>
      </span>
    </>
  );
}
