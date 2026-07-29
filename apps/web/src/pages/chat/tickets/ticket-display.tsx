import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  EqualSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function ticketStatusText(status: unknown) {
  return ({
    canceled: "已取消",
    dismissed: "已取消",
    done: "已完成",
    expired: "已取消",
    in_progress: "处理中",
    open: "待处理",
  } as Record<string, string>)[String(status)] ?? String(status ?? "-");
}

export function TicketStatusBadge({
  className,
  size = "compact",
  status,
}: {
  className?: string;
  size?: "compact" | "default";
  status: string;
}) {
  return (
    <Badge
      className={cn(
        "rounded-[5px] py-0.5 font-medium",
        size === "compact" ? "px-1.5 text-[11px]" : "px-2 text-sm",
        status === "open" && "bg-warning-muted/55 text-warning",
        status === "in_progress" && "bg-info/10 text-info",
        status === "done" && "bg-success-muted/55 text-success",
        status === "canceled" && "bg-muted text-muted-foreground",
        className,
      )}
    >
      {ticketStatusText(status)}
    </Badge>
  );
}

export function TicketOverdueBadge({ className }: { className?: string }) {
  return (
    <Badge className={cn("rounded-[5px] bg-destructive/10 px-1.5 py-0.5 text-[11px] text-destructive", className)}>
      逾期
    </Badge>
  );
}

export function ticketPriorityText(priority: unknown) {
  return ({ high: "高", low: "低", medium: "中" } as Record<string, string>)[String(priority)]
    ?? String(priority ?? "-");
}

export function TicketPriority({ priority, size = "compact" }: { priority: string; size?: "compact" | "default" }) {
  const config = {
    high: { className: "text-destructive", icon: ArrowUp01Icon, label: "高" },
    low: { className: "text-info", icon: ArrowDown01Icon, label: "低" },
    medium: { className: "text-warning", icon: EqualSignIcon, label: "中" },
  }[priority];

  if (!config) {
    return <span className="text-sm text-muted-foreground">{priority}</span>;
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5 font-medium", size === "compact" ? "text-xs" : "text-sm", config.className)}>
      <HugeiconsIcon aria-hidden="true" icon={config.icon} size={size === "compact" ? 14 : 16} strokeWidth={2.2} />
      {config.label}
    </span>
  );
}
