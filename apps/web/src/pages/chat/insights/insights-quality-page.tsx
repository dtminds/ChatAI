import { useEffect, useRef, useState } from "react";
import type {
  InsightsQualityAgentStatsResponse,
  InsightsQualityOverviewResponse,
  InsightsQualityResultsResponse,
} from "@chatai/contracts";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  getInsightQualityAgentStats,
  getInsightQualityOverview,
  getInsightQualityResults,
} from "./api/insights-service";
import { InsightDateRangeFilter } from "./insight-date-range-filter";
import { InsightDetailPanel } from "./insight-detail-panel";
import { InsightPerson } from "./insight-person";
import { InsightTablePagination } from "./insight-table-pagination";
import { InsightsLayout, InsightsPageHeader } from "./insights-layout";
import {
  getRecentDateRange,
  toBoundaryDate,
  type InsightDateRange,
} from "./insights-date-range";
import {
  formatInsightTime,
} from "./insights-utils";
import { insightQualityRuleColors } from "./insights-chart-palette";
import { useInsightDetail } from "./use-insight-detail";
import { useInsightsCapabilities } from "./insights-capabilities-context";
import { InsightFeatureRequiredHint } from "./insight-badges";

type QualityView = "agent-report" | "quality-results";
type QualityResultFilter = "all" | "failed" | "passed";

const qualityResultPageSize = 10;
const qualityRuleSlotCount = 10;
const qualityRuleOtherSlotIndex = qualityRuleSlotCount - 1;

const qualityResultFilterItems: Array<{
  label: string;
  value: QualityResultFilter;
}> = [
  { label: "全部结果", value: "all" },
  { label: "未通过", value: "failed" },
  { label: "已通过", value: "passed" },
];

