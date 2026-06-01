import { useEffect, useState } from "react";
import type { InsightSettingsResponse } from "@chatai/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth-store";
import { createInsightRescanJob, getInsightSettings } from "./api/insights-service";
import { InsightsLayout } from "./insights-layout";

export function InsightsSettingsPage() {
  const role = useAuthStore((state) => state.subUser?.role);
  const [settings, setSettings] = useState<InsightSettingsResponse>();
  const [rescanState, setRescanState] = useState<string>();
  const canAccessSettings = role === "owner" || role === "admin";

  useEffect(() => {
    if (canAccessSettings) {
      void getInsightSettings().then(setSettings);
    }
  }, [canAccessSettings]);

  async function createRescan() {
    const result = await createInsightRescanJob({
      from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    });
    setRescanState(`已创建任务 ${result.jobId}`);
  }

  if (!canAccessSettings) {
    return (
      <InsightsLayout title="洞察配置">
        <div className="rounded-[8px] border bg-background p-8 text-center">
          <h2 className="text-lg font-semibold">仅管理员可查看洞察配置</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            数据页仍按登录态和租户隔离开放，配置页需要管理员角色
          </p>
        </div>
      </InsightsLayout>
    );
  }

  return (
    <InsightsLayout title="洞察配置">
      <div className="space-y-5">
        <section className="rounded-[8px] border bg-background p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">切片策略</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                第一版使用种子配置，后续接入 CRUD
              </p>
            </div>
            <Button className="rounded-[8px]" onClick={() => void createRescan()} size="sm">
              历史重刷
            </Button>
          </div>
          {settings ? (
            <div className="mt-4 grid gap-3 md:grid-cols-5">
              <ConfigValue label="预设" value={settings.sessionization.preset} />
              <ConfigValue
                label="结束时长"
                value={`${settings.sessionization.idleTimeoutMinutes} 分钟`}
              />
              <ConfigValue
                label="最长会话"
                value={`${settings.sessionization.hardMaxDurationHours} 小时`}
              />
              <ConfigValue
                label="分析延迟"
                value={`${settings.sessionization.analysisDelayMinutes} 分钟`}
              />
              <ConfigValue
                label="迟到窗口"
                value={`${settings.sessionization.lateArrivalWindowMinutes} 分钟`}
              />
            </div>
          ) : null}
          {rescanState ? <p className="mt-3 text-sm text-muted-foreground">{rescanState}</p> : null}
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <ConfigList
            items={settings?.labelConfigs.map((item) => item.labelName) ?? []}
            title="自定义标签"
          />
          <ConfigList
            items={settings?.qaRuleConfigs.map((item) => item.ruleName) ?? []}
            title="质检规则"
          />
          <ConfigList
            items={settings?.riskConfigs.map((item) => item.riskName) ?? []}
            title="风险关注项"
          />
          <ConfigList
            items={settings?.entityDictionary.map((item) => item.canonicalName) ?? []}
            title="实体词库"
          />
        </section>

        <section className="rounded-[8px] border bg-background p-5">
          <h2 className="text-base font-semibold">分析策略</h2>
          {settings ? (
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <ConfigValue
                label="准实时分析"
                value={settings.analysisPolicy.liveAnalysisEnabled ? "开启" : "关闭"}
              />
              <ConfigValue
                label="最少新消息"
                value={`${settings.analysisPolicy.liveMinNewMeaningfulMessages} 条`}
              />
              <ConfigValue
                label="最短间隔"
                value={`${settings.analysisPolicy.liveMinIntervalMinutes} 分钟`}
              />
              <ConfigValue
                label="低置信阈值"
                value={String(settings.analysisPolicy.lowConfidenceThreshold)}
              />
            </div>
          ) : null}
        </section>
      </div>
    </InsightsLayout>
  );
}

function ConfigValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] bg-muted/35 px-3 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function ConfigList({ items, title }: { items: string[]; title: string }) {
  return (
    <div className="rounded-[8px] border bg-background p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {items.map((item) => (
          <Badge key={item} variant="outline">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}
