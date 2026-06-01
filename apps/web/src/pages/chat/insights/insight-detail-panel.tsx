import { useState } from "react";
import {
  ArrowRight01Icon,
  BubbleChatIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
  InsightDetailResponse,
  InsightMessageContextResponse,
} from "@chatai/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { adaptMessage } from "@/pages/chat/api/workbench-adapter";
import { HistoryCompactMessageList } from "@/pages/chat/components/message-history-side-panel";
import type { Account, CustomerProfile } from "@/pages/chat/chat-types";
import { getInsightMessageContext } from "./api/insights-service";
import { InsightMessageContextSheet } from "./insight-message-context-sheet";
import {
  formatAnalysisStatus,
  formatResolutionStatus,
} from "./insights-utils";

export function InsightDetailPanel({
  detail,
  isOpen,
  onOpenChange,
}: {
  detail?: InsightDetailResponse;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [messageContext, setMessageContext] = useState<InsightMessageContextResponse>();
  const [messageContextError, setMessageContextError] = useState<string>();
  const [messageContextOpen, setMessageContextOpen] = useState(false);
  const [messageContextLoading, setMessageContextLoading] = useState(false);
  const evidenceRecordMessages = detail
    ? adaptInsightMessages(detail.evidenceMessageRecords)
    : [];
  const messageContextMessages = messageContext
    ? adaptInsightMessages(messageContext.messages)
    : [];

  const handleOpenMessageContext = async (messageId?: string) => {
    if (!detail || !messageId || messageContextLoading) {
      return;
    }

    setMessageContextOpen(true);
    setMessageContextError(undefined);
    setMessageContextLoading(true);

    try {
      const context = await getInsightMessageContext({
        conversationId: detail.session.conversationId,
        messageId,
      });

      setMessageContext(context);
    } catch (error) {
      setMessageContext(undefined);
      setMessageContextError(
        error instanceof Error && error.message
          ? error.message
          : "消息上下文加载失败",
      );
    } finally {
      setMessageContextLoading(false);
    }
  };

  return (
    <>
      <Sheet onOpenChange={onOpenChange} open={isOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-[520px]">
          <SheetHeader className="border-b">
            <SheetTitle>洞察详情</SheetTitle>
            <SheetDescription>
              {detail
                ? `${detail.session.customerName} · ${formatAnalysisStatus(detail.analysisStatus)}`
                : "正在读取洞察结论"}
            </SheetDescription>
          </SheetHeader>

          {detail ? (
            <div className="space-y-6 px-6 py-5">
              <section className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      {detail.session.customerName}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatAnalysisStatus(detail.analysisStatus)}
                    </p>
                  </div>
                  <Badge variant="outline">
                    {formatResolutionStatus(detail.problemResolution.resolutionStatus)}
                  </Badge>
                </div>

                <Button
                  className="h-8 rounded-[8px]"
                  disabled={!detail.evidenceMessages.at(-1)?.messageId}
                  onClick={() => {
                    void handleOpenMessageContext(
                      detail.evidenceMessages.at(-1)?.messageId,
                    );
                  }}
                  size="sm"
                  variant="outline"
                >
                  <HugeiconsIcon icon={BubbleChatIcon} size={15} />
                  查看证据上下文
                </Button>
              </section>

              <section className="grid gap-3 rounded-[8px] border bg-muted/25 p-4">
                <SummaryItem label="客户诉求" value={detail.summary.customerIntent} />
                <SummaryItem label="处理过程" value={detail.summary.processSummary} />
                <SummaryItem label="当前结果" value={detail.summary.resultSummary} />
                {detail.summary.followUp ? (
                  <SummaryItem label="跟进建议" value={detail.summary.followUp} />
                ) : null}
              </section>

              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    问题解决状态
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {detail.problemResolution.problemSummary || "暂无客户问题摘要"}
                  </p>
                </div>
                {detail.problemResolution.unresolvedReason ? (
                  <div className="rounded-[8px] border border-destructive/25 bg-destructive/5 p-3 text-sm text-foreground">
                    {detail.problemResolution.unresolvedReason}
                  </div>
                ) : null}
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">结论维度</h3>
                <InsightPills
                  emptyText="暂无标签"
                  items={detail.tags.map((item) => item.tagName)}
                  label="标签"
                />
                <InsightPills
                  emptyText="暂无情绪"
                  items={detail.sentiment.map(
                    (item) => `${formatPolarity(item.polarity)} · ${item.reason}`,
                  )}
                  label="情绪"
                />
                <InsightPills
                  emptyText="暂无风险"
                  items={detail.risks.map(
                    (item) =>
                      `${item.riskType} · ${item.reason || item.riskLevel}`,
                  )}
                  label="风险"
                />
                <InsightPills
                  emptyText="暂无质检项"
                  items={detail.qaFindings.map(
                    (item) =>
                      `${item.ruleCode} · ${item.passed ? "通过" : "未通过"}`,
                  )}
                  label="质检"
                />
                <InsightPills
                  emptyText="暂无实体"
                  items={detail.entities.map((item) => item.entityName)}
                  label="实体"
                />
                <InsightPills
                  emptyText="暂无意图"
                  items={detail.intents.map((item) => item.intentLabel)}
                  label="意图"
                />
                <InsightPills
                  emptyText="暂无行动项"
                  items={detail.actionItems.map((item) => item.title)}
                  label="行动项"
                />
                <InsightPills
                  emptyText="暂无 FAQ 机会"
                  items={detail.faqCandidates.map((item) => item.question)}
                  label="FAQ"
                />
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">证据消息</h3>
                  <span className="text-xs text-muted-foreground">
                    {evidenceRecordMessages.length} 条
                  </span>
                </div>

                <div className="space-y-2">
                  {evidenceRecordMessages.map((message) => (
                    <article
                      className="relative rounded-[8px] border bg-background p-3 pr-11"
                      key={message.clientMessageId ?? message.optNo ?? message.id}
                    >
                      <Button
                        aria-label={`查看证据上下文 ${message.seq}`}
                        className="absolute right-2 top-2 h-7 px-2"
                        onClick={() => {
                          void handleOpenMessageContext(String(message.seq));
                        }}
                        size="sm"
                        variant="ghost"
                      >
                        <HugeiconsIcon icon={ArrowRight01Icon} size={14} />
                      </Button>
                      <HistoryCompactMessageList messages={[message]} />
                    </article>
                  ))}
                </div>
              </section>
            </div>
          ) : (
            <div className="px-6 py-8 text-sm text-muted-foreground">
              正在加载详情
            </div>
          )}
        </SheetContent>
      </Sheet>
      <InsightMessageContextSheet
        context={messageContext}
        error={messageContextError}
        isLoading={messageContextLoading}
        isOpen={messageContextOpen}
        messages={messageContextMessages}
        onOpenChange={setMessageContextOpen}
      />
    </>
  );
}

function adaptInsightMessages(messages: InsightMessageContextResponse["messages"]) {
  const customerProfiles = buildInsightCustomerProfiles(messages);
  const accounts = buildInsightAccounts(messages);

  return messages.map((message) =>
    adaptMessage(
      message,
      customerProfiles,
      accounts,
    ),
  );
}

function buildInsightCustomerProfiles(
  messages: InsightMessageContextResponse["messages"],
): Record<string, CustomerProfile> {
  return Object.fromEntries(
    messages.map((message) => [
      message.customerId,
      {
        avatarUrl: "",
        city: "",
        id: message.customerId,
        intentScore: 0,
        metrics: [],
        name: message.senderType === "customer" ? (message.senderName ?? "微信客户") : "微信客户",
        notes: [],
        persona: "",
        phone: "",
        stage: "",
        tags: [],
        tasks: [],
      },
    ]),
  );
}

function buildInsightAccounts(
  messages: InsightMessageContextResponse["messages"],
): Record<string, Account> {
  return Object.fromEntries(
    messages.map((message) => [
      message.seatId,
      {
        avatarUrl: "",
        description: "",
        id: message.seatId,
        lastMessageTime: message.createdAt,
        loginStatus: "offline",
        metrics: {
          activeCustomers: 0,
          agents: 0,
          stores: 0,
          totalCustomers: 0,
        },
        name: message.senderType === "agent" ? (message.senderName ?? "客服") : "客服",
        operator: "",
        phone: "",
        tone: "blue",
        unreadCount: 0,
      },
    ]),
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm leading-6 text-foreground">{value || "暂无"}</div>
    </div>
  );
}

function InsightPills({
  emptyText,
  items,
  label,
}: {
  emptyText: string;
  items: string[];
  label: string;
}) {
  return (
    <div className="grid gap-2 rounded-[8px] border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-2">
        {items.length > 0 ? (
          items.map((item) => (
            <Badge key={`${label}:${item}`} variant="secondary">
              {item}
            </Badge>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">{emptyText}</span>
        )}
      </div>
    </div>
  );
}

function formatPolarity(polarity: string) {
  if (polarity === "positive") {
    return "正向";
  }

  if (polarity === "negative") {
    return "负向";
  }

  if (polarity === "mixed") {
    return "混合";
  }

  if (polarity === "neutral") {
    return "中性";
  }

  return "未知";
}
