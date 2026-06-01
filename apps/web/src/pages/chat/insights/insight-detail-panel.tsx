import { Link } from "react-router-dom";
import {
  ArrowRight01Icon,
  BubbleChatIcon,
  File01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { InsightDetailResponse } from "@chatai/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  chatMessageHref,
  formatAnalysisStatus,
  formatInsightTime,
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
  return (
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
                    会话 {detail.session.conversationId} · 逻辑会话 {detail.session.sessionId}
                  </p>
                </div>
                <Badge variant="outline">
                  {formatResolutionStatus(detail.problemResolution.resolutionStatus)}
                </Badge>
              </div>

              <Button asChild className="h-8 rounded-[8px]" size="sm" variant="outline">
                <Link
                  to={chatMessageHref(
                    detail.session.conversationId,
                    detail.evidenceMessages.at(-1)?.messageId,
                  )}
                >
                  <HugeiconsIcon icon={BubbleChatIcon} size={15} />
                  跳转聊天
                </Link>
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
                <h3 className="text-sm font-semibold text-foreground">问题解决状态</h3>
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
                items={detail.sentiment.map((item) => `${formatPolarity(item.polarity)} · ${item.reason}`)}
                label="情绪"
              />
              <InsightPills
                emptyText="暂无风险"
                items={detail.risks.map((item) => `${item.riskType} · ${item.reason || item.riskLevel}`)}
                label="风险"
              />
              <InsightPills
                emptyText="暂无质检项"
                items={detail.qaFindings.map((item) => `${item.ruleCode} · ${item.passed ? "通过" : "未通过"}`)}
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
                  {detail.evidenceMessages.length} 条
                </span>
              </div>

              <div className="space-y-2">
                {detail.evidenceMessages.map((message) => (
                  <article
                    className="rounded-[8px] border bg-background p-3"
                    key={message.messageId}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                        <HugeiconsIcon icon={File01Icon} size={14} />
                        <span className="truncate">
                          {message.senderName ?? message.senderRole}
                        </span>
                        <span>{formatInsightTime(message.msgtime)}</span>
                      </div>
                      <Button asChild className="h-7 px-2" size="sm" variant="ghost">
                        <Link
                          aria-label={`跳转聊天 ${message.messageId}`}
                          to={chatMessageHref(
                            detail.session.conversationId,
                            message.messageId,
                          )}
                        >
                          <HugeiconsIcon icon={ArrowRight01Icon} size={14} />
                        </Link>
                      </Button>
                    </div>
                    <p className="text-sm leading-6 text-foreground">{message.contentText}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div className="px-6 py-8 text-sm text-muted-foreground">正在加载详情</div>
        )}
      </SheetContent>
    </Sheet>
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
