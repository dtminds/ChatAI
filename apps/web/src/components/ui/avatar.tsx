import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState, type ComponentPropsWithoutRef } from "react";
import { normalizeAvatarUrl } from "@/lib/avatar-url";
import { cn } from "@/lib/utils";

type AvatarProps = ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>;

export function Avatar({ className, ...props }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        "relative flex size-11 shrink-0 rounded-[8px]",
        className,
      )}
      {...props}
    />
  );
}

export function AvatarImage({
  className,
  src,
  ...props
}: ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>) {
  const normalizedSrc = normalizeAvatarUrl(src);

  return (
    <AvatarPrimitive.Image
      className={cn("aspect-square size-full rounded-[inherit] object-cover", className)}
      src={normalizedSrc || undefined}
      {...props}
    />
  );
}

export function LazyAvatarImage({
  className,
  onError,
  src,
  ...props
}: ComponentPropsWithoutRef<"img">) {
  const normalizedSrc = normalizeAvatarUrl(src);
  const [failedSrc, setFailedSrc] = useState<string>();

  if (!normalizedSrc || failedSrc === normalizedSrc) {
    return null;
  }

  return (
    <img
      {...props}
      className={cn(
        "absolute inset-0 aspect-square size-full rounded-[inherit] object-cover",
        className,
      )}
      decoding="async"
      loading="lazy"
      onError={(event) => {
        setFailedSrc(normalizedSrc);
        onError?.(event);
      }}
      src={normalizedSrc}
    />
  );
}

export function AvatarFallback({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      className={cn(
        "flex size-full items-center justify-center rounded-[inherit] bg-primary/15 text-sm font-semibold text-primary",
        className,
      )}
      {...props}
    >
      {children ?? (
        <HugeiconsIcon
          aria-hidden="true"
          color="currentColor"
          icon={UserIcon}
          size={18}
          strokeWidth={1.8}
        />
      )}
    </AvatarPrimitive.Fallback>
  );
}

export function AvatarBadge({
  className,
  ...props
}: ComponentPropsWithoutRef<"span">) {
  return (
    <span
      className={cn(
        "absolute bottom-0 right-0 rounded-full ring-2 ring-sidebar",
        className,
      )}
      {...props}
    />
  );
}
