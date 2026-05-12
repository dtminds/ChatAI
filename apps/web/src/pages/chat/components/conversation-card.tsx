import { useState } from "react";
import {
  MoreHorizontalIcon,
  PinIcon,
  PinOffIcon,
  BubbleChatNotificationIcon,
  MailOpenIcon,
  ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/pages/chat/chat-types";
import { formatConversationTimestamp } from "@/pages/chat/lib/chat-time";

export function ConversationCard({
  conversation,
  isActive,
  onMarkRead,
  onMarkUnread,
  onSelect,
}: {
  conversation: Conversation;
  isActive: boolean;
  onMarkRead?: () => void;
  onMarkUnread?: () => void;
  onSelect: () => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const conversationMenuItems = [
    {
      label: conversation.isPinned ? "取消置顶" : "置顶",
      icon: conversation.isPinned ? PinOffIcon : PinIcon,
    },
    conversation.unread > 0
      ? { label: "标记已读", icon: MailOpenIcon, onSelect: onMarkRead }
      : { label: "标记未读", icon: BubbleChatNotificationIcon, onSelect: onMarkUnread },
    { label: "不显示", icon: ViewOffSlashIcon },
  ];

  return (
    <div
      className={cn(
        "group relative mb-1 w-full overflow-visible border-b px-2.5 py-2.5 text-left",
        isActive
          ? "rounded-[8px] border-transparent bg-conversation-active text-conversation-active-foreground"
          : "border-divider/60 bg-surface hover:bg-conversation-hover",
      )}
    >
      <Button
        className="grid h-auto w-full min-w-0 cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center justify-normal gap-2.5 whitespace-normal rounded-none p-0 text-left text-sm outline-none hover:bg-transparent hover:text-inherit focus-visible:ring-2 focus-visible:ring-ring/20"
        onClick={onSelect}
        type="button"
        variant="ghost"
      >
        <div className="relative">
          <Avatar className="size-10">
            <AvatarImage
              alt={conversation.customerName}
              src={conversation.customerAvatarUrl}
            />
            <AvatarFallback
              className={cn(
                isActive &&
                  "bg-conversation-active-foreground/20 text-conversation-active-foreground",
              )}
            />
          </Avatar>
          {conversation.unread > 0 ? (
            <div className="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 py-0.5 text-center text-[10px] font-semibold leading-none text-destructive-foreground">
              {conversation.unread}
            </div>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5 pr-7">
            <p
              className={cn(
                "truncate text-[14px] font-medium",
                isActive
                  ? "text-conversation-active-foreground"
                  : "text-foreground",
              )}
            >
              {conversation.customerName}
            </p>
          </div>

          <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <p
              className={cn(
                "truncate text-[12px]",
                isActive
                  ? "text-conversation-active-muted-foreground"
                  : "text-muted-foreground",
              )}
              data-testid="conversation-preview"
            >
              {conversation.preview}
            </p>
            <span
              className={cn(
                "shrink-0 whitespace-nowrap text-[12px]",
                isActive
                  ? "text-conversation-active-muted-foreground"
                  : "text-muted-foreground",
              )}
              data-testid="conversation-updated-at"
            >
              {formatConversationTimestamp(conversation.updatedAt)}
            </span>
          </div>
        </div>
      </Button>

      <DropdownMenu onOpenChange={setIsMenuOpen} open={isMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="会话操作"
            className={cn(
              "group/menu absolute right-2.5 top-2 size-6 rounded-[6px] p-0 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/20 group-hover:opacity-100",
              conversation.isPinned ? "opacity-100" : "opacity-0",
              isActive &&
                "text-conversation-active-icon hover:bg-conversation-active-foreground/15 hover:text-conversation-active-foreground",
              isMenuOpen && "bg-muted text-foreground opacity-100",
            )}
            size="icon"
            type="button"
            variant="ghost"
          >
            {conversation.isPinned ? (
              <span
                className={cn(
                  "group-hover:hidden group-focus-visible/menu:hidden text-primary",
                  isActive && "text-conversation-active-icon",
                  isMenuOpen && "hidden",
                )}
              >
                <HugeiconsIcon icon={PinIcon} size={14} />
              </span>
            ) : null}
            <span
              className={cn(
                conversation.isPinned
                  ? "hidden group-hover:block group-focus-visible/menu:block"
                  : "block",
                isMenuOpen && "block",
              )}
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} size={18} />
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {conversationMenuItems.map((item) => (
            <DropdownMenuItem key={item.label} onSelect={item.onSelect}>
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
  );
}
