import { RoboticIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getCustodyHostingActionLabel,
  getCustodyHostingStatusLabel,
  isCustodyHostingExited,
  shouldUseFullCustodyCancelButton,
  type CustodyHostingStatus,
} from "@/pages/chat/lib/chat-custody-status";
import {
  chatCustodyBorderGradient,
  chatCustodyFullCustodyButtonColors,
  chatCustodyStatusIconColor,
  chatCustodyStatusTextGradient,
  chatCustodySurfaceColors,
  chatCustodyTextColors,
} from "@/pages/chat/lib/chat-custody-palette";

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
  const useFullCustodyCancelButton = shouldUseFullCustodyCancelButton(status);

  return (
    <div
      className={cn(
        "chat-custody-status-bar-border relative z-20 rounded-t-[10px] rounded-b-none p-px shadow-[0_4px_20px_var(--shadow-soft)]",
        className,
      )}
      data-testid="chat-custody-status-bar"
      style={{
        background: chatCustodyBorderGradient,
        backgroundSize: "200% 100%",
      }}
    >
      <div
        className="flex items-center justify-between gap-3 rounded-t-[9px] rounded-b-none px-4 py-1.5"
        style={{ backgroundColor: chatCustodySurfaceColors.barBackground }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <HugeiconsIcon
            className="shrink-0"
            icon={RoboticIcon}
            size={16}
            strokeWidth={1.8}
            style={{
              color: isExited ? chatCustodyTextColors.exited : chatCustodyStatusIconColor,
            }}
          />
          <span
            className={cn(
              "truncate text-sm",
              !isExited && "bg-clip-text text-transparent",
            )}
            style={
              isExited
                ? { color: chatCustodyTextColors.exited }
                : { backgroundImage: chatCustodyStatusTextGradient }
            }
          >
            {getCustodyHostingStatusLabel(status)}
          </span>
        </div>

        <Button
          className={cn(
            "h-7 shrink-0 rounded-[8px] px-3 text-xs shadow-none",
            !useFullCustodyCancelButton && "hover:bg-primary/92",
          )}
          onClick={isExited ? onEnable : onCancel}
          style={
            useFullCustodyCancelButton
              ? {
                  backgroundColor: chatCustodyFullCustodyButtonColors.background,
                  color: chatCustodyFullCustodyButtonColors.text,
                }
              : undefined
          }
          type="button"
          variant={useFullCustodyCancelButton ? "outline" : "default"}
        >
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}
