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
  scrollHideDelay = 700,
  type = "scroll",
  viewportProps,
  viewportRef,
  viewportTestId,
  ...props
}: ScrollAreaProps) {
  const { className: viewportClassName, ...restViewportProps } = viewportProps ?? {};

  return (
    <ScrollAreaPrimitive.Root
      className={cn("group/scroll-area relative overflow-hidden", className)}
      data-scrollbar-hide-delay={scrollHideDelay}
      data-scrollbar-visibility={type}
      scrollHideDelay={scrollHideDelay}
      type={type}
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
      forceMount
      className={cn(
        "pointer-events-none flex touch-none select-none opacity-0 transition-opacity duration-200 data-[state=visible]:pointer-events-auto data-[state=visible]:opacity-100 group-hover/scroll-area:pointer-events-auto group-hover/scroll-area:opacity-100",
        orientation === "vertical"
          ? "h-full w-[var(--scrollbar-size)] border-l border-l-transparent p-[var(--scrollbar-track-padding)]"
          : "h-[var(--scrollbar-size)] flex-col border-t border-t-transparent p-[var(--scrollbar-track-padding)]",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-[var(--scrollbar-radius)] bg-[var(--scrollbar-thumb)] transition-colors hover:bg-[var(--scrollbar-thumb-hover)]" />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}
