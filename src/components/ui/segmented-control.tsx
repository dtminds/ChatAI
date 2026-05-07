import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

export function SegmentedControl({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      className={cn(
        "inline-flex h-[30px] items-center gap-0.5 rounded-[15px] border border-border bg-surface-muted p-[3px]",
        className,
      )}
      {...props}
    />
  );
}

export function SegmentedControlItem({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      className={cn(
        "inline-flex h-6 w-8 items-center justify-center rounded-[12px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 data-[state=on]:bg-surface data-[state=on]:text-foreground data-[state=on]:shadow-[0_1px_3px_var(--shadow-soft)]",
        className,
      )}
      {...props}
    />
  );
}
