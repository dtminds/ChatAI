import { useState } from "react";
import {
  MoreHorizontalIcon,
  PinIcon,
  CheckUnread02Icon,
  EyeIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/pages/chat/chat-types";
import { formatConversationTimestamp } from "@/pages/chat/lib/chat-time";

const conversationMenuItems = [
  { label: "置顶/取消置顶", icon: PinIcon },
  { label: "标记未读", icon: CheckUnread02Icon },
  { label: "不显示", icon: EyeIcon },
];

export function ConversationCard({
  conversation,
  isActive,
  onSelect,
}: {
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onSelect();
  };

  return (
    <div
      className={cn(
        "group relative mb-1 w-full cursor-pointer overflow-visible border-b px-2.5 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/20",
        isActive
          ? "rounded-md border-transparent bg-[#edf4ff] text-foreground"
          : "border-[#EEEFF0] bg-white hover:bg-[#f7f9fc]",
      )}
      onClick={onSelect}
      onKeyDown={handleCardKeyDown}
      role="button"
      tabIndex={0}
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
            <DropdownMenu onOpenChange={setIsMenuOpen} open={isMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="会话操作"
                  className={cn(
                    "flex size-6 items-center justify-center rounded-md text-[#7b8798] opacity-0 transition hover:bg-white hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 group-hover:opacity-100",
                    isMenuOpen && "bg-white text-foreground opacity-100",
                  )}
                  onClick={(event) => event.stopPropagation()}
                  type="button"
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} size={16} strokeWidth={2} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onClick={(event) => event.stopPropagation()}
              >
                {conversationMenuItems.map((item) => (
                  <DropdownMenuItem key={item.label} onSelect={(event) => event.preventDefault()}>
                    <HugeiconsIcon
                      color="currentColor"
                      icon={item.icon}
                      size={14}
                      strokeWidth={1.8}
                    />
                    <span>{item.label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
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
    </div>
  );
}
