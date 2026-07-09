import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { getWorkflowPaletteItemGroups } from "../node-definitions";
import type { WorkflowNodeKind } from "../types";

export function WorkflowPalette({
  onClose,
  onAddNode,
  onSearchChange,
  searchValue,
}: {
  onClose?: () => void;
  onAddNode: (kind: WorkflowNodeKind) => void;
  onSearchChange: (value: string) => void;
  searchValue: string;
}) {
  const paletteGroups = getWorkflowPaletteItemGroups({ query: searchValue });
  const visibleItemCount = paletteGroups.reduce((count, group) => count + group.items.length, 0);

  return (
    <aside
      aria-label="节点库"
      className="workflow-sidebar workflow-floating-palette flex min-h-0 flex-col bg-background"
      role="region"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--workflow-border)] px-3 py-2.5">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold">Blocks</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">选择节点加入当前流程</p>
        </div>
        {onClose ? (
          <button
            aria-label="关闭节点库"
            className="workflow-floating-palette-close"
            onClick={onClose}
            type="button"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.8} />
          </button>
        ) : null}
      </div>
      <div className="border-b border-[var(--workflow-border)] px-3 py-3">
        <div className="relative">
          <HugeiconsIcon
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            icon={Search01Icon}
            size={15}
            strokeWidth={1.8}
          />
          <Input
            aria-label="搜索节点"
            className="h-8 rounded-lg border-[var(--workflow-border)] bg-[var(--workflow-soft)] pl-8 text-xs shadow-none"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索节点"
            value={searchValue}
          />
        </div>
      </div>

      <section className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <h3 className="text-xs font-semibold text-muted-foreground">节点</h3>
          <Badge className="h-5 rounded-md px-1.5 text-[11px]" variant="secondary">
            {visibleItemCount}
          </Badge>
        </div>

        <div className="space-y-3">
          {paletteGroups.map((group) => (
            <div key={group.id}>
              <div className="mb-1 px-2 text-[11px] font-medium text-muted-foreground">{group.label}</div>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <button
                    aria-label={`添加 ${item.label}节点`}
                    className="group flex h-10 w-full items-center gap-2 rounded-lg px-2 text-left transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
                    key={item.id}
                    onClick={() => {
                      onAddNode(item.id);
                      onClose?.();
                    }}
                    type="button"
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[var(--workflow-soft)] text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                      <HugeiconsIcon icon={item.icon} size={15} strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{item.label}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {item.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {visibleItemCount === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--workflow-border)] bg-card px-3 py-6 text-center text-xs text-muted-foreground">
              未找到匹配节点
            </div>
          ) : null}
        </div>
      </section>
    </aside>
  );
}
