import { useState } from "react";
import {
  MoreHorizontalIcon,
  PinIcon,
  PinOffIcon,
  BubbleChatNotificationIcon,
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
  onSelect,
}: {
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const conversationMenuItems = [
    {
      label: conversation.isPinned ? "取消置顶" : "置顶",
      icon: conversation.isPinned ? PinOffIcon : PinIcon,
    },
    { label: "标记未读", icon: BubbleChatNotificationIcon },
    { label: "不显示", icon: ViewOffSlashIcon },
  ];

  return (
    <div
      className={cn(
        "group relative mb-1 w-full overflow-visible border-b px-2.5 py-2.5 text-left",
        isActive
          ? "rounded-md border-transparent bg-surface-selected text-foreground"
          : "border-divider bg-surface",
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
            <AvatarFallback>{conversation.customerName.slice(0, 1)}</AvatarFallback>
          </Avatar>
          {conversation.unread > 0 && !isActive ? (
            <div className="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 py-0.5 text-center text-[10px] font-semibold leading-none text-destructive-foreground">
              {conversation.unread}
            </div>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5 pr-7">
            <p className="truncate text-[14px] font-medium text-foreground">
              {conversation.customerName}
            </p>
            {conversation.mode === "group" ? (
              <span
                className={cn(
                  "rounded px-1 py-0.5 text-[10px]",
                  isActive
                    ? "bg-info-muted text-info"
                    : "bg-primary/10 text-primary",
                )}
              >
                群
              </span>
            ) : null}
          </div>

          <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <p className="truncate text-[12px] text-muted-foreground">
              {conversation.preview}
            </p>
            <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
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
              "group/menu absolute right-2.5 top-2 size-6 rounded-md p-0 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/20 group-hover:opacity-100",
              conversation.isPinned ? "opacity-100" : "opacity-0",
              isMenuOpen && "bg-surface text-foreground opacity-100",
            )}
            size="icon"
            type="button"
            variant="ghost"
          >
            {conversation.isPinned ? (
              <span
                className={cn(
                  "group-hover:hidden group-focus-visible/menu:hidden",
                  isMenuOpen && "hidden",
                )}
              >
                <HugeiconsIcon icon={PinIcon} size={16} strokeWidth={1.8} />
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
            <DropdownMenuItem key={item.label}>
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
