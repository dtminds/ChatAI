import { memo, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AiIdeaIcon,
  ArrowDown01Icon,
  ChartAreaIcon,
  ChartBubbleIcon,
  ConversationIcon,
  CubeIcon,
  FilterIcon,
  Message01Icon,
  MessageMultiple02Icon,
  MessageUser02Icon,
  Search01Icon,
  TagIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
  InsightOverviewSessionsQuery,
  InsightOverviewSessionsResponse,
  InsightFilterOptionsResponse,
  InsightsOverviewResponse,
} from "@chatai/contracts";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getInsightFilterOptions, getInsightOverview, getInsightOverviewSessions } from "./api/insights-service";
import { InsightDateRangeFilter } from "./insight-date-range-filter";
import { AnalysisStatusBadge, ResolutionBadge, ResolutionDiagnosisHeader } from "./insight-badges";
import { InsightDetailPanel } from "./insight-detail-panel";
import { InsightPerson } from "./insight-person";
import { InsightTableLoadingRow } from "./insight-table-loading-row";
import { InsightTablePagination } from "./insight-table-pagination";
import { getRecentDateRange, toBoundaryDate, type InsightDateRange } from "./insights-date-range";
import { InsightsLayout, InsightsPageHeader } from "./insights-layout";
import { formatInsightTime } from "./insights-utils";
import { insightChartColors, insightResolutionColors } from "./insights-chart-palette";
import { useInsightDetail } from "./use-insight-detail";

type TrendMetric = keyof InsightsOverviewResponse["totals"];
type OverviewSessionItem = InsightOverviewSessionsResponse["items"][number];

const overviewPageSize = 20;

const metricCards: Array<{
  icon: typeof Message01Icon;
  key: TrendMetric;
  label: string;
}> = [
  { icon: MessageMultiple02Icon, key: "logicalSessions", label: "咨询会话数" },
  { icon: ConversationIcon, key: "consultingCustomers", label: "咨询用户数" },
  { icon: Message01Icon, key: "messages", label: "消息数" },
  { icon: MessageUser02Icon, key: "customerMessages", label: "客户消息数" },
];

const trendOptions: Array<{ key: TrendMetric; label: string }> = [
  { key: "logicalSessions", label: "咨询会话" },
  { key: "consultingCustomers", label: "咨询用户" },
  { key: "messages", label: "消息" },
  { key: "customerMessages", label: "客户消息" },
  { key: "agentMessages", label: "客服消息" },
];

const problemFilterOptions = [
  { label: "全部会话", value: "all" },
  { label: "有客户问题", value: "problem" },
  { label: "未解决/部分解决", value: "unresolved" },
];

const resolutionFilterOptions = [
  { label: "全部诊断", value: "all" },
  { label: "已解决", value: "resolved" },
  { label: "未解决", value: "unresolved" },
  { label: "部分解决", value: "partially_resolved" },
  { label: "无需客服处理", value: "no_customer_problem" },
  { label: "消息不足", value: "unknown" },
];

const analysisStatusFilterOptions = [
  { label: "全部分析", value: "all" },
  { label: "待分析", value: "analyzing" },
  { label: "已完成", value: "ready" },
  { label: "部分完成", value: "partial" },
  { label: "分析失败", value: "failed" },
  { label: "已过期", value: "stale" },
];

