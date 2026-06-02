import { AlertCircleIcon, Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { InsightMessageContextResponse } from "@chatai/contracts";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { HistoryCompactMessageList } from "@/pages/chat/components/message-history-side-panel";
import type { Message } from "@/pages/chat/chat-types";

export function InsightMessageContextSheet({
  context,
  error,
  isLoading,
  isOpen,
  messages,
  onOpenChange,
}: {
  context?: InsightMessageContextResponse;
  error?: string;
  isLoading: boolean;
  isOpen: boolean;
  messages: Message[];
  onOpenChange: (open: boolean) => void;
}) {
  const targetMessageId = context?.targetMessageId;

  return (
    <Sheet onOpenChange={onOpenChange} open={isOpen}>
      <SheetContent className="flex w-full flex-col overflow-hidden sm:max-w-[640px]">
        <SheetHeader className="border-b">
          <SheetTitle>消息上下文</SheetTitle>
          <SheetDescription>
            {context
              ? `会话 ${context.conversationId} · 前后各 ${context.contextBefore} 条`
              : "查看指定消息前后的原始对话"}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 px-6 py-5">
          {isLoading ? (
            <div className="flex h-full min-h-[240px] items-center justify-center gap-2 text-sm text-muted-foreground">
              <HugeiconsIcon
                className="animate-spin"
                icon={Loading03Icon}
                size={18}
                strokeWidth={1.8}
              />
              <span>正在加载消息上下文</span>
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 rounded-[8px] border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
              <HugeiconsIcon icon={AlertCircleIcon} size={16} strokeWidth={1.8} />
              <span>{error}</span>
            </div>
          ) : context ? (
            <div className="max-h-[calc(100vh-10rem)] overflow-y-auto rounded-[8px] bg-muted/50 p-3">
              {messages.length > 0 ? (
                <div className="space-y-4">
                  <HistoryCompactMessageList
                    messages={messages}
                    renderMetaSuffix={(message) =>
                      isTargetMessage(message, targetMessageId) ? (
                        <span
                          className="rounded-[6px] bg-primary/10 px-1.5 text-[11px] font-medium leading-5 text-primary"
                          data-testid="insight-evidence-context-target"
                        >
                          证据
                        </span>
                      ) : null
                    }
                  />
                </div>
              ) : (
                <div className="rounded-[8px] border border-dashed bg-background/70 p-6 text-center text-sm text-muted-foreground">
                  未找到消息上下文
                </div>
              )}
            </div>
          ) : (
            <div className="px-6 py-8 text-sm text-muted-foreground">
              请选择一条消息查看上下文
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function isTargetMessage(message: Message, targetMessageId?: string) {
  return (
    message.remoteMessageId === targetMessageId ||
    String(message.seq ?? "") === targetMessageId
  );
}
