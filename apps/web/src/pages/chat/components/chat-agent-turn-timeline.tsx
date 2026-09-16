import {
  AlertCircleIcon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  SparklesIcon,
  ToolCaseIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  type AnimationEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AgentTurnEventEnvelope } from "@chatai/contracts";
import { cn } from "@/lib/utils";
import {
  projectAgentTurnTimeline,
  type AgentTurnTimelineActivity,
} from "@/pages/chat/lib/agent-turn-timeline";

export function ChatAgentTurnTimeline({
  events,
  motion = "enter",
  onCollapse,
  onExitComplete,
}: {
  events: readonly AgentTurnEventEnvelope[];
  motion?: "enter" | "exit";
  onCollapse?: () => void;
  onExitComplete?: () => void;
}) {
  const activities = useMemo(() => projectAgentTurnTimeline(events), [events]);
  const scrollViewportRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return;

    viewport.scrollTop = viewport.scrollHeight;
  }, [activities]);

  if (activities.length === 0) return null;

  const handleAnimationEnd = (event: AnimationEvent<HTMLElement>) => {
    if (
      motion === "exit" &&
      event.target === event.currentTarget
    ) {
      onExitComplete?.();
    }
  };

  return (
    <section
      aria-label="思考过程"
      className={cn(
        "chat-agent-turn-timeline-surface relative flex h-[200px] origin-bottom flex-col overflow-hidden rounded-[18px] border border-divider bg-card/95 pb-4 text-foreground backdrop-blur-xs",
        motion === "exit"
          ? "chat-agent-turn-timeline-exit"
          : "chat-agent-turn-timeline-enter",
      )}
      data-testid="chat-agent-turn-timeline"
      onAnimationEnd={handleAnimationEnd}
    >
      <div className="flex h-10 shrink-0 items-center justify-between px-4">
        <span className="text-sm font-medium">思考过程</span>
        {onCollapse ? (
          <button
            aria-label="收起思考过程"
            className="flex size-6 items-center justify-center rounded-[6px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/20"
            onClick={onCollapse}
            type="button"
          >
            <HugeiconsIcon
              aria-hidden="true"
              icon={ArrowDown01Icon}
              size={15}
              strokeWidth={1.8}
            />
          </button>
        ) : null}
      </div>
      <div
        className="relative z-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-1"
        data-testid="chat-agent-turn-timeline-scroll"
        ref={scrollViewportRef}
      >
        {activities.map((activity) => (
          <TimelineActivity activity={activity} key={activity.id} />
        ))}
      </div>
    </section>
  );
}

function TimelineActivity({
  activity,
}: {
  activity: AgentTurnTimelineActivity;
}) {
  const [isRawDetailExpanded, setIsRawDetailExpanded] = useState(false);
  const hasRawDetail =
    activity.kind === "tool" &&
    [activity.input, activity.output, activity.error].some(
      (value) => value !== undefined,
    );
  const inlineSummary =
    activity.kind !== "thinking" && activity.summary !== activity.label
      ? activity.summary
      : undefined;
  const decisionLabel = getDecisionLabel(activity);

  return (
    <div className="grid grid-cols-[18px_minmax(0,1fr)] gap-2.5 py-1">
      <div className="flex justify-center pt-px">
        <ActivityIcon activity={activity} />
      </div>
      <div className="min-w-0">
        <div className="flex min-h-5 min-w-0 items-center gap-2">
          <span className="shrink-0 text-[13px] leading-4 font-medium text-foreground">
            {activity.label}
          </span>
          {inlineSummary ? (
            <span className="min-w-0 truncate text-xs leading-4 text-muted-foreground">
              {inlineSummary}
            </span>
          ) : null}
          {hasRawDetail ? (
            <button
              aria-expanded={isRawDetailExpanded}
              aria-label={`${isRawDetailExpanded ? "收起" : "展开"}${activity.label}原始数据`}
              className="flex size-5 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/20"
              onClick={() => setIsRawDetailExpanded((current) => !current)}
              type="button"
            >
              <HugeiconsIcon
                aria-hidden="true"
                icon={
                  isRawDetailExpanded ? ArrowDown01Icon : ArrowRight01Icon
                }
                size={14}
                strokeWidth={1.8}
              />
            </button>
          ) : null}
        </div>

        {decisionLabel ? (
          <p className="mt-0.5 text-xs leading-4 text-warning">
            {decisionLabel}
          </p>
        ) : null}

        {hasRawDetail && isRawDetailExpanded ? (
          <ToolRawDetails activity={activity} />
        ) : null}
      </div>
    </div>
  );
}

function ActivityIcon({
  activity,
}: {
  activity: AgentTurnTimelineActivity;
}) {
  const isFailed = activity.status === "failed";
  const isRejected =
    activity.decision?.action === "reject" ||
    activity.decision?.action === "redirect";
  const isThinking = activity.kind === "thinking";
  const isWarning = isFailed || isRejected;
  const label = isFailed
    ? "工具调用失败"
    : isRejected
      ? "工具调用被拒绝"
      : isThinking
        ? "思考"
        : "工具调用";
  const icon = isWarning
    ? AlertCircleIcon
    : isThinking
      ? SparklesIcon
      : ToolCaseIcon;

  return (
    <span
      aria-label={label}
      className="flex size-[18px] items-center justify-center"
      role="img"
    >
      <HugeiconsIcon
        aria-hidden="true"
        className={
          isFailed
            ? "text-destructive"
            : isRejected
              ? "text-warning"
              : "text-muted-foreground"
        }
        icon={icon}
        size={14}
        strokeWidth={1.8}
      />
    </span>
  );
}

function ToolRawDetails({
  activity,
}: {
  activity: AgentTurnTimelineActivity;
}) {
  return (
    <div
      aria-label={`${activity.label}原始数据`}
      className="mt-2 grid gap-2 rounded-[8px] bg-foreground/[0.035] px-3 py-2.5 dark:bg-white/[0.045]"
    >
      {activity.input !== undefined ? (
        <RawDataBlock label="输入" value={activity.input} />
      ) : null}
      {activity.output !== undefined ? (
        <RawDataBlock label="输出" value={activity.output} />
      ) : null}
      {activity.error !== undefined ? (
        <RawDataBlock label="错误" value={activity.error} />
      ) : null}
    </div>
  );
}

function RawDataBlock({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-foreground/85">
        {formatRawValue(value)}
      </pre>
    </div>
  );
}

function getDecisionLabel(activity: AgentTurnTimelineActivity) {
  if (activity.decision?.action === "reject") return "客服已拒绝执行";
  if (activity.decision?.action === "redirect") {
    return activity.decision.instruction
      ? `客服指令：${activity.decision.instruction}`
      : "客服已要求调整处理方式";
  }
  return "";
}

function formatRawValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
