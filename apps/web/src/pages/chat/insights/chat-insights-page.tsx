import {
  AddMoneyCircleIcon,
  AlertCircleIcon,
  Analytics01Icon,
  ArrowLeft02Icon,
  ArrowRight01Icon,
  Calendar03Icon,
  ChartBarIncreasingIcon,
  ChartBreakoutCircleIcon,
  PackageSearch01Icon,
  Search01Icon,
  ShoppingCart01Icon,
  StoreManagement01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  defaultInsightFilters,
  filterInsightData,
  insightDemoData,
  intentLabels,
  type AfterSaleInsight,
  type InsightEvidence,
  type InsightFilters,
  type InsightIntent,
  type InsightMode,
  type InsightRange,
  type InsightRiskLevel,
  type PriorityQueueItem,
  type ProductInsight,
} from "@/pages/chat/insights/insights-data";

type EvidenceDrawerState = {
  action: string;
  description: string;
  evidence: InsightEvidence[];
  meta: string[];
  title: string;
};

const rangeOptions: Array<{ label: string; value: InsightRange }> = [
  { label: "今日", value: "today" },
  { label: "近 7 天", value: "7d" },
  { label: "近 30 天", value: "30d" },
];

const modeOptions: Array<{ label: string; value: InsightMode }> = [
  { label: "全部会话", value: "all" },
  { label: "私聊", value: "single" },
  { label: "群聊", value: "group" },
];

const riskOptions: Array<{ label: string; value: InsightRiskLevel }> = [
  { label: "全部风险", value: "all" },
  { label: "高风险", value: "high" },
  { label: "中风险", value: "medium" },
  { label: "低风险", value: "low" },
];

const intentOptions: Array<{ label: string; value: InsightIntent }> = [
  { label: "全部意图", value: "all" },
  ...Object.entries(intentLabels).map(([value, label]) => ({
    label,
    value: value as Exclude<InsightIntent, "all">,
  })),
];

const seatOptions = [
  { label: "全部客服", value: "all" },
  { label: "杭州 1 号客服", value: "seat-1" },
  { label: "私域群客服", value: "seat-2" },
  { label: "团购客服", value: "seat-3" },
];

const riskConfig = {
  high: {
    label: "高风险",
    badgeClassName: "border-destructive/25 bg-destructive-muted text-destructive",
    dotClassName: "bg-destructive",
    progress: 92,
  },
  medium: {
    label: "中风险",
    badgeClassName: "border-warning/35 bg-warning-muted text-foreground",
    dotClassName: "bg-warning",
    progress: 62,
  },
  low: {
    label: "低风险",
    badgeClassName: "border-success/25 bg-success-muted text-success",
    dotClassName: "bg-success",
    progress: 34,
  },
} satisfies Record<
  Exclude<InsightRiskLevel, "all">,
  {
    badgeClassName: string;
    dotClassName: string;
    label: string;
    progress: number;
  }
>;

const modeLabels: Record<Exclude<InsightMode, "all">, string> = {
  group: "群聊",
  single: "私聊",
};

const trendLabels: Record<AfterSaleInsight["trend"], string> = {
  down: "回落",
  flat: "持平",
  up: "上升",
};

