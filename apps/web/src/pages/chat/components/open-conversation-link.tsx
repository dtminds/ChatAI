import { MessageSquareShareIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createOpenConversationTarget } from "@/pages/chat/lib/conversation-navigation";

/**
 * Canonical cross-module entry for opening a workbench conversation.
 *
 * Use this component from tickets, Insights, and other modules instead of a
 * raw `/chat/conversations/:id` link. It carries the one-time open intent that
 * selects and temporarily promotes the target before the URL returns to `/chat`.
 */
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

  const target = createOpenConversationTarget(conversationId);

  return (
    <Button asChild className={cn("shrink-0", className)} size="sm" variant="ghost">
      <Link state={target.state} to={target.pathname}>
        <HugeiconsIcon icon={MessageSquareShareIcon} size={15} strokeWidth={1.8} />
        {label}
      </Link>
    </Button>
  );
}
