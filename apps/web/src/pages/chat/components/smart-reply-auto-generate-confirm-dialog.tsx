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

export function SmartReplyAutoGenerateConfirmDialog({
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
        aria-describedby="smart-reply-auto-generate-description"
        className="gap-0 p-0 sm:max-w-[420px]"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="space-y-2 px-6 pt-6 text-left">
          <DialogTitle>是否确认开启话术自动生成？</DialogTitle>
          <DialogDescription
            className="space-y-1 text-sm leading-6 text-muted-foreground"
            id="smart-reply-auto-generate-description"
          >
            <span className="block">确认开启后，所有活跃会话都会自动生成推荐话术。</span>
            <span className="block">（AI全自动托管状态下不会自动生成）</span>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 px-6 pb-6 pt-8 sm:gap-2">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              取消
            </Button>
          </DialogClose>
          <Button onClick={onConfirm} type="button">
            确认开启
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
