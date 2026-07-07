import { Cancel01Icon, FlowConnectionIcon, PlayIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { paletteItems } from "../node-definitions";
import type { MarketingNodeKind } from "../types";

export function WorkflowPalette({
  onClose,
  onAddNode,
  onSearchChange,
  searchValue,
}: {
  onClose?: () => void;
  onAddNode: (kind: MarketingNodeKind) => void;
  onSearchChange: (value: string) => void;
  searchValue: string;
}) {
  const normalizedQuery = searchValue.trim().toLowerCase();
  const visiblePaletteItems = paletteItems.filter((item) => {
    if (!normalizedQuery) {
      return true;
    }

    return `${item.label} ${item.description}`.toLowerCase().includes(normalizedQuery);
  });

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
            {visiblePaletteItems.length}
          </Badge>
        </div>

        <div className="mb-3 rounded-xl border border-[var(--workflow-border)] bg-[var(--workflow-soft)] p-2">
          <div className="flex items-center gap-2 px-1 py-0.5">
            <span className="flex size-6 items-center justify-center rounded-lg bg-background text-primary shadow-xs">
              <HugeiconsIcon icon={FlowConnectionIcon} size={14} strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-xs font-medium">新人转化</div>
              <div className="truncate text-[11px] text-muted-foreground">124.8 万进入 · 18.4% 目标</div>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          {visiblePaletteItems.map((item) => (
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
          {visiblePaletteItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--workflow-border)] bg-card px-3 py-6 text-center text-xs text-muted-foreground">
              未找到匹配节点
            </div>
          ) : null}
        </div>
      </section>

      <section className="workflow-palette-preview border-t border-[var(--workflow-border)] p-2">
        <div className="rounded-xl border border-[var(--workflow-border)] bg-[var(--workflow-panel-section)] p-2 shadow-xs">
          <div className="flex items-center gap-2 px-0.5 text-xs font-medium">
            <HugeiconsIcon icon={PlayIcon} size={15} strokeWidth={1.8} />
            <span>Run preview</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[11px]">
            <MetricPill label="进入" value="124.8万" />
            <MetricPill label="触达" value="83.6%" />
            <MetricPill label="转化" value="18.4%" />
          </div>
        </div>
      </section>
    </aside>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--workflow-soft)] px-1.5 py-1.5">
      <div className="font-semibold text-foreground">{value}</div>
      <div className="mt-0.5 text-muted-foreground">{label}</div>
    </div>
  );
}
