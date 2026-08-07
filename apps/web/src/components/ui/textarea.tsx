import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const textareaVariants = cva(
  "flex min-h-28 w-full rounded-[8px] border px-4 py-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/90 focus-visible:border-primary/60 focus-visible:ring-4 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50",
  {
    variants: {
      variant: {
        outline: "border-input/80 bg-transparent shadow-xs",
        soft: "border-transparent bg-secondary shadow-none",
      },
    },
    defaultVariants: {
      variant: "outline",
    },
  },
);

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof textareaVariants> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <textarea
        className={cn(textareaVariants({ variant }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);

Textarea.displayName = "Textarea";

export { textareaVariants };
