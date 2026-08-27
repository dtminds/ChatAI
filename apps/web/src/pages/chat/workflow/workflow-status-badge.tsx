import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const workflowStatusBadgeVariants = cva(
  "h-6 rounded-[6px] border px-2 py-0 text-xs font-medium",
  {
    variants: {
      variant: {
        neutral: "border-border/70 bg-muted text-muted-foreground",
        success: "border-success/10 bg-success-muted/50 text-success",
        warning: "border-warning/15 bg-warning-muted/40 text-warning",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

type WorkflowStatusBadgeProps = Omit<ComponentProps<typeof Badge>, "variant"> &
  VariantProps<typeof workflowStatusBadgeVariants>;

export function WorkflowStatusBadge({
  className,
  variant,
  ...props
}: WorkflowStatusBadgeProps) {
  return (
    <Badge
      className={cn(workflowStatusBadgeVariants({ variant }), className)}
      {...props}
    />
  );
}
