import { cn } from "@/lib/utils";

export function BetaBadge({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "beta-badge flex h-[18px] min-w-10 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-medium leading-none",
        className,
      )}
    >
      Beta
    </span>
  );
}
