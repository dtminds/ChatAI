import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type InsightPersonProps = {
  avatarUrl?: string;
  className?: string;
  name?: string | null;
  roleLabel?: string;
};

export function InsightPerson({
  avatarUrl,
  className,
  name,
  roleLabel,
}: InsightPersonProps) {
  const displayName = name?.trim() || "未命名";

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <Avatar aria-label={displayName} className="size-7 rounded-[8px]" role="img">
        {avatarUrl ? <AvatarImage alt={displayName} src={avatarUrl} /> : null}
        <AvatarFallback className="text-[11px]">{getFallbackText(displayName)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 truncate text-sm font-medium text-foreground">
        {roleLabel ? `${roleLabel} ${displayName}` : displayName}
      </span>
    </div>
  );
}

function getFallbackText(name: string) {
  return name.slice(0, 2);
}