export function ChatInsightsPage() {
  const [filters, setFilters] = useState<InsightFilters>(defaultInsightFilters);
  const [selectedEvidence, setSelectedEvidence] =
    useState<EvidenceDrawerState | null>(null);

  const data = useMemo(
    () => filterInsightData(insightDemoData, filters),
    [filters],
  );

  const maxIntentCount = Math.max(
    1,
    ...data.intentBreakdown.map((item) => item.count),
  );

  const updateFilters = <K extends keyof InsightFilters>(
    key: K,
    value: InsightFilters[K],
  ) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const resetFilters = () => {
    setFilters(defaultInsightFilters);
  };

  return (
    <div
      className="min-h-svh bg-surface text-foreground"
      data-testid="chat-insights-page"
    >
      <header className="border-b border-divider bg-background/95">
        <div className="mx-auto flex max-w-[1480px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <Button asChild size="icon" variant="outline">
                <Link aria-label="返回聊天" to="/chat">
                  <HugeiconsIcon
                    color="currentColor"
                    icon={ArrowLeft02Icon}
                    size={18}
                    strokeWidth={1.8}
                  />
                </Link>
              </Button>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-medium text-primary">
                  <HugeiconsIcon
                    color="currentColor"
                    icon={StoreManagement01Icon}
                    size={14}
                    strokeWidth={1.8}
                  />
                  <span>私域客服经营台</span>
                </div>
                <h1 className="text-[26px] font-semibold tracking-normal text-foreground">
                  电商洞察
                </h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2 rounded-[8px] border border-border bg-background px-3 py-2">
                <HugeiconsIcon
                  color="currentColor"
                  icon={Calendar03Icon}
                  size={15}
                  strokeWidth={1.8}
                />
                {data.generatedAt}
              </span>
              <Button size="sm" type="button" variant="outline" onClick={resetFilters}>
                重置筛选
              </Button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <FilterSelect
              label="时间"
              options={rangeOptions}
              value={filters.range}
              onValueChange={(value) => updateFilters("range", value as InsightRange)}
            />
            <FilterSelect
              label="类型"
              options={modeOptions}
              value={filters.mode}
              onValueChange={(value) => updateFilters("mode", value as InsightMode)}
            />
            <FilterSelect
              label="风险"
              options={riskOptions}
              value={filters.riskLevel}
              onValueChange={(value) =>
                updateFilters("riskLevel", value as InsightRiskLevel)
              }
            />
            <FilterSelect
              label="意图"
              options={intentOptions}
              value={filters.intent}
              onValueChange={(value) =>
                updateFilters("intent", value as InsightIntent)
              }
            />
            <FilterSelect
              label="客服"
              options={seatOptions}
              value={filters.seatId}
              onValueChange={(value) => updateFilters("seatId", value)}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1480px] gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={AlertCircleIcon}
            label="待处理事项"
            supporting={`${data.overview.highRiskConversations} 个高风险`}
            tone="danger"
            value={data.overview.pendingActions}
          />
          <MetricCard
            icon={PackageSearch01Icon}
            label="售后会话"
            supporting="退款/退货/少件"
            tone="warning"
            value={data.overview.afterSaleConversations}
          />
          <MetricCard
            icon={AddMoneyCircleIcon}
            label="高意向客户"
            supporting="可转化线索"
            tone="success"
            value={data.overview.highIntentCustomers}
          />
          <MetricCard
            icon={Analytics01Icon}
            label="负面占比"
            supporting={`${data.overview.customerMessages} 条客户消息`}
            tone="info"
            value={`${data.overview.negativeRate}%`}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.16fr)_minmax(360px,0.84fr)]">
          <PriorityQueuePanel
            items={data.priorityQueue}
            onOpenEvidence={(item) => setSelectedEvidence(getQueueDrawerState(item))}
          />

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-1">
            <IntentBreakdownPanel
              maxIntentCount={maxIntentCount}
              items={data.intentBreakdown}
            />
            <AfterSalePressurePanel
              items={data.afterSales}
              onOpenEvidence={(item) =>
                setSelectedEvidence(getAfterSaleDrawerState(item))
              }
            />
          </div>
        </section>

        <Tabs defaultValue="products">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TabsList className="w-fit rounded-[8px]">
              <TabsTrigger className="rounded-[6px]" value="products">
                商品洞察
              </TabsTrigger>
              <TabsTrigger className="rounded-[6px]" value="after-sales">
                售后归因
              </TabsTrigger>
              <TabsTrigger className="rounded-[6px]" value="intents">
                意图分布
              </TabsTrigger>
            </TabsList>
            <div className="text-sm text-muted-foreground">
              {data.overview.totalConversations} 个会话样本
            </div>
          </div>

          <TabsContent value="products">
            <ProductsPanel
              products={data.products}
              onOpenEvidence={(product) =>
                setSelectedEvidence(getProductDrawerState(product))
              }
            />
          </TabsContent>
          <TabsContent value="after-sales">
            <AfterSaleTablePanel
              items={data.afterSales}
              onOpenEvidence={(item) =>
                setSelectedEvidence(getAfterSaleDrawerState(item))
              }
            />
          </TabsContent>
          <TabsContent value="intents">
            <IntentPanel items={data.intentBreakdown} maxIntentCount={maxIntentCount} />
          </TabsContent>
        </Tabs>
      </main>

      <EvidenceSheet
        item={selectedEvidence}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setSelectedEvidence(null);
          }
        }}
      />
    </div>
  );
}

