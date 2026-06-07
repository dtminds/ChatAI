import { useEffect, useMemo, useState } from "react";
import type { InsightsQualityResponse } from "@chatai/contracts";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { getInsightQuality } from "./api/insights-service";
import { InsightDateRangeFilter } from "./insight-date-range-filter";
import { InsightDetailPanel } from "./insight-detail-panel";
import { InsightPerson } from "./insight-person";
import { InsightTablePagination } from "./insight-table-pagination";
import { InsightsLayout, InsightsPageHeader } from "./insights-layout";
import {
  getRecentDateRange,
  type InsightDateRange,
} from "./insights-date-range";
import {
  formatInsightTime,
  formatResolutionStatus,
} from "./insights-utils";
import { insightQualityRuleColors } from "./insights-chart-palette";
import { useInsightDetail } from "./use-insight-detail";

type QualityView = "agent-report" | "problem-list";
type ProblemSession = InsightsQualityResponse["unresolvedSessions"][number];
type ResolutionFilter = "all" | ProblemSession["resolutionStatus"];

const qualityProblemPageSize = 10;
const qualityRuleSlotCount = 10;
const qualityRuleOtherSlotIndex = qualityRuleSlotCount - 1;

const resolutionFilterItems: Array<{
  label: string;
  value: ResolutionFilter;
}> = [
  { label: "全部问题", value: "all" },
  { label: "未解决", value: "unresolved" },
  { label: "部分解决", value: "partially_resolved" },
  { label: "已解决", value: "resolved" },
];

