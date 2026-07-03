import { DotmCircular8 } from "@/components/ui/dotmatrix/dotm-circular-8";
import { DotmSquare1 } from "@/components/ui/dotmatrix/dotm-square-1";
import { DotmSquare5 } from "@/components/ui/dotmatrix/dotm-square-5";
import type { DotMatrixCommonProps } from "@/components/ui/dotmatrix/dotmatrix-core";
import { cn } from "@/lib/utils";

export type DotMatrixLoaderType = "circular-8" | "square-1" | "square-5";

export interface DotMatrixLoaderProps extends DotMatrixCommonProps {
  type?: DotMatrixLoaderType;
}

const dotMatrixLoaders = {
  "circular-8": DotmCircular8,
  "square-1": DotmSquare1,
  "square-5": DotmSquare5,
} satisfies Record<DotMatrixLoaderType, typeof DotmSquare1>;

export function DotMatrixLoader({
  className,
  type = "square-1",
  ...props
}: DotMatrixLoaderProps) {
  const Loader = dotMatrixLoaders[type];

  return (
    <div
      className="inline-flex shrink-0 items-center justify-center leading-none"
      data-loader-type={type}
      data-testid="dot-matrix-loader"
    >
      <Loader {...props} className={cn("text-current", className)} />
    </div>
  );
}
