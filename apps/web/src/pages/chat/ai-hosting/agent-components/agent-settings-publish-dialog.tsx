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
import { Spinner } from "@/components/ui/spinner";

export function AgentSettingsPublishDialog({
  disabled,
  onConfirm,
  onOpenChange,
  open,
}: {
  disabled: boolean;
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
            确认发布后，Agent 配置将立即生效。
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="px-6 pb-6 pt-8">
          <DialogClose asChild>
            <Button disabled={disabled} type="button" variant="outline">
              取消
            </Button>
          </DialogClose>
          <Button disabled={disabled} onClick={onConfirm} type="button">
            {disabled ? (
              <>
                <Spinner
                  aria-hidden="true"
                  className="text-current"
                  size={14}
                  variant="classic"
                />
                <span className="sr-only">发布中</span>
              </>
            ) : null}
            发布
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
