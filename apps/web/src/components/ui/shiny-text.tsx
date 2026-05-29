import { cn } from "@/lib/utils";

type ShinyTextProps = React.ComponentProps<"span"> & {
  shimmerWidth?: number;
};

function ShinyText({
  children,
  className,
  shimmerWidth = 80,
  style,
  ...props
}: ShinyTextProps) {
  return (
    <span
      data-slot="shiny-text"
      style={
        {
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
