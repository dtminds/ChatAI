import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";

export function AgentSettingsDraftBanner({
  onRestoreClick,
}: {
  onRestoreClick: () => void;
}) {
  return (
    <div className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#EAF3FF] px-3 py-1.5 text-xs text-foreground">
      <HugeiconsIcon
        className="shrink-0 text-[#3B82F6]"
        icon={InformationCircleIcon}
        size={14}
        strokeWidth={1.8}
      />
      <span className="leading-5">
        当前为未发布的草稿，你可以将下方内容
        <Button
          className="h-auto px-1 py-0 text-xs font-normal text-[#2563EB] hover:bg-transparent hover:text-[#1D4ED8]"
          onClick={onRestoreClick}
          type="button"
          variant="ghost"
        >
          还原为正式版内容
        </Button>
      </span>
    </div>
  );
}
