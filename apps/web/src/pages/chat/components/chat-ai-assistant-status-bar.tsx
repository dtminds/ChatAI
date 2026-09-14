import {
  type AnimationEvent,
  type ReactNode,
  useLayoutEffect,
  useState,
} from "react";
import { BorderBeam } from "border-beam";
import { BubbleChatSparkIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AgentThinkingOrb } from "@/components/ui/agent-thinking-orb";
import { AnimatedTextSwitch } from "@/components/ui/animated-text-switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppearanceStore } from "@/store/appearance-store";

export type ChatAIAssistantStatus =
  | "waiting"
  | "thinking"
  | "confirmation";

type StatusBarView = {
  label: string;
  status: ChatAIAssistantStatus;
};

type StatusBarMode = "wait" | "on";
type BeamTheme = "light" | "dark";

export function ChatAIAssistantStatusBar({
  className,
  customerName,
  label,
  onApprove,
  onIgnore,
  status = "waiting",
  thinkingActions,
}: {
  className?: string;
  customerName?: string;
  label?: string;
  onApprove?: () => void;
  onIgnore?: () => void;
  status?: ChatAIAssistantStatus;
  thinkingActions?: ReactNode;
}) {
  const targetLabel =
    label?.trim() || getDefaultStatusLabel(status, customerName);
  const [visibleView, setVisibleView] = useState<StatusBarView>(() => ({
    label: targetLabel,
    status,
  }));
  const [outgoingView, setOutgoingView] = useState<StatusBarView | null>(null);
  const beamTheme = useAppearanceStore((state): BeamTheme =>
    state.themePreference === "dark" ||
    (state.themePreference === "system" && state.isSystemDarkMode)
      ? "dark"
      : "light",
  );
  useLayoutEffect(() => {
    if (outgoingView) {
      if (outgoingView.status === status) {
        setOutgoingView(null);
        setVisibleView({ label: targetLabel, status });
        return;
      }

      if (visibleView.status !== status || visibleView.label !== targetLabel) {
        setVisibleView({ label: targetLabel, status });
      }
      return;
    }

    if (visibleView.status !== status) {
      setOutgoingView(visibleView);
      setVisibleView({ label: targetLabel, status });
      return;
    }

    if (visibleView.status !== status || visibleView.label !== targetLabel) {
      setVisibleView({ label: targetLabel, status });
    }
  }, [
    status,
    targetLabel,
    outgoingView,
    visibleView.label,
    visibleView.status,
  ]);

  const handleEntranceAnimationEnd = (
    event: AnimationEvent<HTMLDivElement>,
  ) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    setOutgoingView(null);
  };

  return (
    <div
      className={cn("relative h-[42px] overflow-visible", className)}
      data-testid="chat-ai-assistant-status-viewport"
    >
      {outgoingView ? (
        <div
          className="chat-ai-assistant-status-layer--exiting absolute inset-x-0 top-0 h-[42px] will-change-transform"
          data-testid="chat-ai-assistant-status-outgoing-layer"
          key={`outgoing-${outgoingView.status}`}
        >
          <StatusBarSurface
            beamTheme={beamTheme}
            onApprove={onApprove}
            onIgnore={onIgnore}
            thinkingActions={thinkingActions}
            view={outgoingView}
          />
        </div>
      ) : null}
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-[42px] will-change-transform",
          outgoingView &&
            "chat-ai-assistant-status-layer--entering",
        )}
        data-testid="chat-ai-assistant-status-motion-layer"
        key={`current-${visibleView.status}`}
        onAnimationEnd={handleEntranceAnimationEnd}
        style={
          outgoingView
            ? {
                opacity: 0,
                transform: "translate3d(0, calc(100% + 8px), 0)",
              }
            : undefined
        }
      >
        <StatusBarSurface
          beamTheme={beamTheme}
          onApprove={onApprove}
          onIgnore={onIgnore}
          thinkingActions={thinkingActions}
          view={visibleView}
        />
      </div>
    </div>
  );
}

