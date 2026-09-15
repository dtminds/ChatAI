import {
  type AnimationEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { BorderBeam } from "border-beam";
import { AgentThinkingOrb } from "@/components/ui/agent-thinking-orb";
import { AnimatedTextSwitch } from "@/components/ui/animated-text-switch";
import { Button } from "@/components/ui/button";
import { ElapsedTime } from "@/components/ui/elapsed-time";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAppearanceStore } from "@/store/appearance-store";

export type ChatAIAssistantStatus =
  | "waiting"
  | "thinking"
  | "confirmation";

export type ChatAIAssistantAction = {
  disabled?: boolean;
  id: string;
  label: string;
  onSelect?: () => void;
  tone?: "primary" | "quiet";
};

type StatusBarView = {
  label: string;
  reason?: string;
  status: ChatAIAssistantStatus;
  waitingForCustomer: boolean;
};

type OnStatusBarStatus = Exclude<ChatAIAssistantStatus, "waiting">;
type BeamTheme = "light" | "dark";

const THINKING_SHINY_MIN_DURATION_SECONDS = 1.4;
const THINKING_SHINY_MAX_DURATION_SECONDS = 4;
const THINKING_SHINY_SECONDS_PER_CHARACTER = 0.12;
const STATUS_TRANSITION_FALLBACK_MS = 800;

type OnStatusBarThemeStyles = {
  beamBrightness: number;
  beamColorVariant: "colorful" | "ocean";
  beamSaturation: number;
  content: string;
  orb?: string;
  primaryActionButton: string;
  quietActionButton: string;
  surface: string;
};

const ON_STATUS_BAR_THEME_STYLES: Record<
  BeamTheme,
  OnStatusBarThemeStyles
> = {
  light: {
    beamBrightness: 2.1,
    beamColorVariant: "colorful",
    beamSaturation: 0.5,
    content: "text-muted-foreground",
    primaryActionButton:
      "bg-neutral-strong text-neutral-strong-foreground hover:bg-neutral-strong/90 hover:text-neutral-strong-foreground",
    quietActionButton:
      "bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground active:bg-transparent",
    surface: "bg-muted/80 backdrop-blur-xs",
  },
  dark: {
    beamBrightness: 1.2,
    beamColorVariant: "ocean",
    beamSaturation: 0.15,
    content: "text-white/90",
    orb: "opacity-85",
    primaryActionButton: "bg-white text-neutral-900 hover:bg-white/90",
    quietActionButton:
      "bg-transparent text-white/70 hover:bg-transparent hover:text-white active:bg-transparent",
    surface: "bg-muted/90 backdrop-blur-xs",
  },
};

export function ChatAIAssistantStatusBar({
  actions,
  className,
  customerName,
  label,
  reason,
  status = "waiting",
  waitingForCustomer = false,
}: {
  actions?: readonly ChatAIAssistantAction[];
  className?: string;
  customerName?: string;
  label?: string;
  reason?: string;
  status?: ChatAIAssistantStatus;
  waitingForCustomer?: boolean;
}) {
  const targetLabel =
    label?.trim() || getDefaultStatusLabel(status, customerName);
  const [visibleView, setVisibleView] = useState<StatusBarView>(() => ({
    label: targetLabel,
    reason,
    status,
    waitingForCustomer,
  }));
  const [outgoingView, setOutgoingView] = useState<StatusBarView | null>(null);
  const [thinkingStartedAt, setThinkingStartedAt] = useState(() => Date.now());
  const previousStatusRef = useRef(status);
  const beamTheme = useAppearanceStore((state): BeamTheme =>
    state.themePreference === "dark" ||
    (state.themePreference === "system" && state.isSystemDarkMode)
      ? "dark"
      : "light",
  );
  useLayoutEffect(() => {
    const nextView = {
      label: targetLabel,
      reason,
      status,
      waitingForCustomer,
    };

    if (outgoingView) {
      if (outgoingView.status === status) {
        setOutgoingView(null);
        setVisibleView(nextView);
        return;
      }

      if (
        visibleView.status !== status ||
        visibleView.label !== targetLabel ||
        visibleView.reason !== reason ||
        visibleView.waitingForCustomer !== waitingForCustomer
      ) {
        setVisibleView(nextView);
      }
      return;
    }

    if (visibleView.status !== status) {
      setOutgoingView(visibleView);
      setVisibleView(nextView);
      return;
    }

    if (
      visibleView.label !== targetLabel ||
      visibleView.reason !== reason ||
      visibleView.waitingForCustomer !== waitingForCustomer
    ) {
      setVisibleView(nextView);
    }
  }, [
    reason,
    status,
    targetLabel,
    waitingForCustomer,
    outgoingView,
    visibleView.label,
    visibleView.reason,
    visibleView.status,
    visibleView.waitingForCustomer,
  ]);
  useLayoutEffect(() => {
    if (
      status === "thinking" &&
      previousStatusRef.current !== "thinking"
    ) {
      setThinkingStartedAt(Date.now());
    }
    previousStatusRef.current = status;
  }, [status]);
  useEffect(() => {
    if (!outgoingView) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setOutgoingView(null);
    }, STATUS_TRANSITION_FALLBACK_MS);

    return () => window.clearTimeout(timeoutId);
  }, [outgoingView]);

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
            actions={actions}
            beamTheme={beamTheme}
            customerName={customerName}
            thinkingStartedAt={thinkingStartedAt}
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
            actions={actions}
            beamTheme={beamTheme}
            customerName={customerName}
            thinkingStartedAt={thinkingStartedAt}
            view={visibleView}
        />
      </div>
    </div>
  );
}

