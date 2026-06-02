import { useEffect, useState } from "react";
import type { InsightsFollowUpsResponse } from "@chatai/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getInsightFollowUps,
  updateInsightActionStatus,
} from "./api/insights-service";
import { PriorityBadge } from "./insight-badges";
import { InsightDetailPanel } from "./insight-detail-panel";
import { InsightPerson } from "./insight-person";
import { InsightsLayout, InsightsPageHeader } from "./insights-layout";
import {
  formatActionStatus,
  formatInsightTime,
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
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <InsightsPageHeader
            description="集中处理风险、跟进和异常事项，状态只在洞察模块内生效"
            title="待处理"
          />
          <Badge className="mt-1" variant="outline">{followUps?.total ?? 0} 项</Badge>
        </div>

        <div className="rounded-[8px] border bg-background">
          <div className="divide-y">
            {(followUps?.items ?? []).map((item) => (
              <article className="grid gap-3 px-5 py-4" key={item.actionItemId}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <PriorityBadge priority={item.priority} />
                      <Badge variant="outline">{formatActionStatus(item.status)}</Badge>
                      <h3 className="text-sm font-medium">{item.title}</h3>
                    </div>
                    <p className="mt-2 text-sm text-foreground">{item.reason}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <InsightPerson
                        avatarUrl={item.customerAvatarUrl}
                        name={item.customerName}
                      />
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
      </div>

      <InsightDetailPanel
        detail={detail.detail}
        isOpen={detail.isOpen}
        onOpenChange={detail.onOpenChange}
      />
    </InsightsLayout>
  );
}
