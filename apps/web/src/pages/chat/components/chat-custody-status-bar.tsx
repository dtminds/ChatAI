import { BorderBeam } from "border-beam";
import { Button } from "@/components/ui/button";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";
import { ShinyText } from "@/components/ui/shiny-text";
import { cn } from "@/lib/utils";
import {
  getCustodyHostingActionLabel,
  getCustodyHostingStatusLabel,
  isCustodyHostingExited,
  type CustodyHostingStatus,
} from "@/pages/chat/lib/chat-custody-status";

export function ChatCustodyStatusBar({
  className,
  onCancel,
  onEnable,
  status,
}: {
  className?: string;
  onCancel?: () => void;
  onEnable?: () => void;
  status: CustodyHostingStatus;
}) {
  const actionLabel = getCustodyHostingActionLabel(status);
  const isExited = isCustodyHostingExited(status);
  const isBusy = status === "thinking" || status === "retrying";

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
        data-testid="chat-custody-status-bar"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-background/85 backdrop-blur-xs"
          data-testid="chat-custody-status-bar-surface"
        />
        <div
          className="relative z-10 flex items-center justify-between gap-3 px-4 py-1.5"
          data-testid="chat-custody-status-bar-content"
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
            <ShinyText
              className="truncate text-xs text-muted-foreground"
              duration={isBusy ? 1.15 : 2}
              shimmerWidth={44}
            >
              {getCustodyHostingStatusLabel(status)}
            </ShinyText>
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
