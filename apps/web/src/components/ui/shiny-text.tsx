import { cn } from "@/lib/utils";

const SHINY_TEXT_SWEEP_PROGRESS = 0.85;

type ShinyTextProps = React.ComponentProps<"span"> & {
  baseColor?: string;
  duration?: number;
  highlightColor?: string;
};

function ShinyText({
  baseColor,
  children,
  className,
  duration = 1.35,
  highlightColor = "var(--foreground)",
  style,
  ...props
}: ShinyTextProps) {
  return (
    <span
      data-slot="shiny-text"
      style={
        {
          ...(baseColor
            ? { "--shiny-text-base-color": baseColor }
            : {}),
          "--shiny-text-cycle-duration": `${getShinyTextCycleDuration(duration)}s`,
          "--shiny-text-highlight-color": highlightColor,
          ...style,
        } as React.CSSProperties
      }
      className={cn("shiny-text", className)}
      {...props}
    >
      {children}
    </span>
  );
}

function getShinyTextCycleDuration(sweepDuration: number) {
  return Number((sweepDuration / SHINY_TEXT_SWEEP_PROGRESS).toFixed(3));
}

export { getShinyTextCycleDuration, ShinyText };
