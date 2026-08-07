import {
  ArrowLeftRightIcon,
  ChartBreakoutCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";

const XY_LOGO_URL = "https://b5.bokr.com.cn/dist/ui/xy_logo.png";

const AUTHORIZED_ITEMS = [
  "客户档案读取与操作",
  "订单信息读取与操作",
] as const;

export function SkillResourceAuthDialog({
  onAgree,
  onOpenChange,
  open,
  submitting = false,
}: {
  onAgree: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  submitting?: boolean;
}) {
  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (submitting && !nextOpen) {
          return;
        }
        onOpenChange(nextOpen);
      }}
      open={open}
    >
      <DialogContent
        className="w-[min(600px,calc(100vw-2rem))] max-w-[600px] gap-0 overflow-hidden p-0 sm:rounded-[14px]"
        closeButtonDisabled={submitting}
      >
        <div className="space-y-1 border-b border-border px-6 py-5 pr-14">
          <DialogTitle className="text-base font-semibold text-foreground">
            资源授权
          </DialogTitle>
          <DialogDescription className="sr-only">
            授权 ChatAI 访问星云有客资源
          </DialogDescription>
        </div>

        <div className="space-y-6 px-8 py-8">
          <div className="flex items-center justify-center gap-5">
            <span className="inline-flex size-16 items-center justify-center overflow-hidden rounded-[14px] border border-border bg-card shadow-xs">
              <img
                alt="星云有客"
                className="size-8 object-contain"
                draggable={false}
                src={XY_LOGO_URL}
              />
            </span>
            <HugeiconsIcon
              aria-hidden="true"
              className="shrink-0 text-muted-foreground"
              icon={ArrowLeftRightIcon}
              size={24}
              strokeWidth={1.8}
            />
            <span className="inline-flex size-16 items-center justify-center overflow-hidden rounded-[14px] border border-border bg-card shadow-xs">
              <HugeiconsIcon
                aria-hidden="true"
                className="text-foreground"
                icon={ChartBreakoutCircleIcon}
                size={32}
                strokeWidth={1.8}
              />
            </span>
          </div>

          <div className="space-y-2 text-center">
            <p className="text-base font-semibold leading-6 text-foreground">
              ChatAI 想要访问您的星云有客资源
            </p>
            <p className="text-sm leading-5 text-muted-foreground">
              为了让智能体更准确地响应，需授权访问您的星云有客资源
            </p>
          </div>

          <div className="rounded-[10px] bg-muted/60 px-4 py-3 text-left">
            <p className="text-sm text-muted-foreground">授权项：</p>
            <ul className="mt-2 space-y-1.5 text-sm leading-5 text-foreground">
              {AUTHORIZED_ITEMS.map((item) => (
                <li className="flex items-start gap-2" key={item}>
                  <span
                    aria-hidden="true"
                    className="mt-2 size-1 shrink-0 rounded-full bg-foreground"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <DialogFooter className="border-t border-border px-6 py-4 sm:justify-end">
          <Button
            disabled={submitting}
            onClick={() => {
              onOpenChange(false);
            }}
            type="button"
            variant="outline"
          >
            取消
          </Button>
          <Button disabled={submitting} onClick={onAgree} type="button">
            同意并授权
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
