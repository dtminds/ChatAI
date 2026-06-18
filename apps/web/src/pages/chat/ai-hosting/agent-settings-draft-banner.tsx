import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { aiHostingDraftBannerColors } from "./ai-hosting-palette";

export function AgentSettingsDraftBanner({
  onRestoreClick,
}: {
  onRestoreClick: () => void;
}) {
  return (
    <div
      className="inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-foreground"
      style={{ backgroundColor: aiHostingDraftBannerColors.background }}
    >
      <HugeiconsIcon
        className="shrink-0"
        icon={InformationCircleIcon}
        size={14}
        strokeWidth={1.8}
        style={{ color: aiHostingDraftBannerColors.icon }}
      />
      <span className="leading-5">
        当前为未发布的草稿，你可以将下方内容
        <Button
          className="h-auto px-1 py-0 text-xs font-normal hover:bg-transparent hover:opacity-80"
          onClick={onRestoreClick}
          style={{ color: aiHostingDraftBannerColors.link }}
          type="button"
          variant="ghost"
        >
          还原为正式版内容
        </Button>
      </span>
    </div>
  );
}
