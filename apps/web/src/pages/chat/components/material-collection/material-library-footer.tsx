import { Button } from "@/components/ui/button";

type MaterialLibraryFooterProps = {
  canSend: boolean;
  isBusy?: boolean;
  onCancel: () => void;
  onSend: () => void;
};

export function MaterialLibraryFooter({
  canSend,
  isBusy = false,
  onCancel,
  onSend,
}: MaterialLibraryFooterProps) {
  return (
    <div className="flex shrink-0 justify-end gap-3 border-t border-divider px-8 py-4">
      <Button
        className="min-w-28"
        disabled={isBusy}
        onClick={onCancel}
        type="button"
        variant="outline"
      >
        取消
      </Button>
      <Button
        className="min-w-28"
        disabled={isBusy || !canSend}
        onClick={onSend}
        type="button"
      >
        发送
      </Button>
    </div>
  );
}
