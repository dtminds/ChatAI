import { useEffect, useState } from "react";
import type {
  InsightOverviewSessionsResponse,
  InsightSessionMessagesResponse,
} from "@chatai/contracts";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { HistoryCompactMessageList } from "@/pages/chat/components/message-history-side-panel";
import { getInsightSessionMessages } from "./api/insights-service";
import { adaptInsightMessages } from "./insight-detail-panel";
import { formatInsightTime } from "./insights-utils";

type SessionItem = InsightOverviewSessionsResponse["items"][number];

export function BasicSessionMessagesPanel({
  onOpenChange,
  session,
}: {
  onOpenChange: (open: boolean) => void;
  session?: SessionItem;
}) {
  const [messages, setMessages] = useState<InsightSessionMessagesResponse["messages"]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!session) {
      setMessages([]);
      setError(false);
      return;
    }

    let active = true;
    setIsLoading(true);
    setError(false);
    setMessages([]);

    void getInsightSessionMessages(session.sessionId)
      .then((response) => {
        if (active) {
          setMessages(response.messages);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [session]);

  const adaptedMessages = adaptInsightMessages(messages);

  return (
    <Sheet onOpenChange={onOpenChange} open={Boolean(session)}>
      <SheetContent className="w-full overflow-hidden sm:max-w-[560px]">
        <SheetTitle className="sr-only">会话消息</SheetTitle>
        <SheetDescription className="sr-only">查看本轮服务会话的原始消息</SheetDescription>
        {session ? (
          <div className="flex h-full min-h-0 flex-col">
            <header className="border-b px-6 py-5 pr-14">
              <h2 className="text-base font-semibold text-foreground">{session.customerName}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatInsightTime(session.startedAt)} 至 {session.endedAt ? formatInsightTime(session.endedAt) : "进行中"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                共 {session.messageCount} 条，客户 {session.customerMessageCount} 条，客服 {session.agentMessageCount} 条
              </p>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {isLoading ? (
                <div className="flex min-h-[220px] items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
                  <Spinner size={18} variant="classic" />
                  <span>正在加载</span>
                </div>
              ) : error ? (
                <div className="rounded-[8px] border border-dashed p-6 text-center text-sm text-muted-foreground">
                  会话消息加载失败
                </div>
              ) : adaptedMessages.length > 0 ? (
                <HistoryCompactMessageList messages={adaptedMessages} textWeight="normal" />
              ) : (
                <div className="rounded-[8px] border border-dashed p-6 text-center text-sm text-muted-foreground">
                  暂无数据
                </div>
              )}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