export function InsightsQualityPage() {
  const [quality, setQuality] = useState<InsightsQualityResponse>();
  const [isLoading, setIsLoading] = useState(true);
  const [activeView, setActiveView] = useState<QualityView>("problem-list");
  const [problemPage, setProblemPage] = useState(1);
  const [resolutionFilter, setResolutionFilter] =
    useState<ResolutionFilter>("unresolved");
  const [dateRange, setDateRange] = useState<InsightDateRange>(() => getRecentDateRange(7));
  const detail = useInsightDetail();

  useEffect(() => {
    const controller = new AbortController();

    setIsLoading(true);

    void getInsightQuality(
      {
        from: dateRange.from,
        page: problemPage,
        pageSize: qualityProblemPageSize,
        to: dateRange.to,
      },
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) {
          setQuality(data);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [dateRange.from, dateRange.to, problemPage]);

  const overview = quality?.overview;
  const problemItems = useMemo(() => {
    const sessions = quality?.unresolvedSessions ?? [];

    if (resolutionFilter === "all") {
      return sessions;
    }

    return sessions.filter(
      (session) => session.resolutionStatus === resolutionFilter,
    );
  }, [quality?.unresolvedSessions, resolutionFilter]);

  return (
    <InsightsLayout title="服务质检">
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <InsightsPageHeader
            description="按咨询会话判断客户问题是否解决，辅助主管复核服务质量"
            title="服务质检"
          />
          <InsightDateRangeFilter
            from={dateRange.from}
            onChange={(range) => {
              setDateRange(range);
              setProblemPage(1);
            }}
            to={dateRange.to}
          />
        </div>
        <div
          className="grid gap-5 lg:grid-cols-2"
          data-testid="quality-overview-content"
        >
          <section aria-label="质检指标" className="flex min-w-0 flex-col rounded-[8px] border bg-background p-5">
            <PanelTitle
              title="质检指标"
              trailing={<DateRangeSummary from={dateRange.from} to={dateRange.to} />}
            />
            <div
              className="grid flex-1 gap-3 sm:grid-cols-2 sm:grid-rows-2"
              data-testid="quality-metric-grid"
            >
              <Stat label="会话数" value={overview?.totalSessions} />
              <Stat label="质检会话数" value={overview?.inspectedSessions ?? overview?.analyzedSessions} />
              <Stat label="质检覆盖率" value={overview?.inspectionRate} format="percent" />
              <Stat label="质检通过率" value={overview?.passRate} format="percent" />
            </div>
          </section>

          <section aria-label="质检分布" className="min-w-0 rounded-[8px] border bg-background p-5">
            {(overview?.ruleDistribution?.length ?? 0) > 0 ? (
              <QualityRuleDistribution
                distribution={overview!.ruleDistribution}
                from={dateRange.from}
                to={dateRange.to}
              />
            ) : (
              <>
                <PanelTitle
                  title="质检分布"
                  trailing={<DateRangeSummary from={dateRange.from} to={dateRange.to} />}
                />
                <div className="py-8 text-center text-sm text-muted-foreground">暂无数据</div>
              </>
            )}
          </section>
        </div>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              onValueChange={(value) => setActiveView(value as QualityView)}
              value={activeView}
            >
              <TabsList className="h-10 rounded-[8px] bg-muted p-1">
                <TabsTrigger className="h-8 min-w-24 rounded-[6px] px-4 py-0 text-sm" value="problem-list">
                  问题列表
                </TabsTrigger>
                <TabsTrigger className="h-8 min-w-24 rounded-[6px] px-4 py-0 text-sm" value="agent-report">
                  客服报表
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {activeView === "problem-list" ? (
              <Select
                onValueChange={(value) => {
                  setProblemPage(1);
                  setResolutionFilter(value as ResolutionFilter);
                }}
                value={resolutionFilter}
              >
                <SelectTrigger className="h-8 rounded-[8px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {resolutionFilterItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>

          {activeView === "problem-list" ? (
            <ProblemList
              isLoading={isLoading}
              items={problemItems}
              onOpenDetail={(sessionId) => void detail.openDetail(sessionId)}
              onPageChange={setProblemPage}
              page={quality?.unresolvedSessionsPage}
            />
          ) : (
            <AgentReportTable rows={quality?.agentStats ?? []} />
          )}
        </section>
      </div>

      <InsightDetailPanel
        detail={detail.detail}
        error={detail.error}
        isOpen={detail.isOpen}
        isLoading={detail.isLoading}
        onOpenChange={detail.onOpenChange}
      />
    </InsightsLayout>
  );
}

function ProblemList({
  isLoading,
  items,
  onPageChange,
  onOpenDetail,
  page,
}: {
  isLoading: boolean;
  items: InsightsQualityResponse["unresolvedSessions"];
  onPageChange: (page: number) => void;
  onOpenDetail: (sessionId: string) => void;
  page: InsightsQualityResponse["unresolvedSessionsPage"] | undefined;
}) {
  const currentPage = page?.page ?? 1;
  const pageSize = page?.pageSize ?? qualityProblemPageSize;
  const total = page?.total ?? items.length;
  const totalPages = page?.totalPages ?? 1;
  const startRow = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(total, currentPage * pageSize);

  return (
    <div className="rounded-[8px] border bg-background">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <h2 className="text-base font-semibold">问题列表</h2>
      </div>
      <div className="divide-y">
        {isLoading ? (
          <ListLoadingState />
        ) : items.length > 0 ? (
          items.map((session) => (
            <article className="grid gap-3 px-5 py-4" key={session.sessionId}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {formatResolutionStatus(session.resolutionStatus)}
                    </Badge>
                    <InsightPerson
                      avatarUrl={session.customerAvatarUrl}
                      name={session.customerName}
                    />
                  </div>
                  <p className="mt-2 text-sm text-foreground">
                    {session.problemSummary}
                  </p>
                  {session.unresolvedReason ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {session.unresolvedReason}
                    </p>
                  ) : null}
                </div>
                <Button
                  className="h-8 rounded-[8px]"
                  onClick={() => onOpenDetail(session.sessionId)}
                  size="sm"
                  variant="outline"
                >
                  详情
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <InsightPerson
                  avatarUrl={session.agentAvatarUrl}
                  name={session.agentName ?? "未分配"}
                  roleLabel="客服"
                />
                <span>{formatInsightTime(session.lastCustomerMessageAt)}</span>
              </div>
            </article>
          ))
        ) : (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            暂无数据
          </div>
        )}
      </div>
      <InsightTablePagination
        className="px-5"
        endRow={endRow}
        onPageChange={onPageChange}
        page={currentPage}
        startRow={startRow}
        total={total}
        totalPages={totalPages}
      />
    </div>
  );
}

function ListLoadingState() {
  return (
    <div className="px-5 py-10 text-center">
      <div
        aria-label="正在加载会话"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground"
        role="status"
      >
        <span className="size-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
        <span>正在加载会话</span>
      </div>
    </div>
  );
}

function AgentReportTable({
  rows,
}: {
  rows: InsightsQualityResponse["agentStats"];
}) {
  return (
    <div className="rounded-[8px] border bg-background">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/35 hover:bg-muted/35">
            <TableHead className="h-12 px-5">客服账号</TableHead>
            <TableHead className="h-12 px-5">接待会话数</TableHead>
            <TableHead className="h-12 px-5">客户问题数</TableHead>
            <TableHead className="h-12 px-5">质检通过数</TableHead>
            <TableHead className="h-12 px-5">质检未通过数</TableHead>
            <TableHead className="h-12 px-5">质检通过率</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length > 0 ? (
            rows.map((row) => {
              const failedCount = row.unresolved + row.partial;

              return (
                <TableRow key={row.agentSeatId}>
                  <TableCell className="px-5 py-4 font-medium">
                    <InsightPerson
                      avatarUrl={row.agentAvatarUrl}
                      name={row.agentName}
                    />
                  </TableCell>
                  <TableCell className="px-5 py-4">{row.totalSessions}</TableCell>
                  <TableCell className="px-5 py-4">{row.problemSessions}</TableCell>
                  <TableCell className="px-5 py-4">{row.resolved}</TableCell>
                  <TableCell className="px-5 py-4">{failedCount}</TableCell>
                  <TableCell className="px-5 py-4">
                    {formatPercent(1 - row.unresolvedRate)}
                  </TableCell>
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell
                className="px-5 py-8 text-center text-sm text-muted-foreground"
                colSpan={6}
              >
                暂无数据
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function Stat({
  format,
  label,
  tone = "default",
  value,
}: {
  format?: "percent";
  label: string;
  tone?: "danger" | "default" | "warning";
  value?: number;
}) {
  const display = format === "percent" && value != null
    ? `${(value * 100).toFixed(1)}%`
    : value ?? "-";
  const percentValue = format === "percent" && typeof value === "number" && Number.isFinite(value)
    ? Math.min(Math.max(value, 0), 1)
    : undefined;
  const progressValue = percentValue == null
    ? undefined
    : Math.round(percentValue * 100);

  return (
    <div className="flex min-h-[96px] flex-col justify-between rounded-[8px] bg-muted/35 px-3 py-3.5">
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div
          className={
            tone === "danger"
              ? "mt-2 text-2xl font-semibold leading-none text-destructive"
              : tone === "warning"
                ? "mt-2 text-2xl font-semibold leading-none text-amber-600"
                : "mt-2 text-2xl font-semibold leading-none"
          }
        >
          {display}
        </div>
      </div>
      {format === "percent" ? (
        <div
          aria-label={label}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progressValue}
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-primary/70"
            style={{ width: `${progressValue ?? 0}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return `${(value * 100).toFixed(2)}%`;
}

function QualityRuleDistribution({
  distribution,
  from,
  to,
}: {
  distribution: InsightsQualityResponse["overview"]["ruleDistribution"];
  from: string;
  to: string;
}) {
  const data = buildRuleDistributionData(distribution);
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const slots = buildRuleDistributionSlots(data, total);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <PanelTitle
        title="质检分布"
        trailing={<DateRangeSummary from={from} to={to} />}
      />
      <div className="grid min-w-0 items-center gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
        <div className="relative size-[180px] shrink-0 justify-self-center" data-testid="quality-rule-distribution-chart">
          <ResponsiveContainer height="100%" width="100%">
            <PieChart>
              <Pie
                animationDuration={450}
                cx="50%"
                cy="50%"
                data={data}
                dataKey="value"
                innerRadius="60%"
                nameKey="name"
                outerRadius="76%"
                paddingAngle={2}
                stroke="hsl(var(--background))"
                strokeWidth={2}
              >
                {data.map((item) => (
                  <Cell fill={item.color} key={item.ruleCode} />
                ))}
              </Pie>
              <Tooltip
                content={<RuleDistributionTooltip />}
                wrapperStyle={{ zIndex: 20 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-semibold tabular-nums">{total}</span>
            <span className="text-xs text-muted-foreground">命中次数</span>
          </div>
        </div>

        <ScrollArea
          className="h-[152px] min-w-0"
          data-testid="quality-rule-distribution-scroll"
          viewportProps={{ className: "pr-4" }}
          viewportTestId="quality-rule-distribution-viewport"
        >
          <div
            className="grid gap-1"
            data-testid="quality-rule-distribution-list"
            role="list"
          >
            {slots.map(({ index, item }) => (
              <div
                className={cn(
                  "grid min-h-7 grid-cols-[minmax(0,1fr)_60px_44px] items-center gap-2 rounded-[8px] px-0.5",
                  item ? "text-foreground" : "text-muted-foreground/45",
                )}
                key={item ? item.ruleCode : `quality-rule-placeholder-${index}`}
                role="listitem"
              >
                {item ? (
                  <>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: item.color }} />
                      <span className="min-w-0 truncate text-sm">{item.name}</span>
                    </div>
                    <span className="text-right text-xs tabular-nums text-muted-foreground">
                      {formatShare(item.share)}
                    </span>
                    <span className="text-right text-sm tabular-nums">{item.value}</span>
                  </>
                ) : (
                  <>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-[3px] bg-muted" />
                      <span className="h-2.5 min-w-0 flex-1 rounded-full bg-muted" />
                    </div>
                    <span className="justify-self-end h-2.5 w-10 rounded-full bg-muted" />
                    <span className="justify-self-end h-2.5 w-7 rounded-full bg-muted" />
                  </>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

function PanelTitle({
  title,
  trailing,
}: {
  title: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      {trailing}
    </div>
  );
}

function DateRangeSummary({ from, to }: { from: string; to: string }) {
  return (
    <div className="shrink-0 text-xs text-muted-foreground">
      {formatDateRangeSummary(from, to)}
    </div>
  );
}

function formatDateRangeSummary(from: string, to: string) {
  return from === to ? from : `${from} 至 ${to}`;
}

function buildRuleDistributionData(
  ruleDistribution: InsightsQualityResponse["overview"]["ruleDistribution"],
) {
  const sorted = [...ruleDistribution].sort((left, right) =>
    right.count - left.count
    || left.ruleName.localeCompare(right.ruleName, "zh-CN")
    || left.ruleCode.localeCompare(right.ruleCode),
  );
  const total = sorted.reduce((sum, rule) => sum + rule.count, 0);
  const visibleRules = sorted.length > qualityRuleSlotCount
    ? sorted.slice(0, qualityRuleOtherSlotIndex)
    : sorted.slice(0, qualityRuleSlotCount);
  const otherRules = sorted.length > qualityRuleSlotCount
    ? sorted.slice(qualityRuleOtherSlotIndex)
    : [];
  const items = visibleRules.map((rule, index) => ({
    color: insightQualityRuleColors[index % insightQualityRuleColors.length],
    name: rule.ruleName,
    ruleCode: rule.ruleCode,
    share: total > 0 ? rule.count / total : 0,
    value: rule.count,
  }));

  if (otherRules.length > 0) {
    const otherValue = otherRules.reduce((sum, rule) => sum + rule.count, 0);
    items.push({
      color: insightQualityRuleColors[qualityRuleOtherSlotIndex % insightQualityRuleColors.length],
      name: "其他",
      ruleCode: "__other__",
      share: total > 0 ? otherValue / total : 0,
      value: otherValue,
    });
  }

  return items;
}

function buildRuleDistributionSlots(
  data: ReturnType<typeof buildRuleDistributionData>,
  total: number,
) {
  const slots = Array.from({ length: qualityRuleSlotCount }, (_, index) => ({
    index,
    item: data[index],
  }));

  if (total <= 0) {
    return slots.map((slot) => ({ ...slot, item: undefined }));
  }

  return slots;
}

function formatShare(value: number) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function RuleDistributionTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    payload: {
      color: string;
      share: number;
    };
  }>;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const item = payload[0];

  return (
    <div className="rounded-[8px] border bg-background px-3 py-2 text-sm shadow-sm">
      <div className="flex items-center gap-2">
        <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: item.payload.color }} />
        <span>{item.name}</span>
        <span className="text-muted-foreground">{formatShare(item.payload.share)}</span>
        <span className="font-medium tabular-nums">{item.value}</span>
      </div>
    </div>
  );
}
