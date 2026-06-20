import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  ChatMessage,
  ChatRecordMessageContent,
  Message,
} from "@/pages/chat/chat-types";
import { getWorkbenchService } from "@/pages/chat/api/workbench-service";
import { adaptMessage } from "@/pages/chat/api/workbench-adapter";
import { ContactCardMessageCard } from "@/pages/chat/components/message/contact-card";
import { FileMessageCard } from "@/pages/chat/components/message/file";
import { ImageMessageCard } from "@/pages/chat/components/message/image";
import { LinkMessageCard } from "@/pages/chat/components/message/link";
import { LocationMessageCard } from "@/pages/chat/components/message/location";
import { MiniAppMessageCard } from "@/pages/chat/components/message/miniapp";
import { QuoteMessageCard } from "@/pages/chat/components/message/quote";
import { RedPacketMessageCard } from "@/pages/chat/components/message/redpacket";
import { SolitaireMessageCard } from "@/pages/chat/components/message/solitaire";
import { SphFeedMessageCard } from "@/pages/chat/components/message/sphfeed";
import {
  TextMessageBubble,
  WechatEmojiText,
} from "@/pages/chat/components/message/text";
import { VideoMessageCard } from "@/pages/chat/components/message/video";

type ChatRecordDetail = {
  messageId: string;
  messages: Message[];
};

export type LoadChatRecordDetail = (input: {
  conversationId: string;
  msgInfoId: number;
}) => Promise<ChatRecordDetail>;

type ChatRecordMessageCardProps = {
  content: ChatRecordMessageContent;
  conversationId: string;
  loadChatRecordDetail?: LoadChatRecordDetail;
  msgInfoId?: number;
};

const CHAT_RECORD_FALLBACK_TEXT = "[聊天记录]";

