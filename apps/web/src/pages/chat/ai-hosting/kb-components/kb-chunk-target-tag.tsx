import {
  Cancel01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type KbChunkTargetTagProps = {
  chunkId: string;
  onClear: () => void;
};

export function KbChunkTargetTag({
  chunkId,
  onClear,
}: KbChunkTargetTagProps) {
  return (
    <Badge
      className="h-10 max-w-full gap-2 rounded-[8px] px-3 py-0 text-[13px] font-normal"
      variant="secondary"
    >
      <HugeiconsIcon
        aria-hidden="true"
        className="shrink-0 text-muted-foreground"
        icon={Search01Icon}
        size={16}
        strokeWidth={1.8}
      />
      <span className="min-w-0 max-w-[220px] truncate" title={`切片 ID：${chunkId}`}>
        切片 ID：{chunkId}
      </span>
      <Button
        aria-label="清除切片 ID 筛选"
        className="-mr-1 size-6 shrink-0 rounded-[6px] p-0 text-muted-foreground shadow-none hover:bg-background/60 hover:text-foreground"
        onClick={onClear}
        size="icon"
        type="button"
        variant="ghost"
      >
        <HugeiconsIcon
          aria-hidden="true"
          icon={Cancel01Icon}
          size={14}
          strokeWidth={2}
        />
      </Button>
    </Badge>
  );
}
