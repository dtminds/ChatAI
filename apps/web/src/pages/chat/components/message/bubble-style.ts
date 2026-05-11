import { cn } from "@/lib/utils";

export function getTextBubbleClassName(isAgent: boolean, isOwnMessage?: boolean) {
  const isRightAligned = isAgent || Boolean(isOwnMessage);

  return cn(
    "w-fit max-w-full rounded-[12px] px-3 py-2.5 text-[14px] leading-6",
    isRightAligned
      ? "bg-primary/15 text-foreground"
      : "bg-secondary text-foreground",
  );
}
