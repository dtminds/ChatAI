import { MessageSquareShareIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function OpenConversationLink({
  className,
  conversationId,
  label = "打开会话",
}: {
  className?: string;
  conversationId: string;
  label?: string;
}) {
  if (!conversationId) {
    return null;
  }

  return (
    <Button asChild className={cn("shrink-0", className)} size="sm" variant="ghost">
      <Link to={`/chat/conversations/${encodeURIComponent(conversationId)}`}>
        <HugeiconsIcon icon={MessageSquareShareIcon} size={15} strokeWidth={1.8} />
        {label}
      </Link>
    </Button>
  );
}
