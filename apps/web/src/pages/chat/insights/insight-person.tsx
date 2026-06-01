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
        className={cn(size === "md" ? "size-10" : "size-7", "rounded-[8px]")}
        role="img"
      >
        {avatarUrl ? <AvatarImage alt={displayName} src={avatarUrl} /> : null}
        <AvatarFallback className="text-[11px]">{getFallbackText(displayName)}</AvatarFallback>
      </Avatar>
      <span
        className={cn(
          "min-w-0 truncate font-medium text-foreground",
          size === "md" ? "text-base" : "text-sm",
        )}
      >
        {roleLabel ? `${roleLabel} ${displayName}` : displayName}
      </span>
    </div>
  );
}

function getFallbackText(name: string) {
  return name.slice(0, 2);
}
