import type { ComponentProps } from "react";
import {
  ArrowLeft01Icon,
  BubbleChatNotificationIcon,
  ChatDone01Icon,
  InformationCircleIcon,
  LayoutAlignRightIcon,
  MoreHorizontalIcon,
  PinIcon,
  PinOffIcon,
  TeamWorkIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AIHostingIcon } from "@/pages/chat/components/ai-hosting-avatar-badge";
import { NewMessageSoundControl } from "@/pages/chat/components/new-message-sound-control";
import type { Conversation } from "@/pages/chat/chat-types";

type ChatHeaderProps = {
  activeConversation?: Conversation;
  isAIHostingEnabled?: boolean;
  isConversationActionDisabled?: boolean;
  isMobileLayout?: boolean;
  isSidebarOpen?: boolean;
  onBack?: () => void;
  onMarkConversationRead?: () => void | Promise<void>;
  onMarkConversationUnread?: () => void | Promise<void>;
  onPinConversation?: () => void | Promise<void>;
  onToggleSidebar?: () => void;
  onUnpinConversation?: () => void | Promise<void>;
};

export function ChatHeader({
  activeConversation,
  isAIHostingEnabled = false,
  isConversationActionDisabled = false,
  isMobileLayout = false,
  isSidebarOpen = false,
  onBack,
  onMarkConversationRead,
  onMarkConversationUnread,
  onPinConversation,
  onToggleSidebar,
  onUnpinConversation,
}: ChatHeaderProps) {
  const hasConversationActions = Boolean(
    activeConversation &&
      (onMarkConversationRead ||
        onMarkConversationUnread ||
        onPinConversation ||
        onUnpinConversation),
  );

  return (
    <div className="flex min-h-[69px] items-center border-b border-divider px-5 py-3">
      <div className="flex w-full items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          {onBack ? (
            <Button
              aria-label="返回会话列表"
              className="size-9 shrink-0 rounded-[10px] p-0 shadow-none"
              onClick={onBack}
              size="icon"
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon
                aria-hidden="true"
                color="currentColor"
                icon={ArrowLeft01Icon}
                size={18}
                strokeWidth={1.8}
              />
            </Button>
          ) : null}
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <p className="min-w-0 truncate text-[17px] font-semibold text-foreground">
                {activeConversation?.customerName ?? "请选择会话"}
              </p>
              {activeConversation && isAIHostingEnabled ? (
                <Badge className="h-6 shrink-0 gap-1.5 rounded-[6px] bg-muted px-2 py-0.5 text-xs font-bold text-success">
                  <AIHostingIcon className="size-3" />
                  <span className="ai-hosting-tag-text">AI 托管中</span>
                </Badge>
              ) : null}
              {activeConversation?.mode === "group" &&
              activeConversation.isShadowGroup ? (
                <ReceptionAccountNotice />
              ) : null}
            </div>
            {activeConversation?.groupOriginalName ||
            activeConversation?.contactOriginalName ? (
              <p className="truncate text-[12px] text-muted-foreground">
                {activeConversation?.groupOriginalName ??
                  activeConversation?.contactOriginalName}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {hasConversationActions && activeConversation ? (
            <ConversationHeaderActions
              conversation={activeConversation}
              disabled={isConversationActionDisabled}
              onMarkRead={onMarkConversationRead}
              onMarkUnread={onMarkConversationUnread}
              onPin={onPinConversation}
              onUnpin={onUnpinConversation}
            />
          ) : null}
          {activeConversation && onToggleSidebar ? (
            <HeaderIconButton
              icon={LayoutAlignRightIcon}
              label={isSidebarOpen ? "折叠侧边栏" : "展开侧边栏"}
              onClick={onToggleSidebar}
            />
          ) : null}
          {isMobileLayout ? null : <NewMessageSoundControl />}
        </div>
      </div>
    </div>
  );
}

