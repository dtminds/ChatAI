import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { format, isValid, parseISO } from "date-fns";
import {
  ArrowDown01Icon,
  Cancel01Icon,
  ExclamationMarkIcon,
  Download04Icon,
  Loading03Icon,
  PlayIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { FileExtensionBadge } from "@/pages/chat/components/message/file";
import { ImagePreviewDialog } from "@/pages/chat/components/message/image";
import { LoadableMessageImage } from "@/pages/chat/components/message/media-fallback";
import {
  MessageContentRenderer,
  WechatEmojiText,
} from "@/pages/chat/components/message";
import { QuoteMessagePreview } from "@/pages/chat/components/message/quote";
import { getOptimizedMessageImageUrl } from "@/pages/chat/components/message/url";
import { getSafeMessageUrl } from "@/pages/chat/components/message/url";
import {
  canUseExpiringUrl,
  isExpiringUrlExpired,
} from "@/pages/chat/lib/message-url-expiry";
import type {
  ChatMessage,
  Conversation,
  GroupMember,
  H5CardMessageContent,
  ImageMessageContent,
  MiniProgramMessageContent,
  Message,
  VideoMessageContent,
} from "@/pages/chat/chat-types";

type HistoryPanelScope = "all" | "file" | "media" | "h5" | "mini-program";
type HistoryTabSortDirection = "ascending" | "descending";

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
  scrollMode?: "end";
  accountAvatarUrl?: string;
  accountName?: string;
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
  onDownloadMessageFile?: (message: ChatMessage) => void;
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
  scrollMode,
  accountAvatarUrl,
  accountName,
  customer,
  groupMembers,
  isOpen,
  onClose,
  onLoadMoreNext,
  onLoadMorePrev,
  onDownloadMessageFile,
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
        <p className="min-w-0 text-sm font-semibold text-foreground">
          聊天记录
        </p>
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
                accountAvatarUrl={accountAvatarUrl}
                accountName={accountName}
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
                filterKey={getHistoryFilterKey(activeHistoryFilters)}
                scrollMode={scrollMode}
                sortDirection={getHistoryTabSortDirection(
                  activeHistoryFilters.scope,
                )}
                onDownloadMessageFile={onDownloadMessageFile}
                onLoadMoreNext={onLoadMoreNext}
                onLoadMorePrev={onLoadMorePrev}
              >
                <HistoryCompactMessageList
                  messages={activeHistory?.messages ?? []}
                  onDownloadMessageFile={onDownloadMessageFile}
                />
              </HistoryMessageViewport>
            </TabsContent>
            <TabsContent className="mt-0 h-full min-h-0" value="file">
              <HistoryMessageViewport
                activeHistory={activeHistory}
                activeHistoryError={activeHistoryError}
                activeHistoryLoading={activeHistoryLoading}
                filterKey={getHistoryFilterKey(activeHistoryFilters)}
                scrollMode={scrollMode}
                sortDirection={getHistoryTabSortDirection(
                  activeHistoryFilters.scope,
                )}
                onDownloadMessageFile={onDownloadMessageFile}
                onLoadMoreNext={onLoadMoreNext}
                onLoadMorePrev={onLoadMorePrev}
              >
                <HistoryFileList
                  messages={getHistoryTabMessages(
                    activeHistory?.messages ?? [],
                    activeHistoryFilters.scope,
                  )}
                  onDownloadMessageFile={onDownloadMessageFile}
                />
              </HistoryMessageViewport>
            </TabsContent>
            <TabsContent className="mt-0 h-full min-h-0" value="media">
              <HistoryMessageViewport
                activeHistory={activeHistory}
                activeHistoryError={activeHistoryError}
                activeHistoryLoading={activeHistoryLoading}
                filterKey={getHistoryFilterKey(activeHistoryFilters)}
                scrollMode={scrollMode}
                sortDirection={getHistoryTabSortDirection(
                  activeHistoryFilters.scope,
                )}
                onDownloadMessageFile={onDownloadMessageFile}
                onLoadMoreNext={onLoadMoreNext}
                onLoadMorePrev={onLoadMorePrev}
              >
                <HistoryMediaWall
                  messages={getHistoryTabMessages(
                    activeHistory?.messages ?? [],
                    activeHistoryFilters.scope,
                  )}
                  onDownloadMessageFile={onDownloadMessageFile}
                />
              </HistoryMessageViewport>
            </TabsContent>
            <TabsContent className="mt-0 h-full min-h-0" value="h5">
              <HistoryMessageViewport
                activeHistory={activeHistory}
                activeHistoryError={activeHistoryError}
                activeHistoryLoading={activeHistoryLoading}
                filterKey={getHistoryFilterKey(activeHistoryFilters)}
                scrollMode={scrollMode}
                sortDirection={getHistoryTabSortDirection(
                  activeHistoryFilters.scope,
                )}
                onDownloadMessageFile={onDownloadMessageFile}
                onLoadMoreNext={onLoadMoreNext}
                onLoadMorePrev={onLoadMorePrev}
              >
                <HistoryLinkList
                  messages={getHistoryTabMessages(
                    activeHistory?.messages ?? [],
                    activeHistoryFilters.scope,
                  )}
                />
              </HistoryMessageViewport>
            </TabsContent>
            <TabsContent className="mt-0 h-full min-h-0" value="mini-program">
              <HistoryMessageViewport
                activeHistory={activeHistory}
                activeHistoryError={activeHistoryError}
                activeHistoryLoading={activeHistoryLoading}
                filterKey={getHistoryFilterKey(activeHistoryFilters)}
                scrollMode={scrollMode}
                sortDirection={getHistoryTabSortDirection(
                  activeHistoryFilters.scope,
                )}
                onDownloadMessageFile={onDownloadMessageFile}
                onLoadMoreNext={onLoadMoreNext}
                onLoadMorePrev={onLoadMorePrev}
              >
                <HistoryMiniProgramList
                  messages={getHistoryTabMessages(
                    activeHistory?.messages ?? [],
                    activeHistoryFilters.scope,
                  )}
                />
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
  filterKey,
  onDownloadMessageFile,
  scrollMode,
  sortDirection,
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
  filterKey: string;
  onDownloadMessageFile?: (message: ChatMessage) => void;
  sortDirection: HistoryTabSortDirection;
  scrollMode?: "end";
  children: ReactNode;
  onLoadMoreNext: () => void;
  onLoadMorePrev: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pendingPrependRestoreRef = useRef<{
    previousScrollHeight: number;
    previousScrollTop: number;
  } | null>(null);
  const previousMessageIdsKeyRef = useRef("");
  const previousFilterKeyRef = useRef("");
  const historyMessages = activeHistory?.messages;
  const messageIdsKey = useMemo(
    () => historyMessages?.map((message) => message.id).join("\u0000") ?? "",
    [historyMessages],
  );
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
  const showTopLoader =
    sortDirection === "ascending" ? activeHistory?.hasPrev : activeHistory?.hasNext;
  const showBottomLoader =
    sortDirection === "ascending" ? activeHistory?.hasNext : activeHistory?.hasPrev;
  const topLoaderText =
    sortDirection === "ascending" ? "加载更早的对话" : "加载更多对话";
  const bottomLoaderText =
    sortDirection === "ascending" ? "加载更多对话" : "加载更早的对话";
  const topLoaderOnClick =
    sortDirection === "ascending" ? handleLoadMorePrev : onLoadMoreNext;
  const bottomLoaderOnClick =
    sortDirection === "ascending" ? onLoadMoreNext : handleLoadMorePrev;

  useLayoutEffect(() => {
    const pendingRestore = pendingPrependRestoreRef.current;
    const viewport = viewportRef.current;

    if (!viewport) {
      previousMessageIdsKeyRef.current = messageIdsKey;
      previousFilterKeyRef.current = filterKey;
      return;
    }

    if (pendingRestore) {
      pendingPrependRestoreRef.current = null;
      viewport.scrollTop =
        pendingRestore.previousScrollTop +
        (viewport.scrollHeight - pendingRestore.previousScrollHeight);
    } else if (scrollMode === "end") {
      viewport.scrollTop = Math.max(
        0,
        viewport.scrollHeight - viewport.clientHeight,
      );
    } else if (
      previousFilterKeyRef.current &&
      previousFilterKeyRef.current !== filterKey
    ) {
      viewport.scrollTop = 0;
    }

    previousMessageIdsKeyRef.current = messageIdsKey;
    previousFilterKeyRef.current = filterKey;
  }, [filterKey, messageIdsKey, scrollMode]);

  return (
    <ScrollArea
      className="h-full"
      viewportRef={viewportRef}
      viewportTestId="history-message-viewport"
    >
      <div className="space-y-3 px-4 py-0">
        {activeHistoryError ? (
          <div className="rounded-[8px] border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {activeHistoryError}
          </div>
        ) : null}
        {showTopLoader ? (
          <HistoryEdgeLoader onClick={topLoaderOnClick} text={topLoaderText} />
        ) : null}
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
        {showBottomLoader ? (
          <HistoryEdgeLoader onClick={bottomLoaderOnClick} text={bottomLoaderText} />
        ) : null}
      </div>
    </ScrollArea>
  );
}

