import { useEffect, useMemo, useState } from "react";
import type { InsightsQualityResponse } from "@chatai/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getInsightQuality } from "./api/insights-service";
import { SeverityBadge } from "./insight-badges";
import { InsightDetailPanel } from "./insight-detail-panel";
import { InsightPerson } from "./insight-person";
import { InsightsLayout, InsightsPageHeader } from "./insights-layout";
import {
  formatInsightTime,
  formatResolutionStatus,
} from "./insights-utils";
import { useInsightDetail } from "./use-insight-detail";

type QualityView = "agent-report" | "problem-list";
type ProblemSession = InsightsQualityResponse["unresolvedSessions"][number];
type ResolutionFilter = "all" | ProblemSession["resolutionStatus"];

const qualityProblemPageSize = 10;

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
  const detail = useInsightDetail();

  useEffect(() => {
    const controller = new AbortController();

    setIsLoading(true);

    void getInsightQuality(
      {
        page: problemPage,
        pageSize: qualityProblemPageSize,
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
  }, [problemPage]);

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
        <InsightsPageHeader
          description="按咨询会话判断客户问题是否解决，辅助主管复核服务质量"
          title="服务质检"
        />
        <section className="rounded-[8px] border bg-background p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold">客户问题是否解决</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              只判断当前咨询会话内是否解决，作为主管辅助复核
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-7">
            <Stat label="咨询会话总数" value={overview?.totalSessions} />
            <Stat label="已分析会话数" value={overview?.analyzedSessions} />
            <Stat label="有客户问题" value={overview?.problemSessions} />
            <Stat label="已解决" value={overview?.resolved} />
            <Stat label="未解决" value={overview?.unresolved} tone="danger" />
            <Stat label="部分解决" value={overview?.partial} tone="warning" />
            <Stat label="无需客服处理" value={overview?.noCustomerProblem} />
          </div>
        </section>

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
        isOpen={detail.isOpen}
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
  const pageNumbers = buildPaginationNumbers(currentPage, totalPages);

  return (
    <div className="rounded-[8px] border bg-background">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <h2 className="text-base font-semibold">问题列表</h2>
        <Badge variant="outline">{total} 条</Badge>
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
                    <SeverityBadge severity={session.severity} />
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
          <div className="px-5 py-8 text-sm text-muted-foreground">
            暂无匹配的问题
          </div>
        )}
      </div>
      {totalPages > 1 ? (
        <div className="flex flex-col gap-3 border-t px-5 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            显示 {startRow}-{endRow} / 共 {total} 条
          </span>
          <div className="flex items-center gap-1">
            <Button
              className="h-8 rounded-[8px]"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
              size="sm"
              variant="outline"
            >
              上一页
            </Button>
            {pageNumbers.map((item, index) => item === "ellipsis" ? (
              <span className="px-2" key={`${item}-${index}`}>...</span>
            ) : (
              <Button
                className="h-8 min-w-8 rounded-[8px] px-2"
                key={item}
                onClick={() => onPageChange(item)}
                size="sm"
                variant={item === currentPage ? "default" : "outline"}
              >
                {item}
              </Button>
            ))}
            <Button
              className="h-8 rounded-[8px]"
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange(currentPage + 1)}
              size="sm"
              variant="outline"
            >
              下一页
            </Button>
          </div>
        </div>
      ) : null}
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
                className="px-5 py-8 text-sm text-muted-foreground"
                colSpan={6}
              >
                暂无客服统计数据
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function Stat({
  label,
  tone = "default",
  value,
}: {
  label: string;
  tone?: "danger" | "default" | "warning";
  value?: number;
}) {
  return (
    <div className="rounded-[8px] bg-muted/35 px-3 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={
          tone === "danger"
            ? "mt-1 text-xl font-semibold text-destructive"
            : tone === "warning"
              ? "mt-1 text-xl font-semibold text-amber-600"
              : "mt-1 text-xl font-semibold"
        }
      >
        {value ?? "-"}
      </div>
    </div>
  );
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return `${(value * 100).toFixed(2)}%`;
}

function buildPaginationNumbers(page: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, page - 1, page, page + 1].filter((item) => item >= 1 && item <= totalPages));
  const sorted = Array.from(pages).sort((left, right) => left - right);
  const result: Array<number | "ellipsis"> = [];

  for (const item of sorted) {
    const previous = result.at(-1);

    if (typeof previous === "number" && item - previous > 1) {
      result.push("ellipsis");
    }

    result.push(item);
  }

  return result;
}
