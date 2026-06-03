import * as React from "react";
import { cn } from "@/lib/utils";

export interface SpinnerProps extends React.ComponentProps<"svg"> {
  size?: number | string;
  variant?: "track" | "classic";
}

function Spinner({
  className,
  size = 16,
  strokeWidth = 2,
  variant = "track",
  ...props
}: SpinnerProps) {
  if (variant === "classic") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("animate-spin text-muted-foreground", className)}
        data-slot="spinner"
        {...props}
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    );
  }

  // "track" 变体：带有淡色底环的双轨道 Spinner (Vercel / Linear 风格，更加精致)
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("animate-spin text-muted-foreground", className)}
      data-slot="spinner"
      {...props}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="opacity-20"
      />
      <path
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        className="opacity-80"
      />
    </svg>
  );
}

export { Spinner };
