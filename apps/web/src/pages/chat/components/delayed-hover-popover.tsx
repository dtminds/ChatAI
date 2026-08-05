import {
  type ComponentProps,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type PopoverOpenMode = "hover" | "interaction";

export function DelayedHoverPopover({
  children,
  closeDelay = 120,
  contentProps,
  onOpenChange,
  openDelay,
  trigger,
}: {
  children: ReactNode;
  closeDelay?: number;
  contentProps?: Omit<
    ComponentProps<typeof PopoverContent>,
    "children" | "onCloseAutoFocus" | "onOpenAutoFocus"
  >;
  onOpenChange?: (open: boolean) => void;
  openDelay: number;
  trigger: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const openModeRef = useRef<PopoverOpenMode>("interaction");
  const openTimerRef = useRef<number | undefined>(undefined);
  const closeTimerRef = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearTimeout(openTimerRef.current);
      window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  function clearOpenTimer() {
    window.clearTimeout(openTimerRef.current);
    openTimerRef.current = undefined;
  }

  function clearCloseTimer() {
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = undefined;
  }

  function updateOpen(nextOpen: boolean) {
    clearOpenTimer();
    clearCloseTimer();
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }

  function handlePointerEnter(event: ReactPointerEvent) {
    if (event.pointerType === "touch") {
      return;
    }

    clearCloseTimer();
    if (open) {
      return;
    }

    clearOpenTimer();
    openTimerRef.current = window.setTimeout(() => {
      openModeRef.current = "hover";
      updateOpen(true);
    }, openDelay);
  }

  function handlePointerLeave(event: ReactPointerEvent) {
    if (event.pointerType === "touch") {
      return;
    }

    clearOpenTimer();
    if (!open || openModeRef.current !== "hover") {
      return;
    }

    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      updateOpen(false);
    }, closeDelay);
  }

  return (
    <Popover
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          openModeRef.current = "interaction";
        }
        updateOpen(nextOpen);
      }}
      open={open}
    >
      <PopoverTrigger
        asChild
        onClick={(event) => {
          clearOpenTimer();

          if (open && openModeRef.current === "hover") {
            event.preventDefault();
            openModeRef.current = "interaction";
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            openModeRef.current = "interaction";
          }
        }}
        onPointerDown={(event) => {
          if (!open || event.pointerType === "touch") {
            openModeRef.current = "interaction";
          }
        }}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        {...contentProps}
        onCloseAutoFocus={(event) => {
          if (openModeRef.current === "hover") {
            event.preventDefault();
          }
        }}
        onOpenAutoFocus={(event) => {
          if (openModeRef.current === "hover") {
            event.preventDefault();
          }
        }}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
