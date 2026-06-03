import { Male02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type InsightPersonProps = {
  avatarUrl?: string;
  className?: string;
  name?: string | null;
  roleLabel?: string;
  size?: "md" | "sm";
};

export function InsightPerson({
  avatarUrl,
  className,
  name,
  roleLabel,
  size = "sm",
}: InsightPersonProps) {
  const displayName = name?.trim() || "未命名";

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <Avatar
        aria-label={displayName}
        className={cn(size === "md" ? "size-10" : "size-6", "rounded-[8px]")}
        role="img"
      >
        {avatarUrl ? <AvatarImage alt={displayName} src={avatarUrl} /> : null}
        <AvatarFallback>
          <HugeiconsIcon aria-hidden="true" color="currentColor" icon={Male02Icon} size={size === "md" ? 18 : 14} strokeWidth={1.8} />
        </AvatarFallback>
      </Avatar>
      <span
        className={cn(
          "min-w-0 truncate text-foreground",
          size === "md" ? "text-base" : "text-sm",
        )}
      >
        {roleLabel ? `${roleLabel} ${displayName}` : displayName}
      </span>
    </div>
  );
}
