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
import { paletteItems } from "../node-definitions";
import type { MarketingWorkflowRenderEdge } from "../types";

export function MarketingBezierEdge({
  data,
  id,
  selected,
  source,
  sourceX,
  sourceY,
  target,
  targetX,
  targetY,
}: EdgeProps<MarketingWorkflowRenderEdge>) {
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
          className={cn("workflow-edge-action nodrag nopan", isActionVisible && "workflow-edge-action-visible")}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          <button
            aria-expanded={menuOpen}
            aria-label={data?.label ? `在${data.label}连线上添加节点` : "在连线上添加节点"}
            className="workflow-edge-add"
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
              className="workflow-edge-menu"
              onClick={(event) => event.stopPropagation()}
              role="menu"
            >
              {paletteItems.map((item) => (
                <button
                  className="workflow-edge-menu-item"
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
