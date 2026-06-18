import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  HeadsetIcon,
  Message01Icon,
  MessageMultiple02Icon,
  RoboticIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import {
  agentStatsPeriodOptions,
  type AgentMetric,
  type AgentMetricKey,
  type AgentStatsPeriod,
} from "./agent-management-mock-data";

const metricVisuals: Record<
  AgentMetricKey,
  {
    icon: typeof Message01Icon;
    iconClassName: string;
  }
> = {
  totalSessions: {
    icon: MessageMultiple02Icon,
    iconClassName: "bg-orange-500/10 text-orange-500",
  },
  aiIndependentSessions: {
    icon: RoboticIcon,
    iconClassName: "bg-violet-500/10 text-violet-500",
  },
  totalMessages: {
    icon: Message01Icon,
    iconClassName: "bg-pink-500/10 text-pink-500",
  },
  aiMessages: {
    icon: RoboticIcon,
    iconClassName: "bg-sky-500/10 text-sky-500",
  },
  humanMessages: {
    icon: HeadsetIcon,
    iconClassName: "bg-blue-500/10 text-blue-500",
  },
};

export function AgentOverviewSection({
  metrics,
  onPeriodChange,
  period,
}: {
  metrics: AgentMetric[];
  onPeriodChange: (period: AgentStatsPeriod) => void;
  period: AgentStatsPeriod;
}) {
  return (
    <section aria-label="数据总览" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">数据总览</h2>
        <SegmentedControl
          aria-label="选择统计时间范围"
          onValueChange={(value) => {
            if (value) {
              onPeriodChange(value as AgentStatsPeriod);
            }
          }}
          type="single"
          value={period}
        >
          {agentStatsPeriodOptions.map((option) => (
            <SegmentedControlItem
              className="h-6 min-w-[52px] w-auto px-3 text-xs"
              key={option.value}
              value={option.value}
            >
              {option.label}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      </div>

      <AgentMetricCarousel metrics={metrics} />
    </section>
  );
}

function AgentMetricCarousel({ metrics }: { metrics: AgentMetric[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  function updateScrollState() {
    const container = scrollRef.current;

    if (!container) {
      return;
    }

    setCanScrollLeft(container.scrollLeft > 0);
    setCanScrollRight(container.scrollLeft + container.clientWidth < container.scrollWidth - 1);
  }

  useEffect(() => {
    updateScrollState();

    const container = scrollRef.current;

    if (!container) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      updateScrollState();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [metrics]);

  function scrollMetrics(direction: "left" | "right") {
    scrollRef.current?.scrollBy({
      behavior: "smooth",
      left: direction === "left" ? -280 : 280,
    });
  }

  return (
    <div className="relative">
      {canScrollLeft ? (
        <Button
          aria-label="向左查看更多指标"
          className="absolute left-0 top-1/2 z-10 size-8 -translate-x-1/2 -translate-y-1/2 rounded-full border bg-background shadow-sm"
          onClick={() => scrollMetrics("left")}
          size="icon"
          type="button"
          variant="outline"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.8} />
        </Button>
      ) : null}

      <div
        className="flex gap-4 overflow-x-auto scroll-smooth pb-1 scrollbar-none [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        onScroll={updateScrollState}
        ref={scrollRef}
      >
        {metrics.map((metric) => (
          <AgentMetricCard key={metric.key} metric={metric} />
        ))}
      </div>

      {canScrollRight ? (
        <Button
          aria-label="向右查看更多指标"
          className="absolute right-0 top-1/2 z-10 size-8 translate-x-1/2 -translate-y-1/2 rounded-full border bg-background shadow-sm"
          onClick={() => scrollMetrics("right")}
          size="icon"
          type="button"
          variant="outline"
        >
          <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.8} />
        </Button>
      ) : null}
    </div>
  );
}

function AgentMetricCard({ metric }: { metric: AgentMetric }) {
  const visual = metricVisuals[metric.key];
  const isIncrease = metric.changePercent >= 0;

  return (
    <article className="min-w-[240px] flex-1 rounded-[12px] border bg-card p-5 shadow-xs">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-[10px]",
            visual.iconClassName,
          )}
        >
          <HugeiconsIcon icon={visual.icon} size={18} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">{metric.label}</p>
          <p className="mt-2 text-[28px] font-semibold leading-tight tracking-tight text-foreground">
            {formatNumber(metric.value)}
          </p>
          <p
            className={cn(
              "mt-3 text-xs font-medium",
              isIncrease ? "text-red-500" : "text-emerald-600",
            )}
          >
            {isIncrease ? "↗" : "↘"} {formatPercent(metric.changePercent)}
          </p>
        </div>
      </div>
    </article>
  );
}

function formatNumber(value: number) {
  return value.toLocaleString("zh-CN");
}

function formatPercent(value: number) {
  return `${Math.abs(value).toFixed(2)}%`;
}
