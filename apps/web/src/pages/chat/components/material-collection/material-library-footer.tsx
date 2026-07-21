import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type MaterialLibraryFooterProps = {
  actionLabel?: string;
  canSend: boolean;
  isMobileLayout?: boolean;
  isBusy?: boolean;
  isSending?: boolean;
  onCancel: () => void;
  onSend: () => void;
};

export function MaterialLibraryFooter({
  actionLabel = "发送",
  canSend,
  isMobileLayout = false,
  isBusy = false,
  isSending = false,
  onCancel,
  onSend,
}: MaterialLibraryFooterProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 justify-end gap-3 border-t border-divider",
        isMobileLayout
          ? "px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3"
          : "px-8 py-4",
      )}
    >
      <Button
        className={cn(isMobileLayout ? "h-11 min-w-0 flex-1" : "min-w-28")}
        disabled={isBusy || isSending}
        onClick={onCancel}
        type="button"
        variant="outline"
      >
        取消
      </Button>
      <Button
        aria-busy={isSending}
        className={cn(isMobileLayout ? "h-11 min-w-0 flex-1 gap-2" : "min-w-28 gap-2")}
        disabled={isBusy || isSending || !canSend}
        onClick={onSend}
        type="button"
      >
        {isSending ? (
          <Spinner className="text-current" size={14} variant="classic" />
        ) : null}
        {actionLabel}
      </Button>
    </div>
  );
}
