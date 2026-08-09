import { useRef, useState } from "react";
import type { EdgeProps } from "@xyflow/react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  getBezierPath,
} from "@xyflow/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { WorkflowRenderEdge } from "../types";
import { WorkflowNodePicker } from "./workflow-palette";

export function WorkflowBezierEdge({
  data,
  id,
  selected,
  source,
  sourceX,
  sourceY,
  target,
  targetX,
  targetY,
}: EdgeProps<WorkflowRenderEdge>) {
  const [isHovered, setIsHovered] = useState(false);
  const actionRef = useRef<HTMLDivElement | null>(null);
  const menuOpen = Boolean(data?.insertMenuOpen);
  const portalContainer = actionRef.current?.closest<HTMLElement>(".agent-workflow-canvas");
  const [edgePath, labelX, labelY] = getBezierPath({
    curvature: 0.16,
    sourcePosition: Position.Right,
    sourceX: sourceX - 8,
    sourceY,
    targetPosition: Position.Left,
    targetX: targetX + 8,
    targetY,
  });
  const isActionVisible = selected || isHovered || menuOpen;
  const isConnectedHighlight = data?.highlightState === "connected";
  const isDimmed = data?.highlightState === "dimmed";
  const stroke = selected || isConnectedHighlight ? "var(--workflow-blue)" : "var(--workflow-edge)";
  return (
    <>
      <BaseEdge
        id={id}
        interactionWidth={24}
        path={edgePath}
        style={{
          opacity: selected || isConnectedHighlight ? 1 : isDimmed ? 0.32 : 0.72,
          stroke,
          strokeWidth: selected || isConnectedHighlight ? 2.5 : 2,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className={cn(
            "workflow-edge-action nodrag nopan group/edge absolute z-[35] flex items-center p-2.5 opacity-0 transition-opacity pointer-events-auto",
            isActionVisible && "workflow-edge-action-visible opacity-100",
          )}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          ref={actionRef}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          <Popover
            modal={false}
            onOpenChange={(open) => {
              if (!open && menuOpen) data?.onToggleInsertMenu?.(id, false);
            }}
            open={menuOpen}
          >
            <PopoverAnchor asChild>
              <button
                aria-expanded={menuOpen}
                aria-label={data?.label ? `在${data.label}连线上添加节点` : "在连线上添加节点"}
                className={cn(
                  "workflow-edge-add flex size-5 items-center justify-center rounded-full border-[0.5px] border-primary/30 bg-[var(--workflow-panel-bg)] text-primary shadow-[0_8px_18px_var(--shadow-soft)] transition-[background,color,transform,box-shadow] hover:bg-primary hover:text-primary-foreground hover:shadow-[0_10px_24px_var(--shadow-medium)] group-hover/edge:scale-[1.08]",
                  menuOpen && "scale-[1.08] bg-primary text-primary-foreground shadow-[0_10px_24px_var(--shadow-medium)]",
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  data?.onToggleInsertMenu?.(id);
                }}
                type="button"
              >
                <HugeiconsIcon icon={Add01Icon} size={12} strokeWidth={1.8} />
              </button>
            </PopoverAnchor>
            <PopoverContent
              align="center"
              className="w-auto border-0 bg-transparent p-0 shadow-none"
              onOpenAutoFocus={(event) => event.preventDefault()}
              portalContainer={portalContainer}
              side="bottom"
              sideOffset={4}
            >
              <WorkflowNodePicker
                className="workflow-edge-menu w-[360px]"
                kinds={data?.insertableNodeKinds}
                onAddNode={(kind) => {
                  data?.onInsertBetween?.(id, source, target, kind);
                }}
                role="menu"
              />
            </PopoverContent>
          </Popover>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
