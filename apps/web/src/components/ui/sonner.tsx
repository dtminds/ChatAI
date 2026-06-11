"use client";

import {
  AlertCircleIcon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type * as React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { Spinner } from "@/components/ui/spinner";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      icons={{
        success: <ToastIcon icon={CheckmarkCircle02Icon} />,
        info: <ToastIcon icon={InformationCircleIcon} />,
        warning: <ToastIcon icon={AlertCircleIcon} />,
        error: <ToastIcon icon={CancelCircleIcon} />,
        loading: <Spinner variant="classic" size={16} />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
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
