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

export function AgentSettingsPublishDialog({
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
        aria-describedby="agent-settings-publish-description"
        className="gap-0 p-0 sm:max-w-[420px]"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="space-y-2 px-6 pt-6 text-left">
          <DialogTitle>是否确认发布到正式版？</DialogTitle>
          <DialogDescription id="agent-settings-publish-description">
            确认发布后，Agent配置将立即生效。
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
