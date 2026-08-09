import { Bug01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { notifyAuthSessionChanged } from "@/pages/auth/auth-tokens";
import { logout } from "@/pages/auth/auth-service";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type SupportReadonlyNoticeProps = {
  compact?: boolean;
  onExit?: () => void | Promise<void>;
};

export function SupportReadonlyNotice({ compact = false, onExit }: SupportReadonlyNoticeProps) {
  const handleExit = async () => {
    if (onExit) {
      await onExit();
      return;
    }

    try {
      await logout();
    } finally {
      notifyAuthSessionChanged();
    }
  };

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              aria-label="诊断模式"
              className="flex size-9 items-center justify-center rounded-[8px] border border-warning/30 bg-warning-muted/35 text-warning"
              role="status"
            >
              <HugeiconsIcon icon={Bug01Icon} size={17} strokeWidth={1.8} />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            诊断模式
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div
      className="flex items-start gap-2.5 rounded-[8px] border border-warning/30 bg-warning-muted/35 px-3 py-2.5"
      role="status"
    >
      <HugeiconsIcon
        className="mt-0.5 shrink-0 text-warning"
        icon={Bug01Icon}
        size={17}
        strokeWidth={1.8}
      />
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-foreground">诊断模式</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          请谨慎操作，
          <button
            className="text-primary hover:underline"
            onClick={() => void handleExit()}
            type="button"
          >
            点此退出
          </button>
        </p>
      </div>
    </div>
  );
}
