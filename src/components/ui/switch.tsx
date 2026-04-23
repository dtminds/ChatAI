import * as SwitchPrimitives from "@radix-ui/react-switch";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type SwitchProps = ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>;

export function Switch({ className, ...props }: SwitchProps) {
  return (
    <SwitchPrimitives.Root
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-[#d7dde6] transition-colors outline-none focus-visible:ring-4 focus-visible:ring-ring/20 data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          "pointer-events-none block size-4 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[18px]",
        )}
      />
    </SwitchPrimitives.Root>
  );
}
