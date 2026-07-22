import type { ReactNode } from "react";
import {
  CheckmarkCircle02Icon,
  DashedLineCircleIcon,
  InformationCircleIcon,
  Leaf01Icon,
  Loading03Icon,
  MessageSquareDashedIcon,
  Progress03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import {
  formatAnalysisStatus,
  formatPriority,
  formatResolutionStatus,
  formatSeverity,
} from "./insights-utils";

type Level = "high" | "low" | "medium";

const levelClasses: Record<Level, string> = {
  high: "text-destructive",
  low: "text-success",
  medium: "text-warning",
};

export function PriorityBadge({ priority }: { priority: Level }) {
  return (
    <span className={cn("text-sm font-medium", levelClasses[priority])}>
      {formatPriority(priority)}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Level }) {
  return (
    <Badge className={cn("border-transparent bg-transparent", levelClasses[severity])} variant="outline">
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

export function AnalysisStatusBadge({ status = "analyzing" }: { status?: "analyzing" | "skipped" }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground">
      {status === "analyzing" ? (
        <HugeiconsIcon icon={Loading03Icon} size={13} strokeWidth={2} />
      ) : null}
      {formatAnalysisStatus(status)}
    </span>
  );
}

export function AnalysisPhaseBadge({ phase }: { phase?: "final" | "live" }) {
  if (phase !== "live") {
    return null;
  }

  return (
    <span className="inline-flex items-center text-xs font-medium text-muted-foreground">
      仅实时结果
    </span>
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

export function ResolutionDiagnosisHeader() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>AI 诊断</span>
      <HoverCard closeDelay={80} openDelay={120}>
        <HoverCardTrigger asChild>
          <button
            aria-label="查看 AI 诊断说明"
            className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
            type="button"
          >
            <HugeiconsIcon
              aria-hidden
              color="currentColor"
              icon={InformationCircleIcon}
              size={14}
              strokeWidth={1.9}
            />
          </button>
        </HoverCardTrigger>
        <HoverCardContent
          align="start"
          className="w-[300px] rounded-[8px] border-border bg-popover p-3 text-popover-foreground shadow-sm"
          side="top"
          sideOffset={8}
        >
          <div className="space-y-2">
            <p className="text-xs leading-5 text-muted-foreground">
              按本轮会话内容判断，不代表后续处理状态
            </p>
            <dl className="grid gap-1.5 text-xs leading-5">
              {resolutionDiagnosisDescriptions.map((item) => (
                <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2" key={item.label}>
                  <dt className="font-medium text-foreground">{item.label}</dt>
                  <dd className="text-muted-foreground">{item.description}</dd>
                </div>
              ))}
            </dl>
          </div>
        </HoverCardContent>
      </HoverCard>
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

const resolutionDiagnosisDescriptions = [
  { label: "已解决", description: "本轮会话内已有明确答复或闭环证据" },
  { label: "部分解决", description: "本轮会话内已有处理动作，但缺少关键信息或最终结果" },
  { label: "未解决", description: "本轮会话内未看到有效处理或明确回复" },
  { label: "无需处理", description: "未识别到需要客服处理的客户问题" },
  { label: "消息不足", description: "消息未达准入门槛，或模型基于现有消息仍无法判断" },
] as const;
