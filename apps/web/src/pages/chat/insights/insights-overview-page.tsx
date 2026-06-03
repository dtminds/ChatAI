import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDown01Icon,
  BubbleChatIcon,
  Calendar03Icon,
  ChartAreaIcon,
  ChartBubbleIcon,
  FilterIcon,
  Message01Icon,
  MoreHorizontalIcon,
  Search01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { InsightSettingsResponse, InsightsOverviewResponse } from "@chatai/contracts";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
import { getInsightOverview, getInsightSettings } from "./api/insights-service";
import { InsightDateRangeFilter } from "./insight-date-range-filter";
import { ResolutionBadge } from "./insight-badges";
import { InsightDetailPanel } from "./insight-detail-panel";
import { InsightPerson } from "./insight-person";
import { getDefaultDateRange, toBoundaryDate, type InsightDateRange } from "./insights-date-range";
import { InsightsLayout, InsightsPageHeader } from "./insights-layout";
import { formatInsightTime } from "./insights-utils";
import { useInsightDetail } from "./use-insight-detail";

type TrendMetric = keyof InsightsOverviewResponse["totals"];

const metricCards: Array<{
  icon: typeof BubbleChatIcon;
  key: TrendMetric;
  label: string;
  subLabel: string;
}> = [
  { icon: BubbleChatIcon, key: "logicalSessions", label: "逻辑会话数", subLabel: "切片后的服务会话" },
  { icon: UserGroupIcon, key: "consultingCustomers", label: "咨询用户数", subLabel: "按客户去重" },
  { icon: Message01Icon, key: "messages", label: "消息数", subLabel: "客户与客服合计" },
  { icon: ChartAreaIcon, key: "customerMessages", label: "客户消息数", subLabel: "客户主动表达量" },
];

const trendOptions: Array<{ key: TrendMetric; label: string }> = [
  { key: "logicalSessions", label: "逻辑会话" },
  { key: "consultingCustomers", label: "咨询用户" },
  { key: "messages", label: "消息" },
  { key: "customerMessages", label: "客户消息" },
  { key: "agentMessages", label: "客服消息" },
];

const resolutionColors: Record<string, string> = {
  no_customer_problem: "#8b8f98",
  partially_resolved: "#f0a337",
  resolved: "#16a36a",
  unknown: "#a4a7ae",
  unresolved: "#df3f40",
};

