import { ImageNotFound01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState, type ImgHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type MessageMediaFallbackProps = {
  className?: string;
  iconTestId?: string;
  iconSize?: number;
  label: string;
  testId?: string;
};

export function MessageMediaFallback({
  className,
  iconTestId,
  iconSize = 24,
  label,
  testId,
}: MessageMediaFallbackProps) {
  return (
    <div
      aria-label={label}
      className={cn(
        "flex items-center justify-center bg-muted-foreground/5 text-muted-foreground/30",
        className,
      )}
      data-testid={testId}
      role="img"
    >
      <HugeiconsIcon
        aria-hidden="true"
        data-icon-name="image-not-found-01"
        data-testid={iconTestId}
        icon={ImageNotFound01Icon}
        size={iconSize}
      />
    </div>
  );
}

type LoadableMessageImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "onError"> & {
  fallback: ReactNode;
};

export function LoadableMessageImage({
  fallback,
  ...imageProps
}: LoadableMessageImageProps) {
  const [hasLoadError, setHasLoadError] = useState(false);

  useEffect(() => {
    setHasLoadError(false);
  }, [imageProps.src]);

  if (hasLoadError) {
    return fallback;
  }

  return (
    <img
      {...imageProps}
      onError={() => setHasLoadError(true)}
    />
  );
}
