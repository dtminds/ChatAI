import { BorderBeam } from "border-beam";
import { AgentThinkingOrb } from "@/components/ui/agent-thinking-orb";
import { AnimatedTextSwitch } from "@/components/ui/animated-text-switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getAgentHostingActionLabel,
  getAgentHostingStatusLabel,
  isAgentHostingBusy,
  isAgentHostingExited,
  type AgentHostingStatus,
} from "@/pages/chat/lib/chat-agent-hosting-status";

export function ChatAgentHostingStatusBar({
  className,
  onCancel,
  onEnable,
  status,
}: {
  className?: string;
  onCancel?: () => void;
  onEnable?: () => void;
  status: AgentHostingStatus;
}) {
  const actionLabel = getAgentHostingActionLabel(status);
  const statusLabel = getAgentHostingStatusLabel(status);
  const isExited = isAgentHostingExited(status);
  const isBusy = isAgentHostingBusy(status);

  if (isExited) {
    return null;
  }

  return (
    <BorderBeam
      active
      borderRadius={999}
      className={cn(
        "relative z-20 block rounded-full",
        className,
      )}
      colorVariant="colorful"
      duration={2.4}
      size={isBusy ? "pulse-inner" : "line"}
      theme="auto"
    >
      <div
        className="relative overflow-hidden rounded-full border border-border shadow-[0_4px_20px_var(--shadow-soft)]"
        data-testid="chat-agent-hosting-status-bar"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-background/85 backdrop-blur-xs"
          data-testid="chat-agent-hosting-status-bar-surface"
        />
        <div
          className="relative z-10 flex items-center justify-between gap-3 px-4 py-1.5"
          data-testid="chat-agent-hosting-status-bar-content"
        >
          <div className="flex min-w-0 items-center gap-2">
            <AgentThinkingOrb
              speed={isBusy ? 1 : 0.6}
              state={isBusy ? "solving" : "searching"}
            />
            <AnimatedTextSwitch
              className="min-w-0 text-xs font-medium text-muted-foreground"
              shiny
              shinyDuration={isBusy ? 1.15 : 2}
              shinyShimmerWidth={44}
              staggerMs={12}
              value={statusLabel}
            />
          </div>

          <Button
            className="h-7 shrink-0 rounded-[8px] border-transparent bg-neutral-strong px-3 text-xs text-neutral-strong-foreground shadow-none hover:bg-neutral-strong/90 hover:text-neutral-strong-foreground"
            onClick={isExited ? onEnable : onCancel}
            type="button"
            variant="default"
          >
            {actionLabel}
          </Button>
        </div>
      </div>
    </BorderBeam>
  );
}