function HistoryEdgeLoader({
  onClick,
  text,
}: {
  onClick: () => void;
  text: string;
}) {
  return (
    <div className="flex justify-center">
      <Button
        className="h-8 px-3 text-[12px]"
        onClick={onClick}
        variant="outline"
      >
        {text}
      </Button>
    </div>
  );
}

export function HistoryCompactMessageList({
  messages,
  onDownloadMessageFile,
}: {
  messages: Message[];
  onDownloadMessageFile?: (message: ChatMessage) => void;
}) {
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
          <div
            className="flex w-full max-w-full min-w-0 items-center gap-2"
            data-testid="history-message-meta-row"
          >
            <span
              className="min-w-0 max-w-[min(18rem,calc(100%_-_7rem))] shrink truncate text-[13px] font-medium leading-5 text-muted-foreground/80"
              data-testid="history-message-author"
            >
              {getHistoryMessageAuthor(message)}
            </span>
            <span
              className="shrink-0 text-xs leading-5 text-muted-foreground/70"
              data-testid="history-message-time"
            >
              {formatHistoryMessageTime(message.sentAt)}
            </span>
            {message.status === "failed" ? <HistoryCompactDeliveryState /> : null}
          </div>
          <HistoryCompactMessageContent
            message={message}
            onDownloadMessageFile={onDownloadMessageFile}
          />
          {message.isRevoked ? <HistoryCompactRevokedState /> : null}
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

function HistoryCompactMessageContent({
  message,
  onDownloadMessageFile,
}: {
  message: ChatMessage;
  onDownloadMessageFile?: (message: ChatMessage) => void;
}) {
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
        onDownloadMessageFile={onDownloadMessageFile}
      />
    </div>
  );
}

