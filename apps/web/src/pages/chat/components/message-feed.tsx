import { ReloadIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { MessageContentRenderer } from "@/pages/chat/components/message";
import type { ChatMessage, Message } from "@/pages/chat/chat-types";

const TIMESTAMP_BREAK_MS = 30 * 60 * 1000;

type ChatMessageListProps = {
  messages: Message[];
  onRetryMessage?: (messageId: string) => void;
};

type FeedItem =
  | {
      id: string;
      label: string;
      type: "divider";
    }
  | {
      message: Message;
      type: "message";
    };

export function ChatMessageList({ messages, onRetryMessage }: ChatMessageListProps) {
  const items = buildFeedItems(messages);

  return (
    <div className="space-y-3">
      {items.map((item) =>
        item.type === "divider" ? (
          <div data-scroll-anchor={item.id} key={item.id}>
            <MessageTimeDivider label={item.label} />
          </div>
        ) : (
          <div data-scroll-anchor={item.message.id} key={item.message.id}>
            <MessageRow
              message={item.message}
              onRetryMessage={onRetryMessage}
            />
          </div>
        ),
      )}
    </div>
  );
}

export function MessageTimeDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-0.5">
      <span className="text-[12px] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

export function MessageRow({
  message,
  onRetryMessage,
}: {
  message: Message;
  onRetryMessage?: (messageId: string) => void;
}) {
  if (message.role === "system") {
    return (
      <div className="mx-auto max-w-2xl rounded-full bg-surface-muted px-4 py-2 text-center text-[12px] leading-5 text-muted-foreground">
        {message.content.text}
      </div>
    );
  }

  const isAgent = message.role === "agent";

  return (
    <div className={cn("flex items-start", isAgent ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "flex min-w-0 max-w-[90%] items-start gap-2",
          isAgent ? "justify-end" : "justify-start",
        )}
        data-testid="message-row-group"
      >
        {!isAgent ? <MessageAvatar message={message} /> : null}

        <div className={cn("flex min-w-0 flex-col", isAgent ? "items-end" : "items-start")}>
          <div
            className={cn(
              "flex min-w-0 max-w-full items-end gap-2",
              isAgent ? "flex-row" : "flex-row-reverse",
            )}
          >
            {isAgent && message.status === "failed" && onRetryMessage ? (
              <button
                aria-label="重试发送"
                className="mb-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-destructive/25 bg-surface text-destructive transition-colors hover:bg-destructive-muted"
                onClick={() => onRetryMessage(message.id)}
                title="重试发送"
                type="button"
              >
                <HugeiconsIcon icon={ReloadIcon} size={13} strokeWidth={2} />
              </button>
            ) : null}
            <div
              className={cn(
                "flex min-w-0 max-w-full flex-col gap-1.5",
                isAgent ? "items-end" : "items-start",
              )}
              data-testid="message-content-stack"
            >
              <MessageContentRenderer isAgent={isAgent} message={message} />
            </div>
          </div>
          {isAgent ? <MessageDeliveryState message={message} /> : null}
        </div>

        {isAgent ? <MessageAvatar message={message} /> : null}
      </div>
    </div>
  );
}

function MessageDeliveryState({ message }: { message: ChatMessage }) {
  if (message.status === "sent" || message.status === "read") {
    return null;
  }

  const label =
    message.status === "failed"
      ? message.failReason ?? "发送失败"
      : message.status === "pending"
        ? "等待提交..."
        : "发送中...";

  return (
    <p
      className={cn(
        "mt-1 px-1 text-[11px]",
        message.status === "failed" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {label}
    </p>
  );
}

export function MessageAvatar({ message }: { message: ChatMessage }) {
  return (
    <Avatar className="size-8 rounded-[6px] bg-surface">
      {message.sender.avatarUrl ? (
        <AvatarImage alt={message.sender.name} src={message.sender.avatarUrl} />
      ) : null}
      <AvatarFallback className="rounded-[12px] text-sm">
        {message.sender.name.slice(0, 1)}
      </AvatarFallback>
    </Avatar>
  );
}

function buildFeedItems(messages: Message[]): FeedItem[] {
  const items: FeedItem[] = [];

  messages.forEach((message, index) => {
    const previous = messages[index - 1];

    if (shouldInsertDivider(previous, message)) {
      items.push({
        id: `divider-${message.id}`,
        label: formatMessageDividerLabel(message.sentAt),
        type: "divider",
      });
    }

    items.push({
      message,
      type: "message",
    });
  });

  return items;
}

function shouldInsertDivider(previous: Message | undefined, current: Message) {
  if (!previous) {
    return true;
  }

  const previousDate = parseWorkbenchDate(previous.sentAt);
  const currentDate = parseWorkbenchDate(current.sentAt);

  if (!previousDate || !currentDate) {
    return previous.sentAt !== current.sentAt;
  }

  return (
    !isSameCalendarDay(previousDate, currentDate) ||
    currentDate.getTime() - previousDate.getTime() >= TIMESTAMP_BREAK_MS
  );
}

export function formatMessageDividerLabel(value: string) {
  const date = parseWorkbenchDate(value);

  if (!date) {
    return value;
  }

  const now = new Date();
  const time = formatTimePart(date);

  if (isSameCalendarDay(date, now)) {
    return time;
  }

  if (isSameCalendarDay(date, addDays(now, -1))) {
    return `昨天 ${time}`;
  }

  if (isSameWeekMondayToSunday(date, now)) {
    return `${formatWeekdayPart(date)} ${time}`;
  }

  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
  }

  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

function parseWorkbenchDate(value: string) {
  const normalized = value.trim().replace(" ", "T");
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function isSameCalendarDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isSameWeekMondayToSunday(a: Date, b: Date) {
  const weekStart = getMondayStartOfDay(b);
  const nextWeekStart = addDays(weekStart, 7);

  return a.getTime() >= weekStart.getTime() && a.getTime() < nextWeekStart.getTime();
}

function getMondayStartOfDay(value: Date) {
  const date = startOfDay(value);
  const day = date.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;

  return addDays(date, -daysSinceMonday);
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);

  return date;
}

function formatTimePart(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatWeekdayPart(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    weekday: "short",
  }).format(date);
}
