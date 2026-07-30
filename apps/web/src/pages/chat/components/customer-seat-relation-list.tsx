import type {
  WorkbenchCustomerLastConversationDto,
  WorkbenchCustomerSeatRelationDto,
} from "@chatai/contracts";
import {
  Male02Icon,
  MessageSquareShareIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  Account,
  CustomerChatStartInput,
} from "@/pages/chat/chat-types";
import { formatMessageDividerLabel } from "@/pages/chat/lib/chat-time";

type CustomerSeatRelationTarget = {
  avatar: string;
  lastConversation?: WorkbenchCustomerLastConversationDto;
  name: string;
  realName: string;
  thirdExternalUserId: string;
};

export function CustomerSeatRelationList({
  accounts,
  compact = false,
  conversationStatus = "loaded",
  conversationTimes = {},
  currentEmployeeId,
  customer,
  onStartChat,
  relations,
}: {
  accounts: Account[];
  compact?: boolean;
  conversationStatus?: "idle" | "loading" | "loaded" | "error";
  conversationTimes?: Record<string, number>;
  currentEmployeeId?: string;
  customer: CustomerSeatRelationTarget;
  onStartChat?: (input: CustomerChatStartInput) => void | Promise<void>;
  relations: WorkbenchCustomerSeatRelationDto[];
}) {
  return (
    <div className="space-y-1">
      {relations.map((relation) => {
        const account = accounts.find((item) => item.id === relation.seatId);
        const seatName = getSeatRelationName(relation);
        const canStartChat = canStartSeatChat(account, currentEmployeeId);
        const relationConversationTime =
          conversationTimes[relation.thirdUserId] ?? relation.lastMessageTime;
        const hasRecentConversation = relationConversationTime != null;
        const actionText = hasRecentConversation ? "继续会话" : "发起会话";

        return (
          <div
            className={cn(
              "flex items-center gap-2 rounded-[8px] text-foreground",
              compact ? "min-h-10 px-1 py-1" : "min-h-12 px-2.5 py-1.5 text-sm",
            )}
            key={relation.bindId}
          >
            <SeatRelationAvatar
              account={account}
              className={compact ? "size-7" : undefined}
              relation={relation}
            />
            <div className="min-w-0 flex-1">
              <div className={cn("truncate", compact && "text-xs leading-4")}>
                {seatName}
              </div>
              <div
                className={cn(
                  "mt-0.5 truncate text-xs text-muted-foreground",
                  compact && "text-[11px] leading-4",
                )}
              >
                {conversationStatus === "idle" || conversationStatus === "loading"
                  ? "加载中"
                  : conversationStatus === "error"
                    ? "加载失败"
                    : hasRecentConversation
                      ? formatCustomerTimestamp(relationConversationTime)
                      : "暂无会话"}
              </div>
            </div>
            <Button
              aria-label={
                canStartChat
                  ? `向 ${seatName} ${actionText}`
                  : `${seatName} 不可${actionText}`
              }
              disabled={!canStartChat}
              className={compact ? "h-7 gap-1.5 px-2" : undefined}
              onClick={() => {
                void onStartChat?.({
                  conversationId:
                    customer.lastConversation?.seatId === relation.seatId
                      ? customer.lastConversation.conversationId
                      : undefined,
                  customerAvatar: customer.avatar,
                  customerName: customer.name,
                  realName: customer.realName,
                  seatId: relation.seatId,
                  thirdExternalUserId: customer.thirdExternalUserId,
                });
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              <HugeiconsIcon
                color="currentColor"
                icon={MessageSquareShareIcon}
                size={compact ? 13 : 14}
              />
              {actionText}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

export function SeatRelationAvatar({
  account,
  className,
  relation,
}: {
  account?: Account;
  className?: string;
  relation: WorkbenchCustomerSeatRelationDto;
}) {
  const seatName = getSeatRelationName(relation);
  const avatarUrl = relation.seatAvatar || account?.avatarUrl || "";

  return (
    <Avatar
      aria-label={`关联托管账号 ${seatName}`}
      className={cn("size-8 rounded-full border-2 border-surface", className)}
      title={seatName}
    >
      {avatarUrl ? <AvatarImage alt={`${seatName}头像`} src={avatarUrl} /> : null}
      <AvatarFallback className="rounded-full bg-primary/15 text-xs text-primary">
        <HugeiconsIcon color="currentColor" icon={Male02Icon} size={16} />
      </AvatarFallback>
    </Avatar>
  );
}

export function canStartSeatChat(
  account: Account | undefined,
  currentEmployeeId: string | undefined,
) {
  return (
    account?.loginStatus === "online" &&
    !!account.takenOverEmployeeId &&
    account.takenOverEmployeeId === currentEmployeeId
  );
}

export function formatCustomerTimestamp(value?: number) {
  if (!value || !Number.isFinite(value)) {
    return "-";
  }

  try {
    return formatMessageDividerLabel(new Date(value).toISOString()) || "-";
  } catch {
    return "-";
  }
}

function getSeatRelationName(relation: WorkbenchCustomerSeatRelationDto) {
  return relation.seatName || relation.thirdUserId || relation.seatId;
}