function HistoryCompactDeliveryState() {
  return (
    <span
      aria-label="发送失败"
      className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
      data-testid="history-message-delivery-state"
      role="status"
    >
      <HugeiconsIcon icon={ExclamationMarkIcon} size={10} strokeWidth={2.4} />
    </span>
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

function HistoryCompactRevokedState() {
  return (
    <div className="text-[12px] leading-5 text-muted-foreground">
      已撤回
    </div>
  );
}

function HistoryFileList({
  messages,
  onDownloadMessageFile,
}: {
  messages: Message[];
  onDownloadMessageFile?: (message: ChatMessage) => void;
}) {
  const fileMessages = messages.filter(isFileMessage);

  return (
    <div className="w-full max-w-full min-w-0 divide-y divide-divider/80 overflow-hidden">
      {fileMessages.map((message) => (
        <div
          className="grid w-full max-w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 overflow-hidden px-2 py-3"
          key={message.id}
        >
          <HistoryFileBadge message={message} />
          <div className="min-w-0 overflow-hidden">
            <div className="flex min-w-0 items-start gap-2 overflow-hidden">
              <div className="block min-w-0 flex-1 truncate text-[14px] font-semibold leading-5 text-foreground">
                {message.content.fileName}
              </div>
              {message.content.downloadStatus === "ing" ? (
                <span
                  aria-label="文件下载中"
                  className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-muted-foreground"
                  role="status"
                >
                  <HugeiconsIcon
                    className="animate-spin"
                    icon={Loading03Icon}
                    size={14}
                    strokeWidth={1.8}
                  />
                  下载中
                </span>
              ) : onDownloadMessageFile ? (
                <button
                  aria-label={`下载文件：${message.content.fileName}`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-[4px] text-[12px] font-medium text-foreground outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/35"
                  onClick={() => onDownloadMessageFile(message)}
                  type="button"
                >
                  <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.8} />
                  下载
                </button>
              ) : null}
            </div>
            <div className="mt-0.5 block w-full min-w-0 max-w-full truncate text-[12px] leading-5 text-muted-foreground/75">
              <span>{message.author}</span>
              {message.content.fileSizeLabel ? (
                <span>
                  <span className="mx-1.5 text-muted-foreground/45">|</span>
                  {message.content.fileSizeLabel}
                </span>
              ) : null}
              <span>
                <span className="mx-1.5 text-muted-foreground/45">|</span>
                {formatHistoryResourceDate(message.sentAt)}
              </span>
            </div>
          </div>
        </div>
      ))}
      {fileMessages.length === 0 ? (
        <div className="px-3 py-10 text-center text-sm text-muted-foreground">
          暂无历史记录
        </div>
      ) : null}
    </div>
  );
}

function getHistoryTabMessages(messages: Message[], scope: HistoryPanelScope) {
  if (scope === "all") {
    return messages;
  }

  return [...messages].sort((left, right) => {
    const rightTime = parseHistoryMessageDate(right.sentAt)?.getTime() ?? 0;
    const leftTime = parseHistoryMessageDate(left.sentAt)?.getTime() ?? 0;

    if (rightTime !== leftTime) {
      return rightTime - leftTime;
    }

    return right.id.localeCompare(left.id);
  });
}

function getHistoryTabSortDirection(
  scope: HistoryPanelScope,
): HistoryTabSortDirection {
  return scope === "all" ? "ascending" : "descending";
}

function HistoryFileBadge({ message }: { message: FileHistoryMessage }) {
  return (
    <FileExtensionBadge
      className="size-10 shrink-0"
      extension={message.content.extension}
    />
  );
}

function HistoryResourceThumbFallback() {
  return (
    <div className="size-10 shrink-0 rounded-[8px] bg-muted-foreground/5" />
  );
}

function HistoryLinkList({ messages }: { messages: Message[] }) {
  const linkMessages = messages.filter(isH5Message);

  return (
    <div className="w-full max-w-full min-w-0 divide-y divide-divider/80 overflow-hidden">
      {linkMessages.map((message) => (
        <HistoryLinkRow key={message.id} message={message} />
      ))}
      {linkMessages.length === 0 ? (
        <div className="px-3 py-10 text-center text-sm text-muted-foreground">
          暂无历史记录
        </div>
      ) : null}
    </div>
  );
}

function HistoryLinkRow({ message }: { message: H5HistoryMessage }) {
  const safeUrl = getSafeMessageUrl(message.content.url);

  return (
    <a
      aria-disabled={!safeUrl}
      className="grid w-full max-w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 overflow-hidden px-2 py-3"
      href={safeUrl ?? undefined}
      rel={safeUrl ? "noopener noreferrer" : undefined}
      target={safeUrl ? "_blank" : undefined}
    >
      <HistoryLinkThumb message={message} />
      <div className="min-w-0 overflow-hidden">
        <div className="flex min-w-0 items-start gap-2 overflow-hidden">
          <div className="block min-w-0 flex-1 truncate text-[14px] font-semibold leading-5 text-foreground">
            {message.content.title || message.content.description || "H5"}
          </div>
        </div>
        <div className="mt-0.5 block w-full min-w-0 max-w-full truncate text-[12px] leading-5 text-muted-foreground/75">
          <span>{message.author}</span>
          <span>
            <span className="mx-1.5 text-muted-foreground/45">|</span>
            {formatHistoryResourceDate(message.sentAt)}
          </span>
        </div>
      </div>
    </a>
  );
}

function HistoryLinkThumb({ message }: { message: H5HistoryMessage }) {
  const previewImageUrl = message.content.previewImageUrl?.trim();

  if (previewImageUrl) {
    return (
      <LoadableMessageImage
        alt={message.content.title}
        className="size-10 shrink-0 rounded-[8px] object-cover"
        fallback={<HistoryResourceThumbFallback />}
        loading="lazy"
        src={previewImageUrl}
      />
    );
  }

  return <HistoryResourceThumbFallback />;
}

function HistoryMiniProgramList({ messages }: { messages: Message[] }) {
  const miniProgramMessages = messages.filter(isMiniProgramMessage);

  return (
    <div className="w-full max-w-full min-w-0 divide-y divide-divider/80 overflow-hidden">
      {miniProgramMessages.map((message) => (
        <div
          className="grid w-full max-w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 overflow-hidden px-2 py-3"
          key={message.id}
        >
          <HistoryMiniProgramThumb message={message} />
          <div className="min-w-0 overflow-hidden">
            <div className="flex min-w-0 items-start gap-2 overflow-hidden">
              <div className="block min-w-0 flex-1 truncate text-[14px] font-semibold leading-5 text-foreground">
                {message.content.title || message.content.appName || "小程序"}
              </div>
            </div>
            <div className="mt-0.5 block w-full min-w-0 max-w-full truncate text-[12px] leading-5 text-muted-foreground/75">
              <span>{message.author}</span>
              <span>
                <span className="mx-1.5 text-muted-foreground/45">|</span>
                {formatHistoryResourceDate(message.sentAt)}
              </span>
            </div>
          </div>
        </div>
      ))}
      {miniProgramMessages.length === 0 ? (
        <div className="px-3 py-10 text-center text-sm text-muted-foreground">
          暂无历史记录
        </div>
      ) : null}
    </div>
  );
}

function HistoryMiniProgramThumb({
  message,
}: {
  message: MiniProgramHistoryMessage;
}) {
  const coverImageUrl = message.content.coverImageUrl?.trim();

  if (coverImageUrl) {
    return (
      <LoadableMessageImage
        alt={message.content.title}
        className="size-10 shrink-0 rounded-[8px] object-cover"
        fallback={<HistoryResourceThumbFallback />}
        loading="lazy"
        src={coverImageUrl}
      />
    );
  }

  return <HistoryResourceThumbFallback />;
}

function HistoryMediaWall({
  messages,
  onDownloadMessageFile,
}: {
  messages: Message[];
  onDownloadMessageFile?: (message: ChatMessage) => void;
}) {
  const mediaMessages = messages.filter(isMediaMessage);
  const groupedMediaMessages = groupMediaMessagesByDate(mediaMessages);

  return (
    <div className="space-y-5 px-0 py-3">
      {groupedMediaMessages.map((group) => (
        <div key={group.label} className="space-y-3">
          <HistoryDateDivider label={group.label} />
          <div className="grid grid-cols-3 gap-2">
            {group.messages.map((message) => (
              <HistoryMediaTile
                key={message.id}
                message={message}
                onDownloadMessageFile={onDownloadMessageFile}
              />
            ))}
          </div>
        </div>
      ))}
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

type FileHistoryMessage = ChatMessage & {
  content: ChatMessage["content"] & { type: "file" };
};

type H5HistoryMessage = ChatMessage & {
  content: H5CardMessageContent;
};

type MiniProgramHistoryMessage = ChatMessage & {
  content: MiniProgramMessageContent;
};

function HistoryMediaTile({
  message,
  onDownloadMessageFile,
}: {
  message: MediaHistoryMessage;
  onDownloadMessageFile?: (message: ChatMessage) => void;
}) {
  const content = message.content;
  const imageUrl =
    content.type === "image"
      ? content.imageUrl?.trim() ?? ""
      : content.coverImageUrl?.trim() ?? "";
  const videoUrl =
    content.type === "video" ? content.videoUrl?.trim() ?? "" : "";
  const isVideoDownloading =
    content.type === "video" && content.downloadStatus === "ing";
  const needsVideoTransfer =
    content.type === "video" &&
    Boolean(
      content.fileSerialNo &&
        (isExpiringUrlExpired(content.fileUrlExpireTime) ||
          (content.downloadStatus !== "finished" &&
            !canUseExpiringUrl(videoUrl, content.fileUrlExpireTime))),
    );
  const isVideoPlayable =
    content.type === "video" &&
    !isVideoDownloading &&
    !needsVideoTransfer &&
    canUseExpiringUrl(videoUrl, content.fileUrlExpireTime);
  const optimizedImageUrl = imageUrl
    ? getOptimizedMessageImageUrl(imageUrl)
    : "";
  const fallbackText =
    content.type === "image" ? "图片不可用" : "视频封面不可用";
  const tileContent = optimizedImageUrl ? (
    <LoadableMessageImage
      alt={content.alt}
      className="h-full w-full object-contain transition-transform duration-200 group-hover/media:scale-[1.01]"
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
    <div
      className="group/media relative isolate aspect-square overflow-hidden rounded-[8px] border border-border bg-muted"
      data-testid={`history-media-tile-${message.id}`}
    >
      {content.type === "image" && imageUrl ? (
        <ImagePreviewDialog
          alt={content.alt}
          imageUrl={imageUrl}
          triggerClassName="block h-full w-full p-0 text-left outline-none focus-visible:ring-4 focus-visible:ring-ring/25"
        >
          {tileContent}
        </ImagePreviewDialog>
      ) : isVideoPlayable ? (
        <button
          aria-label={`播放视频：${content.alt}`}
          className="block h-full w-full p-0 text-left outline-none focus-visible:ring-4 focus-visible:ring-ring/25"
          onClick={() =>
            window.open(videoUrl, "_blank", "noopener,noreferrer")
          }
          type="button"
        >
          {tileContent}
        </button>
      ) : (
        tileContent
      )}
      {content.type === "video" ? (
        isVideoDownloading ? (
          <span
            aria-label="视频下载中"
            className="absolute left-1/2 top-1/2 z-1 inline-flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/85 bg-black/25 text-white shadow-sm backdrop-blur-[1px]"
            role="status"
          >
            <HugeiconsIcon
              className="animate-spin"
              icon={Loading03Icon}
              size={21}
              strokeWidth={2.1}
            />
          </span>
        ) : needsVideoTransfer ? (
          onDownloadMessageFile ? (
            <button
              aria-label={`下载视频：${content.alt}`}
              className="absolute left-1/2 top-1/2 z-1 inline-flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/85 bg-black/25 text-white shadow-sm outline-none backdrop-blur-[1px] transition-colors hover:bg-black/35 focus-visible:ring-4 focus-visible:ring-white/35"
              onClick={() => onDownloadMessageFile(message)}
              type="button"
            >
              <HugeiconsIcon icon={Download04Icon} size={21} strokeWidth={2.1} />
            </button>
          ) : null
        ) : isVideoPlayable ? (
          <span className="pointer-events-none absolute left-1/2 top-1/2 z-1 inline-flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/85 bg-black/25 text-white shadow-sm backdrop-blur-[1px]">
            <HugeiconsIcon
              className="translate-x-[1px]"
              icon={PlayIcon}
              size={21}
              strokeWidth={2.1}
            />
          </span>
        ) : null
      ) : null}
    </div>
  );
}

function HistoryDateDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-12 text-[12px] leading-5 text-muted-foreground">
      <span className="h-px flex-1 bg-divider" />
      <span className="shrink-0">{label}</span>
      <span className="h-px flex-1 bg-divider" />
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

function isFileMessage(message: Message): message is FileHistoryMessage {
  return message.role !== "system" && message.content.type === "file";
}

function isH5Message(message: Message): message is H5HistoryMessage {
  return message.role !== "system" && message.content.type === "h5";
}

function isMiniProgramMessage(
  message: Message,
): message is MiniProgramHistoryMessage {
  return message.role !== "system" && message.content.type === "mini-program";
}

function getHistoryMessageAuthor(message: ChatMessage) {
  return message.author || message.senderDisplayName || message.sender.name;
}

function groupMediaMessagesByDate(messages: MediaHistoryMessage[]) {
  const groups: Array<{ label: string; messages: MediaHistoryMessage[] }> = [];

  for (const message of messages) {
    const label = formatHistoryResourceDate(message.sentAt);
    const previousGroup = groups[groups.length - 1];

    if (previousGroup && previousGroup.label === label) {
      previousGroup.messages.push(message);
    } else {
      groups.push({
        label,
        messages: [message],
      });
    }
  }

  return groups;
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

function formatHistoryResourceDate(value: string) {
  const date = parseHistoryMessageDate(value);

  if (!date) {
    return value.split(" ")[0] ?? value;
  }

  const month = date.getMonth() + 1;
  const day = date.getDate();

  if (date.getFullYear() === new Date().getFullYear()) {
    return `${month}/${day}`;
  }

  return `${date.getFullYear()}/${month}/${day}`;
}

function parseHistoryMessageDate(value: string) {
  const date = parseISO(value.trim().replace(" ", "T"));

  if (!isValid(date)) {
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
  const [isOpen, setIsOpen] = useState(false);
  const selectedDate = value ? new Date(`${value}T00:00:00`) : undefined;
  const handleSelectDate = (date?: Date) => {
    const nextDay = date ? formatDay(date) : undefined;

    onChange(nextDay === value ? undefined : nextDay);
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
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
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelectDate}
        />
      </PopoverContent>
    </Popover>
  );
}

function SenderFilter({
  activeConversation,
  accountAvatarUrl,
  accountName,
  customerName,
  groupMembers,
  onChange,
  value,
}: {
  activeConversation?: Conversation;
  accountAvatarUrl?: string;
  accountName?: string;
  customerName?: string;
  groupMembers: GroupMember[];
  onChange: (senderId?: string) => void;
  value?: string;
}) {
  const options = buildSenderOptions(
    activeConversation,
    accountAvatarUrl,
    accountName,
    groupMembers,
    customerName,
  );
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
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
      <PopoverContent align="start" className="w-72 p-2">
        <div className="space-y-1">
          <button
            aria-pressed={(value ?? "__all__") === "__all__"}
            className={cn(
              "flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-sm outline-none transition-colors focus-visible:bg-muted",
              (value ?? "__all__") === "__all__" && "bg-muted/70",
            )}
            onClick={() => {
              onChange(undefined);
              setIsOpen(false);
            }}
            type="button"
          >
            <span className="flex size-4 shrink-0 items-center justify-center">
              {(value ?? "__all__") === "__all__" ? (
                <HugeiconsIcon
                  data-testid="history-sender-selected-icon"
                  icon={Tick02Icon}
                  size={16}
                  strokeWidth={1.8}
                />
              ) : null}
            </span>
            <span className="min-w-0 flex-1 truncate">全部</span>
          </button>
          {options.map((option) => {
            const isSelected = value === option.id;

            return (
              <button
                aria-pressed={isSelected}
                className={cn(
                  "flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-sm outline-none transition-colors focus-visible:bg-muted",
                  isSelected && "bg-muted/70",
                )}
                key={option.id}
                onClick={() => {
                  onChange(option.id);
                  setIsOpen(false);
                }}
                type="button"
              >
                <span className="flex size-4 shrink-0 items-center justify-center">
                  {isSelected ? (
                    <HugeiconsIcon
                      data-testid="history-sender-selected-icon"
                      icon={Tick02Icon}
                      size={16}
                      strokeWidth={1.8}
                    />
                  ) : null}
                </span>
                <Avatar className="size-5 shrink-0">
                  <AvatarImage alt={option.label} src={option.avatarUrl} />
                  <AvatarFallback className="text-[11px]">
                    {getFirstGrapheme(option.label)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function buildSenderOptions(
  activeConversation?: Conversation,
  accountAvatarUrl?: string,
  accountName?: string,
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
        avatarUrl: accountAvatarUrl,
        label: accountName ?? "客服",
      },
      {
        id: activeConversation.thirdExternalUserId ?? "",
        avatarUrl: activeConversation.customerAvatarUrl,
        label: customerName ?? activeConversation.customerName,
      },
    ].filter((item) => item.id);
  }

  return groupMembers.map((member) => ({
    avatarUrl: member.avatarUrl,
    id: member.id,
    label: member.displayName,
  }));
}

function formatDay(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function getHistoryFilterKey(filters: {
  day?: string;
  senderId?: string;
  scope: HistoryPanelScope;
}) {
  return `${filters.scope}\u0000${filters.day ?? ""}\u0000${filters.senderId ?? ""}`;
}

function getFirstGrapheme(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "?";
  }

  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, {
      granularity: "grapheme",
    });
    const first = segmenter.segment(trimmed)[Symbol.iterator]().next();

    if (!first.done) {
      return first.value.segment;
    }
  }

  return Array.from(trimmed)[0] ?? "?";
}
