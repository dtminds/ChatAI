import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

function Timeline({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      className={cn("flex flex-col gap-2.5", className)}
      data-slot="timeline"
      {...props}
    />
  );
}

function TimelineItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      className={cn(
        "group/timeline-item relative flex flex-col gap-0.5 pl-8",
        className,
      )}
      data-slot="timeline-item"
      {...props}
    />
  );
}

const timelineIndicatorVariants = cva(
  "absolute top-1.5 left-1 size-2 -translate-x-1/2 rounded-full",
  {
    variants: {
      variant: {
        default: "bg-muted-foreground",
        destructive: "bg-destructive",
        success: "bg-success",
        warning: "bg-warning",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function TimelineIndicator({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof timelineIndicatorVariants>) {
  return (
    <span
      aria-hidden="true"
      className={cn(timelineIndicatorVariants({ variant }), className)}
      data-slot="timeline-indicator"
      {...props}
    />
  );
}

function TimelineSeparator({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute top-6 -bottom-1.5 left-1 w-0.5 -translate-x-1/2 bg-foreground/10 group-last/timeline-item:hidden",
        className,
      )}
      data-slot="timeline-separator"
      {...props}
    />
  );
}

function TimelineTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("text-sm font-medium", className)}
      data-slot="timeline-title"
      {...props}
    />
  );
}

function TimelineDate({ className, ...props }: React.ComponentProps<"time">) {
  return (
    <time
      className={cn("text-xs text-muted-foreground", className)}
      data-slot="timeline-date"
      {...props}
    />
  );
}

function TimelineContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("text-xs text-muted-foreground", className)}
      data-slot="timeline-content"
      {...props}
    />
  );
}

export {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
};
