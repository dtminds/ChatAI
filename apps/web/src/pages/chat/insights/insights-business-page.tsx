import { type ReactNode, memo, useEffect, useMemo, useState } from "react";
import {
  Analytics02Icon,
  ChartAreaIcon,
  DatabaseIcon,
  LabelImportantIcon,
  Search01Icon,
  Target02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
  InsightBusinessRelatedSessionsResponse,
  InsightOverviewSessionsResponse,
  InsightsBusinessResponse,
} from "@chatai/contracts";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
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
import { getInsightBusiness, getInsightBusinessRelatedSessions } from "./api/insights-service";
import { InsightDateRangeFilter } from "./insight-date-range-filter";
import { ResolutionBadge } from "./insight-badges";
import { InsightDetailPanel } from "./insight-detail-panel";
import { InsightPerson } from "./insight-person";
import { InsightTableLoadingRow } from "./insight-table-loading-row";
import { InsightTablePagination } from "./insight-table-pagination";
import { getRecentDateRange, toBoundaryDate } from "./insights-date-range";
import { InsightsLayout, InsightsPageHeader } from "./insights-layout";
import { formatInsightTime } from "./insights-utils";
import { insightChartColors, insightDimensionColors } from "./insights-chart-palette";
import { useInsightDetail } from "./use-insight-detail";

type BusinessTopic = InsightsBusinessResponse["tagDistribution"][number];
type BusinessSession = InsightOverviewSessionsResponse["items"][number];
type BusinessDimension = BusinessTopic["dimension"];
type BusinessTrendMetric = "assetMentions" | "entityMentions" | "intentMentions" | "tagMentions";
type IntentTrendSeries = {
  color: string;
  opacity?: number;
  key: string;
  name: string;
};
type IntentTrendPoint = {
  __counts: Record<string, number>;
  date: string;
} & Record<string, number | string | Record<string, number>>;

const dimensionConfigs: Array<{
  color: string;
  description: string;
  icon: typeof Analytics02Icon;
  key: BusinessDimension;
  metricKey: BusinessTrendMetric;
  title: string;
}> = [
  {
    color: insightDimensionColors.intent,
    description: "客户来咨询的主要意图",
    icon: Target02Icon,
    key: "intent",
    metricKey: "intentMentions",
    title: "客户意图",
  },
  {
    color: insightDimensionColors.tag,
    description: "命中已配置的业务标签",
    icon: LabelImportantIcon,
    key: "tag",
    metricKey: "tagMentions",
    title: "业务标签",
  },
  {
    color: insightDimensionColors.entity,
    description: "商品、订单、活动等实体对象",
    icon: DatabaseIcon,
    key: "entity",
    metricKey: "entityMentions",
    title: "实体对象",
  },
  {
    color: insightDimensionColors.asset,
    description: "H5、小程序卡片、文件",
    icon: ChartAreaIcon,
    key: "asset",
    metricKey: "assetMentions",
    title: "链接文件",
  },
];

const businessRelatedSessionsPageSize = 20;

