import type { ReactNode } from "react";
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
  const className =
    status === "resolved"
      ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
      : status === "unresolved"
        ? "bg-destructive/12 text-destructive"
        : status === "partially_resolved"
          ? "bg-amber-500/16 text-amber-700 dark:text-amber-300"
          : "bg-muted text-muted-foreground";

  return <Badge className={className}>{formatResolutionStatus(status)}</Badge>;
}
