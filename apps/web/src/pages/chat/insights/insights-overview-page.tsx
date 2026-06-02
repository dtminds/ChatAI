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
import type { InsightsOverviewResponse } from "@chatai/contracts";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getInsightOverview } from "./api/insights-service";
import { ResolutionBadge } from "./insight-badges";
import { InsightDetailPanel } from "./insight-detail-panel";
import { InsightPerson } from "./insight-person";
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
  const [activeMetric, setActiveMetric] = useState<TrendMetric>("logicalSessions");
  const [from, setFrom] = useState(() => getDefaultDateRange().from);
  const [keyword, setKeyword] = useState("");
  const [to, setTo] = useState(() => getDefaultDateRange().to);
  const detail = useInsightDetail();

  useEffect(() => {
    void getInsightOverview({
      from: toBoundaryDate(from, "start"),
      to: toBoundaryDate(to, "end"),
    }).then(setOverview);
  }, [from, to]);

  const sessions = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    if (!normalizedKeyword) {
      return overview?.sessions ?? [];
    }

    return (overview?.sessions ?? []).filter((session) =>
      [
        session.customerName,
        session.agentName,
        session.problemSummary,
        session.summaryCustomerIntent,
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalizedKeyword)),
    );
  }, [keyword, overview?.sessions]);

  return (
    <InsightsLayout title="总览">
      <div className="space-y-5">
        <OverviewHeader
          from={from}
          onFromChange={setFrom}
          onToChange={setTo}
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
          keyword={keyword}
          onKeywordChange={setKeyword}
          onOpenDetail={(sessionId) => void detail.openDetail(sessionId)}
          rows={sessions}
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
  onFromChange,
  onToChange,
  overview,
  to,
}: {
  from: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
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
        <DateInput label="开始日期" onChange={onFromChange} value={from} />
        <DateInput label="结束日期" onChange={onToChange} value={to} />
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
              <Tooltip content={<DistributionTooltip />} />
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
                    <stop offset="100%" stopColor="#5b5ff0" stopOpacity={0.04} />
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
  keyword,
  onKeywordChange,
  onOpenDetail,
  rows,
  total,
}: {
  keyword: string;
  onKeywordChange: (value: string) => void;
  onOpenDetail: (sessionId: string) => void;
  rows: InsightsOverviewResponse["sessions"];
  total: number;
}) {
  return (
    <section className="rounded-xl border bg-card">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:px-6 sm:py-4">
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
          <Button className="h-9 gap-2 rounded-[8px]" variant="outline">
            <HugeiconsIcon icon={FilterIcon} size={16} />
            筛选
          </Button>
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

function DateInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-xs text-muted-foreground">
      {label}
      <Input
        className="h-9 w-[9.5rem] rounded-[8px] text-sm"
        onChange={(event) => onChange(event.target.value)}
        type="date"
        value={value}
      />
    </label>
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
    { color: resolutionColors.no_customer_problem, name: "无客户问题", value: counts.no_customer_problem },
    { color: resolutionColors.unknown, name: "待判断", value: counts.unknown },
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

function formatDateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDefaultDateRange() {
  const to = new Date();
  const from = new Date(to);

  from.setDate(to.getDate() - 29);

  return {
    from: formatDateInputValue(from),
    to: formatDateInputValue(to),
  };
}

function toBoundaryDate(value: string, boundary: "end" | "start") {
  if (!value) {
    return undefined;
  }

  return boundary === "start"
    ? `${value}T00:00:00.000+08:00`
    : `${value}T23:59:59.999+08:00`;
}
