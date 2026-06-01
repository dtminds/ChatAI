import { useEffect, useState } from "react";
import type { InsightsFollowUpsResponse } from "@chatai/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getInsightFollowUps,
  updateInsightActionStatus,
} from "./api/insights-service";
import { InsightDetailPanel } from "./insight-detail-panel";
import { InsightsLayout } from "./insights-layout";
import {
  formatActionStatus,
  formatInsightTime,
  formatPriority,
} from "./insights-utils";
import { useInsightDetail } from "./use-insight-detail";

export function InsightsFollowUpsPage() {
  const [followUps, setFollowUps] = useState<InsightsFollowUpsResponse>();
  const detail = useInsightDetail();

  useEffect(() => {
    void getInsightFollowUps({ status: "open" }).then(setFollowUps);
  }, []);

  async function updateStatus(actionItemId: string, status: "dismissed" | "done") {
    await updateInsightActionStatus(actionItemId, status);
    setFollowUps((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.actionItemId === actionItemId ? { ...item, status } : item,
            ),
          }
        : current,
    );
  }

  return (
    <InsightsLayout title="待处理">
      <div className="rounded-[8px] border bg-background">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">行动队列</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              风险、跟进和异常事项只在洞察模块内标记状态
            </p>
          </div>
          <Badge variant="outline">{followUps?.total ?? 0} 项</Badge>
        </div>

        <div className="divide-y">
          {(followUps?.items ?? []).map((item) => (
            <article className="grid gap-3 px-5 py-4" key={item.actionItemId}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{formatPriority(item.priority)}</Badge>
                    <Badge variant="outline">{formatActionStatus(item.status)}</Badge>
                    <h3 className="text-sm font-medium">{item.title}</h3>
                  </div>
                  <p className="mt-2 text-sm text-foreground">{item.reason}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>{item.customerName}</span>
                    <span>{item.actionType}</span>
                    <span>{formatInsightTime(item.lastCustomerMessageAt)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    className="h-8 rounded-[8px]"
                    onClick={() => void detail.openDetail(item.sessionId)}
                    size="sm"
                    variant="outline"
                  >
                    查看证据
                  </Button>
                  <Button
                    className="h-8 rounded-[8px]"
                    disabled={item.status !== "open"}
                    onClick={() => void updateStatus(item.actionItemId, "done")}
                    size="sm"
                  >
                    标记完成
                  </Button>
                  <Button
                    className="h-8 rounded-[8px]"
                    disabled={item.status !== "open"}
                    onClick={() => void updateStatus(item.actionItemId, "dismissed")}
                    size="sm"
                    variant="ghost"
                  >
                    忽略
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      <InsightDetailPanel
        detail={detail.detail}
        isOpen={detail.isOpen}
        onOpenChange={detail.onOpenChange}
      />
    </InsightsLayout>
  );
}
