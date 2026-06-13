import { Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";

type MaterialSelectionIndicatorProps = {
  className?: string;
  selected: boolean;
  size?: "sm" | "md";
};

export function MaterialSelectionIndicator({
  className,
  selected,
  size = "md",
}: MaterialSelectionIndicatorProps) {
  const dimensionClass = size === "sm" ? "size-4" : "size-5";
  const iconSize = size === "sm" ? 10 : 12;

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full border border-input shadow-xs transition-colors",
        dimensionClass,
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background/95",
        className,
      )}
    >
      <HugeiconsIcon
        className={cn(
          "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity",
          selected ? "opacity-100" : "opacity-0",
        )}
        icon={Tick02Icon}
        size={iconSize}
        strokeWidth={2.2}
      />
    </span>
  );
}
