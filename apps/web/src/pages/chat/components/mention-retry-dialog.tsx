import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getMentionRetryDialogCopy,
  type MentionRetryDialogState,
} from "@/pages/chat/lib/mention-retry";

type MentionRetryDialogProps = {
  isRefreshing: boolean;
  onCancel: () => void;
  onRetry: () => void;
  state: MentionRetryDialogState | null;
};

export function MentionRetryDialog({
  isRefreshing,
  onCancel,
  onRetry,
  state,
}: MentionRetryDialogProps) {
  const copy = state
    ? getMentionRetryDialogCopy(state)
    : { description: "", title: "" };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
      open={state !== null}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button disabled={isRefreshing} onClick={onRetry}>
            {isRefreshing ? "刷新中" : "刷新群成员并重试"}
          </Button>
          <Button onClick={onCancel} variant="outline">
            取消
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
