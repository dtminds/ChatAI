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
  return (
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
        close: <ToastIcon icon={Cancel01Icon} />,
        ...icons,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "12px",
          ...style,
        } as React.CSSProperties
      }
      toastOptions={{
        ...toastOptions,
        classNames: {
          ...toastOptions?.classNames,
          closeButton: cn(
            "text-muted-foreground",
            toastOptions?.classNames?.closeButton,
          ),
        },
        closeButtonAriaLabel: toastOptions?.closeButtonAriaLabel ?? "关闭通知",
      }}
      {...props}
    />
  );
};

function ToastIcon({
  className,
  icon,
}: {
  className?: string;
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
}) {
  return (
    <HugeiconsIcon
      className={className}
      color="currentColor"
      icon={icon}
      size={16}
      strokeWidth={1.8}
    />
  );
}

export { Toaster };
