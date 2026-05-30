import { cn } from "@/lib/utils";

type ShinyTextProps = React.ComponentProps<"span"> & {
  duration?: number;
  shimmerWidth?: number;
};

function ShinyText({
  children,
  className,
  duration = 1.35,
  shimmerWidth = 56,
  style,
  ...props
}: ShinyTextProps) {
  return (
    <span
      data-slot="shiny-text"
      style={
        {
          "--shiny-text-duration": `${duration}s`,
          "--shiny-text-shimmer-width": `${shimmerWidth}px`,
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

export { ShinyText };
