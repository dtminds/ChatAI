import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const InputGroup = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => (
  <div
    className={cn(
      "group/input-group relative flex h-10 w-full min-w-0 items-center rounded-[10px] border border-input bg-background shadow-xs outline-none transition-[color,box-shadow] focus-within:border-ring/60 focus-within:ring-4 focus-within:ring-ring/15",
      "has-[[data-slot=input-group-control][aria-invalid=true]]:border-destructive has-[[data-slot=input-group-control][aria-invalid=true]]:ring-destructive/20",
      className,
    )}
    data-slot="input-group"
    ref={ref}
    role="group"
    {...props}
  />
));
InputGroup.displayName = "InputGroup";

type InputGroupAddonProps = React.ComponentPropsWithoutRef<"div"> & {
  align?: "inline-end" | "inline-start";
};

const InputGroupAddon = React.forwardRef<HTMLDivElement, InputGroupAddonProps>(
  ({ align = "inline-start", className, ...props }, ref) => (
    <div
      className={cn(
        "flex h-full shrink-0 items-center gap-1.5 text-sm text-muted-foreground",
        align === "inline-start" ? "order-first pl-1" : "order-last pr-1",
        className,
      )}
      data-align={align}
      data-slot="input-group-addon"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button")) {
          return;
        }
        event.currentTarget.parentElement?.querySelector("input")?.focus();
      }}
      ref={ref}
      role="group"
      {...props}
    />
  ),
);
InputGroupAddon.displayName = "InputGroupAddon";

const InputGroupButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size = "sm", type = "button", variant = "ghost", ...props }, ref) => (
    <Button
      className={cn(
        "shadow-none focus-visible:ring-0",
        className,
      )}
      ref={ref}
      size={size}
      type={type}
      variant={variant}
      {...props}
    />
  ),
);
InputGroupButton.displayName = "InputGroupButton";

const InputGroupInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentPropsWithoutRef<"input">
>(({ className, ...props }, ref) => (
  <Input
    className={cn(
      "h-full min-w-0 flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:border-0 focus-visible:ring-0",
      className,
    )}
    data-slot="input-group-control"
    ref={ref}
    {...props}
  />
));
InputGroupInput.displayName = "InputGroupInput";

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
};
