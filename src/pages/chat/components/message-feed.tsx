import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { MessageContentRenderer } from "@/pages/chat/components/message";
import type { ChatMessage, Message } from "@/pages/chat/chat-types";

const TIMESTAMP_BREAK_MS = 30 * 60 * 1000;

type ChatMessageListProps = {
  messages: Message[];
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

export function ChatMessageList({ messages }: ChatMessageListProps) {
  const items = buildFeedItems(messages);

  return (
    <div className="space-y-3">
      {items.map((item) =>
        item.type === "divider" ? (
          <MessageTimeDivider key={item.id} label={item.label} />
        ) : (
          <MessageRow key={item.message.id} message={item.message} />
        ),
      )}
    </div>
  );
}

export function MessageTimeDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-0.5">
      <span className="text-[12px] font-medium tracking-[0.02em] text-[#9aa4b2]">
        {label}
      </span>
    </div>
  );
}

export function MessageRow({ message }: { message: Message }) {
  if (message.role === "system") {
    return (
      <div className="mx-auto max-w-2xl rounded-full bg-[#f3f5f8] px-4 py-2 text-center text-[12px] leading-5 text-[#8c98a8]">
        {message.content.text}
      </div>
    );
  }

  const isAgent = message.role === "agent";

  return (
    <div className={cn("flex items-start gap-3", isAgent ? "justify-end" : "justify-start")}>
      {!isAgent ? <MessageAvatar message={message} /> : null}

      <div
        className={cn(
          "flex max-w-[42rem] flex-col",
          isAgent ? "order-first items-end" : "items-start",
        )}
      >
        <div className={cn("flex flex-col gap-1.5", isAgent ? "items-end" : "items-start")}>
          <MessageContentRenderer isAgent={isAgent} message={message} />
        </div>
      </div>

      {isAgent ? <MessageAvatar message={message} /> : null}
    </div>
  );
}

export function MessageAvatar({ message }: { message: ChatMessage }) {
  return (
    <Avatar className="size-10 rounded-[12px] border border-[#edf1f5] bg-white">
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

function formatMessageDividerLabel(value: string) {
  const date = parseWorkbenchDate(value);

  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
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
