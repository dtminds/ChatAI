import { useLayoutEffect, useRef, type ReactNode } from "react";
import {
  ArrowDown01Icon,
  Cancel01Icon,
  Loading03Icon,
  PlayIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ImagePreviewDialog } from "@/pages/chat/components/message/image";
import { LoadableMessageImage } from "@/pages/chat/components/message/media-fallback";
import {
  MessageContentRenderer,
  WechatEmojiText,
} from "@/pages/chat/components/message";
import { QuoteMessagePreview } from "@/pages/chat/components/message/quote";
import { getOptimizedMessageImageUrl } from "@/pages/chat/components/message/url";
import type {
  ChatMessage,
  Conversation,
  GroupMember,
  ImageMessageContent,
  Message,
  VideoMessageContent,
} from "@/pages/chat/chat-types";

type HistoryPanelScope = "all" | "file" | "media" | "h5" | "mini-program";

type HistoryMessageHistoryPanelProps = {
  activeConversation?: Conversation;
  activeHistory?: {
    hasNext: boolean;
    hasPrev: boolean;
    messages: Message[];
    nextCursor?: string;
    prevCursor?: string;
  };
  activeHistoryError?: string;
  activeHistoryLoading: boolean;
  activeHistoryFilters: {
    day?: string;
    senderId?: string;
    scope: HistoryPanelScope;
  };
  customer?: {
    name?: string;
  };
  groupMembers: GroupMember[];
  isOpen: boolean;
  onClose: () => void;
  onLoadMoreNext: () => void;
  onLoadMorePrev: () => void;
  onRefresh: () => void;
  onSetDay: (day?: string) => void;
  onSetScope: (scope: HistoryPanelScope) => void;
  onSetSenderId: (senderId?: string) => void;
};