export function InsightsOverviewPage() {
  const [overview, setOverview] = useState<InsightsOverviewResponse>();
  const [overviewError, setOverviewError] = useState(false);
  const [sessionsPage, setSessionsPage] = useState<InsightOverviewSessionsResponse>();
  const [filterOptionsResponse, setFilterOptionsResponse] = useState<InsightFilterOptionsResponse>();
  const [activeMetric, setActiveMetric] = useState<TrendMetric>("logicalSessions");
  const [analysisStatusFilter, setAnalysisStatusFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [from, setFrom] = useState(() => getRecentDateRange(7).from);
  const [intentFilter, setIntentFilter] = useState("all");
  const [isSessionsLoading, setIsSessionsLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const debouncedKeyword = useDebouncedValue(keyword.trim(), 300);
  const [page, setPage] = useState(1);
  const [problemFilter, setProblemFilter] = useState("all");
  const [resolutionFilter, setResolutionFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [to, setTo] = useState(() => getRecentDateRange(7).to);
  const detail = useInsightDetail();

  useEffect(() => {
    setPage(1);
  }, [
    analysisStatusFilter,
    debouncedKeyword,
    entityFilter,
    from,
    intentFilter,
    problemFilter,
    resolutionFilter,
    tagFilter,
    to,
  ]);

  useEffect(() => {
    let isActive = true;

    void getInsightFilterOptions()
      .then((response) => {
        if (isActive) {
          setFilterOptionsResponse(response);
        }
      })
      .catch(() => {
        if (isActive) {
          setFilterOptionsResponse(undefined);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    setOverviewError(false);
    void getInsightOverview({
      from: toBoundaryDate(from, "start"),
      to: toBoundaryDate(to, "end"),
    }).then((response) => {
      if (isActive) {
        setOverview(response);
        setOverviewError(false);
      }
    }).catch(() => {
      if (isActive) {
        setOverview(undefined);
        setOverviewError(true);
      }
    });

    return () => {
      isActive = false;
    };
  }, [from, to]);

  useEffect(() => {
    let isActive = true;

    setIsSessionsLoading(true);
    void getInsightOverviewSessions({
      analysisStatus: normalizeAnalysisStatusFilter(analysisStatusFilter),
      entityId: entityFilter === "all" ? undefined : entityFilter,
      from: toBoundaryDate(from, "start"),
      intentId: intentFilter === "all" ? undefined : intentFilter,
      keyword: debouncedKeyword || undefined,
      page,
      pageSize: overviewPageSize,
      problemScope: normalizeProblemScopeFilter(problemFilter),
      resolutionStatus: normalizeResolutionStatusFilter(resolutionFilter),
      tagId: tagFilter === "all" ? undefined : tagFilter,
      to: toBoundaryDate(to, "end"),
    }).then((response) => {
      if (isActive) {
        setSessionsPage(response);
        setIsSessionsLoading(false);
      }
    }).catch(() => {
      if (isActive) {
        setSessionsPage(undefined);
        setIsSessionsLoading(false);
      }
    });

    return () => {
      isActive = false;
    };
  }, [
    analysisStatusFilter,
    debouncedKeyword,
    entityFilter,
    from,
    intentFilter,
    page,
    problemFilter,
    resolutionFilter,
    tagFilter,
    to,
  ]);

  const sessions = sessionsPage?.items ?? [];

  const filterOptions = useMemo(
    () => buildSessionFilterOptions(filterOptionsResponse),
    [filterOptionsResponse],
  );

  return (
    <InsightsLayout title="总览">
      <div className="space-y-5">
        <OverviewHeader
          from={from}
          onDateRangeChange={(range) => {
            setFrom(range.from);
            setTo(range.to);
          }}
          overview={overview}
          to={to}
        />
        {overviewError ? (
          <div className="rounded-[8px] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            数据加载失败
          </div>
        ) : null}
        <MetricStrip
          activeMetric={activeMetric}
          onMetricChange={setActiveMetric}
          overview={overview}
        />
        <div className="grid gap-5 xl:grid-cols-[520px_minmax(0,1fr)]">
          <ResolutionDistribution from={from} overview={overview} to={to} />
          <TrendPanel
            activeMetric={activeMetric}
            from={from}
            onMetricChange={setActiveMetric}
            overview={overview}
            to={to}
          />
        </div>
        <SessionTableCard
          analysisStatusFilter={analysisStatusFilter}
          entityFilter={entityFilter}
          filterOptions={filterOptions}
          intentFilter={intentFilter}
          keyword={keyword}
          onAnalysisStatusFilterChange={setAnalysisStatusFilter}
          onEntityFilterChange={setEntityFilter}
          onIntentFilterChange={setIntentFilter}
          onKeywordChange={setKeyword}
          onOpenDetail={(sessionId) => void detail.openDetail(sessionId)}
          onProblemFilterChange={setProblemFilter}
          onPageChange={setPage}
          onResolutionFilterChange={setResolutionFilter}
          onTagFilterChange={setTagFilter}
          problemFilter={problemFilter}
          resolutionFilter={resolutionFilter}
          isLoading={isSessionsLoading}
          rows={sessions}
          sessionsPage={sessionsPage}
          tagFilter={tagFilter}
        />
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

function OverviewHeader({
  from,
  onDateRangeChange,
  overview,
  to,
}: {
  from: string;
  onDateRangeChange: (range: InsightDateRange) => void;
  overview: InsightsOverviewResponse | undefined;
  to: string;
}) {
  return (
    <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <InsightsPageHeader
          title="会话数据总览"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <InsightDateRangeFilter from={from} onChange={onDateRangeChange} to={to} />
      </div>
    </section>
  );
}

function MetricStrip({
  activeMetric,
  onMetricChange,
  overview,
}: {
  activeMetric: TrendMetric;
  onMetricChange: (metric: TrendMetric) => void;
  overview: InsightsOverviewResponse | undefined;
}) {
  return (
    <section className="grid gap-0 overflow-hidden rounded-xl border bg-card sm:grid-cols-2 lg:grid-cols-4">
      {metricCards.map((metric, index) => {
        const delta = getComparisonDelta(overview, metric.key);
        const isActive = activeMetric === metric.key;

        return (
          <button
            aria-label={metric.label}
            className={cn(
              "flex min-h-[136px] items-start gap-3 border-b p-5 text-left transition-colors hover:bg-muted/35 sm:[&:nth-child(odd)]:border-r lg:border-b-0 lg:border-r",
              index === metricCards.length - 1 && "lg:border-r-0",
              isActive && "bg-muted/45",
            )}
            key={metric.key}
            onClick={() => onMetricChange(metric.key)}
            type="button"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] border bg-background text-muted-foreground">
              <HugeiconsIcon icon={metric.icon} size={17} strokeWidth={1.8} />
            </span>
            <span className="grid min-w-0 flex-1 gap-4">
              <span className="grid gap-1">
                <span className="text-sm font-medium text-muted-foreground">
                  {metric.label}
                </span>
                <span className="text-[28px] font-semibold leading-tight tracking-tight text-foreground">
                  {formatNumber(overview?.totals[metric.key])}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-2 text-xs font-medium">
                <span className={getComparisonClassName(delta.value)}>
                  {delta.label}
                </span>
              </span>
            </span>
          </button>
        );
      })}
    </section>
  );
}

const ResolutionDistribution = memo(function ResolutionDistribution({
  from,
  overview,
  to,
}: {
  from: string;
  overview: InsightsOverviewResponse | undefined;
  to: string;
}) {
  const data = useMemo(() => overview ? buildResolutionData(overview) : [], [overview]);
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const hasData = data.length > 0;

  return (
    <section className="flex min-h-[260px] flex-col rounded-xl border bg-card p-4">
      <PanelTitle
        icon={ChartBubbleIcon}
        title="AI 诊断"
        trailing={<DateRangeSummary from={from} to={to} />}
      />
      {hasData ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 sm:flex-row">
          <div className="relative size-[220px] shrink-0">
            <ResponsiveContainer height="100%" width="100%">
              <PieChart>
                <Pie
                  animationDuration={450}
                  cx="50%"
                  cy="50%"
                  data={data}
                  dataKey="value"
                  innerRadius="48%"
                  outerRadius="72%"
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {data.map((item) => (
                    <Cell fill={item.color} key={item.name} />
                  ))}
                </Pie>
                <Tooltip
                  content={<DistributionTooltip />}
                  wrapperStyle={{ zIndex: 20 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold">{formatNumber(total)}</span>
              <span className="text-xs text-muted-foreground">咨询会话</span>
            </div>
          </div>
          <div className="grid w-full gap-3 sm:max-w-[180px]">
            {data.map((item) => (
              <div className="flex items-center gap-2.5" key={item.name}>
                <span
                  className="h-5 w-1 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {item.name}
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {formatNumber(item.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-[10px] bg-muted/35 text-sm text-muted-foreground">
          暂无数据
        </div>
      )}
    </section>
  );
});

const TrendPanel = memo(function TrendPanel({
  activeMetric,
  from,
  onMetricChange,
  overview,
  to,
}: {
  activeMetric: TrendMetric;
  from: string;
  onMetricChange: (metric: TrendMetric) => void;
  overview: InsightsOverviewResponse | undefined;
  to: string;
}) {
  const trend = overview?.trend ?? [];
  const activeLabel = trendOptions.find((option) => option.key === activeMetric)?.label ?? "";

  return (
    <section className="flex min-h-[240px] flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] border bg-background text-muted-foreground">
            <HugeiconsIcon icon={ChartAreaIcon} size={17} />
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="inline-flex items-center gap-1 text-base font-medium text-foreground outline-none transition-colors hover:text-primary focus-visible:outline-none"
                type="button"
              >
                {activeLabel}
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={ArrowDown01Icon}
                  size={16}
                  strokeWidth={1.8}
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-36">
              <DropdownMenuRadioGroup
                onValueChange={(value) => onMetricChange(value as TrendMetric)}
                value={activeMetric}
              >
                {trendOptions.map((option) => (
                  <DropdownMenuRadioItem key={option.key} value={option.key}>
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <DateRangeSummary from={from} to={to} />
      </div>
      <div className="flex flex-1 items-stretch">
        <div className="min-h-[180px] min-w-0 flex-1">
          {trend.length > 0 ? (
            <ResponsiveContainer height="100%" width="100%">
              <AreaChart data={trend} margin={{ bottom: 0, left: -16, right: 14, top: 10 }}>
                <defs>
                  <linearGradient id="insightTrendArea" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={insightChartColors.primary} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={insightChartColors.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.45} vertical={false} />
                <XAxis
                  axisLine={false}
                  dataKey="date"
                  dy={10}
                  tick={{ fill: insightChartColors.axis, fontSize: 12 }}
                  tickFormatter={formatTrendDate}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  tick={{ fill: insightChartColors.axis, fontSize: 12 }}
                  tickLine={false}
                  width={46}
                />
                <Tooltip content={<TrendTooltip activeMetric={activeMetric} activeLabel={activeLabel} />} />
                <Area
                  animationDuration={450}
                  dataKey={activeMetric}
                  fill="url(#insightTrendArea)"
                  key={activeMetric}
                  stroke={insightChartColors.primary}
                  strokeWidth={2.4}
                  type="monotone"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-[10px] bg-muted/35 text-sm text-muted-foreground">
              暂无数据
            </div>
          )}
        </div>
      </div>
    </section>
  );
});

function DateRangeSummary({ from, to }: { from: string; to: string }) {
  return (
    <div className="shrink-0 text-xs text-muted-foreground">
      {formatDateRangeSummary(from, to)}
    </div>
  );
}

function SessionTableCard({
  analysisStatusFilter,
  entityFilter,
  filterOptions,
  intentFilter,
  isLoading,
  keyword,
  onAnalysisStatusFilterChange,
  onEntityFilterChange,
  onIntentFilterChange,
  onKeywordChange,
  onOpenDetail,
  onPageChange,
  onProblemFilterChange,
  onResolutionFilterChange,
  onTagFilterChange,
  problemFilter,
  resolutionFilter,
  rows,
  sessionsPage,
  tagFilter,
}: {
  analysisStatusFilter: string;
  entityFilter: string;
  filterOptions: SessionFilterOptions;
  intentFilter: string;
  isLoading: boolean;
  keyword: string;
  onAnalysisStatusFilterChange: (value: string) => void;
  onEntityFilterChange: (value: string) => void;
  onIntentFilterChange: (value: string) => void;
  onKeywordChange: (value: string) => void;
  onOpenDetail: (sessionId: string) => void;
  onPageChange: (page: number) => void;
  onProblemFilterChange: (value: string) => void;
  onResolutionFilterChange: (value: string) => void;
  onTagFilterChange: (value: string) => void;
  problemFilter: string;
  resolutionFilter: string;
  rows: OverviewSessionItem[];
  sessionsPage: InsightOverviewSessionsResponse | undefined;
  tagFilter: string;
}) {
  const total = sessionsPage?.total ?? 0;
  const page = sessionsPage?.page ?? 1;
  const pageSize = sessionsPage?.pageSize ?? overviewPageSize;
  const totalPages = sessionsPage?.totalPages ?? 1;
  const startRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRow = Math.min(total, page * pageSize);
  const advancedFilterCount = [analysisStatusFilter, entityFilter, intentFilter, tagFilter]
    .filter((value) => value !== "all").length;
  const activeFilters = buildActiveSessionFilters({
    analysisStatus: analysisStatusFilter,
    entity: entityFilter,
    filterOptions,
    intent: intentFilter,
    onAnalysisStatusRemove: () => onAnalysisStatusFilterChange("all"),
    onEntityRemove: () => onEntityFilterChange("all"),
    onIntentRemove: () => onIntentFilterChange("all"),
    onProblemRemove: () => onProblemFilterChange("all"),
    onResolutionRemove: () => onResolutionFilterChange("all"),
    onTagRemove: () => onTagFilterChange("all"),
    problem: problemFilter,
    resolution: resolutionFilter,
    tag: tagFilter,
  });

  return (
    <section className="rounded-xl border bg-card">
      <div className="grid gap-3 p-4 sm:px-6 sm:py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-base font-medium">咨询会话明细</h2>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <div className="relative flex-1 sm:flex-none">
              <HugeiconsIcon
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                icon={Search01Icon}
                size={17}
              />
              <Input
                aria-label="搜索摘要"
                className="h-9 w-full pl-9 sm:w-[220px]"
                onChange={(event) => onKeywordChange(event.target.value)}
                placeholder="搜索摘要"
                value={keyword}
              />
            </div>
            <FilterSelect
              label="问题范围"
              onValueChange={onProblemFilterChange}
              options={problemFilterOptions}
              value={problemFilter}
              widthClassName="w-[132px]"
            />
            <FilterSelect
              label="AI 诊断"
              onValueChange={onResolutionFilterChange}
              options={resolutionFilterOptions}
              value={resolutionFilter}
              widthClassName="w-[136px]"
            />
            <AdvancedSessionFilterDropdown
              activeCount={advancedFilterCount}
              analysisStatusFilter={analysisStatusFilter}
              entityFilter={entityFilter}
              filterOptions={filterOptions}
              intentFilter={intentFilter}
              onAnalysisStatusFilterChange={onAnalysisStatusFilterChange}
              onEntityFilterChange={onEntityFilterChange}
              onIntentFilterChange={onIntentFilterChange}
              onReset={() => {
                onAnalysisStatusFilterChange("all");
                onEntityFilterChange("all");
                onIntentFilterChange("all");
                onTagFilterChange("all");
              }}
              onTagFilterChange={onTagFilterChange}
              tagFilter={tagFilter}
            />
          </div>
        </div>
        {activeFilters.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {activeFilters.map((filter) => (
              <button
                className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-background px-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                key={filter.key}
                onClick={filter.onRemove}
                type="button"
                aria-label={`移除筛选 ${filter.label}`}
              >
                <span>{filter.label}</span>
                <span aria-hidden="true" className="text-sm leading-none">×</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="overflow-x-auto px-4 pb-4 sm:px-6">
        <Table aria-label="咨询会话明细">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-11 min-w-[180px]">客户</TableHead>
              <TableHead className="h-11 min-w-[180px]">接待客服</TableHead>
              <TableHead className="h-11 min-w-[260px]">摘要</TableHead>
              <TableHead className="h-11 min-w-[160px]">
                <ResolutionDiagnosisHeader />
              </TableHead>
              <TableHead className="h-11 min-w-[150px]">时间</TableHead>
              <TableHead className="h-11 w-[100px] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <InsightTableLoadingRow colSpan={6} />
            ) : rows.length > 0 ? (
              rows.map((row) => (
                <TableRow key={row.sessionId}>
                  <TableCell className="py-4">
                    <InsightPerson
                      avatarUrl={row.customerAvatarUrl}
                      name={row.customerName}
                    />
                  </TableCell>
                  <TableCell className="py-4">
                    <InsightPerson
                      avatarUrl={row.agentAvatarUrl}
                      name={row.agentName ?? "未分配客服"}
                    />
                  </TableCell>
                  <TableCell className="max-w-[300px] py-4">
                    <div className="truncate text-sm font-medium text-foreground">
                      {formatSessionSummaryCell(row.summarySessionTitle, row.problemSummary)}
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    {row.analysisStatus === "analyzing" ? (
                      <AnalysisStatusBadge />
                    ) : (
                      <ResolutionBadge status={row.resolutionStatus} />
                    )}
                  </TableCell>
                  <TableCell className="py-4 text-sm text-muted-foreground">
                    {formatInsightTime(row.startedAt)}
                  </TableCell>
                  <TableCell className="py-4 text-right">
                    <Button
                      className="h-8 rounded-[8px]"
                      onClick={() => onOpenDetail(row.sessionId)}
                      size="sm"
                      variant="outline"
                    >
                      详情
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell className="py-10 text-center text-sm text-muted-foreground" colSpan={7}>
                  暂无数据
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <InsightTablePagination
        className="sm:px-6"
        endRow={endRow}
        onPageChange={onPageChange}
        page={page}
        startRow={startRow}
        total={total}
        totalPages={totalPages}
      />
    </section>
  );
}

function formatSessionSummaryCell(summarySessionTitle?: string, problemSummary?: string) {
  return summarySessionTitle || problemSummary || <span className="text-muted-foreground/50">-</span>;
}

type SessionFilterOptions = {
  entities: Array<{ label: string; value: string }>;
  intents: Array<{ label: string; value: string }>;
  tags: Array<{ label: string; value: string }>;
};

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [delayMs, value]);

  return debouncedValue;
}

function normalizeAnalysisStatusFilter(value: string): InsightOverviewSessionsQuery["analysisStatus"] | undefined {
  return value === "analyzing" || value === "ready" || value === "partial" || value === "failed" || value === "stale"
    ? value
    : undefined;
}

function normalizeProblemScopeFilter(value: string): InsightOverviewSessionsQuery["problemScope"] | undefined {
  return value === "problem" || value === "unresolved" ? value : undefined;
}

function normalizeResolutionStatusFilter(value: string): InsightOverviewSessionsQuery["resolutionStatus"] | undefined {
  return value === "resolved" ||
    value === "unresolved" ||
    value === "partially_resolved" ||
    value === "no_customer_problem" ||
    value === "unknown"
    ? value
    : undefined;
}

function AdvancedSessionFilterDropdown({
  activeCount,
  analysisStatusFilter,
  entityFilter,
  filterOptions,
  intentFilter,
  onAnalysisStatusFilterChange,
  onEntityFilterChange,
  onIntentFilterChange,
  onReset,
  onTagFilterChange,
  tagFilter,
}: {
  activeCount: number;
  analysisStatusFilter: string;
  entityFilter: string;
  filterOptions: SessionFilterOptions;
  intentFilter: string;
  onAnalysisStatusFilterChange: (value: string) => void;
  onEntityFilterChange: (value: string) => void;
  onIntentFilterChange: (value: string) => void;
  onReset: () => void;
  onTagFilterChange: (value: string) => void;
  tagFilter: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="relative h-9 rounded-[8px]" variant="outline">
          <HugeiconsIcon icon={FilterIcon} size={16} />
          更多筛选
          {activeCount > 0 ? (
            <span
              aria-hidden="true"
              className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary"
            />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" aria-label="更多筛选" className="w-48">
        <DropdownMenuLabel className="text-muted-foreground">更多筛选</DropdownMenuLabel>
        <AdvancedFilterSubMenu
          icon={TagIcon}
          label="标签"
          onValueChange={onTagFilterChange}
          options={[{ label: "全部标签", value: "all" }, ...filterOptions.tags]}
          value={tagFilter}
        />
        <AdvancedFilterSubMenu
          icon={CubeIcon}
          label="实体"
          onValueChange={onEntityFilterChange}
          options={[{ label: "全部实体", value: "all" }, ...filterOptions.entities]}
          value={entityFilter}
        />
        <AdvancedFilterSubMenu
          icon={AiIdeaIcon}
          label="意图"
          onValueChange={onIntentFilterChange}
          options={[{ label: "全部意图", value: "all" }, ...filterOptions.intents]}
          value={intentFilter}
        />
        <DropdownMenuSeparator />
        <AdvancedFilterSubMenu
          label="分析状态"
          onValueChange={onAnalysisStatusFilterChange}
          options={analysisStatusFilterOptions}
          value={analysisStatusFilter}
        />
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={activeCount === 0} onClick={onReset}>
          重置筛选
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AdvancedFilterSubMenu({
  icon,
  label,
  onValueChange,
  options,
  value,
}: {
  icon?: typeof TagIcon;
  label: string;
  onValueChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DropdownMenuSub onOpenChange={setIsOpen} open={isOpen}>
      <DropdownMenuSubTrigger
        onClick={() => {
          setIsOpen(true);
        }}
      >
        {icon ? <HugeiconsIcon icon={icon} size={15} strokeWidth={1.8} /> : null}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {value !== "all" ? (
          <span className="mr-1 max-w-[5.5rem] truncate text-xs text-muted-foreground">
            {findOptionLabel(options, value)}
          </span>
        ) : null}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56">
        <DropdownMenuRadioGroup onValueChange={onValueChange} value={value}>
          {options.map((option) => (
            <DropdownMenuRadioItem className="min-w-0" key={option.value} value={option.value}>
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function FilterSelect({
  label,
  onValueChange,
  options,
  value,
  widthClassName,
}: {
  label: string;
  onValueChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
  widthClassName: string;
}) {
  return (
    <Select onValueChange={onValueChange} value={value}>
      <SelectTrigger aria-label={label} className={cn("h-9 rounded-[8px]", widthClassName)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function buildActiveSessionFilters({
  analysisStatus,
  entity,
  filterOptions,
  intent,
  onAnalysisStatusRemove,
  onEntityRemove,
  onIntentRemove,
  onProblemRemove,
  onResolutionRemove,
  onTagRemove,
  problem,
  resolution,
  tag,
}: {
  analysisStatus: string;
  entity: string;
  filterOptions: SessionFilterOptions;
  intent: string;
  onAnalysisStatusRemove: () => void;
  onEntityRemove: () => void;
  onIntentRemove: () => void;
  onProblemRemove: () => void;
  onResolutionRemove: () => void;
  onTagRemove: () => void;
  problem: string;
  resolution: string;
  tag: string;
}) {
  const filters: Array<{ key: string; label: string; onRemove: () => void }> = [];

  if (problem !== "all") {
    filters.push({
      key: "problem",
      label: `问题范围：${findOptionLabel(problemFilterOptions, problem)}`,
      onRemove: onProblemRemove,
    });
  }

  if (resolution !== "all") {
    filters.push({
      key: "resolution",
      label: `AI 诊断：${findOptionLabel(resolutionFilterOptions, resolution)}`,
      onRemove: onResolutionRemove,
    });
  }

  if (tag !== "all") {
    filters.push({
      key: "tag",
      label: `标签：${findOptionLabel(filterOptions.tags, tag)}`,
      onRemove: onTagRemove,
    });
  }

  if (entity !== "all") {
    filters.push({
      key: "entity",
      label: `实体：${findOptionLabel(filterOptions.entities, entity)}`,
      onRemove: onEntityRemove,
    });
  }

  if (intent !== "all") {
    filters.push({
      key: "intent",
      label: `意图：${findOptionLabel(filterOptions.intents, intent)}`,
      onRemove: onIntentRemove,
    });
  }

  if (analysisStatus !== "all") {
    filters.push({
      key: "analysis",
      label: `分析状态：${findOptionLabel(analysisStatusFilterOptions, analysisStatus)}`,
      onRemove: onAnalysisStatusRemove,
    });
  }

  return filters;
}

function findOptionLabel(options: Array<{ label: string; value: string }>, value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function PanelTitle({
  icon,
  title,
  trailing,
}: {
  icon: typeof ChartAreaIcon;
  title: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] border bg-background text-muted-foreground">
        <HugeiconsIcon icon={icon} size={17} />
      </span>
      <h2 className="text-base font-medium">{title}</h2>
      {trailing ? <div className="ml-auto">{trailing}</div> : null}
    </div>
  );
}

function buildSessionFilterOptions(
  filterOptions: InsightFilterOptionsResponse | undefined,
): SessionFilterOptions {
  return {
    entities: toFilterOptions(
      filterOptions?.entities
        .map((entity) => ({
          label: entity.name,
          value: entity.id,
        })) ?? [],
    ),
    intents: toFilterOptions(
      filterOptions?.intents
        .map((intent) => ({
          label: intent.name,
          value: intent.id,
        })) ?? [],
    ),
    tags: toFilterOptions(
      filterOptions?.tags
        .map((label) => ({
          label: label.name,
          value: label.id,
        })) ?? [],
    ),
  };
}

function toFilterOptions(options: Array<{ label: string; value: string }>) {
  return Array.from(
    new Map(options.map((option) => [option.value, option])).values(),
  ).sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
}

function TrendTooltip({
  active,
  activeLabel,
  activeMetric,
  label,
  payload,
}: TooltipProps<number, string> & {
  activeLabel: string;
  activeMetric: TrendMetric;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const value = payload.find((item) => item.dataKey === activeMetric)?.value ?? 0;

  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-lg">
      <div className="font-medium text-foreground">{formatFullTrendDate(String(label))}</div>
      <div className="mt-2 flex items-center gap-2">
        <span className="size-2 rounded-full" style={{ backgroundColor: insightChartColors.primary }} />
        <span className="text-muted-foreground">{activeLabel}</span>
        <span className="font-semibold tabular-nums">{formatNumber(Number(value))}</span>
      </div>
    </div>
  );
}

function DistributionTooltip({
  active,
  payload,
}: TooltipProps<number, string>) {
  if (!active || !payload?.length) {
    return null;
  }

  const item = payload[0];

  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-lg">
      <div className="font-medium text-foreground">{item.name}</div>
      <div className="mt-1 text-muted-foreground">
        {formatNumber(Number(item.value ?? 0))} 个会话
      </div>
    </div>
  );
}

function buildResolutionData(overview: InsightsOverviewResponse | undefined) {
  const resolution = overview?.resolution;

  const data = [
    { color: insightResolutionColors.resolved, name: "已解决", value: resolution?.resolved ?? 0 },
    { color: insightResolutionColors.partiallyResolved, name: "部分解决", value: resolution?.partiallyResolved ?? 0 },
    { color: insightResolutionColors.unresolved, name: "未解决", value: resolution?.unresolved ?? 0 },
    { color: insightResolutionColors.noCustomerProblem, name: "无需客服处理", value: resolution?.noCustomerProblem ?? 0 },
    { color: insightResolutionColors.unknown, name: "消息不足", value: resolution?.unknown ?? 0 },
  ].filter((item) => item.value > 0);

  return data;
}

function getComparisonDelta(
  overview: InsightsOverviewResponse | undefined,
  metric: TrendMetric,
) {
  const comparison = overview?.comparison?.[metric];

  if (!comparison) {
    return { label: "暂无对比", value: 0 };
  }

  const delta = comparison.delta;
  const rateLabel = formatPercent(comparison.deltaRate);

  if (delta === 0) {
    return { label: `环比持平 ${rateLabel}`, value: 0 };
  }

  const direction = delta > 0 ? "↑" : "↓";
  const absolutePrefix = delta > 0 ? "+" : "-";

  return { label: `环比 ${direction}${rateLabel} ${absolutePrefix}${formatNumber(Math.abs(delta))}`, value: delta };
}

function getComparisonClassName(value: number) {
  if (value === 0) {
    return "text-muted-foreground";
  }

  return value > 0 ? "text-emerald-600" : "text-red-600";
}

function formatNumber(value: number | undefined) {
  return value == null ? "-" : value.toLocaleString("zh-CN");
}

function formatPercent(value: number | undefined) {
  if (value == null) {
    return "-";
  }

  return `${(Math.abs(value) * 100).toFixed(1)}%`;
}

function formatDateRangeSummary(from: string, to: string) {
  return from === to ? from : `${from} 至 ${to}`;
}

function formatTrendDate(value: string) {
  return value.slice(5).replace("-", "/");
}

function formatFullTrendDate(value: string) {
  return value.replaceAll("-", "/");
}
