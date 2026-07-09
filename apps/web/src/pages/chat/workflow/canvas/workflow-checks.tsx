import { AlertCircleIcon, Cancel01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WorkflowPublishCheck } from "../types";

export function WorkflowChecks({
  checks,
  onNavigateToNode,
  onClose,
  publishAttempted,
  publishReady,
}: {
  checks: WorkflowPublishCheck[];
  onNavigateToNode?: (nodeId: string) => void;
  onClose: () => void;
  publishAttempted: boolean;
  publishReady: boolean;
}) {
  return (
    <section aria-label="发布检查" className="workflow-checks-panel">
      <div className="space-y-4">
        <div
          className={cn(
            "rounded-[12px] border bg-background p-4 shadow-xs",
            publishAttempted && (publishReady ? "border-emerald-200" : "border-amber-200"),
          )}
          role={publishAttempted ? "alert" : undefined}
        >
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[10px]",
                publishReady ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
              )}
            >
              <HugeiconsIcon
                icon={publishReady ? CheckmarkCircle02Icon : AlertCircleIcon}
                size={20}
                strokeWidth={1.8}
              />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">
                {publishReady ? "可以发布" : "发布前需处理配置问题"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                检查触发、连线、节点配置、分支兜底和动作幂等配置
              </p>
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
        </div>

        <div className="grid gap-3">
          {checks.length === 0 ? (
            <article className="rounded-[12px] border bg-background p-4 text-sm text-muted-foreground shadow-xs">
              当前 Workflow 已通过发布前检查
            </article>
          ) : checks.map((check) => {
            const canNavigate = Boolean(check.nodeId && onNavigateToNode);
            const content = (
              <div className="flex items-start gap-3">
                <span
                  className="mt-0.5 flex size-8 items-center justify-center rounded-[8px] bg-amber-50 text-amber-700"
                >
                  <HugeiconsIcon
                    icon={AlertCircleIcon}
                    size={17}
                    strokeWidth={1.8}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold">{check.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{check.description}</p>
                  {check.messages && check.messages.length > 1 ? (
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {check.messages.map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            );

            return (
              <article className="rounded-[12px] border bg-background p-4 shadow-xs" key={check.id}>
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