export function MessageHistorySidePanel({
  activeConversation,
  activeHistory,
  activeHistoryError,
  activeHistoryFilters,
  activeHistoryLoading,
  customer,
  groupMembers,
  isOpen,
  onClose,
  onLoadMoreNext,
  onLoadMorePrev,
  onRefresh,
  onSetDay,
  onSetScope,
  onSetSenderId,
}: HistoryMessageHistoryPanelProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <aside
      aria-label="聊天记录"
      className="absolute inset-0 z-20 flex w-full min-w-0 flex-col border-l border-divider bg-surface"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <p className="min-w-0 text-sm font-semibold text-foreground">聊天记录</p>
        <Button
          aria-label="关闭聊天记录"
          className="size-8 p-0"
          onClick={onClose}
          size="icon"
          variant="ghost"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.8} />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <Tabs
          className="min-h-0 flex-1 gap-0"
          onValueChange={(value) => onSetScope(value as HistoryPanelScope)}
          value={activeHistoryFilters.scope}
        >
          <div className="pb-3">
            <TabsList className="h-auto w-full justify-start gap-8 overflow-x-auto rounded-none border-0 border-b border-divider bg-transparent px-4 py-0">
              <TabsTrigger
                className="min-w-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-0 py-2 text-sm shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                value="all"
              >
                全部
              </TabsTrigger>
              <TabsTrigger
                className="min-w-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-0 py-2 text-sm shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                value="file"
              >
                文件
              </TabsTrigger>
              <TabsTrigger
                className="min-w-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-0 py-2 text-sm shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                value="media"
              >
                图片与视频
              </TabsTrigger>
              <TabsTrigger
                className="min-w-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-0 py-2 text-sm shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                value="h5"
              >
                链接
              </TabsTrigger>
              <TabsTrigger
                className="min-w-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-0 py-2 text-sm shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                value="mini-program"
              >
                小程序
              </TabsTrigger>
            </TabsList>

            <div className="mt-2.5 flex items-center gap-1.5 px-4">
              <SenderFilter
                activeConversation={activeConversation}
                customerName={customer?.name}
                groupMembers={groupMembers}
                onChange={onSetSenderId}
                value={activeHistoryFilters.senderId}
              />
              <DateFilter
                value={activeHistoryFilters.day}
                onChange={onSetDay}
              />
              <Button
                className="ml-auto h-8 px-3 text-[12px]"
                onClick={onRefresh}
                size="sm"
                variant="ghost"
              >
                刷新
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1">
            <TabsContent className="mt-0 h-full min-h-0" value="all">
              <HistoryMessageViewport
                activeHistory={activeHistory}
                activeHistoryError={activeHistoryError}
                activeHistoryLoading={activeHistoryLoading}
                onLoadMoreNext={onLoadMoreNext}
                onLoadMorePrev={onLoadMorePrev}
              >
                <HistoryCompactMessageList
                  messages={activeHistory?.messages ?? []}
                />
              </HistoryMessageViewport>
            </TabsContent>
            <TabsContent className="mt-0 h-full min-h-0" value="file">
              <HistoryMessageViewport
                activeHistory={activeHistory}
                activeHistoryError={activeHistoryError}
                activeHistoryLoading={activeHistoryLoading}
                onLoadMoreNext={onLoadMoreNext}
                onLoadMorePrev={onLoadMorePrev}
              >
                <HistoryResourceList messages={activeHistory?.messages ?? []} />
              </HistoryMessageViewport>
            </TabsContent>
            <TabsContent className="mt-0 h-full min-h-0" value="media">
              <HistoryMessageViewport
                activeHistory={activeHistory}
                activeHistoryError={activeHistoryError}
                activeHistoryLoading={activeHistoryLoading}
                onLoadMoreNext={onLoadMoreNext}
                onLoadMorePrev={onLoadMorePrev}
              >
                <HistoryMediaWall messages={activeHistory?.messages ?? []} />
              </HistoryMessageViewport>
            </TabsContent>
            <TabsContent className="mt-0 h-full min-h-0" value="h5">
              <HistoryMessageViewport
                activeHistory={activeHistory}
                activeHistoryError={activeHistoryError}
                activeHistoryLoading={activeHistoryLoading}
                onLoadMoreNext={onLoadMoreNext}
                onLoadMorePrev={onLoadMorePrev}
              >
                <HistoryResourceList messages={activeHistory?.messages ?? []} />
              </HistoryMessageViewport>
            </TabsContent>
            <TabsContent className="mt-0 h-full min-h-0" value="mini-program">
              <HistoryMessageViewport
                activeHistory={activeHistory}
                activeHistoryError={activeHistoryError}
                activeHistoryLoading={activeHistoryLoading}
                onLoadMoreNext={onLoadMoreNext}
                onLoadMorePrev={onLoadMorePrev}
              >
                <HistoryResourceList messages={activeHistory?.messages ?? []} />
              </HistoryMessageViewport>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </aside>
  );
}

