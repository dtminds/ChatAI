import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { branchHandleOptions } from "../constants";
import type { NodeVisual } from "../node-definitions";
import type { MarketingNodeKind, MarketingNodeRenderData } from "../types";

export type NodeBodyProps = {
  data: MarketingNodeRenderData;
  visual: NodeVisual;
};

export const nodeBodyComponentMap: Record<MarketingNodeKind, ComponentType<NodeBodyProps>> = {
  action: StandardNodeBody,
  ai: StandardNodeBody,
  branch: BranchNodeBody,
  goal: StandardNodeBody,
  trigger: StandardNodeBody,
  wait: StandardNodeBody,
};

export function StandardNodeBody({ data, visual }: NodeBodyProps) {
  return (
    <span className="workflow-node-section">
      <span className="workflow-node-section-title">{visual.label}</span>
      <NodeStatusRow data={data} />
      <span className="workflow-node-param">
        <span>配置</span>
        <span className="workflow-node-param-value">{data.summary}</span>
      </span>
      <span className="workflow-node-param">
        <span>输出</span>
        <span className="workflow-node-param-value">{data.metric}</span>
      </span>
    </span>
  );
}

export function BranchNodeBody({ data, visual }: NodeBodyProps) {
  return (
    <>
      <span className="workflow-node-section workflow-branch-overview">
        <span className="workflow-node-section-title">{visual.label}</span>
        <NodeStatusRow data={data} />
      </span>
      <span className="workflow-branch-paths" aria-label="条件分支出口">
        {branchHandleOptions.map((branch) => (
          <span
            className="workflow-branch-path"
            data-testid={`workflow-branch-path-${branch.id}`}
            key={branch.id}
          >
            <span className="workflow-branch-path-heading">
              <span>{branch.title}</span>
              <span>{branch.operator}</span>
            </span>
            <span className="workflow-branch-path-rule">
              <span className="truncate">{branch.label}</span>
            </span>
          </span>
        ))}
      </span>
    </>
  );
}

function NodeStatusRow({ data }: { data: MarketingNodeRenderData }) {
  const isWarning = data.status === "warning";
  const isRunning = data.status === "running";

  return (
    <span className="workflow-node-param">
      <span>状态</span>
      <span
        className={cn(
          "workflow-node-param-value",
          isRunning && "text-emerald-700",
          isWarning && "text-amber-700",
        )}
      >
        {isRunning ? "Running" : isWarning ? "Missing config" : "Ready"}
      </span>
    </span>
  );
}
