import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/pages/chat/chat-types";
import { formatConversationTimestamp } from "@/pages/chat/lib/chat-time";

export function ConversationCard({
  conversation,
  isActive,
  onSelect,
}: {
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={cn(
        "mb-1 w-full overflow-hidden border-b px-2.5 py-2.5 text-left transition-colors",
        isActive
          ? "rounded-md border-transparent bg-[#edf4ff] text-foreground"
          : "border-[#EEEFF0] bg-white hover:bg-[#f7f9fc]",
      )}
      onClick={onSelect}
      type="button"
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5">
        <div className="relative">
          <Avatar className="size-10">
            <AvatarImage
              alt={conversation.customerName}
              src={conversation.customerAvatarUrl}
            />
            <AvatarFallback>{conversation.customerName.slice(0, 1)}</AvatarFallback>
          </Avatar>
          {conversation.unread > 0 && !isActive ? (
            <div className="absolute -right-1 -top-1 min-w-4 rounded-full bg-[#ff4d4f] px-1 py-0.5 text-center text-[10px] font-semibold leading-none text-white">
              {conversation.unread}
            </div>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-[14px] font-medium text-foreground">
                {conversation.customerName}
              </p>
              {conversation.mode === "group" ? (
                <span
                  className={cn(
                    "rounded px-1 py-0.5 text-[10px]",
                    isActive
                      ? "bg-[#dce9ff] text-primary"
                      : "bg-[#eef3ff] text-primary",
                  )}
                >
                  群
                </span>
              ) : null}
            </div>
            {conversation.priority === "high" ? (
              <span className="shrink-0 whitespace-nowrap rounded bg-[#FFF1F1] px-1 py-0.5 text-[10px] leading-none text-[#C74848]">
                高优先
              </span>
            ) : (
              <span />
            )}
          </div>

          <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <p className="truncate text-[12px] text-[#7b8798]">
              {conversation.preview}
            </p>
            <span className="shrink-0 whitespace-nowrap text-xs text-[#8a94a6]">
              {formatConversationTimestamp(conversation.updatedAt)}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