function StatusBarSurface({
  actions,
  beamTheme,
  customerName,
  thinkingStartedAt,
  view,
}: {
  actions?: readonly ChatAIAssistantAction[];
  beamTheme: BeamTheme;
  customerName?: string;
  thinkingStartedAt: number;
  view: StatusBarView;
}) {
  if (view.status === "waiting") {
    return (
      <WaitStatusBarSurface
        customerName={customerName}
        label={view.label}
        reason={view.reason}
        waitingForCustomer={view.waitingForCustomer}
      />
    );
  }

  return (
    <OnStatusBarSurface
      actions={actions}
      beamTheme={beamTheme}
      label={view.label}
      status={view.status}
      thinkingStartedAt={thinkingStartedAt}
    />
  );
}

function WaitStatusBarSurface({
  customerName,
  label,
  reason,
  waitingForCustomer,
}: {
  customerName?: string;
  label: string;
  reason?: string;
  waitingForCustomer: boolean;
}) {
  const resolvedCustomerName = customerName?.trim();
  const shouldEmphasizeCustomerName =
    resolvedCustomerName &&
    label === getDefaultStatusLabel("waiting", resolvedCustomerName);

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className="chat-ai-assistant-status-surface relative z-20 h-full rounded-full border border-transparent"
        data-mode="wait"
        data-status="waiting"
        data-testid="chat-ai-assistant-status-bar"
        role="status"
      >
        <div className="relative z-10 flex h-full items-center justify-center gap-3 px-4 text-[13px] leading-4 font-medium text-foreground/80">
          <div className="flex min-w-0 items-center gap-2">
            <AgentThinkingOrb speed={0.6} state="breathing" />
            <span className="min-w-0 truncate">
              {reason ? (
                <>
                  {label}：
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help underline decoration-dotted underline-offset-2">
                        查看原因
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6}>
                      {reason}
                    </TooltipContent>
                  </Tooltip>
                </>
              ) : shouldEmphasizeCustomerName && !waitingForCustomer ? (
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
          {waitingForCustomer ? (
            <span className="shrink-0 text-muted-foreground">
              正在等待{" "}
              <strong className="font-semibold text-foreground">
                {resolvedCustomerName || "客户"}
              </strong>{" "}
              的消息
            </span>
          ) : null}
        </div>
      </div>
    </TooltipProvider>
  );
}

function OnStatusBarSurface({
  actions,
  beamTheme,
  label,
  status,
  thinkingStartedAt,
}: {
  actions?: readonly ChatAIAssistantAction[];
  beamTheme: BeamTheme;
  label: string;
  status: OnStatusBarStatus;
  thinkingStartedAt: number;
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
              speed={0.6}
              state={isThinking ? "connecting" : "breathing"}
            />
            {isThinking ? (
              <AnimatedTextSwitch
                className="min-w-0 text-[14px] font-medium text-muted-foreground"
                shiny
                shinyDuration={getThinkingShinyDuration(label)}
                staggerMs={12}
                value={label}
              />
            ) : (
              <span
                aria-label={label}
                className="min-w-0 truncate text-[14px] leading-5 font-medium text-foreground"
              >
                {label}
              </span>
            )}
            {isThinking ? (
              <ElapsedTime
                key={thinkingStartedAt}
                startedAt={thinkingStartedAt}
              />
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <OnStatusBarActions
              actions={actions}
              themeStyles={themeStyles}
            />
          </div>
        </div>
      </div>
    </BorderBeam>
  );
}

function OnStatusBarActions({
  actions = [],
  themeStyles,
}: {
  actions?: readonly ChatAIAssistantAction[];
  themeStyles: OnStatusBarThemeStyles;
}) {
  if (actions.length === 0) {
    return null;
  }

  return actions.map((action) => {
    const tone = action.tone ?? "quiet";

    return (
      <Button
        className={cn(
          "h-7 rounded-[8px] border-transparent px-3 text-xs shadow-none",
          tone === "primary"
            ? themeStyles.primaryActionButton
            : themeStyles.quietActionButton,
        )}
        disabled={action.disabled || !action.onSelect}
        key={action.id}
        onClick={action.onSelect}
        size="sm"
        type="button"
        variant={tone === "primary" ? "default" : "ghost"}
      >
        {action.label}
      </Button>
    );
  });
}

function getThinkingShinyDuration(label: string) {
  const duration =
    Array.from(label).length * THINKING_SHINY_SECONDS_PER_CHARACTER;
  return Math.min(
    THINKING_SHINY_MAX_DURATION_SECONDS,
    Math.max(THINKING_SHINY_MIN_DURATION_SECONDS, duration),
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