export function InsightsOverviewPage() {
  const [overview, setOverview] = useState<InsightsOverviewResponse>();
  const [settings, setSettings] = useState<InsightSettingsResponse>();
  const [activeMetric, setActiveMetric] = useState<TrendMetric>("logicalSessions");
  const [analysisStatusFilter, setAnalysisStatusFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [from, setFrom] = useState(() => getDefaultDateRange().from);
  const [intentFilter, setIntentFilter] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [problemFilter, setProblemFilter] = useState("all");
  const [resolutionFilter, setResolutionFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [to, setTo] = useState(() => getDefaultDateRange().to);
  const detail = useInsightDetail();

  useEffect(() => {
    let isActive = true;

    void getInsightOverview({
      from: toBoundaryDate(from, "start"),
      to: toBoundaryDate(to, "end"),
    }).then((response) => {
      if (isActive) {
        setOverview(response);
      }
    });

    return () => {
      isActive = false;
    };
  }, [from, to]);

  useEffect(() => {
    let isActive = true;

    void getInsightSettings()
      .then((response) => {
        if (isActive) {
          setSettings(response);
        }
      })
      .catch(() => {
        if (isActive) {
          setSettings(undefined);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  const sessions = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return (overview?.sessions ?? []).filter((session) =>
      (!normalizedKeyword || [
        session.customerName,
        session.agentName,
        session.problemSummary,
        session.summaryCustomerIntent,
        ...(session.tags ?? []).map((tag) => tag.tagName),
        ...(session.entities ?? []).map((entity) => entity.entityName),
        ...(session.intents ?? []).map((intent) => intent.intentLabel),
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalizedKeyword))) &&
      (resolutionFilter === "all" || session.resolutionStatus === resolutionFilter) &&
      (analysisStatusFilter === "all" || session.analysisStatus === analysisStatusFilter) &&
      (tagFilter === "all" || (session.tags ?? []).some((tag) => tag.tagCode === tagFilter)) &&
      (entityFilter === "all" ||
        (session.entities ?? []).some((entity) =>
          entity.entityId === entityFilter || entity.entityName === entityFilter
        )) &&
      (intentFilter === "all" || (session.intents ?? []).some((intent) => intent.intentCode === intentFilter)) &&
      (problemFilter === "all" ||
        (problemFilter === "problem" &&
          session.resolutionStatus !== "no_customer_problem" &&
          session.resolutionStatus !== "unknown") ||
        (problemFilter === "unresolved" && (
          session.resolutionStatus === "unresolved" ||
          session.resolutionStatus === "partially_resolved"
        )))
    );
  }, [
    analysisStatusFilter,
    entityFilter,
    intentFilter,
    keyword,
    overview?.sessions,
    problemFilter,
    resolutionFilter,
    tagFilter,
  ]);

  const filterOptions = useMemo(
    () => buildSessionFilterOptions(overview?.sessions ?? [], settings),
    [overview?.sessions, settings],
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
        <MetricStrip
          activeMetric={activeMetric}
          onMetricChange={setActiveMetric}
          overview={overview}
        />
        <div className="grid gap-5 xl:grid-cols-[520px_minmax(0,1fr)]">
          <ResolutionDistribution overview={overview} />
          <TrendPanel
            activeMetric={activeMetric}
            onMetricChange={setActiveMetric}
            overview={overview}
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
          onResolutionFilterChange={setResolutionFilter}
          onTagFilterChange={setTagFilter}
          problemFilter={problemFilter}
          resolutionFilter={resolutionFilter}
          rows={sessions}
          tagFilter={tagFilter}
          total={overview?.sessions.length ?? 0}
        />
      </div>

      <InsightDetailPanel
        detail={detail.detail}
        isOpen={detail.isOpen}
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
  const lastPoint = overview?.trend.at(-1);

  return (
    <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <InsightsPageHeader
          description={`当前范围内有 ${overview?.totals.logicalSessions ?? "-"} 个逻辑会话，${overview?.totals.consultingCustomers ?? "-"} 位咨询用户，最近一天新增 ${lastPoint?.logicalSessions ?? "-"} 个会话`}
          title="会话数据总览"
        />
        <p className="sr-only">
          当前范围内有{" "}
          <span className="font-medium text-foreground">
            {overview?.totals.logicalSessions ?? "-"} 个逻辑会话
          </span>
          ，{" "}
          <span className="font-medium text-foreground">
            {overview?.totals.consultingCustomers ?? "-"} 位咨询用户
          </span>
          ，最近一天新增{" "}
          <span className="font-medium text-foreground">
            {lastPoint?.logicalSessions ?? "-"} 个会话
          </span>
        </p>
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
        const delta = getTrendDelta(overview, metric.key);
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
                <span className={delta.value >= 0 ? "text-emerald-600" : "text-red-600"}>
                  {delta.label}
                </span>
                <span className="text-muted-foreground">{metric.subLabel}</span>
              </span>
            </span>
          </button>
        );
      })}
    </section>
  );
}

function ResolutionDistribution({
  overview,
}: {
  overview: InsightsOverviewResponse | undefined;
}) {
  const data = useMemo(() => overview ? buildResolutionData(overview) : [], [overview]);
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const isReady = Boolean(overview);

  return (
    <section className="flex min-h-[260px] flex-col rounded-xl border bg-card p-4">
      <PanelTitle
        icon={ChartBubbleIcon}
        title="问题解决分布"
        trailing={<Button className="size-8" size="icon" variant="ghost"><HugeiconsIcon icon={MoreHorizontalIcon} size={18} /></Button>}
      />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 sm:flex-row">
        <div className="relative size-[220px] shrink-0">
          <ResponsiveContainer height="100%" width="100%">
            <PieChart>
              <Pie
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
            <span className="text-2xl font-semibold">{isReady ? formatNumber(total) : "-"}</span>
            <span className="text-xs text-muted-foreground">逻辑会话</span>
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
      <div className="mt-auto flex items-center gap-2 text-xs text-muted-foreground">
        <HugeiconsIcon icon={FilterIcon} size={14} />
        <span>最近 30 天</span>
      </div>
    </section>
  );
}

function TrendPanel({
  activeMetric,
  onMetricChange,
  overview,
}: {
  activeMetric: TrendMetric;
  onMetricChange: (metric: TrendMetric) => void;
  overview: InsightsOverviewResponse | undefined;
}) {
  const trend = overview?.trend ?? [];
  const activeLabel = trendOptions.find((option) => option.key === activeMetric)?.label ?? "";

  return (
    <section className="flex min-h-[240px] flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
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
      </div>
      <div className="flex flex-1 items-stretch">
        <div className="min-h-[180px] min-w-0 flex-1">
          {trend.length > 0 ? (
            <ResponsiveContainer height="100%" width="100%">
              <AreaChart data={trend} margin={{ bottom: 0, left: -16, right: 14, top: 10 }}>
                <defs>
                  <linearGradient id="insightTrendArea" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#5b5ff0" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#5b5ff0" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.45} vertical={false} />
                <XAxis
                  axisLine={false}
                  dataKey="date"
                  dy={10}
                  tick={{ fill: "#a1a1aa", fontSize: 12 }}
                  tickFormatter={formatTrendDate}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  tick={{ fill: "#a1a1aa", fontSize: 12 }}
                  tickLine={false}
                  width={46}
                />
                <Tooltip content={<TrendTooltip activeMetric={activeMetric} activeLabel={activeLabel} />} />
                <Area
                  dataKey={activeMetric}
                  fill="url(#insightTrendArea)"
                  key={activeMetric}
                  stroke="#5b5ff0"
                  strokeWidth={2.4}
                  type="monotone"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-[10px] bg-muted/35 text-sm text-muted-foreground">
              暂无趋势数据
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SessionTableCard({
  analysisStatusFilter,
  entityFilter,
  filterOptions,
  intentFilter,
  keyword,
  onAnalysisStatusFilterChange,
  onEntityFilterChange,
  onIntentFilterChange,
  onKeywordChange,
  onOpenDetail,
  onProblemFilterChange,
  onResolutionFilterChange,
  onTagFilterChange,
  problemFilter,
  resolutionFilter,
  rows,
  tagFilter,
  total,
}: {
  analysisStatusFilter: string;
  entityFilter: string;
  filterOptions: SessionFilterOptions;
  intentFilter: string;
  keyword: string;
  onAnalysisStatusFilterChange: (value: string) => void;
  onEntityFilterChange: (value: string) => void;
  onIntentFilterChange: (value: string) => void;
  onKeywordChange: (value: string) => void;
  onOpenDetail: (sessionId: string) => void;
  onProblemFilterChange: (value: string) => void;
  onResolutionFilterChange: (value: string) => void;
  onTagFilterChange: (value: string) => void;
  problemFilter: string;
  resolutionFilter: string;
  rows: InsightsOverviewResponse["sessions"];
  tagFilter: string;
  total: number;
}) {
  return (
    <section className="rounded-xl border bg-card">
      <div className="grid gap-3 p-4 sm:px-6 sm:py-4">
        <div className="flex flex-1 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] border bg-background text-muted-foreground">
            <HugeiconsIcon icon={Calendar03Icon} size={17} />
          </span>
          <h2 className="text-base font-medium">逻辑会话明细</h2>
          <Badge className="ml-1" variant="secondary">{rows.length}/{total}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:flex-none">
            <HugeiconsIcon
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              icon={Search01Icon}
              size={17}
            />
            <Input
              className="h-9 w-full pl-9 sm:w-[220px]"
              onChange={(event) => onKeywordChange(event.target.value)}
              placeholder="搜索客户、客服、问题"
              value={keyword}
            />
          </div>
          <FilterSelect
            label="问题范围"
            onValueChange={onProblemFilterChange}
            options={[
              { label: "全部会话", value: "all" },
              { label: "有客户问题", value: "problem" },
              { label: "未解决/部分解决", value: "unresolved" },
            ]}
            value={problemFilter}
            widthClassName="w-[152px]"
          />
          <FilterSelect
            label="解决状态"
            onValueChange={onResolutionFilterChange}
            options={[
              { label: "全部状态", value: "all" },
              { label: "已解决", value: "resolved" },
              { label: "未解决", value: "unresolved" },
              { label: "部分解决", value: "partially_resolved" },
              { label: "无需客服处理", value: "no_customer_problem" },
              { label: "消息不足", value: "unknown" },
            ]}
            value={resolutionFilter}
            widthClassName="w-[136px]"
          />
          <FilterSelect
            label="分析状态"
            onValueChange={onAnalysisStatusFilterChange}
            options={[
              { label: "全部分析", value: "all" },
              { label: "已完成", value: "ready" },
              { label: "部分完成", value: "partial" },
              { label: "分析失败", value: "failed" },
              { label: "已过期", value: "stale" },
            ]}
            value={analysisStatusFilter}
            widthClassName="w-[128px]"
          />
          <FilterSelect
            label="标签"
            onValueChange={onTagFilterChange}
            options={[{ label: "全部标签", value: "all" }, ...filterOptions.tags]}
            value={tagFilter}
            widthClassName="w-[136px]"
          />
          <FilterSelect
            label="实体"
            onValueChange={onEntityFilterChange}
            options={[{ label: "全部实体", value: "all" }, ...filterOptions.entities]}
            value={entityFilter}
            widthClassName="w-[136px]"
          />
          <FilterSelect
            label="意图"
            onValueChange={onIntentFilterChange}
            options={[{ label: "全部意图", value: "all" }, ...filterOptions.intents]}
            value={intentFilter}
            widthClassName="w-[136px]"
          />
        </div>
      </div>
      <div className="overflow-x-auto px-4 pb-4 sm:px-6">
        <Table aria-label="逻辑会话明细">
          <TableHeader>
            <TableRow className="bg-muted/45 hover:bg-muted/45">
              <TableHead className="h-11 min-w-[210px]">客户</TableHead>
              <TableHead className="h-11 min-w-[170px]">客服</TableHead>
              <TableHead className="h-11 min-w-[260px]">诉求/问题</TableHead>
              <TableHead className="h-11 min-w-[120px]">消息</TableHead>
              <TableHead className="h-11 min-w-[120px]">状态</TableHead>
              <TableHead className="h-11 min-w-[150px]">开始时间</TableHead>
              <TableHead className="h-11 w-[100px] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length > 0 ? (
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
                      {row.summaryCustomerIntent || "暂无诉求"}
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {row.problemSummary || "暂无客户问题摘要"}
                    </div>
                    <TopicBadges row={row} />
                  </TableCell>
                  <TableCell className="py-4 text-sm">
                    <div className="font-medium">{row.messageCount} 条</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      客户 {row.customerMessageCount} / 客服 {row.agentMessageCount}
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <ResolutionBadge status={row.resolutionStatus} />
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
                      查看详情
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell className="py-10 text-sm text-muted-foreground" colSpan={7}>
                  当前时间范围内暂无逻辑会话
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

type SessionFilterOptions = {
  entities: Array<{ label: string; value: string }>;
  intents: Array<{ label: string; value: string }>;
  tags: Array<{ label: string; value: string }>;
};

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

function TopicBadges({ row }: { row: InsightsOverviewResponse["sessions"][number] }) {
  const topics = [
    ...(row.tags ?? []).slice(0, 2).map((tag) => tag.tagName),
    ...(row.entities ?? []).slice(0, 2).map((entity) => entity.entityName),
    ...(row.intents ?? []).slice(0, 1).map((intent) => intent.intentLabel),
  ].filter(Boolean);

  if (topics.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 flex max-w-[300px] flex-wrap gap-1.5">
      {topics.slice(0, 4).map((topic) => (
        <Badge className="max-w-[9rem] truncate" key={topic} variant="secondary">
          {topic}
        </Badge>
      ))}
    </div>
  );
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
  sessions: InsightsOverviewResponse["sessions"],
  settings: InsightSettingsResponse | undefined,
): SessionFilterOptions {
  return {
    entities: toFilterOptions(
      settings?.entityDictionary
        .filter((entity) => entity.enabled && entity.includeInAggregation)
        .map((entity) => ({
          label: entity.canonicalName,
          value: entity.canonicalName,
        })) ?? [],
    ),
    intents: toFilterOptions(
      sessions.flatMap((session) =>
        (session.intents ?? []).map((intent) => ({
          label: intent.intentLabel,
          value: intent.intentCode,
        })),
      ),
    ),
    tags: toFilterOptions(
      settings?.labelConfigs
        .filter((label) => label.enabled && label.includeInStatistics)
        .map((label) => ({
          label: label.labelName,
          value: label.labelCode,
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
        <span className="size-2 rounded-full bg-[#5b5ff0]" />
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
  const counts = {
    no_customer_problem: 0,
    partially_resolved: 0,
    resolved: 0,
    unknown: 0,
    unresolved: 0,
  };

  for (const session of overview?.sessions ?? []) {
    counts[session.resolutionStatus] += 1;
  }

  const data = [
    { color: resolutionColors.resolved, name: "已解决", value: counts.resolved },
    { color: resolutionColors.unresolved, name: "未解决", value: counts.unresolved },
    { color: resolutionColors.partially_resolved, name: "部分解决", value: counts.partially_resolved },
    { color: resolutionColors.no_customer_problem, name: "无需客服处理", value: counts.no_customer_problem },
    { color: resolutionColors.unknown, name: "消息不足", value: counts.unknown },
  ].filter((item) => item.value > 0);

  return data.length > 0
    ? data
    : [{ color: resolutionColors.unknown, name: "暂无数据", value: 1 }];
}

function getTrendDelta(
  overview: InsightsOverviewResponse | undefined,
  metric: TrendMetric,
) {
  const points = overview?.trend ?? [];

  if (points.length < 2) {
    return { label: "暂无对比", value: 0 };
  }

  const current = points.at(-1)?.[metric] ?? 0;
  const previous = points.at(-2)?.[metric] ?? 0;
  const delta = current - previous;

  if (delta === 0) {
    return { label: "持平", value: 0 };
  }

  return { label: `${delta > 0 ? "+" : ""}${formatNumber(delta)}`, value: delta };
}

function formatNumber(value: number | undefined) {
  return value == null ? "-" : value.toLocaleString("zh-CN");
}

function formatTrendDate(value: string) {
  return value.slice(5).replace("-", "/");
}

function formatFullTrendDate(value: string) {
  return value.replaceAll("-", "/");
}
