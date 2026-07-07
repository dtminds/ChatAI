import { useState } from "react";
import type { ComponentType } from "react";
import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { MoreHorizontalIcon, Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { branchHandleOptions } from "../constants";
import { getBranchHandleTop } from "../layout";
import { nodeVisuals } from "../node-definitions";
import type { MarketingNodeKind, MarketingNodeRenderData, MarketingWorkflowRenderNode } from "../types";

type NodeBodyProps = {
  data: MarketingNodeRenderData;
  visual: typeof nodeVisuals[MarketingNodeKind];
};

const nodeBodyMap: Record<MarketingNodeKind, ComponentType<NodeBodyProps>> = {
  action: StandardNodeBody,
  ai: StandardNodeBody,
  branch: BranchNodeBody,
  goal: StandardNodeBody,
  trigger: StandardNodeBody,
  wait: StandardNodeBody,
};

export function MarketingNodeCard({ data, id }: NodeProps<MarketingWorkflowRenderNode>) {
  const visual = nodeVisuals[data.kind];
  const isSelected = Boolean(data.selected);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const NodeBody = nodeBodyMap[data.kind];

  return (
    <div
      className={cn(
        "workflow-node-shell",
        isSelected && "workflow-node-shell-selected",
      )}
    >
      <div
        className={cn(
          "workflow-node-card group",
          data.kind === "branch" && "workflow-node-card-branch",
        )}
      >
        {data.kind !== "trigger" ? (
          <Handle
            className="workflow-node-handle workflow-node-handle-target"
            position={Position.Left}
            type="target"
          />
        ) : null}
        <NodeActionMenu
          actionMenuOpen={actionMenuOpen}
          data={data}
          id={id}
          setActionMenuOpen={setActionMenuOpen}
        />
        <button
          aria-label={`${data.title} ${data.summary}`}
          className="workflow-node-select"
          onClick={() => data.onSelect?.(id)}
          type="button"
        >
          <span className="flex items-center rounded-t-2xl px-3 pb-2 pr-10 pt-3">
            <span
              className={cn(
                "mr-2 flex size-7 shrink-0 items-center justify-center rounded-lg ring-1",
                visual.accentClassName,
              )}
            >
              <HugeiconsIcon icon={visual.icon} size={15} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[13px] font-semibold text-foreground">{data.title}</span>
              </span>
            </span>
          </span>

          <NodeBody data={data} visual={visual} />
        </button>
        {data.kind === "branch" ? (
          <>
            {branchHandleOptions.map((branch) => (
              <WorkflowSourceHandle
                className="workflow-branch-path-handle"
                handleId={branch.id}
                insertMenuOpen={
                  data.insertMenuOpen
                  && (data.insertMenuSourceHandle ?? branchHandleOptions[0].id) === branch.id
                }
                key={branch.id}
                label={branch.label}
                nodeId={id}
                onToggleInsertMenu={data.onToggleInsertMenu}
                showInsertAction
                title={data.title}
                top={getBranchHandleTop(branch.id)}
              />
            ))}
          </>
        ) : data.kind !== "goal" ? (
          <WorkflowSourceHandle
            insertMenuOpen={data.insertMenuOpen}
            nodeId={id}
            onToggleInsertMenu={data.onToggleInsertMenu}
            showInsertAction
            title={data.title}
            top={16}
          />
        ) : null}
      </div>
    </div>
  );
}

function NodeActionMenu({
  actionMenuOpen,
  data,
  id,
  setActionMenuOpen,
}: {
  actionMenuOpen: boolean;
  data: MarketingNodeRenderData;
  id: string;
  setActionMenuOpen: (open: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "workflow-node-actionbar nodrag nopan",
        (data.selected || actionMenuOpen) && "workflow-node-actionbar-visible",
      )}
    >
      <DropdownMenu modal={false} open={actionMenuOpen} onOpenChange={setActionMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`更多操作：${data.title}`}
            className="workflow-node-actionbar-button"
            onClick={(event) => event.stopPropagation()}
            type="button"
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} size={14} strokeWidth={1.8} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[132px]" side="bottom">
          <DropdownMenuItem
            onClick={(event) => {
              event.stopPropagation();
              data.onSelect?.(id);
              setActionMenuOpen(false);
            }}
          >
            打开配置
          </DropdownMenuItem>
          {data.kind !== "goal" ? (
            <DropdownMenuItem
              onClick={(event) => {
                event.stopPropagation();
                data.onToggleInsertMenu?.(
                  id,
                  data.kind === "branch" ? branchHandleOptions[0].id : undefined,
                );
                setActionMenuOpen(false);
              }}
            >
              添加后续节点
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function StandardNodeBody({ data, visual }: NodeBodyProps) {
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

function BranchNodeBody({ data, visual }: NodeBodyProps) {
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

function WorkflowSourceHandle({
  className,
  handleId,
  insertMenuOpen,
  label,
  nodeId,
  onToggleInsertMenu,
  showInsertAction,
  title,
  top,
}: {
  className?: string;
  handleId?: string;
  insertMenuOpen?: boolean;
  label?: string;
  nodeId: string;
  onToggleInsertMenu?: (nodeId: string, sourceHandle?: string) => void;
  showInsertAction: boolean;
  title: string;
  top?: number;
}) {
  return (
    <Handle
      className={cn(
        "workflow-node-handle workflow-node-handle-source",
        !showInsertAction && "workflow-node-handle-source-branch",
        className,
      )}
      id={handleId}
      position={Position.Right}
      style={top === undefined ? undefined : { top }}
      type="source"
    >
      <div className="workflow-node-handle-tip">
        <div className="workflow-node-handle-tip-body">
          {label ? <div className="whitespace-nowrap">{label}</div> : null}
          {showInsertAction ? (
            <>
              <div className="whitespace-nowrap">
                <span className="workflow-node-handle-tip-title">点击</span>
                添加节点
              </div>
              <div className="whitespace-nowrap">
                <span className="workflow-node-handle-tip-title">拖拽</span>
                连接节点
              </div>
            </>
          ) : (
            <div className="whitespace-nowrap">
              <span className="workflow-node-handle-tip-title">拖拽</span>
              连接节点
            </div>
          )}
        </div>
      </div>
      {showInsertAction ? (
        <button
          aria-label={label ? `在${title}的${label}分支后添加节点` : `在${title}后添加节点`}
          className={cn(
            "workflow-node-insert nodrag nopan",
            insertMenuOpen && "workflow-node-insert-visible",
          )}
          onClick={(event) => {
            event.stopPropagation();
            onToggleInsertMenu?.(nodeId, handleId);
          }}
          type="button"
        >
          <HugeiconsIcon icon={Add01Icon} size={10} strokeWidth={2.4} />
        </button>
      ) : null}
    </Handle>
  );
}
