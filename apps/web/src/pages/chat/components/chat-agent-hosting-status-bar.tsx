import { BorderBeam } from "border-beam";
import { AnimatedTextSwitch } from "@/components/ui/animated-text-switch";
import { Button } from "@/components/ui/button";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";
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
        className={cn(
          "relative overflow-hidden border border-border rounded-full shadow-[0_4px_20px_var(--shadow-soft)]",
          isExited ? "border-border" : "border-primary/25",
        )}
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
            {isBusy ? (
              <DotMatrixLoader
                ariaLabel="处理中"
                className="text-primary"
                dotSize={2}
                size={14}
                speed={1.2}
              />
            ) : (
              <DotMatrixLoader
                ariaLabel="AI托管中"
                cellPadding={0.625}
                className="text-primary"
                dotSize={2.5}
                size={15}
                speed={1.35}
                type="circular-8"
              />
            )}
            <AnimatedTextSwitch
              className="min-w-0 text-xs text-muted-foreground"
              shiny
              shinyDuration={isBusy ? 1.15 : 2}
              shinyShimmerWidth={44}
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
