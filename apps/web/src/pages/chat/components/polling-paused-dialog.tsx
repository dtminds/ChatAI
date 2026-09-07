import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getPollingPausedDialogCopy,
  type PollingPauseReason,
} from "@/pages/chat/lib/polling-pause";

type PollingPausedDialogProps = {
  onRefresh: () => void;
  reason: PollingPauseReason | null;
};

export function PollingPausedDialog({
  onRefresh,
  reason,
}: PollingPausedDialogProps) {
  const copy = getPollingPausedDialogCopy(reason);

  return (
    <AlertDialog open={reason !== null}>
      <AlertDialogContent
        className="overflow-hidden p-0"
        size="sm"
        style={{ height: 286, maxWidth: 520, width: 520 }}
      >
        <div className="relative h-full overflow-hidden px-10 py-9">
          <AlertDialogHeader className="relative z-10 min-w-0 space-y-4 text-left">
            <AlertDialogTitle>{copy.title}</AlertDialogTitle>
            <AlertDialogDescription>{copy.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <img
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute bottom-2 left-2 w-[250px] select-none"
            data-testid="polling-paused-illustration"
            src="https://b5.bokr.com.cn/dist/pause_poll.png"
          />
          <AlertDialogFooter className="absolute bottom-10 right-10 z-10">
            <AlertDialogAction onClick={onRefresh}>刷新页面</AlertDialogAction>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
