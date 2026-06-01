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
