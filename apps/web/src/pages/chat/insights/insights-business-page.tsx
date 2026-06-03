import { useEffect, useMemo, useState } from "react";
import {
  Analytics02Icon,
  ChartAreaIcon,
  DatabaseIcon,
  LabelImportantIcon,
  Search01Icon,
  Target02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { InsightsBusinessResponse, InsightsOverviewResponse } from "@chatai/contracts";
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
import { getInsightBusiness, getInsightOverview } from "./api/insights-service";
import { InsightDateRangeFilter } from "./insight-date-range-filter";
import { ResolutionBadge } from "./insight-badges";
import { InsightDetailPanel } from "./insight-detail-panel";
import { InsightPerson } from "./insight-person";
import { getDefaultDateRange, toBoundaryDate } from "./insights-date-range";
import { InsightsLayout, InsightsPageHeader } from "./insights-layout";
import { formatInsightTime } from "./insights-utils";
import { useInsightDetail } from "./use-insight-detail";

type BusinessTopic = InsightsBusinessResponse["tagDistribution"][number];
type BusinessSession = InsightsOverviewResponse["sessions"][number];
type BusinessDimension = BusinessTopic["dimension"];
type BusinessTrendMetric = "assetMentions" | "entityMentions" | "intentMentions" | "tagMentions";

const dimensionConfigs: Array<{
  color: string;
  description: string;
  icon: typeof Analytics02Icon;
  key: BusinessDimension;
  metricKey: BusinessTrendMetric;
  title: string;
}> = [
  {
    color: "#5b5ff0",
    description: "客户来咨询的主要原因",
    icon: Target02Icon,
    key: "intent",
    metricKey: "intentMentions",
    title: "客户诉求",
  },
  {
    color: "#16a36a",
    description: "命中已配置的业务标签",
    icon: LabelImportantIcon,
    key: "tag",
    metricKey: "tagMentions",
    title: "业务标签",
  },
  {
    color: "#f0a337",
    description: "商品、订单、活动等实体对象",
    icon: DatabaseIcon,
    key: "entity",
    metricKey: "entityMentions",
    title: "实体对象",
  },
  {
    color: "#0891b2",
    description: "H5、小程序卡片、文件",
    icon: ChartAreaIcon,
    key: "asset",
    metricKey: "assetMentions",
    title: "链接文件",
  },
];

const topicColors = ["#5b5ff0", "#14a6a6", "#e7a23b", "#e36f5c", "#7b61d9", "#2f8bc9", "#58a65c", "#c16d9b", "#b58a3b", "#6f8fbc"];

export function InsightsBusinessPage() {
  const [activeDimension, setActiveDimension] = useState<BusinessDimension>("intent");
  const [business, setBusiness] = useState<InsightsBusinessResponse>();
  const [from, setFrom] = useState(() => getDefaultDateRange().from);
  const [overview, setOverview] = useState<InsightsOverviewResponse>();
  const [sessionSearchKeyword, setSessionSearchKeyword] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<BusinessTopic>();
  const [to, setTo] = useState(() => getDefaultDateRange().to);
  const detail = useInsightDetail();

  useEffect(() => {
    let isActive = true;
    const query = {
      from: toBoundaryDate(from, "start"),
      to: toBoundaryDate(to, "end"),
    };

    void Promise.all([
      getInsightBusiness(query),
      getInsightOverview(query),
    ]).then(([businessResponse, overviewResponse]) => {
      if (isActive) {
        setBusiness(businessResponse);
        setOverview(overviewResponse);
      }
    });

    return () => {
      isActive = false;
    };
  }, [from, to]);

  const topicsByDimension = useMemo(() => buildTopicsByDimension(business), [business]);
  const activeTopics = topicsByDimension[activeDimension];
  const topTopics = activeTopics.slice(0, 10);

  useEffect(() => {
    const keywordMatchedTopic = findTopicByKeyword(topTopics, sessionSearchKeyword);

    if (keywordMatchedTopic && !isSameTopic(keywordMatchedTopic, selectedTopic)) {
      setSelectedTopic(keywordMatchedTopic);
      return;
    }

    if (!selectedTopic || selectedTopic.dimension !== activeDimension || !topTopics.some((topic) => isSameTopic(topic, selectedTopic))) {
      setSelectedTopic(topTopics[0]);
    }
  }, [activeDimension, selectedTopic, sessionSearchKeyword, topTopics]);

  const activeTopic = selectedTopic?.dimension === activeDimension
    ? selectedTopic
    : topTopics[0];
  const relatedSessions = useMemo(
    () => activeTopic
      ? (overview?.sessions ?? [])
        .filter((session) => topicMatchesSession(activeTopic, session))
        .filter((session) => sessionMatchesKeyword(session, sessionSearchKeyword))
      : [],
    [activeTopic, overview?.sessions, sessionSearchKeyword],
  );

  return (
    <InsightsLayout title="业务洞察">
      <div className="space-y-5">
        <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <InsightsPageHeader
            description="从客户诉求、业务标签、实体对象和链接文件四个维度查看经营主题，并追溯到对应会话"
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

        <DimensionMetricStrip
            activeDimension={activeDimension}
            onChangeDimension={setActiveDimension}
            topicsByDimension={topicsByDimension}
          />

        <div className="grid gap-5 xl:grid-cols-2">
          <BusinessTrendPanel
            activeDimension={activeDimension}
            business={business}
          />

          <TopicDistributionPanel
            activeDimension={activeDimension}
            onSelectTopic={setSelectedTopic}
            selectedTopic={activeTopic}
            topics={topTopics}
          />
        </div>

        <RelatedSessionsPanel
          onOpenDetail={(sessionId) => void detail.openDetail(sessionId)}
          onSearchChange={setSessionSearchKeyword}
          searchKeyword={sessionSearchKeyword}
          sessions={relatedSessions}
          topic={activeTopic}
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

function BusinessTrendPanel({
  activeDimension,
  business,
}: {
  activeDimension: BusinessDimension;
  business: InsightsBusinessResponse | undefined;
}) {
  const dimension = getDimensionConfig(activeDimension);

  return (
    <section className="flex min-h-[320px] flex-col rounded-xl border bg-card p-4">
      <PanelTitle icon={ChartAreaIcon} title={`${dimension.title}趋势`} />
      <div className="mt-4 min-h-[240px] flex-1">
        <DimensionTrendChart
          business={business}
          dimension={dimension}
          key={dimension.key}
        />
      </div>
    </section>
  );
}

function DimensionTrendChart({
  business,
  dimension,
}: {
  business: InsightsBusinessResponse | undefined;
  dimension: (typeof dimensionConfigs)[number];
}) {
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
          tick={{ fill: "#a1a1aa", fontSize: 12 }}
          tickFormatter={formatTrendDate}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          axisLine={false}
          tick={{ fill: "#a1a1aa", fontSize: 12 }}
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

function TopicDistributionPanel({
  activeDimension,
  onSelectTopic,
  selectedTopic,
  topics,
}: {
  activeDimension: BusinessDimension;
  onSelectTopic: (topic: BusinessTopic) => void;
  selectedTopic: BusinessTopic | undefined;
  topics: BusinessTopic[];
}) {
  const dimension = getDimensionConfig(activeDimension);
  const topicSlots = buildTopicSlots(topics);

  return (
    <aside className="flex min-h-[320px] min-w-0 flex-col rounded-xl border bg-card p-4">
      <PanelTitle icon={ChartAreaIcon} title={`${dimension.title} Top10`} />

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
                      fill={topicColors[index % topicColors.length]}
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
    </aside>
  );
}

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
        style={{ backgroundColor: topicColors[index % topicColors.length] }}
      >
        {index + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium leading-5 text-foreground">{topic.name}</span>
        <span className="flex items-center gap-2 text-xs leading-4 text-muted-foreground">
          <span>{topic.sessionCount} 个会话</span>
          <span>{topic.mentionCount} 次提及</span>
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
  onOpenDetail,
  onSearchChange,
  searchKeyword,
  sessions,
  topic,
}: {
  onOpenDetail: (sessionId: string) => void;
  onSearchChange: (value: string) => void;
  searchKeyword: string;
  sessions: BusinessSession[];
  topic: BusinessTopic | undefined;
}) {
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
              <TableHead className="h-11 min-w-[280px]">诉求/问题</TableHead>
              <TableHead className="h-11 min-w-[120px]">状态</TableHead>
              <TableHead className="h-11 min-w-[150px]">开始时间</TableHead>
              <TableHead className="h-11 w-[100px] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.length > 0 ? sessions.map((session) => (
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
                    {session.summaryCustomerIntent || "暂无诉求"}
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {session.problemSummary || "暂无客户问题摘要"}
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
    </section>
  );
}

function PanelTitle({ icon, title }: { icon: typeof Analytics02Icon; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] border bg-background text-muted-foreground">
        <HugeiconsIcon icon={icon} size={17} />
      </span>
      <h2 className="text-base font-medium">{title}</h2>
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

function sessionMatchesKeyword(session: BusinessSession, keyword: string) {
  const normalizedKeyword = normalizeKeyword(keyword);

  if (!normalizedKeyword) {
    return true;
  }

  return [
    session.agentName ?? "",
    session.customerName,
    session.problemSummary ?? "",
    session.summaryCustomerIntent,
    ...(session.tags ?? []).flatMap((tag) => [tag.tagCode, tag.tagName]),
    ...(session.entities ?? []).flatMap((entity) => [entity.entityId, entity.entityName, entity.entityType]),
    ...(session.intents ?? []).flatMap((intent) => [intent.intentCode, intent.intentLabel]),
    ...(session.assets ?? []).flatMap((asset) => [asset.assetCode, asset.assetName, asset.assetType]),
  ].some((value) => normalizeKeyword(value).includes(normalizedKeyword));
}

function normalizeKeyword(value: string) {
  return value.trim().toLowerCase();
}

function dimensionText(topic: BusinessTopic) {
  const text: Record<BusinessTopic["dimension"], string> = {
    entity: topic.type ? entityTypeText(topic.type) : "实体对象",
    intent: "客户诉求",
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
  return Boolean(left && right && left.dimension === right.dimension && left.code === right.code);
}

function topicMatchesSession(topic: BusinessTopic, session: BusinessSession) {
  if (topic.dimension === "tag") {
    return (session.tags ?? []).some((tag) => tag.tagCode === topic.code);
  }

  if (topic.dimension === "entity") {
    return (session.entities ?? []).some((entity) => entity.entityId === topic.code);
  }

  if (topic.dimension === "asset") {
    return (session.assets ?? []).some((asset) => asset.assetCode === topic.code);
  }

  return (session.intents ?? []).some((intent) => intent.intentCode === topic.code);
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
