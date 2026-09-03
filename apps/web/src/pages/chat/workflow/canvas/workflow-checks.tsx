import { AlertCircleIcon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getWorkflowNodeCatalogEntry } from "../node-catalog";
import type { WorkflowPublishCheck } from "../types";

export function WorkflowChecks({
  checks,
  onNavigateToNode,
  onClose,
  publishAttempted,
}: {
  checks: WorkflowPublishCheck[];
  onNavigateToNode?: (nodeId: string) => void;
  onClose: () => void;
  publishAttempted: boolean;
}) {
  return (
    <section
      aria-label="发布检查"
      className="workflow-checks-panel absolute bottom-3 left-3 top-3 z-[16] flex min-h-0 w-[min(380px,calc(100%-24px))] flex-col overflow-hidden rounded-2xl border border-foreground/15 bg-[var(--workflow-panel-bg-blur)] p-3 shadow-[0_4px_12px_var(--shadow-soft)] backdrop-blur-[10px] max-lg:right-3 max-lg:w-auto"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div
          className="flex items-center gap-3 px-1 py-1"
          role={publishAttempted ? "alert" : undefined}
        >
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">发布检查</h2>
          </div>
          <Button
            aria-label="关闭发布检查"
            className="size-8 shrink-0 rounded-lg"
            onClick={onClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.8} />
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto">
          {checks.length === 0 ? (
            <article className="rounded-[8px] border bg-card p-4 text-sm text-muted-foreground">
              已通过发布检查
            </article>
          ) : checks.map((check) => {
            const canNavigate = Boolean(check.nodeId && onNavigateToNode);
            const visual = check.nodeKind
              ? getWorkflowNodeCatalogEntry(check.nodeKind).visual
              : undefined;
            const messages = check.messages?.length ? check.messages : [check.description];
            const content = (
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[8px]",
                    visual?.accentClassName ?? "bg-warning-muted text-warning",
                  )}
                  data-node-icon-kind={check.nodeKind}
                >
                  <HugeiconsIcon
                    icon={visual?.icon ?? AlertCircleIcon}
                    size={17}
                    strokeWidth={1.8}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold">{check.title}</h3>
                  <p className="mt-1.5 text-xs text-destructive">
                    {messages.join("；")}
                  </p>
                </div>
              </div>
            );

            return (
              <article className="rounded-[8px] border bg-card p-4" key={check.id}>
                {canNavigate ? (
                  <button
                    className="block w-full text-left"
                    onClick={() => {
                      onNavigateToNode?.(check.nodeId!);
                    }}
                    type="button"
                  >
                    {content}
                  </button>
                ) : content}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
