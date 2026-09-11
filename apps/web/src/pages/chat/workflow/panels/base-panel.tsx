import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { WORKFLOW_NODE_TITLE_MAX_LENGTH } from "@chatai/contracts";
import {
  Cancel01Icon,
  Edit03Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LimitedInput } from "@/components/ui/limited-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { isBillableWorkflowNodeKind } from "@/pages/chat/billing/ai-credit-billing";
import { BillingBadge } from "@/pages/chat/billing/billing-badge";
import { canRenameNodeKind, nodeVisuals } from "../node-definitions";
import type { WorkflowNode } from "../types";
import { useWorkflowSurface } from "../workflow-surface";

export function BasePanel({
  children,
  headerActions,
  node,
  onClose,
  onRenameNode,
  readOnly = false,
}: {
  children: ReactNode;
  headerActions?: ReactNode;
  node: WorkflowNode;
  onClose: () => void;
  onRenameNode: (nodeId: string, title: string) => void;
  readOnly?: boolean;
}) {
  return (
    <aside
      aria-label="节点配置"
      className="workflow-config-panel flex h-full min-h-0 flex-col"
      role="complementary"
    >
      <PanelHeader
        headerActions={headerActions}
        node={node}
        onClose={onClose}
        onRenameNode={onRenameNode}
        readOnly={readOnly}
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-8">{children}</div>
    </aside>
  );
}

function PanelHeader({
  headerActions,
  node,
  onClose,
  onRenameNode,
  readOnly,
}: {
  headerActions?: ReactNode;
  node: WorkflowNode;
  onClose: () => void;
  onRenameNode: (nodeId: string, title: string) => void;
  readOnly: boolean;
}) {
  const visual = nodeVisuals[node.data.kind];
  const surface = useWorkflowSurface();
  const showNodeType = node.data.title !== visual.label;
  const showBillingBadge = !surface.embedded && isBillableWorkflowNodeKind(node.data.kind);
  const canRename = canRenameNodeKind(node.data.kind);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.data.title);
  const renameCancelledRef = useRef(false);
  const renameLength = renameValue.length;
  const renameTooLong = renameLength > WORKFLOW_NODE_TITLE_MAX_LENGTH;

  return (
    <div className="p-4">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-[10px]",
            visual.accentClassName,
          )}
        >
          <HugeiconsIcon icon={visual.icon} size={17} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isRenaming ? (
              <div className="relative min-w-0 flex-1">
                <LimitedInput
                  aria-invalid={renameTooLong || undefined}
                  aria-label="节点名称"
                  autoFocus
                  className={cn(
                    "h-8 min-w-0 rounded px-2.5 pr-12 text-sm font-normal",
                    renameTooLong && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/15",
                  )}
                  onBlur={(event) => commitRename(event.currentTarget.value)}
                  maxLength={WORKFLOW_NODE_TITLE_MAX_LENGTH}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter"
                      && !event.nativeEvent.isComposing
                      && event.keyCode !== 229
                    ) {
                      event.preventDefault();
                      if (!renameTooLong) {
                        event.currentTarget.blur();
                      }
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      event.stopPropagation();
                      renameCancelledRef.current = true;
                      setRenameValue(node.data.title);
                      setIsRenaming(false);
                    }
                  }}
                  onValueChange={setRenameValue}
                  value={renameValue}
                />
                <span
                  className={cn(
                    "pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground",
                    renameTooLong && "text-destructive",
                  )}
                >
                  {renameLength}/{WORKFLOW_NODE_TITLE_MAX_LENGTH}
                </span>
              </div>
            ) : (
              <h2 className="truncate text-base font-semibold">{node.data.title}</h2>
            )}
            {showNodeType && !isRenaming ? (
              <Badge className="h-5 rounded-md px-1.5 text-[11px]" variant="secondary">
                {visual.label}
              </Badge>
            ) : null}
            {showBillingBadge && !isRenaming ? <BillingBadge /> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {headerActions}
          {canRename && !readOnly ? (
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

  function commitRename(nextRenameValue = renameValue) {
    if (renameCancelledRef.current) {
      renameCancelledRef.current = false;
      return;
    }

    const title = nextRenameValue.trim();

    if (!title || nextRenameValue.length > WORKFLOW_NODE_TITLE_MAX_LENGTH) {
      setRenameValue(node.data.title);
      setIsRenaming(false);
      return;
    }

    setIsRenaming(false);
    if (title !== node.data.title) {
      onRenameNode(node.id, title);
    }
  }
}
