import { ArrowTurnForwardIcon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";

type MessageMultiSelectToolbarProps = {
  className?: string;
  disabled?: boolean;
  onCancel: () => void;
  onForward: () => void;
  selectedCount: number;
};

export function MessageMultiSelectToolbar({
  className,
  disabled = false,
  onCancel,
  onForward,
  selectedCount,
}: MessageMultiSelectToolbarProps) {
  const canForward = !disabled && selectedCount > 0;

  return (
    <div
      className={cn(
        "flex h-11 items-center rounded-[14px] border border-border bg-card p-1 shadow-[0_4px_16px_var(--shadow-soft)]",
        className,
      )}
      data-testid="message-multi-select-toolbar"
    >
      <button
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-[12px] font-medium text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20",
          canForward ? "hover:bg-surface-hover" : "cursor-not-allowed opacity-45",
        )}
        disabled={!canForward}
        onClick={onForward}
        type="button"
      >
        <HugeiconsIcon
          aria-hidden="true"
          color="currentColor"
          icon={ArrowTurnForwardIcon}
          size={18}
          strokeWidth={1.8}
        />
        <span>逐条转发</span>
      </button>
      <div aria-hidden="true" className="mx-1 h-5 w-px bg-divider" />
      <button
        aria-label="退出多选"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-45"
        disabled={disabled}
        onClick={onCancel}
        type="button"
      >
        <HugeiconsIcon
          aria-hidden="true"
          color="currentColor"
          icon={Cancel01Icon}
          size={16}
          strokeWidth={2}
        />
      </button>
    </div>
  );
}
