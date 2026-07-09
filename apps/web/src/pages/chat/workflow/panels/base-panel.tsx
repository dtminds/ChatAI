import type { ReactNode } from "react";
import {
  Cancel01Icon,
  MoreHorizontalIcon,
  PlayIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { nodeVisuals } from "../node-definitions";
import type {
  InspectorTab,
  WorkflowNode,
} from "../types";

export function BasePanel({
  activeTab,
  children,
  node,
  onClose,
  onRunNode,
  onTabChange,
}: {
  activeTab: InspectorTab;
  children: ReactNode;
  node: WorkflowNode;
  onClose: () => void;
  onRunNode: () => void;
  onTabChange: (tab: InspectorTab) => void;
}) {
  return (
    <aside
      aria-label="节点配置"
      className="workflow-config-panel absolute bottom-1 right-1 top-[5.75rem] z-20 flex w-[26.25rem] min-h-0 flex-col rounded-2xl border-[0.5px] border-[var(--workflow-border)] bg-[var(--workflow-panel-bg-blur)] shadow-[0_18px_44px_rgba(15,23,42,0.14)] backdrop-blur-[10px] max-xl:w-[23.5rem] max-lg:relative max-lg:inset-auto max-lg:min-h-[280px] max-lg:w-full max-lg:rounded-none max-lg:border-x-0"
      role="complementary"
    >
      <PanelHeader
        activeTab={activeTab}
        node={node}
        onClose={onClose}
        onRunNode={onRunNode}
        onTabChange={onTabChange}
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">{children}</div>
    </aside>
  );
}

function PanelHeader({
  activeTab,
  node,
  onClose,
  onRunNode,
  onTabChange,
}: {
  activeTab: InspectorTab;
  node: WorkflowNode;
  onClose: () => void;
  onRunNode: () => void;
  onTabChange: (tab: InspectorTab) => void;
}) {
  const visual = nodeVisuals[node.data.kind];

  return (
    <div className="border-b border-[var(--workflow-border)] p-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl ring-1",
            visual.accentClassName,
          )}
        >
          <HugeiconsIcon icon={visual.icon} size={17} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold">{node.data.title}</h2>
            <Badge className="h-5 rounded-md px-1.5 text-[11px]" variant="secondary">
              {visual.label}
            </Badge>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{node.data.summary}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            aria-label="运行当前节点"
            className="size-8 rounded-lg p-0"
            onClick={onRunNode}
            type="button"
            variant="outline"
          >
            <HugeiconsIcon icon={PlayIcon} size={15} strokeWidth={1.8} />
          </Button>
          <Button aria-label="更多节点操作" className="size-8 rounded-lg p-0" type="button" variant="ghost">
            <HugeiconsIcon icon={MoreHorizontalIcon} size={15} strokeWidth={1.8} />
          </Button>
          <Button
            aria-label="关闭节点配置"
            className="size-8 rounded-lg p-0"
            onClick={onClose}
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={15} strokeWidth={1.8} />
          </Button>
        </div>
      </div>
      <Tabs
        className="mt-4 gap-0"
        onValueChange={(value) => {
          if (value) {
            onTabChange(value as InspectorTab);
          }
        }}
        value={activeTab}
      >
        <TabsList aria-label="节点配置视图" className="h-9 w-full rounded-[10px]">
          <TabsTrigger className="h-7 flex-1 rounded-[8px] px-3 py-0 text-xs" value="settings">
            设置
          </TabsTrigger>
          <TabsTrigger className="h-7 flex-1 rounded-[8px] px-3 py-0 text-xs" value="run">
            上次运行
          </TabsTrigger>
          <TabsTrigger className="h-7 flex-1 rounded-[8px] px-3 py-0 text-xs" value="variables">
            变量
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