export function InsightsBusinessPage() {
  const [activeDimension, setActiveDimension] = useState<BusinessDimension>("intent");
  const [business, setBusiness] = useState<InsightsBusinessResponse>();
  const [businessError, setBusinessError] = useState(false);
  const [from, setFrom] = useState(() => getRecentDateRange(7).from);
  const [isRelatedSessionsLoading, setIsRelatedSessionsLoading] = useState(false);
  const [relatedSessionsPage, setRelatedSessionsPage] = useState<InsightBusinessRelatedSessionsResponse>();
  const [relatedSessionsPageNumber, setRelatedSessionsPageNumber] = useState(1);
  const [sessionSearchKeyword, setSessionSearchKeyword] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<BusinessTopic>();
  const [to, setTo] = useState(() => getRecentDateRange(7).to);
  const detail = useInsightDetail();

  useEffect(() => {
    const controller = new AbortController();
    const query = {
      from: toBoundaryDate(from, "start"),
      to: toBoundaryDate(to, "end"),
    };

    setBusinessError(false);
    void getInsightBusiness(query, { signal: controller.signal })
      .then((businessResponse) => {
        if (!controller.signal.aborted) {
          setBusiness(businessResponse);
          setBusinessError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setBusiness(undefined);
          setBusinessError(true);
        }
      });

    return () => {
      controller.abort();
    };
  }, [from, to]);

  const topicsByDimension = useMemo(() => buildTopicsByDimension(business), [business]);
  const activeTopics = topicsByDimension[activeDimension];
  const topTopics = useMemo(() => activeTopics.slice(0, 10), [activeTopics]);

  useEffect(() => {
    const keywordMatchedTopic = findTopicByKeyword(topTopics, sessionSearchKeyword);

    if (keywordMatchedTopic && !isSameTopic(keywordMatchedTopic, selectedTopic)) {
      setSelectedTopic(keywordMatchedTopic);
      return;
    }

    if (selectedTopic && (selectedTopic.dimension !== activeDimension || !topTopics.some((topic) => isSameTopic(topic, selectedTopic)))) {
      setSelectedTopic(undefined);
    }
  }, [activeDimension, selectedTopic, sessionSearchKeyword, topTopics]);

  const activeTopic = selectedTopic?.dimension === activeDimension
    ? selectedTopic
    : topTopics[0];

  useEffect(() => {
    setRelatedSessionsPageNumber(1);
  }, [activeTopic?.code, activeTopic?.dimension, activeTopic?.type, from, sessionSearchKeyword, to]);

  useEffect(() => {
    if (!activeTopic) {
      setRelatedSessionsPage(undefined);
      setIsRelatedSessionsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsRelatedSessionsLoading(true);
    void getInsightBusinessRelatedSessions({
      dimension: activeTopic.dimension,
      from: toBoundaryDate(from, "start"),
      keyword: sessionSearchKeyword,
      page: relatedSessionsPageNumber,
      pageSize: businessRelatedSessionsPageSize,
      topicCode: activeTopic.code,
      topicType: activeTopic.type,
      to: toBoundaryDate(to, "end"),
    }, { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) {
          setRelatedSessionsPage(response);
          setIsRelatedSessionsLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setRelatedSessionsPage(undefined);
          setIsRelatedSessionsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [activeTopic, from, relatedSessionsPageNumber, sessionSearchKeyword, to]);

  return (
    <InsightsLayout title="业务洞察">
      <div className="space-y-5">
        <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <InsightsPageHeader
            title="经营洞察"
          />
          <div className="flex flex-wrap items-center gap-2">
            <InsightDateRangeFilter
              from={from}
              onChange={(range) => {
                setFrom(range.from);
                setTo(range.to);
              }}
              to={to}
            />
          </div>
        </section>

        {businessError ? (
          <div className="rounded-[8px] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            数据加载失败
          </div>
        ) : null}

        <DimensionMetricStrip
            activeDimension={activeDimension}
            onChangeDimension={setActiveDimension}
            topicsByDimension={topicsByDimension}
          />

        <div className="grid gap-5 xl:grid-cols-2">
          <TopicDistributionPanel
            activeDimension={activeDimension}
            from={from}
            onSelectTopic={setSelectedTopic}
            selectedTopic={activeTopic}
            topics={topTopics}
            to={to}
          />

          <BusinessTrendPanel
            activeDimension={activeDimension}
            business={business}
            from={from}
            to={to}
            topTopics={topTopics}
          />
        </div>

        <RelatedSessionsPanel
          onOpenDetail={(sessionId) => void detail.openDetail(sessionId)}
          onPageChange={setRelatedSessionsPageNumber}
          onSearchChange={setSessionSearchKeyword}
          isLoading={isRelatedSessionsLoading}
          page={relatedSessionsPage}
          searchKeyword={sessionSearchKeyword}
          sessions={relatedSessionsPage?.items ?? []}
          topic={activeTopic}
        />
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

function DimensionMetricStrip({
  activeDimension,
  onChangeDimension,
  topicsByDimension,
}: {
  activeDimension: BusinessDimension;
  onChangeDimension: (value: BusinessDimension) => void;
  topicsByDimension: Record<BusinessDimension, BusinessTopic[]>;
}) {
  return (
    <section className="grid gap-0 overflow-hidden rounded-xl border bg-card sm:grid-cols-2 lg:grid-cols-4">
      {dimensionConfigs.map((dimension) => {
        const isActive = activeDimension === dimension.key;
        const topics = topicsByDimension[dimension.key];
        const totalMentions = sumTopicMentions(topics);
        const totalSessions = sumTopicSessions(topics);

        return (
          <button
            className={cn(
              "flex min-h-[124px] min-w-0 gap-3 border-b p-5 text-left transition-colors hover:bg-muted/45 sm:[&:nth-child(odd)]:border-r lg:border-b-0 lg:border-r",
              isActive && "bg-primary/8 hover:bg-primary/10",
              dimension.key === "asset" && "lg:border-r-0",
            )}
            key={dimension.key}
            onClick={() => onChangeDimension(dimension.key)}
            type="button"
          >
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-white"
              style={{ backgroundColor: dimension.color }}
            >
              <HugeiconsIcon icon={dimension.icon} size={17} strokeWidth={1.8} />
            </span>
            <span className="grid min-w-0 flex-1 gap-3">
              <span className="grid gap-1">
                <span className="text-sm font-medium text-muted-foreground">{dimension.title}</span>
                <span className="text-[28px] font-semibold leading-tight text-foreground">
                  {formatNumber(totalMentions)}
                </span>
              </span>
              <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate">{dimension.description}</span>
                <span className="shrink-0 tabular-nums">{formatNumber(totalSessions)} 会话</span>
              </span>
            </span>
          </button>
        );
      })}
    </section>
  );
}

const BusinessTrendPanel = memo(function BusinessTrendPanel({
  activeDimension,
  business,
  from,
  to,
  topTopics,
}: {
  activeDimension: BusinessDimension;
  business: InsightsBusinessResponse | undefined;
  from: string;
  to: string;
  topTopics: BusinessTopic[];
}) {
  const dimension = getDimensionConfig(activeDimension);
  const title = activeDimension === "intent" ? "客户意图分布趋势" : `${dimension.title}趋势`;

  return (
    <section aria-label={title} className="flex min-h-[320px] flex-col rounded-xl border bg-card p-4">
      <PanelTitle
        icon={ChartAreaIcon}
        title={title}
        trailing={<DateRangeSummary from={from} to={to} />}
      />
      <div className="mt-4 min-h-[240px] flex-1">
        <DimensionTrendChart
          business={business}
          dimension={dimension}
          key={dimension.key}
          topTopics={topTopics}
        />
      </div>
    </section>
  );
});

function DimensionTrendChart({
  business,
  dimension,
  topTopics,
}: {
  business: InsightsBusinessResponse | undefined;
  dimension: (typeof dimensionConfigs)[number];
  topTopics: BusinessTopic[];
}) {
  if (dimension.key === "intent") {
    return <IntentDistributionTrendChart business={business} topTopics={topTopics} />;
  }

  const trend = business?.trend ?? [];

  if (trend.length === 0) {
    return <EmptyChart text="暂无趋势数据" />;
  }

  const gradientId = `businessTrendArea-${dimension.key}`;

  return (
    <ResponsiveContainer height="100%" width="100%">
      <AreaChart data={trend} margin={{ bottom: 0, left: -14, right: 14, top: 10 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={dimension.color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={dimension.color} stopOpacity={0} />
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
          width={44}
        />
        <Tooltip content={<BusinessTrendTooltip dimension={dimension} />} />
        <Area
          animationDuration={450}
          dataKey={dimension.metricKey}
          fill={`url(#${gradientId})`}
          name={dimension.title}
          stroke={dimension.color}
          strokeWidth={2.4}
          type="monotone"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function IntentDistributionTrendChart({
  business,
  topTopics,
}: {
  business: InsightsBusinessResponse | undefined;
  topTopics: BusinessTopic[];
}) {
  const chart = buildIntentDistributionTrendChart(business, topTopics);

  if (chart.points.length === 0 || chart.series.length === 0) {
    return <EmptyChart text="暂无意图趋势数据" />;
  }

  return (
    <div className="flex h-full min-h-[240px] flex-col gap-3">
      <div className="min-h-[190px] flex-1">
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={chart.points} margin={{ bottom: 0, left: 4, right: 14, top: 10 }}>
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
              axisLine={false}
              domain={[0, 1]}
              tick={{ fill: insightChartColors.axis, fontSize: 12 }}
              tickFormatter={formatPercentTick}
              tickLine={false}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              width={56}
            />
            <Tooltip
              content={<IntentDistributionTrendTooltip series={chart.series} />}
              cursor={{ fill: "var(--muted-foreground)", fillOpacity: 0.1 }}
            />
            {chart.series.map((series) => (
              <Bar
                animationDuration={450}
                barSize={24}
                dataKey={series.key}
                fill={series.color}
                fillOpacity={series.opacity ?? 1}
                key={series.key}
                name={series.name}
                radius={0}
                stackId="intent"
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 px-1 text-xs text-muted-foreground">
        {chart.series.map((series) => (
          <span className="inline-flex min-w-0 items-center gap-1.5" key={series.key}>
            <span className="size-2 rounded-full" style={{ backgroundColor: series.color }} />
            <span className="max-w-[120px] truncate">{series.name}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const TopicDistributionPanel = memo(function TopicDistributionPanel({
  activeDimension,
  from,
  onSelectTopic,
  selectedTopic,
  to,
  topics,
}: {
  activeDimension: BusinessDimension;
  from: string;
  onSelectTopic: (topic: BusinessTopic) => void;
  selectedTopic: BusinessTopic | undefined;
  to: string;
  topics: BusinessTopic[];
}) {
  const dimension = getDimensionConfig(activeDimension);
  const topicSlots = buildTopicSlots(topics);
  const title = `${dimension.title} Top10`;

  return (
    <section aria-label={title} className="flex min-h-[320px] min-w-0 flex-col rounded-xl border bg-card p-4">
      <PanelTitle
        icon={ChartAreaIcon}
        title={title}
        trailing={<DateRangeSummary from={from} to={to} />}
      />

      <div className="grid min-w-0 flex-1 items-center gap-5 lg:grid-cols-[190px_minmax(0,1fr)]">
        <div className="h-[210px] p-2">
          {topics.length > 0 ? (
            <ResponsiveContainer height="100%" key={activeDimension} width="100%">
              <PieChart key={`pie-${activeDimension}`}>
                <Pie
                  animationDuration={450}
                  cx="50%"
                  cy="50%"
                  data={topics}
                  dataKey="sessionCount"
                  innerRadius={44}
                  nameKey="name"
                  outerRadius={74}
                  paddingAngle={2}
                >
                  {topics.map((topic, index) => (
                    <Cell
                      fill={getTopicColor(index)}
                      key={`${topic.dimension}:${topic.code}`}
                      stroke="hsl(var(--background))"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip content={<TopicPieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart text="暂无分布数据" />
          )}
        </div>

        <div className="max-h-[260px] min-w-0 overflow-y-auto pr-1" data-testid="business-topic-list-scroll">
          <div
            aria-label={`${dimension.title} Top10`}
            className="grid min-w-0 gap-x-4 gap-y-2 2xl:grid-cols-2"
            role="list"
          >
            {topicSlots.map((column, columnIndex) => (
              <div className="grid min-w-0 content-start gap-2" key={columnIndex}>
                {column.map(({ index, topic }) => (
                  <div
                    className="min-w-0"
                    key={topic ? `${topic.dimension}:${topic.code}` : `topic-placeholder-${index}`}
                    role="listitem"
                  >
                    {topic ? (
                      <TopicRankButton
                        index={index}
                        isSelected={isSameTopic(selectedTopic, topic)}
                        onClick={() => onSelectTopic(topic)}
                        topic={topic}
                      />
                    ) : (
                      <TopicRankSkeleton index={index} />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
});

function TopicRankButton({
  index,
  isSelected,
  onClick,
  topic,
}: {
  index: number;
  isSelected: boolean;
  onClick: () => void;
  topic: BusinessTopic;
}) {
  return (
    <button
      className={cn(
        "flex w-full min-w-0 items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 text-left transition-colors hover:bg-muted/45",
        isSelected ? "bg-primary/8 hover:bg-primary/10" : "bg-transparent",
      )}
      onClick={onClick}
      type="button"
    >
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-[7px] text-xs font-semibold text-white"
        style={{ backgroundColor: getTopicColor(index) }}
      >
        {index + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium leading-5 text-foreground">{topic.name}</span>
        <span className="block truncate text-xs leading-4 text-muted-foreground">
          {formatTopicMentionSummary(topic)}
        </span>
      </span>
    </button>
  );
}

function TopicRankSkeleton({ index }: { index: number }) {
  return (
    <div className="flex w-full min-w-0 items-center gap-2.5 rounded-[8px] bg-muted/25 px-2.5 py-1.5">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-muted text-xs font-semibold text-muted-foreground/60">
        {index + 1}
      </span>
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="block h-3.5 w-3/5 rounded-full bg-muted" />
        <span className="block h-3 w-4/5 rounded-full bg-muted/70" />
      </span>
    </div>
  );
}

function RelatedSessionsPanel({
  isLoading,
  onOpenDetail,
  onPageChange,
  onSearchChange,
  page,
  searchKeyword,
  sessions,
  topic,
}: {
  isLoading: boolean;
  onOpenDetail: (sessionId: string) => void;
  onPageChange: (page: number) => void;
  onSearchChange: (value: string) => void;
  page: InsightBusinessRelatedSessionsResponse | undefined;
  searchKeyword: string;
  sessions: BusinessSession[];
  topic: BusinessTopic | undefined;
}) {
  const total = page?.total ?? 0;
  const currentPage = page?.page ?? 1;
  const pageSize = page?.pageSize ?? businessRelatedSessionsPageSize;
  const totalPages = page?.totalPages ?? 1;
  const startRow = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(total, currentPage * pageSize);

  return (
    <section className="min-w-0 rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <PanelTitle icon={Target02Icon} title="相关会话" />
          <span className="min-w-0 truncate text-sm text-muted-foreground">
            {topic?.name ?? "选择一个主题后查看对应会话"}
          </span>
        </div>
        <div className="relative w-full sm:w-[280px]">
          <HugeiconsIcon
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            icon={Search01Icon}
            size={15}
            strokeWidth={1.8}
          />
          <Input
            aria-label="搜索相关会话"
            className="h-9 rounded-[8px] pl-9 text-sm"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索会话、客户或主题"
            value={searchKeyword}
          />
        </div>
      </div>
      <div className="overflow-x-auto px-4 pb-4">
        <Table aria-label="相关会话">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-11 min-w-[210px]">客户</TableHead>
              <TableHead className="h-11 min-w-[170px]">客服</TableHead>
              <TableHead className="h-11 min-w-[280px]">意图/问题</TableHead>
              <TableHead className="h-11 min-w-[120px]">状态</TableHead>
              <TableHead className="h-11 min-w-[150px]">开始时间</TableHead>
              <TableHead className="h-11 w-[100px] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <InsightTableLoadingRow cellClassName="py-12 text-center" colSpan={6} />
            ) : sessions.length > 0 ? sessions.map((session) => (
              <TableRow key={session.sessionId}>
                <TableCell className="py-4">
                  <InsightPerson
                    avatarUrl={session.customerAvatarUrl}
                    name={session.customerName}
                  />
                </TableCell>
                <TableCell className="py-4">
                  <InsightPerson
                    avatarUrl={session.agentAvatarUrl}
                    name={session.agentName ?? "未分配客服"}
                  />
                </TableCell>
                <TableCell className="max-w-[320px] py-4">
                  <div className="truncate text-sm font-medium text-foreground">
                    {session.summaryCustomerIntent || <span className="text-muted-foreground/50">—</span>}
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {session.problemSummary || <span className="text-muted-foreground/50">—</span>}
                  </div>
                </TableCell>
                <TableCell className="py-4">
                  <ResolutionBadge status={session.resolutionStatus} />
                </TableCell>
                <TableCell className="py-4 text-sm text-muted-foreground">
                  {formatInsightTime(session.startedAt)}
                </TableCell>
                <TableCell className="py-4 text-right">
                  <Button
                    className="h-8 rounded-[8px]"
                    onClick={() => onOpenDetail(session.sessionId)}
                    size="sm"
                    variant="outline"
                  >
                    查看详情
                  </Button>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow>
                <TableCell className="py-12 text-center text-sm text-muted-foreground" colSpan={6}>
                  当前筛选下暂无可追溯会话
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <InsightTablePagination
        endRow={endRow}
        onPageChange={onPageChange}
        page={currentPage}
        startRow={startRow}
        total={total}
        totalPages={totalPages}
      />
    </section>
  );
}

function PanelTitle({
  icon,
  title,
  trailing,
}: {
  icon: typeof Analytics02Icon;
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

function DateRangeSummary({ from, to }: { from: string; to: string }) {
  return (
    <div className="shrink-0 text-xs text-muted-foreground">
      {formatDateRangeSummary(from, to)}
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-[140px] items-center justify-center rounded-[10px] bg-muted/35 text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function BusinessTrendTooltip({
  active,
  dimension,
  label,
  payload,
}: TooltipProps<number, string> & { dimension: (typeof dimensionConfigs)[number] }) {
  if (!active || !payload?.length) {
    return null;
  }

  const value = Number(payload[0]?.value ?? 0);

  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-lg">
      <div className="font-medium text-foreground">{formatFullTrendDate(String(label))}</div>
      <div className="mt-2 flex items-center gap-2">
        <span className="size-2 rounded-full" style={{ backgroundColor: dimension.color }} />
        <span className="text-muted-foreground">{dimension.title}</span>
        <span className="font-semibold tabular-nums">{formatNumber(value)}</span>
      </div>
    </div>
  );
}

function IntentDistributionTrendTooltip({
  active,
  label,
  payload,
  series,
}: TooltipProps<number, string> & { series: IntentTrendSeries[] }) {
  if (!active || !payload?.length) {
    return null;
  }

  const data = payload[0]?.payload as IntentTrendPoint | undefined;
  const counts = data?.__counts ?? {};

  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-lg">
      <div className="font-medium text-foreground">{formatFullTrendDate(String(label))}</div>
      <div className="mt-2 grid gap-1.5">
        {series.map((item) => {
          const percent = Number(data?.[item.key] ?? 0);
          const count = counts[item.key] ?? 0;

          if (percent <= 0 && count <= 0) {
            return null;
          }

          return (
            <div className="flex items-center gap-2" key={item.key}>
              <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.name}</span>
              <span className="font-semibold tabular-nums">{formatPercent(percent)}</span>
              <span className="text-muted-foreground tabular-nums">{formatNumber(count)} 个</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TopicPieTooltip({
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
        {formatNumber(Number(item.value ?? 0))}
        {" "}
        个会话
      </div>
    </div>
  );
}

function getDimensionConfig(value: BusinessDimension) {
  return dimensionConfigs.find((item) => item.key === value) ?? dimensionConfigs[0];
}

function buildTopicsByDimension(business: InsightsBusinessResponse | undefined): Record<BusinessDimension, BusinessTopic[]> {
  return {
    asset: sortBusinessTopics(business?.assetHotspots ?? []),
    entity: sortBusinessTopics(business?.entityHotspots ?? []),
    intent: sortBusinessTopics(business?.intentDistribution ?? []),
    tag: sortBusinessTopics(business?.tagDistribution ?? []),
  };
}

function sortBusinessTopics(topics: BusinessTopic[]) {
  return [...topics].sort((left, right) =>
    right.sessionCount - left.sessionCount
    || right.mentionCount - left.mentionCount
    || left.name.localeCompare(right.name, "zh-CN"),
  );
}

function buildTopicSlots(topics: BusinessTopic[]) {
  const slots = Array.from({ length: 10 }, (_, index) => ({
    index,
    topic: topics[index],
  }));

  return [
    slots.slice(0, 5),
    slots.slice(5, 10),
  ];
}

function getTopicColor(index: number) {
  return insightChartColors.topic[index % insightChartColors.topic.length];
}

function buildIntentDistributionTrendChart(
  business: InsightsBusinessResponse | undefined,
  topTopics: BusinessTopic[],
): { points: IntentTrendPoint[]; series: IntentTrendSeries[] } {
  const topIntents = topTopics
    .filter((topic) => topic.dimension === "intent")
    .slice(0, 5);
  const topIntentCodes = new Set(topIntents.map((topic) => topic.code));
  const seriesKeyByIntentCode = new Map(
    topIntents.map((topic, index) => [topic.code, `intent_${index}`]),
  );
  const hasOther = (business?.intentTrend ?? []).some((point) => !topIntentCodes.has(point.intentCode));
  const series = [
    ...topIntents.map((topic, index) => ({
      color: getTopicColor(index),
      key: seriesKeyByIntentCode.get(topic.code) ?? `intent_${index}`,
      name: topic.name,
    })),
    ...(hasOther ? [{ color: "var(--muted-foreground)", key: "other", name: "其他", opacity: 0.22 }] : []),
  ];

  if (!business?.intentTrend?.length || series.length === 0) {
    return { points: [], series };
  }

  const pointsByDate = new Map<string, { counts: Record<string, number>; date: string }>(
    (business.trend ?? []).map((point) => [point.date, { counts: {}, date: point.date }]),
  );

  for (const point of business.intentTrend) {
    const key = topIntentCodes.has(point.intentCode)
      ? seriesKeyByIntentCode.get(point.intentCode) ?? "other"
      : "other";
    const datePoint = pointsByDate.get(point.date) ?? { counts: {}, date: point.date };
    datePoint.counts[key] = (datePoint.counts[key] ?? 0) + point.sessionCount;
    pointsByDate.set(point.date, datePoint);
  }

  const points = Array.from(pointsByDate.values())
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((point) => {
      const total = series.reduce((sum, item) => sum + (point.counts[item.key] ?? 0), 0);
      const normalized: IntentTrendPoint = {
        __counts: {},
        date: point.date,
      };

      for (const item of series) {
        const count = point.counts[item.key] ?? 0;
        normalized.__counts[item.key] = count;
        normalized[item.key] = total > 0 ? count / total : 0;
      }

      return normalized;
    });

  return { points, series };
}

function findTopicByKeyword(topics: BusinessTopic[], keyword: string) {
  const normalizedKeyword = normalizeKeyword(keyword);

  if (!normalizedKeyword) {
    return undefined;
  }

  return topics.find((topic) => topicMatchesKeyword(topic, normalizedKeyword));
}

function topicMatchesKeyword(topic: BusinessTopic, normalizedKeyword: string) {
  return [
    topic.name,
    topic.code,
    topic.type ?? "",
    dimensionText(topic),
  ].some((value) => normalizeKeyword(value).includes(normalizedKeyword));
}

function normalizeKeyword(value: string) {
  return value.trim().toLowerCase();
}

function dimensionText(topic: BusinessTopic) {
  const text: Record<BusinessTopic["dimension"], string> = {
    entity: topic.type ? entityTypeText(topic.type) : "实体对象",
    intent: "客户意图",
    asset: topic.type ? assetTypeText(topic.type) : "链接文件",
    tag: "业务标签",
  };

  return text[topic.dimension];
}

function assetTypeText(value: string) {
  const text: Record<string, string> = {
    file: "文件",
    link: "H5链接",
    miniapp: "小程序",
  };

  return text[value] ?? "链接文件";
}

function entityTypeText(value: string) {
  const text: Record<string, string> = {
    activity: "活动",
    coupon: "优惠",
    order: "订单",
    product: "商品",
    sku: "商品",
  };

  return text[value] ?? "实体对象";
}

function sumTopicMentions(topics: BusinessTopic[]) {
  return topics.reduce((total, topic) => total + topic.mentionCount, 0);
}

function sumTopicSessions(topics: BusinessTopic[]) {
  return topics.reduce((total, topic) => total + topic.sessionCount, 0);
}

function isSameTopic(
  left: BusinessTopic | undefined,
  right: BusinessTopic | undefined,
) {
  return Boolean(
    left &&
    right &&
    left.dimension === right.dimension &&
    left.code === right.code &&
    left.type === right.type,
  );
}

function formatNumber(value: number | undefined) {
  return value == null ? "-" : value.toLocaleString("zh-CN");
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatPercentTick(value: number) {
  return formatPercent(value);
}

function formatTrendDate(value: string) {
  return value.slice(5).replace("-", "/");
}

function formatFullTrendDate(value: string) {
  return value.replaceAll("-", "/");
}

function formatDateRangeSummary(from: string, to: string) {
  return from === to ? from : `${from} 至 ${to}`;
}

function formatTopicMentionSummary(topic: BusinessTopic) {
  const summary = topic.sessionCount === topic.mentionCount
    ? `${formatNumber(topic.sessionCount)} 个会话提及`
    : `${formatNumber(topic.sessionCount)} 个会话 ${formatNumber(topic.mentionCount)} 次提及`;

  if (topic.dimension !== "asset" || !topic.type) {
    return summary;
  }

  return `${assetTypeText(topic.type)} · ${summary}`;
}
