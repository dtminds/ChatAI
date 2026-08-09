import { ViewIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function SupportReadonlyNotice({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              aria-label="只读排查中"
              className="flex size-9 items-center justify-center rounded-[8px] border border-warning/30 bg-warning-muted/35 text-warning"
              role="status"
            >
              <HugeiconsIcon icon={ViewIcon} size={17} strokeWidth={1.8} />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            只读排查中
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
        icon={ViewIcon}
        size={17}
        strokeWidth={1.8}
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">只读排查中</p>
        <p className="mt-0.5 text-xs text-muted-foreground">仅可查看和下载</p>
      </div>
    </div>
  );
}
