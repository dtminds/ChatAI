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

type OnStatusBarStatus = Exclude<ChatAIAssistantStatus, "waiting">;
type BeamTheme = "light" | "dark";

type OnStatusBarThemeStyles = {
  approveButton: string;
  beamBrightness: number;
  beamColorVariant: "colorful" | "ocean";
  beamSaturation: number;
  content: string;
  ignoreButton: string;
  orb?: string;
  surface: string;
  text: string;
};

const ON_STATUS_BAR_THEME_STYLES: Record<
  BeamTheme,
  OnStatusBarThemeStyles
> = {
  light: {
    approveButton:
      "bg-neutral-strong text-neutral-strong-foreground hover:bg-neutral-strong/90 hover:text-neutral-strong-foreground",
    beamBrightness: 2.1,
    beamColorVariant: "colorful",
    beamSaturation: 0.5,
    content: "text-muted-foreground",
    ignoreButton:
      "text-muted-foreground hover:bg-muted hover:text-foreground",
    surface: "bg-muted/80 backdrop-blur-xs",
    text: "text-muted-foreground",
  },
  dark: {
    approveButton: "bg-white text-neutral-900 hover:bg-white/90",
    beamBrightness: 1.2,
    beamColorVariant: "ocean",
    beamSaturation: 0.15,
    content: "text-white/90",
    ignoreButton: "text-white/70 hover:bg-white/10 hover:text-white",
    orb: "opacity-85",
    surface: "bg-neutral-800",
    text: "text-white/90",
  },
};

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
            customerName={customerName}
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
          customerName={customerName}
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
  customerName,
  onApprove,
  onIgnore,
  thinkingActions,
  view,
}: {
  beamTheme: BeamTheme;
  customerName?: string;
  onApprove?: () => void;
  onIgnore?: () => void;
  thinkingActions?: ReactNode;
  view: StatusBarView;
}) {
  if (view.status === "waiting") {
    return (
      <WaitStatusBarSurface
        customerName={customerName}
        label={view.label}
      />
    );
  }

  return (
    <OnStatusBarSurface
      beamTheme={beamTheme}
      label={view.label}
      onApprove={onApprove}
      onIgnore={onIgnore}
      status={view.status}
      thinkingActions={thinkingActions}
    />
  );
}

function WaitStatusBarSurface({
  customerName,
  label,
}: {
  customerName?: string;
  label: string;
}) {
  const resolvedCustomerName = customerName?.trim();
  const shouldEmphasizeCustomerName =
    resolvedCustomerName &&
    label === getDefaultStatusLabel("waiting", resolvedCustomerName);

  return (
    <div
      className="relative z-20 h-full rounded-full border border-success/18"
      data-mode="wait"
      data-status="waiting"
      data-testid="chat-ai-assistant-status-bar"
      role="status"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0 rounded-full bg-success-muted/60 backdrop-blur-xs"
      />
      <div className="relative z-10 flex h-full items-center justify-center gap-3 px-4 text-[13px] leading-4 font-medium text-foreground/80">
        <div className="flex min-w-0 items-center gap-2">
          <HugeiconsIcon
            aria-hidden="true"
            icon={BubbleChatSparkIcon}
            size={16}
            strokeWidth={1.8}
          />
          <span className="min-w-0 truncate">
            {shouldEmphasizeCustomerName ? (
              <>
                正在等待{" "}
                <strong className="font-semibold text-foreground">
                  {resolvedCustomerName}
                </strong>{" "}
                的消息
              </>
            ) : (
              label
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

function OnStatusBarSurface({
  beamTheme,
  label,
  onApprove,
  onIgnore,
  status,
  thinkingActions,
}: {
  beamTheme: BeamTheme;
  label: string;
  onApprove?: () => void;
  onIgnore?: () => void;
  status: OnStatusBarStatus;
  thinkingActions?: ReactNode;
}) {
  const isThinking = status === "thinking";
  const themeStyles = ON_STATUS_BAR_THEME_STYLES[beamTheme];

  return (
    <BorderBeam
      active
      borderRadius={999}
      saturation={themeStyles.beamSaturation}
      staticColors={isThinking}
      className="relative z-20 block h-full rounded-full"
      colorVariant={themeStyles.beamColorVariant}
      brightness={themeStyles.beamBrightness}
      duration={isThinking ? 2.4 : 4.6}
      size={isThinking ? "pulse-inner" : "line"}
      theme={beamTheme}
    >
      <div
        className="relative h-full rounded-full border border-divider"
        data-mode="on"
        data-status={status}
        data-testid="chat-ai-assistant-status-bar"
        role="status"
      >
        <div
          aria-hidden="true"
          className={cn(
            "absolute inset-0 z-0 rounded-full",
            themeStyles.surface,
          )}
        />
        <div
          className={cn(
            "relative z-10 flex h-full items-center justify-between gap-3 px-4 text-[13px] leading-4 font-medium",
            themeStyles.content,
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <AgentThinkingOrb
              className={themeStyles.orb}
              speed={isThinking ? 1 : 0.6}
              state={isThinking ? "solving" : "searching"}
            />
            <AnimatedTextSwitch
              className={cn(
                "min-w-0 text-[13px] font-medium",
                themeStyles.text,
              )}
              shiny={isThinking}
              shinyDuration={2.5}
              shinyShimmerWidth={44}
              staggerMs={12}
              value={label}
            />
          </div>
          <OnStatusBarActions
            onApprove={onApprove}
            onIgnore={onIgnore}
            status={status}
            themeStyles={themeStyles}
            thinkingActions={thinkingActions}
          />
        </div>
      </div>
    </BorderBeam>
  );
}

function OnStatusBarActions({
  onApprove,
  onIgnore,
  status,
  themeStyles,
  thinkingActions,
}: {
  onApprove?: () => void;
  onIgnore?: () => void;
  status: OnStatusBarStatus;
  themeStyles: OnStatusBarThemeStyles;
  thinkingActions?: ReactNode;
}) {
  if (status === "thinking") {
    return thinkingActions;
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button
        className={cn(
          "h-7 rounded-[8px] px-3 text-xs shadow-none",
          themeStyles.ignoreButton,
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
          themeStyles.approveButton,
        )}
        disabled={!onApprove}
        onClick={onApprove}
        size="sm"
        type="button"
      >
        批准
      </Button>
    </div>
  );
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
