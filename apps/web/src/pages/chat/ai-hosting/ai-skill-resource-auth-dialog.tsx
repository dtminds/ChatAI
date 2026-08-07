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
const AUTH_BACKGROUND_URL = "https://b5.bokr.com.cn/dist/ui/app_auth_bg.jpg";

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
        closeButtonClassName="ai-skill-resource-auth-close"
        closeButtonDisabled={submitting}
      >
        <DialogTitle className="sr-only">授权三方接入</DialogTitle>
        <DialogDescription className="sr-only">
          ChatAI 需要授权来访问三方数据
        </DialogDescription>

        <div
          className="m-4 space-y-6 rounded-[10px] bg-center bg-cover bg-no-repeat px-8 pb-6 pt-8"
          style={{ backgroundImage: `url(${AUTH_BACKGROUND_URL})` }}
        >
          <div className="flex items-center justify-center gap-4">
            <span className="ai-skill-resource-auth-logo inline-flex size-12 items-center justify-center overflow-hidden rounded-[12px] border">
              <img
                alt="星云有客"
                className="size-6 object-contain"
                draggable={false}
                src={XY_LOGO_URL}
              />
            </span>
            <HugeiconsIcon
              aria-hidden="true"
              className="ai-skill-resource-auth-arrow shrink-0"
              icon={ArrowLeftRightIcon}
              size={22}
              strokeWidth={1.8}
            />
            <span className="ai-skill-resource-auth-logo inline-flex size-12 items-center justify-center overflow-hidden rounded-[12px] border">
              <HugeiconsIcon
                aria-hidden="true"
                className="ai-skill-resource-auth-logo-icon"
                icon={ChartBreakoutCircleIcon}
                size={24}
                strokeWidth={1.8}
              />
            </span>
          </div>

          <div className="space-y-2 text-center">
            <p className="ai-skill-resource-auth-title text-base font-semibold leading-6">
              授权三方接入
            </p>
            <p className="ai-skill-resource-auth-description text-sm leading-5">
              ChatAI 需要授权来访问三方数据
            </p>
          </div>
        </div>

        <div className="px-8 pb-8">
          <div className="rounded-[10px] px-4 py-3 text-left">
            <p className="text-sm font-semibold text-foreground">
              授权后将获得以下权限：
            </p>
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