function HistoryMessageViewport({
  activeHistory,
  activeHistoryError,
  activeHistoryLoading,
  children,
  onLoadMoreNext,
  onLoadMorePrev,
}: {
  activeHistory?: {
    hasNext: boolean;
    hasPrev: boolean;
    messages: Message[];
    nextCursor?: string;
    prevCursor?: string;
  };
  activeHistoryError?: string;
  activeHistoryLoading: boolean;
  children: ReactNode;
  onLoadMoreNext: () => void;
  onLoadMorePrev: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pendingPrependRestoreRef = useRef<{
    previousScrollHeight: number;
    previousScrollTop: number;
  } | null>(null);
  const messageIdsKey =
    activeHistory?.messages.map((message) => message.id).join("\u0000") ?? "";
  const handleLoadMorePrev = () => {
    const viewport = viewportRef.current;

    if (viewport) {
      pendingPrependRestoreRef.current = {
        previousScrollHeight: viewport.scrollHeight,
        previousScrollTop: viewport.scrollTop,
      };
    }

    onLoadMorePrev();
  };

  useLayoutEffect(() => {
    const pendingRestore = pendingPrependRestoreRef.current;
    const viewport = viewportRef.current;

    if (!pendingRestore || !viewport) {
      return;
    }

    pendingPrependRestoreRef.current = null;
    viewport.scrollTop =
      pendingRestore.previousScrollTop +
      (viewport.scrollHeight - pendingRestore.previousScrollHeight);
  }, [messageIdsKey]);

  return (
    <ScrollArea
      className="h-full"
      viewportRef={viewportRef}
      viewportTestId="history-message-viewport"
    >
      <div className="space-y-3 px-4 py-4">
        {activeHistoryError ? (
          <div className="rounded-[8px] border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {activeHistoryError}
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <Button
            className="h-8 px-3 text-[12px]"
            disabled={!activeHistory?.hasPrev || activeHistoryLoading}
            onClick={handleLoadMorePrev}
            variant="outline"
          >
            更早
          </Button>
          <Button
            className="h-8 px-3 text-[12px]"
            disabled={!activeHistory?.hasNext || activeHistoryLoading}
            onClick={onLoadMoreNext}
            variant="outline"
          >
            更新
          </Button>
        </div>
        {activeHistoryLoading && !(activeHistory?.messages.length ?? 0) ? (
          <div className="flex min-h-[140px] items-center justify-center text-sm text-muted-foreground">
            <HugeiconsIcon
              className="animate-spin"
              icon={Loading03Icon}
              size={18}
              strokeWidth={1.8}
            />
          </div>
        ) : (
          <div>{children}</div>
        )}
      </div>
    </ScrollArea>
  );
}

function HistoryCompactMessageList({ messages }: { messages: Message[] }) {
  const chatMessages = messages.filter(isChatMessage);

  return (
    <div className="w-full max-w-full min-w-0 space-y-4">
      {chatMessages.map((message) => (
        <div
          className="flex w-full max-w-full min-w-0 flex-col items-start gap-1.5"
          data-scroll-anchor={message.id}
          data-testid="history-message-item"
          key={message.clientMessageId ?? message.optNo ?? message.id}
        >
          <div className="flex w-full max-w-full min-w-0 items-baseline gap-2">
            <span className="min-w-0 truncate text-[13px] font-medium leading-5 text-muted-foreground/80">
              {getHistoryMessageAuthor(message)}
            </span>
            <span className="shrink-0 text-xs leading-5 text-muted-foreground/70">
              {formatHistoryMessageTime(message.sentAt)}
            </span>
          </div>
          <HistoryCompactMessageContent message={message} />
        </div>
      ))}
      {chatMessages.length === 0 ? (
        <div className="px-3 py-10 text-center text-sm text-muted-foreground">
          暂无历史记录
        </div>
      ) : null}
    </div>
  );
}

function HistoryCompactMessageContent({ message }: { message: ChatMessage }) {
  if (message.content.type === "text") {
    return <HistoryCompactText text={message.content.text} />;
  }

  if (message.content.type === "quote") {
    return (
      <div className="flex w-full max-w-full min-w-0 flex-col items-start gap-2">
        <HistoryCompactText text={message.content.text} />
        <QuoteMessagePreview
          quoteMsgId={message.content.quoteMsgId}
          quotedMessage={message.content.quotedMessage}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-full min-w-0">
      <MessageContentRenderer
        isAgent={message.role === "agent"}
        message={message}
      />
    </div>
  );
}

function HistoryCompactText({ text }: { text: string }) {
  return (
    <div
      className="w-full max-w-full min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm font-medium leading-6 text-foreground"
      data-testid="history-message-text"
    >
      <WechatEmojiText text={normalizeHistoryText(text)} />
    </div>
  );
}

function HistoryResourceList({ messages }: { messages: Message[] }) {
  const chatMessages = messages.filter(isChatMessage);

  return (
    <div className="space-y-3">
      {chatMessages.map((message) => (
        <div
          className="rounded-[8px] border border-border bg-surface px-3 py-2 text-sm text-foreground"
          key={message.id}
        >
          <div className="flex items-center justify-between gap-3 text-[12px] text-muted-foreground">
            <span className="truncate">{message.author}</span>
            <span className="shrink-0">{message.sentAt}</span>
          </div>
          <div className="mt-2">
            <MessageContentRenderer
              isAgent={message.role === "agent"}
              message={message}
            />
          </div>
        </div>
      ))}
      {chatMessages.length === 0 ? (
        <div className="px-3 py-10 text-center text-sm text-muted-foreground">
          暂无历史记录
        </div>
      ) : null}
    </div>
  );
}

function HistoryMediaWall({ messages }: { messages: Message[] }) {
  const mediaMessages = messages.filter(isMediaMessage);

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {mediaMessages.map((message) => (
          <HistoryMediaTile key={message.id} message={message} />
        ))}
      </div>
      {mediaMessages.length === 0 ? (
        <div className="px-3 py-10 text-center text-sm text-muted-foreground">
          暂无历史记录
        </div>
      ) : null}
    </div>
  );
}

type MediaHistoryMessage = ChatMessage & {
  content: ImageMessageContent | VideoMessageContent;
};

function HistoryMediaTile({ message }: { message: MediaHistoryMessage }) {
  const content = message.content;
  const imageUrl =
    content.type === "image"
      ? content.imageUrl.trim()
      : content.coverImageUrl.trim();
  const optimizedImageUrl = imageUrl
    ? getOptimizedMessageImageUrl(imageUrl)
    : "";
  const fallbackText =
    content.type === "image" ? "图片不可用" : "视频封面不可用";
  const tileContent = optimizedImageUrl ? (
    <LoadableMessageImage
      alt={content.alt}
      className="h-full w-full object-cover transition-transform duration-200 group-hover/media:scale-[1.02]"
      fallback={
        <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">
          {fallbackText}
        </div>
      }
      loading="lazy"
      src={optimizedImageUrl}
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">
      {fallbackText}
    </div>
  );

  return (
    <div className="group/media relative isolate aspect-square overflow-hidden rounded-[8px] border border-border bg-muted">
      {content.type === "image" && imageUrl ? (
        <ImagePreviewDialog
          alt={content.alt}
          imageUrl={imageUrl}
          triggerClassName="block h-full w-full p-0 text-left outline-none focus-visible:ring-4 focus-visible:ring-ring/25"
        >
          {tileContent}
        </ImagePreviewDialog>
      ) : content.type === "video" && content.videoUrl ? (
        <button
          aria-label={`播放视频：${content.alt}`}
          className="block h-full w-full p-0 text-left outline-none focus-visible:ring-4 focus-visible:ring-ring/25"
          onClick={() =>
            window.open(content.videoUrl, "_blank", "noopener,noreferrer")
          }
          type="button"
        >
          {tileContent}
        </button>
      ) : (
        tileContent
      )}
      {content.type === "video" ? (
        <span className="absolute left-1/2 top-1/2 z-1 inline-flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/85 bg-black/25 text-white shadow-sm backdrop-blur-[1px]">
          <HugeiconsIcon
            className="translate-x-[1px]"
            icon={PlayIcon}
            size={21}
            strokeWidth={2.1}
          />
        </span>
      ) : null}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-1 bg-gradient-to-t from-black/65 via-black/25 to-transparent px-2 pb-2 pt-7 text-white">
        <div className="truncate text-[12px] leading-4">{message.author}</div>
        <div className="truncate text-[11px] leading-4 text-white/78">
          {message.sentAt}
        </div>
      </div>
    </div>
  );
}

function isChatMessage(message: Message): message is ChatMessage {
  return message.role !== "system";
}

function isMediaMessage(message: Message): message is MediaHistoryMessage {
  return (
    message.role !== "system" &&
    (message.content.type === "image" || message.content.type === "video")
  );
}

function getHistoryMessageAuthor(message: ChatMessage) {
  return message.author || message.senderDisplayName || message.sender.name;
}

function normalizeHistoryText(value: string) {
  return value.replace(/\u00a0/g, " ");
}

function formatHistoryMessageTime(value: string) {
  const date = parseHistoryMessageDate(value);

  if (!date) {
    return value.replace(/:\d{2}$/, "");
  }

  const time = formatHistoryTimePart(date);
  const now = new Date();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  if (date.getFullYear() === now.getFullYear()) {
    return `${month}/${day} ${time}`;
  }

  return `${date.getFullYear()}/${month}/${day} ${time}`;
}

function parseHistoryMessageDate(value: string) {
  const normalized = value.trim().replace(" ", "T");
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function formatHistoryTimePart(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function DateFilter({
  value,
  onChange,
}: {
  value?: string;
  onChange: (day?: string) => void;
}) {
  const selectedDate = value ? new Date(`${value}T00:00:00`) : undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label="日期"
          className={cn(
            "h-8 gap-1.5 rounded-[6px] px-2.5 py-0 text-[12px]",
            value && "text-foreground",
          )}
          variant="outline"
        >
          <span>{value ?? "日期"}</span>
          <HugeiconsIcon
            aria-hidden="true"
            icon={ArrowDown01Icon}
            size={14}
            strokeWidth={1.8}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div className="mb-2 flex items-center justify-between gap-2 px-2">
          <Button
            className="h-7 px-2 text-[12px]"
            onClick={() => onChange(undefined)}
            size="sm"
            variant="ghost"
          >
            清空
          </Button>
        </div>
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => onChange(date ? formatDay(date) : undefined)}
        />
      </PopoverContent>
    </Popover>
  );
}

function SenderFilter({
  activeConversation,
  customerName,
  groupMembers,
  onChange,
  value,
}: {
  activeConversation?: Conversation;
  customerName?: string;
  groupMembers: GroupMember[];
  onChange: (senderId?: string) => void;
  value?: string;
}) {
  const options = buildSenderOptions(
    activeConversation,
    groupMembers,
    customerName,
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          className={cn(
            "h-8 gap-1.5 rounded-[6px] px-2.5 py-0 text-[12px]",
            value && "text-foreground",
          )}
          variant="outline"
        >
          <span>发送人</span>
          <HugeiconsIcon
            aria-hidden="true"
            icon={ArrowDown01Icon}
            size={14}
            strokeWidth={1.8}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <RadioGroup
          value={value ?? "__all__"}
          onValueChange={(nextValue) =>
            onChange(nextValue === "__all__" ? undefined : nextValue)
          }
        >
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-sm">
              <RadioGroupItem value="__all__" />
              全部
            </label>
            {options.map((option) => (
              <label
                className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-sm"
                key={option.id}
              >
                <RadioGroupItem value={option.id} />
                <span className="truncate">{option.label}</span>
              </label>
            ))}
          </div>
        </RadioGroup>
      </PopoverContent>
    </Popover>
  );
}

function buildSenderOptions(
  activeConversation?: Conversation,
  groupMembers: GroupMember[] = [],
  customerName?: string,
) {
  if (!activeConversation) {
    return [];
  }

  if (activeConversation.mode === "single") {
    return [
      {
        id: activeConversation.thirdUserId ?? "",
        label: "当前客服",
      },
      {
        id: activeConversation.thirdExternalUserId ?? "",
        label: customerName ?? activeConversation.customerName,
      },
    ].filter((item) => item.id);
  }

  return groupMembers.map((member) => ({
    id: member.id,
    label: member.displayName,
  }));
}

function formatDay(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