export function InsightsQualityPage() {
  const { capabilities } = useInsightsCapabilities();
  const [overview, setOverview] = useState<InsightsQualityOverviewResponse["overview"]>();
  const [agentStats, setAgentStats] = useState<InsightsQualityAgentStatsResponse["agentStats"]>([]);
  const [qualityResults, setQualityResults] = useState<InsightsQualityResultsResponse["qualityResults"]>([]);
  const [qualityResultsPage, setQualityResultsPage] = useState<InsightsQualityResultsResponse["qualityResultsPage"]>();
  const [isOverviewLoading, setIsOverviewLoading] = useState(true);
  const [isAgentStatsLoading, setIsAgentStatsLoading] = useState(false);
  const [isQualityResultsLoading, setIsQualityResultsLoading] = useState(false);
  const [activeView, setActiveView] = useState<QualityView>("agent-report");
  const [resultPage, setResultPage] = useState(1);
  const [resultFilter, setResultFilter] =
    useState<QualityResultFilter>("failed");
  const [dateRange, setDateRange] = useState<InsightDateRange>(() => getRecentDateRange(7));
  const detail = useInsightDetail();

  useEffect(() => {
    const controller = new AbortController();
    const query = {
      from: toBoundaryDate(dateRange.from, "start"),
      to: toBoundaryDate(dateRange.to, "end"),
    };

    setIsOverviewLoading(true);

    void getInsightQualityOverview(query, { signal: controller.signal })
      .then(({ overview: nextOverview }) => {
        if (!controller.signal.aborted) {
          setOverview(nextOverview);
          setIsOverviewLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setIsOverviewLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [dateRange.from, dateRange.to]);

  useEffect(() => {
    if (activeView !== "agent-report") {
      return;
    }

    const controller = new AbortController();

    setIsAgentStatsLoading(true);

    void getInsightQualityAgentStats(
      {
        from: toBoundaryDate(dateRange.from, "start"),
        to: toBoundaryDate(dateRange.to, "end"),
      },
      { signal: controller.signal },
    )
      .then(({ agentStats: nextAgentStats }) => {
        if (!controller.signal.aborted) {
          setAgentStats(nextAgentStats);
          setIsAgentStatsLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setIsAgentStatsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [activeView, dateRange.from, dateRange.to]);

  useEffect(() => {
    if (activeView !== "quality-results") {
      return;
    }

    const controller = new AbortController();

    setIsQualityResultsLoading(true);

    void getInsightQualityResults(
      {
        from: toBoundaryDate(dateRange.from, "start"),
        page: resultPage,
        pageSize: qualityResultPageSize,
        passed: normalizeQualityResultPassedFilter(resultFilter),
        to: toBoundaryDate(dateRange.to, "end"),
      },
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) {
          setQualityResults(data.qualityResults);
          setQualityResultsPage(data.qualityResultsPage);
          setIsQualityResultsLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setIsQualityResultsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [activeView, dateRange.from, dateRange.to, resultFilter, resultPage]);

  const ruleDistribution = overview?.ruleDistribution ?? [];
  const insightEnabled = capabilities.mode === "insight";

  return (
    <InsightsLayout
      canViewWorkerObservability={capabilities.canViewWorkerObservability}
      title="服务质检"
    >
      <div className="space-y-5">
        <div
          className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
          data-testid="quality-page-header"
        >
          <InsightsPageHeader
            title="服务质检"
          />
          <InsightDateRangeFilter
            from={dateRange.from}
            onChange={(range) => {
              setDateRange(range);
              setResultPage(1);
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
              titleAccessory={insightEnabled ? undefined : <InsightFeatureRequiredHint />}
              trailing={<DateRangeSummary from={dateRange.from} to={dateRange.to} />}
            />
            <div
              className="grid flex-1 gap-3 sm:grid-cols-2 sm:grid-rows-2"
              data-testid="quality-metric-grid"
            >
              <Stat label="会话数" value={overview?.totalSessions} />
              <Stat label="质检会话数" value={overview?.inspectedSessions} />
              <Stat label="质检覆盖率" value={overview?.inspectionRate} format="percent" />
              <Stat label="质检通过率" value={overview?.passRate} format="percent" />
            </div>
          </section>

          <section aria-label="质检分布" className="min-w-0 rounded-[8px] border bg-background p-5">
            {ruleDistribution.length > 0 ? (
              <QualityRuleDistribution
                distribution={ruleDistribution}
                from={dateRange.from}
                insightEnabled={insightEnabled}
                to={dateRange.to}
              />
            ) : (
              <>
                <PanelTitle
                  title="质检分布"
                  titleAccessory={insightEnabled ? undefined : <InsightFeatureRequiredHint />}
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
              onValueChange={(value) => {
                setActiveView(value as QualityView);
                setResultPage(1);
              }}
              value={activeView}
            >
              <TabsList className="bg-muted p-1">
                <TabsTrigger className="min-w-24 px-4 text-sm" value="agent-report">
                  客服报表
                </TabsTrigger>
                <TabsTrigger className="min-w-24 px-4 text-sm" value="quality-results">
                  质检结果
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {activeView === "quality-results" ? (
              <Select
                onValueChange={(value) => {
                  setResultPage(1);
                  setResultFilter(value as QualityResultFilter);
                }}
                value={resultFilter}
              >
                <SelectTrigger className="h-8 rounded-[8px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {qualityResultFilterItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>

          {activeView === "quality-results" ? (
            <QualityResultList
              isLoading={isQualityResultsLoading}
              items={qualityResults}
              onOpenDetail={(sessionId) => void detail.openDetail(sessionId)}
              onPageChange={setResultPage}
              page={qualityResultsPage}
            />
          ) : (
            <AgentReportTable isLoading={isAgentStatsLoading || isOverviewLoading} rows={agentStats} />
          )}
        </section>
      </div>

      <InsightDetailPanel
        detail={detail.detail}
        error={detail.error}
        isOpen={detail.isOpen}
        isLoading={detail.isLoading}
        isMessagesLoading={detail.isMessagesLoading}
        messages={detail.messages}
        messagesError={detail.messagesError}
        onActionStatusChange={detail.updateActionStatus}
        onOpenChange={detail.onOpenChange}
      />
    </InsightsLayout>
  );
}

function QualityResultList({
  isLoading,
  items,
  onPageChange,
  onOpenDetail,
  page,
}: {
  isLoading: boolean;
  items: InsightsQualityResultsResponse["qualityResults"];
  onPageChange: (page: number) => void;
  onOpenDetail: (sessionId: string) => void;
  page: InsightsQualityResultsResponse["qualityResultsPage"] | undefined;
}) {
  const currentPage = page?.page ?? 1;
  const pageSize = page?.pageSize ?? qualityResultPageSize;
  const total = page?.total ?? items.length;
  const totalPages = page?.totalPages ?? 1;
  const startRow = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(total, currentPage * pageSize);

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="h-12 px-5">客户</TableHead>
            <TableHead className="h-12 px-5">接待客服</TableHead>
            <TableHead className="h-12 px-5">摘要</TableHead>
            <TableHead className="h-12 px-5">时间</TableHead>
            <TableHead className="h-12 px-5">质检结果</TableHead>
            <TableHead className="h-12 px-5 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
        {isLoading ? (
          <TableRow>
            <TableCell colSpan={6}>
              <ListLoadingState />
            </TableCell>
          </TableRow>
        ) : items.length > 0 ? (
          items.map((result) => {
            const summary = result.summary || "-";

            return (
              <TableRow key={result.sessionId}>
                <TableCell className="px-5 py-4 font-medium">
                  <InsightPerson
                    avatarUrl={result.customerAvatarUrl}
                    name={result.customerName}
                  />
                </TableCell>
                <TableCell className="px-5 py-4">
                  <InsightPerson
                    avatarUrl={result.agentAvatarUrl}
                    name={result.agentName ?? "未分配"}
                  />
                </TableCell>
                <TableCell className="max-w-[360px] px-5 py-4">
                  <div className="line-clamp-2 text-sm text-foreground">{summary}</div>
                </TableCell>
                <TableCell className="px-5 py-4 text-sm text-muted-foreground">
                  {formatInsightTime(result.startedAt)}
                </TableCell>
                <TableCell className="px-5 py-4">
                  <QualityResultBadge result={result} />
                </TableCell>
                <TableCell className="px-5 py-4 text-right">
                <Button
                  className="h-8 rounded-[8px]"
                  onClick={() => onOpenDetail(result.sessionId)}
                  size="sm"
                  variant="outline"
                >
                  详情
                </Button>
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

function QualityResultBadge({
  result,
}: {
  result: InsightsQualityResultsResponse["qualityResults"][number];
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(false);
  const failedRules = Math.max(result.totalRules - result.passedRules, 0);
  const passedPercent = result.totalRules > 0
    ? Math.max(0, Math.min(100, (result.passedRules / result.totalRules) * 100))
    : 0;
  const failedPercent = 100 - passedPercent;
  const openMenu = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpen(true);
  };
  const scheduleClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
    }
    closeTimer.current = setTimeout(() => {
      if (isMounted.current) {
        setOpen(false);
      }
    }, 100);
  };

  useEffect(() => {
    isMounted.current = true;

    return () => {
      isMounted.current = false;
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
      }
    };
  }, []);

  return (
    <DropdownMenu modal={false} onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <div
          className="inline-flex min-w-28 cursor-default flex-col gap-1.5 outline-none"
          onFocus={openMenu}
          onMouseEnter={openMenu}
          onMouseLeave={scheduleClose}
        >
          <span
            className={cn(
              "text-xs font-medium",
              result.passed ? "text-muted-foreground" : "text-destructive",
            )}
          >
            {result.passed ? "已通过" : `未通过 ${failedRules}/${result.totalRules}`}
          </span>
          <div
            aria-label={result.passed ? "质检规则全部通过" : `质检规则未通过 ${failedRules}/${result.totalRules}`}
            className="flex h-1.5 w-24 overflow-hidden rounded-full bg-muted"
          >
            {failedPercent > 0 ? (
              <span
                className="h-full bg-destructive"
                style={{ width: `${failedPercent}%` }}
              />
            ) : null}
            {passedPercent > 0 ? (
              <span
                className="h-full bg-emerald-500"
                style={{ width: `${passedPercent}%` }}
              />
            ) : null}
          </div>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56"
        onMouseEnter={openMenu}
        onMouseLeave={scheduleClose}
        side="top"
      >
        {result.rules.map((rule) => (
          <DropdownMenuItem
            className="justify-between"
            key={rule.ruleCode}
            onSelect={(event) => event.preventDefault()}
          >
            <span className="min-w-0 truncate">{rule.ruleName}</span>
            <span className={rule.passed ? "shrink-0 text-emerald-600" : "shrink-0 text-destructive"}>
              {rule.passed ? "已通过" : "未通过"}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
  isLoading,
  rows,
}: {
  isLoading: boolean;
  rows: InsightsQualityAgentStatsResponse["agentStats"];
}) {
  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="h-12 px-5">客服账号</TableHead>
            <TableHead className="h-12 px-5">接待会话数</TableHead>
            <TableHead className="h-12 px-5">质检会话数</TableHead>
            <TableHead className="h-12 px-5">质检覆盖率</TableHead>
            <TableHead className="h-12 px-5">质检通过数</TableHead>
            <TableHead className="h-12 px-5">质检未通过数</TableHead>
            <TableHead className="h-12 px-5">质检通过率</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={7}>
                <ListLoadingState />
              </TableCell>
            </TableRow>
          ) : rows.length > 0 ? (
            rows.map((row) => {
              return (
                <TableRow key={row.agentSeatId}>
                  <TableCell className="px-5 py-4 font-medium">
                    <InsightPerson
                      avatarUrl={row.agentAvatarUrl}
                      name={row.agentName}
                    />
                  </TableCell>
                  <TableCell className="px-5 py-4">{row.totalSessions}</TableCell>
                  <TableCell className="px-5 py-4">{row.inspectedSessions}</TableCell>
                  <TableCell className="px-5 py-4">
                    {formatPercent(row.inspectionRate)}
                  </TableCell>
                  <TableCell className="px-5 py-4">{row.passedSessions}</TableCell>
                  <TableCell className="px-5 py-4">{row.failedSessions}</TableCell>
                  <TableCell className="px-5 py-4">
                    {formatPercent(row.passRate)}
                  </TableCell>
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell
                className="px-5 py-8 text-center text-sm text-muted-foreground"
                colSpan={7}
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

function normalizeQualityResultPassedFilter(value: QualityResultFilter) {
  if (value === "passed") {
    return true;
  }

  if (value === "failed") {
    return false;
  }

  return undefined;
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
  insightEnabled,
  to,
}: {
  distribution: InsightsQualityOverviewResponse["overview"]["ruleDistribution"];
  from: string;
  insightEnabled: boolean;
  to: string;
}) {
  const data = buildRuleDistributionData(distribution);
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const slots = buildRuleDistributionSlots(data, total);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <PanelTitle
        title="质检分布"
        titleAccessory={insightEnabled ? undefined : <InsightFeatureRequiredHint />}
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
  titleAccessory,
  trailing,
}: {
  title: string;
  titleAccessory?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
      <div className="inline-flex min-w-0 items-center gap-1.5">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        {titleAccessory}
      </div>
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
  ruleDistribution: InsightsQualityOverviewResponse["overview"]["ruleDistribution"],
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