export function ChatRecordMessageCard({
  content,
  conversationId,
  loadChatRecordDetail = loadChatRecordDetailFromService,
  msgInfoId,
}: ChatRecordMessageCardProps) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ChatRecordDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const contextRef = useRef({ conversationId, msgInfoId });
  const isMountedRef = useRef(false);
  const loadDetailRef = useRef<() => Promise<void>>(async () => {});
  const openRef = useRef(open);
  const requestIdRef = useRef(0);
  const isLoadingContent = content.viewState === "loading";
  const canLoadDetail = msgInfoId != null;
  const title = normalizeChatRecordTitle(content.msgTitle);
  const lines = normalizeChatRecordLines(content);

  contextRef.current = { conversationId, msgInfoId };
  openRef.current = open;

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setDetail(null);
    setError("");

    if (openRef.current && canLoadDetail) {
      void loadDetailRef.current();
    }
  }, [canLoadDetail, conversationId, msgInfoId]);

  if (isFallbackChatRecordContent(content)) {
    return (
      <TextMessageBubble
        isAgent={false}
        text={CHAT_RECORD_FALLBACK_TEXT}
      />
    );
  }

  async function loadDetail() {
    if (msgInfoId == null) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    const requestContext = { conversationId, msgInfoId };
    requestIdRef.current = requestId;
    setLoading(true);
    setError("");

    try {
      const nextDetail = await loadChatRecordDetail(requestContext);

      if (!canApplyDetailResult(requestId, requestContext)) {
        return;
      }

      setDetail(nextDetail);
    } catch {
      if (!canApplyDetailResult(requestId, requestContext)) {
        return;
      }

      setError("聊天记录加载失败");
    } finally {
      if (!canApplyDetailResult(requestId, requestContext)) {
        return;
      }

      setLoading(false);
    }
  }

  loadDetailRef.current = loadDetail;

  function canApplyDetailResult(
    requestId: number,
    requestContext: { conversationId: string; msgInfoId: number },
  ) {
    return (
      isMountedRef.current &&
      requestIdRef.current === requestId &&
      contextRef.current.conversationId === requestContext.conversationId &&
      contextRef.current.msgInfoId === requestContext.msgInfoId
    );
  }

  async function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    const hasLoadedMessages = Boolean(detail?.messages.length);

    if (!nextOpen || !canLoadDetail || isLoadingContent || hasLoadedMessages || loading) {
      return;
    }

    await loadDetail();
  }

  async function handleRetry() {
    await loadDetail();
  }

  return (
    <>
      <button
        aria-label={isLoadingContent ? `聊天记录加载中：${title}` : `查看聊天记录：${title}`}
        className="block w-[min(19rem,calc(100vw-7rem))] rounded-[8px] border border-border bg-surface p-3 text-left outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-surface"
        data-testid="chat-record-card"
        disabled={isLoadingContent || !canLoadDetail}
        onClick={() => void handleOpenChange(true)}
        type="button"
      >
        <p className="line-clamp-2 text-[14px] font-semibold leading-5 text-foreground">
          <WechatEmojiText text={title} />
        </p>
        <div className="mt-2 space-y-1">
          {lines.slice(0, 3).map((line, index) => (
            <p
              className="line-clamp-1 text-[13px] leading-5 text-muted-foreground"
              key={`${line}-${index}`}
            >
              <WechatEmojiText text={line} />
            </p>
          ))}
        </div>
        <div className="mt-3 border-t border-divider pt-2.5 text-[11px] text-muted-foreground">
          聊天记录
        </div>
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="w-[min(26rem,calc(100vw-2rem))] max-w-none gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-divider px-5 py-4 text-left">
            <DialogTitle className="pr-10 text-[15px] font-medium leading-6">
              {title}
            </DialogTitle>
            <DialogDescription className="sr-only">
              转发聊天记录详情
            </DialogDescription>
          </DialogHeader>
          <ChatRecordDialogBody
            detail={detail}
            error={error}
            loading={loading}
            onRetry={() => void handleRetry()}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function ChatRecordDialogBody({
  detail,
  error,
  loading,
  onRetry,
}: {
  detail: ChatRecordDetail | null;
  error: string;
  loading: boolean;
  onRetry: () => void;
}) {
  let body: ReactNode;

  if (loading) {
    body = (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Spinner variant="classic" size={18} />
      </div>
    );
  } else if (error) {
    body = (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <p>{error}</p>
        <button
          className="rounded-[8px] border border-border px-3 py-1.5 text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onRetry}
          type="button"
        >
          重试
        </button>
      </div>
    );
  } else {
    const messages = detail?.messages.filter(isChatMessage) ?? [];

    if (messages.length === 0) {
      body = (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
          <p>暂无聊天记录</p>
          <button
            className="rounded-[8px] border border-border px-3 py-1.5 text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onRetry}
            type="button"
          >
            刷新聊天记录
          </button>
        </div>
      );
    } else {
      body = (
        <ScrollArea className="h-full" viewportTestId="chat-record-detail-scroll-viewport">
          <div className="space-y-4 px-5 py-4">
            {messages.map((message) => (
              <ChatRecordDetailMessage
                key={message.clientMessageId ?? message.optNo ?? message.id}
                message={message}
              />
            ))}
          </div>
        </ScrollArea>
      );
    }
  }

  return (
    <div
      className="h-[min(42rem,calc(100vh-6rem))] min-h-[34rem] w-full"
      data-testid="chat-record-detail-viewport"
    >
      {body}
    </div>
  );
}

function ChatRecordDetailMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1.5">
      <div className="flex max-w-full items-center gap-2 text-[13px] leading-5 text-muted-foreground">
        <span className="min-w-0 truncate text-muted-foreground/70">{message.author}</span>
        <span className="shrink-0 text-xs text-muted-foreground/70">
          {message.sentAt}
        </span>
      </div>
      <ChatRecordDetailMessageContent message={message} />
    </div>
  );
}

