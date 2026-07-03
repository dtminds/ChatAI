import { cn } from "@/lib/utils";

export function formatUnreadCount(count: number) {
  return count > 99 ? "99+" : String(count);
}

export function AvatarUnreadCountBadge({
  ariaLabel,
  className,
  count,
  testId,
}: {
  ariaLabel: string;
  className?: string;
  count: number;
  testId?: string;
}) {
  if (count <= 0) {
    return null;
  }

  return (
    <span
      aria-label={ariaLabel}
      className={cn(
        "absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-background bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground",
        className,
      )}
      data-testid={testId}
    >
      {formatUnreadCount(count)}
    </span>
  );
}