function FilterSelect({
  label,
  options,
  value,
  onValueChange,
}: {
  label: string;
  options: Array<{ label: string; value: string }>;
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger aria-label={label} className="h-9 w-full bg-background">
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
    </label>
  );
}

function MetricCard({
  icon,
  label,
  supporting,
  tone,
  value,
}: {
  icon: IconSvgElement;
  label: string;
  supporting: string;
  tone: "danger" | "info" | "success" | "warning";
  value: ReactNode;
}) {
  return (
    <Card className="rounded-[8px] border-divider bg-surface-elevated shadow-none">
      <CardContent className="grid gap-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <span
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-[8px]",
              tone === "danger" && "bg-destructive-muted text-destructive",
              tone === "warning" && "bg-warning-muted text-foreground",
              tone === "success" && "bg-success-muted text-success",
              tone === "info" && "bg-primary/10 text-primary",
            )}
          >
            <HugeiconsIcon
              color="currentColor"
              icon={icon}
              size={18}
              strokeWidth={1.8}
            />
          </span>
          <span className="text-xs text-muted-foreground">{supporting}</span>
        </div>
        <div>
          <div className="text-3xl font-semibold tracking-normal text-foreground">
            {value}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function PriorityQueuePanel({
  items,
  onOpenEvidence,
}: {
  items: PriorityQueueItem[];
  onOpenEvidence: (item: PriorityQueueItem) => void;
}) {
  return (
    <Card className="rounded-[8px] border-divider bg-surface-elevated shadow-none">
      <CardHeader className="flex-row items-center justify-between gap-4 p-4">
        <div>
          <CardTitle className="text-base">优先处理</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">按风险、意图和时效排序</p>
        </div>
        <Badge variant="outline">{items.length} 项</Badge>
      </CardHeader>
      <CardContent className="grid gap-2 px-4 pb-4">
        {items.length === 0 ? (
          <EmptyState label="暂无符合筛选条件的会话" />
        ) : (
          items.map((item) => (
            <button
              className="group grid w-full gap-3 rounded-[8px] border border-divider bg-background px-4 py-3 text-left transition-colors hover:border-input hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
              data-testid={`priority-item-${item.id}`}
              key={item.id}
              type="button"
              onClick={() => onOpenEvidence(item)}
            >
              <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        riskConfig[item.riskLevel].dotClassName,
                      )}
                    />
                    <span className="truncate text-sm font-semibold text-foreground">
                      {item.conversationName}
                    </span>
                    <Badge
                      className={cn(
                        "border",
                        riskConfig[item.riskLevel].badgeClassName,
                      )}
                      variant="outline"
                    >
                      {riskConfig[item.riskLevel].label}
                    </Badge>
                    <Badge variant="outline">{modeLabels[item.mode]}</Badge>
                    <Badge variant="secondary">{item.intentLabel}</Badge>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                    {item.summary}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  <span>{item.lastCustomerMessageAt}</span>
                  <HugeiconsIcon
                    className="text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    color="currentColor"
                    icon={ArrowRight01Icon}
                    size={16}
                    strokeWidth={1.8}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-[6px] bg-surface-muted px-2 py-1">
                  商品: {item.productName}
                </span>
                <span className="rounded-[6px] bg-surface-muted px-2 py-1">
                  {item.seatName}
                </span>
                <span className="inline-flex items-center gap-1 rounded-[6px] bg-primary/10 px-2 py-1 text-primary">
                  <HugeiconsIcon
                    color="currentColor"
                    icon={Search01Icon}
                    size={13}
                    strokeWidth={1.8}
                  />
                  证据
                </span>
              </div>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function IntentBreakdownPanel({
  items,
  maxIntentCount,
}: {
  items: Array<{ count: number; label: string; type: Exclude<InsightIntent, "all"> }>;
  maxIntentCount: number;
}) {
  return (
    <Card className="rounded-[8px] border-divider bg-surface-elevated shadow-none">
      <CardHeader className="p-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">意图热度</CardTitle>
          <HugeiconsIcon
            className="text-primary"
            color="currentColor"
            icon={ChartBreakoutCircleIcon}
            size={18}
            strokeWidth={1.8}
          />
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 px-4 pb-4">
        {items.length === 0 ? (
          <EmptyState label="暂无意图数据" />
        ) : (
          items.map((item) => (
            <div className="grid gap-1.5" key={item.type}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-foreground">{item.label}</span>
                <span className="text-muted-foreground">{item.count}</span>
              </div>
              <Progress
                aria-label={`${item.label} ${item.count}`}
                className="h-2 bg-surface-muted"
                value={(item.count / maxIntentCount) * 100}
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function AfterSalePressurePanel({
  items,
  onOpenEvidence,
}: {
  items: AfterSaleInsight[];
  onOpenEvidence: (item: AfterSaleInsight) => void;
}) {
  const totalRisk = items.reduce((sum, item) => sum + item.riskCount, 0);
  const totalCount = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <Card className="rounded-[8px] border-divider bg-surface-elevated shadow-none">
      <CardHeader className="p-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">售后压力</CardTitle>
          <Badge
            className={cn(
              totalRisk > 0
                ? "border-destructive/25 bg-destructive-muted text-destructive"
                : "border-success/25 bg-success-muted text-success",
            )}
            variant="outline"
          >
            {totalRisk} 个风险
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 px-4 pb-4">
        <div className="grid grid-cols-2 gap-3">
          <SummaryTile label="售后量" value={totalCount} />
          <SummaryTile label="风险量" value={totalRisk} />
        </div>
        <div className="grid gap-2">
          {items.slice(0, 3).map((item) => (
            <button
              className="flex items-center justify-between gap-3 rounded-[8px] border border-divider bg-background px-3 py-2 text-left text-sm transition-colors hover:border-input hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
              key={item.id}
              type="button"
              onClick={() => onOpenEvidence(item)}
            >
              <span className="font-medium text-foreground">{item.label}</span>
              <span className="text-muted-foreground">
                {item.count} 单 / {trendLabels[item.trend]}
              </span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ProductsPanel({
  products,
  onOpenEvidence,
}: {
  products: ProductInsight[];
  onOpenEvidence: (product: ProductInsight) => void;
}) {
  return (
    <Card className="rounded-[8px] border-divider bg-surface-elevated shadow-none">
      <CardHeader className="flex-row items-center justify-between gap-4 p-4">
        <div>
          <CardTitle className="text-base">商品信号</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">咨询、售后和话术缺口</p>
        </div>
        <HugeiconsIcon
          className="text-primary"
          color="currentColor"
          icon={ShoppingCart01Icon}
          size={19}
          strokeWidth={1.8}
        />
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {products.length === 0 ? (
          <EmptyState label="暂无符合筛选条件的商品" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-44">商品</TableHead>
                <TableHead>咨询</TableHead>
                <TableHead>售后</TableHead>
                <TableHead>负面</TableHead>
                <TableHead className="min-w-40">主要问题</TableHead>
                <TableHead className="min-w-56">话术机会</TableHead>
                <TableHead className="w-24 text-right">证据</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">{product.name}</div>
                    <div className="text-xs text-muted-foreground">
                      购买意向 {product.purchaseIntentCount}
                    </div>
                  </TableCell>
                  <TableCell>咨询 {product.mentionCount}</TableCell>
                  <TableCell>{product.afterSaleCount}</TableCell>
                  <TableCell>
                    <Badge
                      className={cn(
                        product.negativeCount >= 5
                          ? "border-destructive/25 bg-destructive-muted text-destructive"
                          : "border-warning/25 bg-warning-muted text-foreground",
                      )}
                      variant="outline"
                    >
                      {product.negativeCount}
                    </Badge>
                  </TableCell>
                  <TableCell>{product.topIssue}</TableCell>
                  <TableCell>{formatFaqOpportunity(product.faqOpportunity)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      type="button"
                      variant="ghost"
                      onClick={() => onOpenEvidence(product)}
                    >
                      <HugeiconsIcon
                        color="currentColor"
                        icon={Search01Icon}
                        size={15}
                        strokeWidth={1.8}
                      />
                      查看
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function AfterSaleTablePanel({
  items,
  onOpenEvidence,
}: {
  items: AfterSaleInsight[];
  onOpenEvidence: (item: AfterSaleInsight) => void;
}) {
  return (
    <Card className="rounded-[8px] border-divider bg-surface-elevated shadow-none">
      <CardHeader className="flex-row items-center justify-between gap-4 p-4">
        <div>
          <CardTitle className="text-base">售后归因</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">退款、退货、物流和少件</p>
        </div>
        <HugeiconsIcon
          className="text-warning"
          color="currentColor"
          icon={PackageSearch01Icon}
          size={19}
          strokeWidth={1.8}
        />
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {items.length === 0 ? (
          <EmptyState label="暂无售后数据" />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {items.map((item) => (
              <button
                className="grid gap-4 rounded-[8px] border border-divider bg-background p-4 text-left transition-colors hover:border-input hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
                key={item.id}
                type="button"
                onClick={() => onOpenEvidence(item)}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-foreground">{item.label}</span>
                  <Badge variant="outline">{trendLabels[item.trend]}</Badge>
                </div>
                <div className="flex items-end justify-between gap-3">
                  <div className="text-3xl font-semibold tracking-normal text-foreground">
                    {item.count}
                  </div>
                  <div
                    className={cn(
                      "text-sm font-medium",
                      item.riskCount > 0 ? "text-destructive" : "text-success",
                    )}
                  >
                    风险 {item.riskCount}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function IntentPanel({
  items,
  maxIntentCount,
}: {
  items: Array<{ count: number; label: string; type: Exclude<InsightIntent, "all"> }>;
  maxIntentCount: number;
}) {
  return (
    <Card className="rounded-[8px] border-divider bg-surface-elevated shadow-none">
      <CardHeader className="flex-row items-center justify-between gap-4 p-4">
        <div>
          <CardTitle className="text-base">客户意图</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">售前转化和售后风险并列看</p>
        </div>
        <HugeiconsIcon
          className="text-primary"
          color="currentColor"
          icon={ChartBarIncreasingIcon}
          size={19}
          strokeWidth={1.8}
        />
      </CardHeader>
      <CardContent className="grid gap-3 px-4 pb-4">
        {items.length === 0 ? (
          <EmptyState label="暂无意图数据" />
        ) : (
          items.map((item) => (
            <div
              className="grid gap-3 rounded-[8px] border border-divider bg-background p-4"
              key={item.type}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-foreground">{item.label}</span>
                <span className="text-sm text-muted-foreground">{item.count} 个</span>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <Progress
                  aria-label={`${item.label} ${item.count}`}
                  className="h-2 bg-surface-muted"
                  value={(item.count / maxIntentCount) * 100}
                />
                <span className="text-xs text-muted-foreground">
                  {Math.round((item.count / maxIntentCount) * 100)}%
                </span>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function EvidenceSheet({
  item,
  onOpenChange,
}: {
  item: EvidenceDrawerState | null;
  onOpenChange: (isOpen: boolean) => void;
}) {
  return (
    <Sheet open={item !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-[min(92vw,36rem)] sm:max-w-xl">
        {item ? (
          <>
            <SheetHeader>
              <SheetTitle>{item.title}</SheetTitle>
              <SheetDescription>{item.description}</SheetDescription>
            </SheetHeader>
            <ScrollArea className="min-h-0 flex-1 px-6 pb-6">
              <div className="grid gap-4">
                <section className="grid gap-2 rounded-[8px] border border-primary/20 bg-primary/10 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                    <HugeiconsIcon
                      color="currentColor"
                      icon={Analytics01Icon}
                      size={16}
                      strokeWidth={1.8}
                    />
                    建议动作
                  </div>
                  <p className="text-sm leading-6 text-foreground">{item.action}</p>
                </section>

                <div className="flex flex-wrap gap-2">
                  {item.meta.map((meta) => (
                    <Badge key={meta} variant="outline">
                      {meta}
                    </Badge>
                  ))}
                </div>

                <section className="grid gap-3">
                  <h2 className="text-sm font-semibold text-foreground">原始证据</h2>
                  <div className="grid gap-3">
                    {item.evidence.map((message) => (
                      <div
                        className={cn(
                          "grid gap-1 rounded-[8px] border p-3",
                          message.senderType === "customer"
                            ? "border-warning/25 bg-warning-muted"
                            : "border-divider bg-surface-muted",
                        )}
                        key={message.id}
                      >
                        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {message.sender}
                          </span>
                          <span>{message.time}</span>
                        </div>
                        <p className="text-sm leading-6 text-foreground">
                          {message.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </ScrollArea>
            <SheetFooter>
              <Button asChild variant="outline">
                <Link to="/chat">打开会话</Link>
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function SummaryTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-[8px] border border-divider bg-background px-3 py-2">
      <div className="text-2xl font-semibold tracking-normal text-foreground">
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-28 items-center justify-center rounded-[8px] border border-dashed border-divider bg-background px-4 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function getQueueDrawerState(item: PriorityQueueItem): EvidenceDrawerState {
  return {
    action: item.action,
    description: item.summary,
    evidence: item.evidence,
    meta: [
      modeLabels[item.mode],
      item.intentLabel,
      item.productName,
      item.seatName,
      riskConfig[item.riskLevel].label,
    ],
    title: item.conversationName,
  };
}

function getProductDrawerState(product: ProductInsight): EvidenceDrawerState {
  return {
    action: product.faqOpportunity,
    description: `${product.name} 的主要问题是 ${product.topIssue}`,
    evidence: product.evidence,
    meta: [
      `咨询 ${product.mentionCount}`,
      `售后 ${product.afterSaleCount}`,
      `负面 ${product.negativeCount}`,
      `购买意向 ${product.purchaseIntentCount}`,
    ],
    title: product.name,
  };
}

function getAfterSaleDrawerState(item: AfterSaleInsight): EvidenceDrawerState {
  return {
    action: item.riskCount > 0 ? "优先处理带风险的售后会话" : "按标准售后流程快速闭环",
    description: `${item.label} 共 ${item.count} 单，风险 ${item.riskCount} 单`,
    evidence: item.evidence,
    meta: [`${item.count} 单`, `风险 ${item.riskCount}`, trendLabels[item.trend]],
    title: item.label,
  };
}

function formatFaqOpportunity(value: string) {
  return value.replace(/^补充/, "");
}