function ChatRecordDetailMessageContent({ message }: { message: ChatMessage }) {
  if (message.content.type === "voice") {
    return (
      <div className="w-full max-w-full min-w-0 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
        <WechatEmojiText text={message.content.transVoiceText?.trim() || "[语音]"} />
      </div>
    );
  }

  if (message.content.type === "chatrecord") {
    return (
      <div className="w-[min(19rem,calc(100vw-7rem))] rounded-[8px] border border-border bg-surface p-3">
        <p className="line-clamp-2 text-[14px] font-semibold leading-5 text-foreground">
          <WechatEmojiText text={normalizeChatRecordTitle(message.content.msgTitle)} />
        </p>
        <div className="mt-2 space-y-1">
          {normalizeChatRecordLines(message.content).slice(0, 3).map((line, index) => (
            <p
              className="line-clamp-1 text-[13px] leading-5 text-muted-foreground"
              key={`${line}-${index}`}
            >
              <WechatEmojiText text={line} />
            </p>
          ))}
        </div>
        <div className="mt-3 border-t border-divider pt-2.5 text-[11px] text-muted-foreground">
          聊天记录
        </div>
      </div>
    );
  }

  if (message.content.type === "file") {
    return <FileMessageCard content={message.content} showDownloadAction={false} />;
  }

  if (message.content.type === "video") {
    return <VideoMessageCard content={message.content} showDownloadAction={false} />;
  }

  switch (message.content.type) {
    case "text":
      return (
        <div className="w-full max-w-full min-w-0 whitespace-pre-wrap break-words text-sm leading-5 text-foreground">
          <WechatEmojiText text={message.content.text} />
        </div>
      );
    case "image":
      return <ImageMessageCard content={message.content} />;
    case "h5":
      return <LinkMessageCard content={message.content} />;
    case "mini-program":
      return <MiniAppMessageCard content={message.content} />;
    case "contact-card":
      return <ContactCardMessageCard content={message.content} />;
    case "location":
      return <LocationMessageCard content={message.content} />;
    case "sphfeed":
      return <SphFeedMessageCard content={message.content} />;
    case "solitaire":
      return (
        <SolitaireMessageCard
          content={message.content}
          isAgent={message.role === "agent"}
          isOwnMessage={message.isOwnMessage}
        />
      );
    case "redpacket":
      return <RedPacketMessageCard content={message.content} />;
    case "quote":
      return (
        <QuoteMessageCard
          content={message.content}
          isAgent={message.role === "agent"}
          isOwnMessage={message.isOwnMessage}
        />
      );
    default:
      return (
        <div className="w-full max-w-full min-w-0 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
          [暂不支持显示该消息]
        </div>
      );
  }
}

async function loadChatRecordDetailFromService(input: {
  conversationId: string;
  msgInfoId: number;
}): Promise<ChatRecordDetail> {
  const response = await getWorkbenchService().getChatRecordDetail(input);

  return {
    messageId: response.messageId,
    messages: response.messages.map((message) => adaptMessage(message, {}, {})),
  };
}

function normalizeChatRecordTitle(value: string | null | undefined) {
  return value?.trim() || "聊天记录";
}

function normalizeChatRecordLines(content: ChatRecordMessageContent) {
  const rawLines = Array.isArray(content.msgContent) ? content.msgContent : [];
  const lines = rawLines
    .filter((line): line is string => typeof line === "string" && line.trim().length > 0)
    .map((line) => line.trim());

  if (lines.length > 0) {
    return lines;
  }

  const fallback = typeof content.unsupportedDisplayText === "string"
    ? content.unsupportedDisplayText.trim()
    : "";

  return fallback ? [fallback] : [CHAT_RECORD_FALLBACK_TEXT];
}

function isFallbackChatRecordContent(content: ChatRecordMessageContent) {
  const rawLines = Array.isArray(content.msgContent) ? content.msgContent : [];
  const firstLine = typeof rawLines[0] === "string" ? rawLines[0].trim() : "";
  const unsupportedDisplayText = typeof content.unsupportedDisplayText === "string"
    ? content.unsupportedDisplayText.trim()
    : "";

  return (
    normalizeChatRecordTitle(content.msgTitle) === "聊天记录" &&
    rawLines.length === 1 &&
    firstLine === CHAT_RECORD_FALLBACK_TEXT &&
    !unsupportedDisplayText
  );
}

function isChatMessage(message: Message): message is ChatMessage {
  return message.role !== "system";
}
