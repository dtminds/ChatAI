import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import type { ComponentPropsWithoutRef, Ref } from "react";
import { cn } from "@/lib/utils";

type ScrollAreaViewportProps = ComponentPropsWithoutRef<"div">;

type ScrollAreaProps = ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
  viewportProps?: ScrollAreaViewportProps;
  viewportRef?: Ref<HTMLDivElement>;
  viewportTestId?: string;
};

export function ScrollArea({
  className,
  children,
  viewportProps,
  viewportRef,
  viewportTestId,
  ...props
}: ScrollAreaProps) {
  const { className: viewportClassName, ...restViewportProps } = viewportProps ?? {};

  return (
    <ScrollAreaPrimitive.Root
      className={cn("relative overflow-hidden", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        className={cn("size-full rounded-[inherit]", viewportClassName)}
        data-testid={viewportTestId}
        data-slot="scroll-area-viewport"
        ref={viewportRef}
        {...restViewportProps}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      orientation={orientation}
      className={cn(
        "flex touch-none select-none transition-colors",
        orientation === "vertical"
          ? "h-full w-2.5 border-l border-l-transparent p-px"
          : "h-2.5 flex-col border-t border-t-transparent p-px",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-[#d3dbe6]" />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}
