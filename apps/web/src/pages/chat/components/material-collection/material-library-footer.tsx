import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type MaterialLibraryFooterProps = {
  canSend: boolean;
  isBusy?: boolean;
  isSending?: boolean;
  onCancel: () => void;
  onSend: () => void;
};

export function MaterialLibraryFooter({
  canSend,
  isBusy = false,
  isSending = false,
  onCancel,
  onSend,
}: MaterialLibraryFooterProps) {
  return (
    <div className="flex shrink-0 justify-end gap-3 border-t border-divider px-8 py-4">
      <Button
        className="min-w-28"
        disabled={isBusy || isSending}
        onClick={onCancel}
        type="button"
        variant="outline"
      >
        取消
      </Button>
      <Button
        aria-busy={isSending}
        className="min-w-28 gap-2"
        disabled={isBusy || isSending || !canSend}
        onClick={onSend}
        type="button"
      >
        {isSending ? (
          <Spinner className="text-current" size={14} variant="classic" />
        ) : null}
        发送
      </Button>
    </div>
  );
}
