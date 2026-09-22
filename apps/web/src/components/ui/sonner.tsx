"use client";

import {
  AlertCircleIcon,
  Cancel01Icon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type * as React from "react";
import { createPortal } from "react-dom";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const Toaster = ({
  className,
  closeButton = true,
  icons,
  style,
  toastOptions,
  ...props
}: ToasterProps) => {
  const toaster = (
    <Sonner
      theme="system"
      className={cn("toaster group", className)}
      closeButton={closeButton}
      icons={{
        success: <ToastIcon icon={CheckmarkCircle02Icon} />,
        info: <ToastIcon icon={InformationCircleIcon} />,
        warning: <ToastIcon icon={AlertCircleIcon} />,
        error: <ToastIcon icon={CancelCircleIcon} />,
        loading: <Spinner variant="classic" size={16} />,
        close: <ToastIcon icon={Cancel01Icon} size={14} />,
        ...icons,
      }}
      style={style}
      toastOptions={{
        ...toastOptions,
        unstyled: true,
        classNames: {
          ...toastOptions?.classNames,
          toast: cn(
            "flex w-[var(--width)] flex-wrap items-start gap-2.5 rounded-[12px] border border-border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-[0_10px_28px_var(--shadow-soft)]",
            toastOptions?.classNames?.toast,
          ),
          title: cn(
            "font-semibold leading-5 tracking-tight text-foreground",
            toastOptions?.classNames?.title,
          ),
          description: cn(
            "text-[13px] leading-5 text-muted-foreground",
            toastOptions?.classNames?.description,
          ),
          content: cn("flex min-w-0 flex-1 flex-col gap-0.5 pr-6", toastOptions?.classNames?.content),
          icon: cn(
            "flex h-5 w-4 shrink-0 items-center justify-center text-foreground [&_svg]:m-0",
            toastOptions?.classNames?.icon,
          ),
          closeButton: cn(
            "absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-[8px] border-0 bg-transparent text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20",
            toastOptions?.classNames?.closeButton,
          ),
          actionButton: cn(
            "inline-flex h-7 shrink-0 items-center rounded-[8px] bg-primary px-2.5 text-xs font-medium text-primary-foreground",
            toastOptions?.classNames?.actionButton,
          ),
          cancelButton: cn(
            "inline-flex h-7 shrink-0 items-center rounded-[8px] bg-secondary px-2.5 text-xs font-medium text-secondary-foreground",
            toastOptions?.classNames?.cancelButton,
          ),
          success: cn("[&_[data-icon]]:text-success", toastOptions?.classNames?.success),
          error: cn("[&_[data-icon]]:text-destructive", toastOptions?.classNames?.error),
          warning: cn("[&_[data-icon]]:text-warning", toastOptions?.classNames?.warning),
          info: cn("[&_[data-icon]]:text-info", toastOptions?.classNames?.info),
          loading: cn(
            "[&_[data-content]]:pr-0 [&_[data-icon]]:text-muted-foreground",
            toastOptions?.classNames?.loading,
          ),
        },
        closeButtonAriaLabel: toastOptions?.closeButtonAriaLabel ?? "关闭通知",
      }}
      {...props}
    />
  );

  if (typeof document === "undefined") {
    return toaster;
  }

  return createPortal(toaster, document.body);
};

function ToastIcon({
  className,
  icon,
  size = 16,
}: {
  className?: string;
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
  size?: number;
}) {
  return (
    <HugeiconsIcon
      className={className}
      color="currentColor"
      icon={icon}
      size={size}
      strokeWidth={1.8}
    />
  );
}

export { Toaster };