function StatusBarSurface({
  beamTheme,
  onApprove,
  onIgnore,
  thinkingActions,
  view,
}: {
  beamTheme: BeamTheme;
  onApprove?: () => void;
  onIgnore?: () => void;
  thinkingActions?: ReactNode;
  view: StatusBarView;
}) {
  const mode = getStatusBarMode(view.status);
  const isOn = mode === "on";
  const isDarkOnSurface = isOn && beamTheme === "dark";
  const beamSize = view.status === "thinking" ? "pulse-inner" : "line";
  const actions =
    view.status === "thinking"
      ? thinkingActions
      : view.status === "confirmation"
        ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                className={cn(
                  "h-7 rounded-[8px] px-3 text-xs shadow-none",
                  isDarkOnSurface
                    ? "text-white/70 hover:bg-white/10 hover:text-white"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                disabled={!onIgnore}
                onClick={onIgnore}
                size="sm"
                type="button"
                variant="ghost"
              >
                忽略
              </Button>
              <Button
                className={cn(
                  "h-7 rounded-[8px] border-transparent px-3 text-xs shadow-none",
                  isDarkOnSurface
                    ? "bg-white text-neutral-900 hover:bg-white/90"
                    : "bg-neutral-strong text-neutral-strong-foreground hover:bg-neutral-strong/90 hover:text-neutral-strong-foreground",
                )}
                disabled={!onApprove}
                onClick={onApprove}
                size="sm"
                type="button"
              >
                批准
              </Button>
            </div>
          )
        : null;

  return (
    <BorderBeam
      active={isOn}
      borderRadius={999}
      saturation={isDarkOnSurface ? 0.15 : 0.5}
      staticColors={view.status === "thinking"}
      className="relative z-20 block h-full rounded-full"
      colorVariant={isDarkOnSurface ? "ocean" : "colorful"}
      brightness={isDarkOnSurface ? 1.2 : 2.1}
      duration={view.status === "thinking" ? 2.4 : 4.6}
      size={beamSize}
      theme={beamTheme}
    >
      <div
        className="relative h-full rounded-full border border-divider"
        data-mode={mode}
        data-status={view.status}
        data-testid="chat-ai-assistant-status-bar"
        role="status"
      >
        <div
          aria-hidden="true"
          className={cn(
            "absolute inset-0 z-0 rounded-full",
            isOn
              ? isDarkOnSurface
                ? "bg-neutral-800"
                : "bg-muted/80 backdrop-blur-xs"
              : "bg-success-muted/60 backdrop-blur-xs",
          )}
        />
        <div
          className={cn(
            "relative z-10 flex h-full items-center gap-3 px-4 text-[13px] leading-4 font-medium",
            isOn
              ? cn(
                  "justify-between",
                  isDarkOnSurface
                    ? "text-white/90"
                    : "text-muted-foreground",
                )
              : "justify-center text-muted-foreground",
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            {isOn ? (
              <AgentThinkingOrb
                className={isDarkOnSurface ? "opacity-85" : undefined}
                speed={view.status === "thinking" ? 1 : 0.6}
                state={view.status === "thinking" ? "solving" : "searching"}
              />
            ) : (
              <HugeiconsIcon
                aria-hidden="true"
                icon={BubbleChatSparkIcon}
                size={16}
                strokeWidth={1.8}
              />
            )}
            {isOn ? (
              <AnimatedTextSwitch
                className={cn(
                  "min-w-0 text-[13px] font-medium",
                  isDarkOnSurface
                    ? "text-white/90"
                    : "text-muted-foreground",
                )}
                shiny={view.status === "thinking"}
                shinyDuration={2.5}
                shinyShimmerWidth={44}
                staggerMs={12}
                value={view.label}
              />
            ) : (
              <span className="min-w-0 truncate">{view.label}</span>
            )}
          </div>
          {isOn && actions ? actions : null}
        </div>
      </div>
    </BorderBeam>
  );
}

function getStatusBarMode(status: ChatAIAssistantStatus): StatusBarMode {
  return status === "waiting" ? "wait" : "on";
}

function getDefaultStatusLabel(
  status: ChatAIAssistantStatus,
  customerName?: string,
) {
  if (status === "thinking") {
    return "AI 正在思考";
  }

  if (status === "confirmation") {
    return "需要你确认";
  }

  const resolvedCustomerName = customerName?.trim();
  return resolvedCustomerName
    ? `等待 ${resolvedCustomerName} 消息`
    : "等待客户消息";
}
