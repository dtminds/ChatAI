import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type TabsVariant = "default" | "underline";

export function Tabs({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root className={cn("flex flex-col gap-2", className)} {...props} />;
}

export function TabsList({
  className,
  variant = "default",
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
  variant?: TabsVariant;
}) {
  return (
    <TabsPrimitive.List
      className={cn(
        variant === "underline"
          ? "inline-flex h-auto w-full items-center justify-start gap-6 rounded-none border-b border-divider bg-transparent p-0 text-muted-foreground"
          : "inline-flex h-10 items-center gap-1 rounded-[8px] bg-secondary/90 p-1 text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  variant = "default",
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
  variant?: TabsVariant;
}) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        variant === "underline"
          ? "inline-flex min-w-0 items-center justify-center gap-2 rounded-none border-b-2 border-transparent bg-transparent px-3 py-3 text-sm font-medium shadow-none transition-colors outline-none hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/20 data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
          : "inline-flex h-8 min-w-20 items-center justify-center gap-2 rounded-[6px] px-3 py-0 text-sm font-medium transition-all outline-none hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/20 data-[state=active]:bg-[var(--tabs-trigger-active-bg)] data-[state=active]:text-foreground data-[state=active]:shadow-[var(--tabs-trigger-active-shadow)]",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn("outline-none focus-visible:ring-0", className)}
      {...props}
    />
  );
}
