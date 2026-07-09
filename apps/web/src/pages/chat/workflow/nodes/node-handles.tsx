import { Handle, Position } from "@xyflow/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";

export function WorkflowTargetHandle() {
  return (
    <Handle
      className="workflow-node-handle workflow-node-handle-target"
      position={Position.Left}
      type="target"
    />
  );
}

export function WorkflowSourceHandle({
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
