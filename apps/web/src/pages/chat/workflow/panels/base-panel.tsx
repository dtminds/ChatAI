import { useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Cancel01Icon,
  Edit03Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { canRenameNodeKind, nodeVisuals } from "../node-definitions";
import type { WorkflowNode } from "../types";

export function BasePanel({
  children,
  node,
  onClose,
  onRenameNode,
}: {
  children: ReactNode;
  node: WorkflowNode;
  onClose: () => void;
  onRenameNode: (nodeId: string, title: string) => void;
}) {
  return (
    <aside
      aria-label="节点配置"
      className="workflow-config-panel flex h-full min-h-0 flex-col"
      role="complementary"
    >
      <PanelHeader node={node} onClose={onClose} onRenameNode={onRenameNode} />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-8 pt-4">{children}</div>
    </aside>
  );
}

function PanelHeader({
  node,
  onClose,
  onRenameNode,
}: {
  node: WorkflowNode;
  onClose: () => void;
  onRenameNode: (nodeId: string, title: string) => void;
}) {
  const visual = nodeVisuals[node.data.kind];
  const showNodeType = node.data.title !== visual.label;
  const canRename = canRenameNodeKind(node.data.kind);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.data.title);
  const renameCancelledRef = useRef(false);

  return (
    <div className="p-4">
      <div className="flex items-center gap-3">
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
            {isRenaming ? (
              <Input
                aria-label="节点名称"
                autoFocus
                className="h-8 min-w-0 rounded px-2.5 text-sm font-normal"
                onBlur={commitRename}
                onChange={(event) => setRenameValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    renameCancelledRef.current = true;
                    setRenameValue(node.data.title);
                    setIsRenaming(false);
                  }
                }}
                value={renameValue}
              />
            ) : (
              <h2 className="truncate text-base font-semibold">{node.data.title}</h2>
            )}
            {showNodeType && !isRenaming ? (
              <Badge className="h-5 rounded-md px-1.5 text-[11px]" variant="secondary">
                {visual.label}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canRename ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button aria-label="更多节点操作" className="size-8 rounded-lg p-0" type="button" variant="ghost">
                  <HugeiconsIcon icon={MoreHorizontalIcon} size={15} strokeWidth={1.8} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-36"
                onCloseAutoFocus={(event) => event.preventDefault()}
              >
                <DropdownMenuItem
                  onSelect={() => {
                    renameCancelledRef.current = false;
                    setRenameValue(node.data.title);
                    queueMicrotask(() => setIsRenaming(true));
                  }}
                >
                  <HugeiconsIcon icon={Edit03Icon} size={14} strokeWidth={1.8} />
                  重命名
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
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
    </div>
  );

  function commitRename() {
    if (renameCancelledRef.current) {
      renameCancelledRef.current = false;
      return;
    }

    const title = renameValue.trim();
    setIsRenaming(false);
    if (title && title !== node.data.title) {
      onRenameNode(node.id, title);
      return;
    }
    setRenameValue(node.data.title);
  }
}
