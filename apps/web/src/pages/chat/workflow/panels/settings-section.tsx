import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function WorkflowSettingsSection({
  actions,
  children,
  className,
  contentClassName,
  title,
  titleAccessory,
}: {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  title: ReactNode;
  titleAccessory?: ReactNode;
}) {
  return (
    <section className={cn("pb-3", className)}>
      <div className={cn("flex items-center gap-1.5 py-3", actions && "justify-between")}>
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
          {titleAccessory}
        </div>
        {actions}
      </div>
      <div className={cn("space-y-3", contentClassName)}>{children}</div>
    </section>
  );
}