function ConversationHeaderActions({
  conversation,
  disabled,
  onMarkRead,
  onMarkUnread,
  onPin,
  onUnpin,
}: {
  conversation: Conversation;
  disabled: boolean;
  onMarkRead?: () => void | Promise<void>;
  onMarkUnread?: () => void | Promise<void>;
  onPin?: () => void | Promise<void>;
  onUnpin?: () => void | Promise<void>;
}) {
  const actions = [
    {
      icon: conversation.isPinned ? PinOffIcon : PinIcon,
      label: conversation.isPinned ? "取消置顶" : "置顶",
      onSelect: conversation.isPinned ? onUnpin : onPin,
    },
    conversation.unread > 0
      ? { icon: ChatDone01Icon, label: "标记已读", onSelect: onMarkRead }
      : {
          icon: BubbleChatNotificationIcon,
          label: "标记未读",
          onSelect: onMarkUnread,
        },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="更多会话操作"
          className="size-9 shrink-0 rounded-[10px] p-0 text-muted-foreground shadow-none hover:text-foreground"
          size="icon"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon
            aria-hidden="true"
            icon={MoreHorizontalIcon}
            size={18}
            strokeWidth={1.8}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action) => (
          <DropdownMenuItem
            disabled={disabled || !action.onSelect}
            key={action.label}
            onSelect={() => runAction(action.onSelect)}
          >
            <HugeiconsIcon
              aria-hidden="true"
              icon={action.icon}
              size={16}
              strokeWidth={1.8}
            />
            <span>{action.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function HeaderIconButton({
  disabled = false,
  icon,
  label,
  onClick,
}: {
  disabled?: boolean;
  icon: ComponentProps<typeof HugeiconsIcon>["icon"];
  label: string;
  onClick: () => void;
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={label}
            className="size-9 shrink-0 rounded-[10px] p-0 text-muted-foreground shadow-none hover:text-foreground"
            disabled={disabled}
            onClick={onClick}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon
              aria-hidden="true"
              icon={icon}
              size={16}
              strokeWidth={1.8}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function runAction(action: (() => void | Promise<void>) | undefined) {
  void action?.();
}

function ReceptionAccountNotice() {
  return (
    <HoverCard closeDelay={100} openDelay={120}>
      <HoverCardTrigger asChild>
        <button
          aria-label="查看接待号注意事项"
          className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-[6px] bg-warning/10 px-2 py-0.5 text-xs font-bold text-warning outline-none transition-colors hover:bg-warning/15 focus-visible:ring-4 focus-visible:ring-ring/20"
          type="button"
        >
          <HugeiconsIcon
            aria-hidden="true"
            color="currentColor"
            icon={TeamWorkIcon}
            size={15}
            strokeWidth={1.9}
          />
          <span>接待号</span>
          <HugeiconsIcon
            aria-hidden="true"
            className="text-warning"
            color="currentColor"
            icon={InformationCircleIcon}
            size={14}
            strokeWidth={1.9}
          />
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="w-[380px] max-w-[calc(100vw-2rem)] rounded-[8px] p-4"
        side="bottom"
        sideOffset={8}
      >
        <div className="space-y-3">
          <p className="text-sm font-semibold text-foreground">接待号注意事项</p>
          <p className="text-xs leading-5 text-muted-foreground">
            受接口能力限制，接待号区别于开通号，在使用上会有一定约束，在此特殊说明：
          </p>
          <ol className="space-y-2 pl-5 text-xs leading-5 text-foreground">
            <li className="list-decimal">
              接待号无法在工作台撤回已发送的消息，需使用客户端撤回
            </li>
            <li className="list-decimal">
              发送的消息中包含引用或@内容时工作台回显可能异常，但不影响客户侧效果
            </li>
            <li className="list-decimal">
              如因网络抖动等原因导致消息发送失败，不支持一键重发，需手动重发
            </li>
          </ol>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
