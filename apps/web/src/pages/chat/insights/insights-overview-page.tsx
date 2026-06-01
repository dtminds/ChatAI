import { useEffect, useState } from "react";
import type { InsightsFollowUpsResponse, InsightsOverviewResponse } from "@chatai/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getInsightFollowUps, getInsightOverview } from "./api/insights-service";
import { PriorityBadge } from "./insight-badges";
import { InsightDetailPanel } from "./insight-detail-panel";
import { InsightPerson } from "./insight-person";
import { InsightsLayout } from "./insights-layout";
import {
  formatAnalysisStatus,
  formatInsightTime,
} from "./insights-utils";
import { useInsightDetail } from "./use-insight-detail";

export function InsightsOverviewPage() {
  const [overview, setOverview] = useState<InsightsOverviewResponse>();
  const [followUps, setFollowUps] = useState<InsightsFollowUpsResponse>();
  const detail = useInsightDetail();

  useEffect(() => {
    void Promise.all([
      getInsightOverview().then(setOverview),
      getInsightFollowUps({ status: "open" }).then(setFollowUps),
    ]);
  }, []);

  return (
    <InsightsLayout title="总览">
      <div className="space-y-6">
        <section className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
          <Metric label="逻辑会话数" value={overview?.totalSessions} />
          <Metric label="已分析会话数" value={overview?.readySessions} />
          <Metric label="有客户问题" value={overview?.problemSessions} />
          <Metric label="未解决会话数" value={overview?.unresolvedSessions} tone="danger" />
          <Metric label="高风险会话数" value={overview?.highRiskSessions} tone="danger" />
          <Metric label="待跟进事项数" value={overview?.actionItemsOpen} />
          <Metric label="负面情绪会话" value={overview?.negativeSessions} />
          <Metric
            label="异常状态"
            value={(overview?.analysis.failed ?? 0) + (overview?.analysis.stale ?? 0)}
            tone="warning"
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.35fr_0.9fr]">
          <div className="rounded-[8px] border bg-background">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h2 className="text-base font-semibold">优先处理队列</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  投诉、退款、物流和高意向会话优先
                </p>
              </div>
              <Badge variant="outline">{followUps?.total ?? 0} 项</Badge>
            </div>
            <div className="divide-y">
              {(followUps?.items ?? []).slice(0, 5).map((item) => (
                <article className="grid gap-3 px-5 py-4" key={item.actionItemId}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <PriorityBadge priority={item.priority} />
                        <h3 className="text-sm font-medium">{item.title}</h3>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{item.reason}</p>
                    </div>
                    <Button
                      aria-label="查看高风险会话"
                      className="h-8 rounded-[8px]"
                      onClick={() => void detail.openDetail(item.sessionId)}
                      size="sm"
                      variant="outline"
                    >
                      查看
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <InsightPerson
                      avatarUrl={item.customerAvatarUrl}
                      name={item.customerName}
                    />
                    <span>{formatInsightTime(item.lastCustomerMessageAt)}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-[8px] border bg-background">
            <div className="border-b px-5 py-4">
              <h2 className="text-base font-semibold">分析完成率和异常状态</h2>
            </div>
            <div className="space-y-5 p-5">
              <Progress value={getReadyRate(overview)} />
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <StatusCount label={formatAnalysisStatus("ready")} value={overview?.analysis.ready} />
                <StatusCount label={formatAnalysisStatus("partial")} value={overview?.analysis.partial} />
                <StatusCount label={formatAnalysisStatus("failed")} value={overview?.analysis.failed} />
                <StatusCount label={formatAnalysisStatus("stale")} value={overview?.analysis.stale} />
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <Distribution
            items={(overview?.intentDistribution ?? []).map((item) => ({
              label: item.intentLabel,
              value: item.count,
            }))}
            title="意图分布"
          />
          <Distribution
            items={(overview?.entityHotspots ?? []).map((item) => ({
              label: item.entityName,
              value: item.mentionCount,
              meta: `${item.riskSessionCount} 个风险会话`,
            }))}
            title="实体/商品热点"
          />
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

function Metric({
  label,
  tone = "default",
  value,
}: {
  label: string;
  tone?: "danger" | "default" | "warning";
  value?: number;
}) {
  return (
    <div className="rounded-[8px] border bg-background p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={
          tone === "danger"
            ? "mt-2 text-2xl font-semibold text-destructive"
            : tone === "warning"
              ? "mt-2 text-2xl font-semibold text-amber-600"
              : "mt-2 text-2xl font-semibold text-foreground"
        }
      >
        {value ?? "-"}
      </div>
    </div>
  );
}

function StatusCount({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-[8px] bg-muted/45 px-2 py-3">
      <div className="font-semibold text-foreground">{value ?? 0}</div>
      <div className="mt-1 text-muted-foreground">{label}</div>
    </div>
  );
}

function Distribution({
  items,
  title,
}: {
  items: Array<{ label: string; meta?: string; value: number }>;
  title: string;
}) {
  return (
    <div className="rounded-[8px] border bg-background">
      <div className="border-b px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <div className="divide-y">
        {items.length > 0 ? (
          items.map((item) => (
            <div className="flex items-center justify-between px-5 py-3" key={item.label}>
              <div>
                <div className="text-sm font-medium">{item.label}</div>
                {item.meta ? <div className="mt-1 text-xs text-muted-foreground">{item.meta}</div> : null}
              </div>
              <Badge variant="outline">{item.value}</Badge>
            </div>
          ))
        ) : (
          <div className="px-5 py-8 text-sm text-muted-foreground">暂无数据</div>
        )}
      </div>
    </div>
  );
}

function getReadyRate(overview: InsightsOverviewResponse | undefined) {
  if (!overview || overview.totalSessions === 0) {
    return 0;
  }

  return Math.round((overview.readySessions / overview.totalSessions) * 100);
}
