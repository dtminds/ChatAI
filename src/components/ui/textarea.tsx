import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "flex min-h-28 w-full rounded-[24px] border border-input/80 bg-background/75 px-4 py-3 text-sm text-foreground shadow-sm outline-none transition-all placeholder:text-muted-foreground/90 focus-visible:border-primary/60 focus-visible:ring-4 focus-visible:ring-ring/20",
        className,
      )}
      {...props}
    />
  );
}
