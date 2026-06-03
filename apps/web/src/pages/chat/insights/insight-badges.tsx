import type { ReactNode } from "react";
import {
  CheckmarkCircle02Icon,
  DashedLineCircleIcon,
  Leaf01Icon,
  MessageSquareDashedIcon,
  Progress03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  formatPriority,
  formatResolutionStatus,
  formatSeverity,
} from "./insights-utils";

type Level = "high" | "low" | "medium";

const levelClasses: Record<Level, string> = {
  high: "bg-destructive/12 text-destructive",
  low: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  medium: "bg-amber-500/16 text-amber-700 dark:text-amber-300",
};

export function PriorityBadge({ priority }: { priority: Level }) {
  return (
    <Badge className={levelClasses[priority]}>
      {formatPriority(priority)}
    </Badge>
  );
}

export function SeverityBadge({ severity }: { severity: Level }) {
  return (
    <Badge className={levelClasses[severity]}>
      {formatSeverity(severity)}
    </Badge>
  );
}

export function StatusBadge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Badge className={cn("bg-muted text-foreground", className)}>
      {children}
    </Badge>
  );
}

export function ResolutionBadge({
  status,
}: {
  status: "no_customer_problem" | "partially_resolved" | "resolved" | "unknown" | "unresolved";
}) {
  const config = resolutionBadgeConfig[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-sm font-semibold",
        config.className,
      )}
    >
      <HugeiconsIcon icon={config.icon} size={13} strokeWidth={2} />
      {formatResolutionStatus(status)}
    </span>
  );
}

const resolutionBadgeConfig = {
  no_customer_problem: {
    className: "text-slate-600",
    icon: Leaf01Icon,
  },
  partially_resolved: {
    className: "text-amber-700",
    icon: Progress03Icon,
  },
  resolved: {
    className: "text-emerald-700",
    icon: CheckmarkCircle02Icon,
  },
  unknown: {
    className: "text-slate-400",
    icon: MessageSquareDashedIcon,
  },
  unresolved: {
    className: "text-red-700",
    icon: DashedLineCircleIcon,
  },
} as const;
