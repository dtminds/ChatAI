import { useEffect, useState } from "react";
import type { InsightsQualityResponse } from "@chatai/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getInsightQuality } from "./api/insights-service";
import { InsightDetailPanel } from "./insight-detail-panel";
import { InsightsLayout } from "./insights-layout";
import {
  formatInsightTime,
  formatResolutionStatus,
  formatSeverity,
} from "./insights-utils";
import { useInsightDetail } from "./use-insight-detail";

export function InsightsQualityPage() {
  const [quality, setQuality] = useState<InsightsQualityResponse>();
  const detail = useInsightDetail();

  useEffect(() => {
    void getInsightQuality().then(setQuality);
  }, []);

  const overview = quality?.overview;

  return (
    <InsightsLayout title="服务质检">
      <div className="space-y-6">
        <section className="rounded-[8px] border bg-background p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">客户问题是否解决</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                只判断当前逻辑会话内是否解决，作为主管辅助复核
              </p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-7">
            <Stat label="逻辑会话总数" value={overview?.totalSessions} />
            <Stat label="已分析会话数" value={overview?.analyzedSessions} />
            <Stat label="有客户问题" value={overview?.problemSessions} />
            <Stat label="已解决" value={overview?.resolved} />
            <Stat label="未解决" value={overview?.unresolved} tone="danger" />
            <Stat label="部分解决" value={overview?.partial} tone="warning" />
            <Stat label="无明确问题" value={overview?.noCustomerProblem} />
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-[8px] border bg-background">
            <div className="border-b px-5 py-4">
              <h2 className="text-base font-semibold">未解决会话</h2>
            </div>
            <div className="divide-y">
              {(quality?.unresolvedSessions ?? []).map((session) => (
                <article className="grid gap-3 px-5 py-4" key={session.sessionId}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{formatSeverity(session.severity)}</Badge>
                        <Badge variant="outline">
                          {formatResolutionStatus(session.resolutionStatus)}
                        </Badge>
                        <h3 className="text-sm font-medium">{session.customerName}</h3>
                      </div>
                      <p className="mt-2 text-sm text-foreground">{session.problemSummary}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {session.unresolvedReason}
                      </p>
                    </div>
                    <Button
                      className="h-8 rounded-[8px]"
                      onClick={() => void detail.openDetail(session.sessionId)}
                      size="sm"
                      variant="outline"
                    >
                      查看证据
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>客服 {session.agentName ?? "未分配"}</span>
                    <span>会话 {session.conversationId}</span>
                    <span>{formatInsightTime(session.lastCustomerMessageAt)}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-[8px] border bg-background">
            <div className="border-b px-5 py-4">
              <h2 className="text-base font-semibold">未解决原因排行</h2>
            </div>
            <div className="divide-y">
              {(quality?.unresolvedReasons ?? []).map((reason) => (
                <div className="flex items-center justify-between px-5 py-3" key={reason.reasonCode}>
                  <span className="text-sm">{reason.reasonLabel}</span>
                  <Badge variant="outline">{reason.count}</Badge>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <InsightDetailPanel
        detail={detail.detail}
        isOpen={detail.isOpen}
        onOpenChange={detail.onOpenChange}
      />
    </InsightsLayout>
  );
}

function Stat({
  label,
  tone = "default",
  value,
}: {
  label: string;
  tone?: "danger" | "default" | "warning";
  value?: number;
}) {
  return (
    <div className="rounded-[8px] bg-muted/35 px-3 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={
          tone === "danger"
            ? "mt-1 text-xl font-semibold text-destructive"
            : tone === "warning"
              ? "mt-1 text-xl font-semibold text-amber-600"
              : "mt-1 text-xl font-semibold"
        }
      >
        {value ?? "-"}
      </div>
    </div>
  );
}
