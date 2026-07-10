import { useState } from "react";
import type { EdgeProps } from "@xyflow/react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  getBezierPath,
} from "@xyflow/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { getPaletteItemsByKinds, paletteItems } from "../node-definitions";
import type { WorkflowRenderEdge } from "../types";

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
  const menuOpen = Boolean(data?.insertMenuOpen);
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
  const candidatePaletteItems = data?.insertableNodeKinds
    ? getPaletteItemsByKinds(data.insertableNodeKinds)
    : paletteItems;

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
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
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
          {menuOpen ? (
            <div
              aria-label="从连线添加节点"
              className="workflow-edge-menu absolute left-1/2 top-[34px] z-40 w-[248px] -translate-x-1/2 rounded-xl border-[0.5px] border-[var(--workflow-border)] bg-[var(--workflow-panel-bg-blur)] p-1.5 shadow-[0_18px_44px_var(--shadow-medium)] backdrop-blur-[10px]"
              onClick={(event) => event.stopPropagation()}
              role="menu"
            >
              {candidatePaletteItems.map((item) => (
                <button
                  className="workflow-edge-menu-item flex w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2 py-[7px] text-left transition-colors hover:bg-muted"
                  key={item.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    data?.onInsertBetween?.(id, source, target, item.id);
                  }}
                  role="menuitem"
                  type="button"
                >
                  <span className="flex size-6 items-center justify-center rounded-md bg-[var(--workflow-soft)] text-muted-foreground">
                    <HugeiconsIcon icon={item.icon} size={14} strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-foreground">{item.label}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
