import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "flex h-11 w-full rounded-[8px] border border-input/80 bg-transparent px-4 py-2 text-sm text-foreground shadow-xs outline-none transition-all placeholder:text-muted-foreground/90 focus-visible:border-primary/60 focus-visible:ring-4 focus-visible:ring-ring/20",
        className,
      )}
      {...props}
    />
  );
}
