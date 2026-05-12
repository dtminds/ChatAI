import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { CustomerProfile } from "@/pages/chat/chat-types";
import { InfoRow } from "@/pages/chat/components/info-row";

export function CustomerBasicInfoPanel({
  accountName,
  customer,
}: {
  accountName?: string;
  customer?: CustomerProfile;
}) {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 px-4 py-4">
        <section className="space-y-2 border-b border-divider pb-4">
          <p className="text-xs leading-5 text-muted-foreground">
            {customer?.persona ?? "这里用于承载客户画像、标签、任务和备注。"}
          </p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">客户阶段</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">
                {customer?.stage ?? "--"}
              </p>
            </div>
            <Badge className="rounded-md px-2 py-0.5 text-[10px]">
              意向 {customer?.intentScore ?? 0}
            </Badge>
          </div>

          <div className="space-y-1.5">
            <InfoRow label="城市" value={customer?.city ?? "--"} />
            <InfoRow label="电话" value={customer?.phone ?? "--"} />
            <InfoRow label="当前账号" value={accountName ?? "--"} />
          </div>
        </section>

        <section className="space-y-2 border-b border-divider pb-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-foreground">客户标签</h3>
            <span className="text-xs text-muted-foreground">占位</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {customer?.tags.map((tag) => (
              <Badge className="rounded-md px-2 py-0.5 text-[10px]" key={tag}>
                {tag}
              </Badge>
            ))}
          </div>
        </section>

        <section className="space-y-2 border-b border-divider pb-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-foreground">关键指标</h3>
            <span className="text-xs text-muted-foreground">占位数据</span>
          </div>
          <div className="space-y-1.5">
            {customer?.metrics.map((metric) => (
              <div
                className="flex items-center justify-between border border-border bg-surface px-3 py-2"
                key={metric.label}
              >
                <span className="text-xs text-muted-foreground">{metric.label}</span>
                <span className="text-xs font-medium text-foreground">{metric.value}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2 border-b border-divider pb-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-foreground">跟进任务</h3>
            <span className="text-xs text-muted-foreground">占位</span>
          </div>
          <div className="space-y-1.5">
            {customer?.tasks.map((task) => (
              <div className="border border-border bg-surface px-3 py-2.5" key={task.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-foreground">{task.title}</p>
                  <Badge className="rounded-md px-2 py-0.5 text-[10px]" variant="outline">
                    {task.status === "done"
                      ? "已完成"
                      : task.status === "due"
                        ? "临期"
                        : "待处理"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-foreground">沟通备注</h3>
            <span className="text-xs text-muted-foreground">客服视图</span>
          </div>
          <div className="space-y-1.5">
            {customer?.notes.map((note) => (
              <div
                className="border border-dashed border-border bg-surface px-3 py-2.5 text-xs leading-5 text-muted-foreground"
                key={note}
              >
                {note}
              </div>
            ))}
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}
