import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AgentSettingsRestoreDialog({
  onConfirm,
  onOpenChange,
  open,
}: {
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        aria-describedby="agent-settings-restore-description"
        className="gap-0 p-0 sm:max-w-[420px]"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="space-y-2 px-6 pt-6 text-left">
          <DialogTitle>是否还原到正式版内容？</DialogTitle>
          <DialogDescription id="agent-settings-restore-description">
            确认还原后，将无法恢复当前草稿内容
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 px-6 pb-6 pt-8 sm:gap-2">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              取消
            </Button>
          </DialogClose>
          <Button onClick={onConfirm} type="button">
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
