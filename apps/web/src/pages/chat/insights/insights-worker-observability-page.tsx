import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  InsightsWorkerPipelineRuntime,
  InsightsWorkerSummaryResponse,
  InsightsWorkerUidDetailResponse,
  InsightsWorkerUidListResponse,
  InsightsWorkerUidState,
} from "@chatai/contracts";
import {
  Refresh03Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
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
  getInsightsWorkerSummary,
  getInsightsWorkerUidDetail,
  getInsightsWorkerUids,
} from "./api/insights-service";
import { InsightTablePagination } from "./insight-table-pagination";
import { useInsightsCapabilities } from "./insights-capabilities-context";
import {
  InsightsLayout,
  InsightsPageHeader,
} from "./insights-layout";

const pageSize = 50;
const pipelineLabels = {
  analysis: "分析",
  discovery: "消息发现",
  sessionization: "会话切片",
} as const;
const stateOptions: Array<{
  label: string;
  value: InsightsWorkerUidState | "all";
}> = [
  { label: "全部状态", value: "all" },
  { label: "阻塞", value: "blocked" },
  { label: "错误", value: "error" },
  { label: "重试中", value: "retrying" },
  { label: "处理中", value: "processing" },
  { label: "排队中", value: "queued" },
  { label: "空闲", value: "idle" },
];

export function InsightsWorkerObservabilityPage() {
  const { capabilities } = useInsightsCapabilities();
  const [summary, setSummary] = useState<InsightsWorkerSummaryResponse>();
  const [uidPage, setUidPage] = useState<InsightsWorkerUidListResponse>();
  const [page, setPage] = useState(1);
  const [state, setState] = useState<InsightsWorkerUidState | "all">("all");
  const [uidInput, setUidInput] = useState("");
  const [uid, setUid] = useState<number>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [selectedUid, setSelectedUid] = useState<number>();
  const [detail, setDetail] = useState<InsightsWorkerUidDetailResponse>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const canView = capabilities.canViewWorkerObservability;

  const refresh = useCallback(() => {
    setRefreshVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [state, uid]);

  useEffect(() => {
    if (!canView) {
      return;
    }

    const controller = new AbortController();
    let inFlight = false;
    const load = async (showLoading: boolean) => {
      if (inFlight || document.visibilityState !== "visible") {
        return;
      }
      inFlight = true;
      if (showLoading) {
        setLoading(true);
      }
      try {
        const [nextSummary, nextPage] = await Promise.all([
          getInsightsWorkerSummary({ signal: controller.signal }),
          getInsightsWorkerUids({
            page,
            pageSize,
            state: state === "all" ? undefined : state,
            uid,
          }, { signal: controller.signal }),
        ]);
        if (!controller.signal.aborted) {
          setSummary(nextSummary);
          setUidPage(nextPage);
          setError(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setError(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
        inFlight = false;
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void load(false);
      }
    };

    void load(true);
    const timer = window.setInterval(() => {
      void load(false);
    }, 30_000);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [canView, page, refreshVersion, state, uid]);

  useEffect(() => {
    if (!canView || selectedUid == null) {
      setDetail(undefined);
      setDetailError(false);
      return;
    }

    setDetail(undefined);
    setDetailError(false);
    const controller = new AbortController();
    let inFlight = false;
    const load = async (showLoading: boolean) => {
      if (inFlight || document.visibilityState !== "visible") {
        return;
      }
      inFlight = true;
      if (showLoading) {
        setDetailLoading(true);
      }
      try {
        const nextDetail = await getInsightsWorkerUidDetail(selectedUid, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setDetail(nextDetail);
          setDetailError(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setDetailError(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setDetailLoading(false);
        }
        inFlight = false;
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void load(false);
      }
    };

    void load(true);
    const timer = window.setInterval(() => {
      void load(false);
    }, 15_000);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [canView, refreshVersion, selectedUid]);

  if (!canView) {
    return (
      <InsightsLayout title="运行观测">
        <div className="flex min-h-[420px] items-center justify-center">
          <div className="max-w-sm text-center">
            <h1 className="text-lg font-semibold">无权查看运行观测</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              该页面仅向平台观测账号开放
            </p>
          </div>
        </div>
      </InsightsLayout>
    );
  }

  const items = uidPage?.items ?? [];
  const startRow = uidPage && uidPage.total > 0
    ? (uidPage.page - 1) * uidPage.pageSize + 1
    : 0;
  const endRow = uidPage
    ? Math.min(uidPage.page * uidPage.pageSize, uidPage.total)
    : 0;

  return (
    <InsightsLayout canViewWorkerObservability title="运行观测">
      <div className="space-y-5">
        <InsightsPageHeader
          actions={(
            <Button
              aria-label="刷新运行观测"
              disabled={loading}
              onClick={refresh}
              variant="outline"
            >
              {loading ? (
                <Spinner size={16} variant="classic" />
              ) : (
                <HugeiconsIcon icon={Refresh03Icon} size={17} />
              )}
              刷新
            </Button>
          )}
          description="跨租户查看消息发现、会话切片和分析任务的当前推进状态"
          title="运行观测"
        />

        {error && (summary || uidPage) ? (
          <div
            className="rounded-[8px] border border-warning/30 bg-warning-muted/30 px-4 py-2.5 text-sm text-warning"
            role="status"
          >
            刷新失败，当前展示上次结果
          </div>
        ) : null}

        {error && !summary ? (
          <LoadError onRetry={refresh} />
        ) : (
          <>
            <PipelineRail
              loading={loading && !summary}
              pipelines={summary?.pipelines ?? []}
            />
            <GlobalSummary loading={loading && !summary} summary={summary} />
          </>
        )}

        <section className="overflow-hidden rounded-[8px] border bg-background">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">UID 推进状态</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                已进入会话切片或洞察链路的租户
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const parsed = Number(uidInput.trim());
                  setUid(Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined);
                }}
              >
                <div className="relative">
                  <HugeiconsIcon
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    icon={Search01Icon}
                    size={15}
                  />
                  <Input
                    aria-label="搜索 UID"
                    className="h-9 w-44 pl-9"
                    inputMode="numeric"
                    onChange={(event) => setUidInput(event.target.value)}
                    placeholder="输入 UID"
                    value={uidInput}
                  />
                </div>
                <Button className="h-9" type="submit" variant="outline">
                  查询
                </Button>
                {uid != null ? (
                  <Button
                    className="h-9"
                    onClick={() => {
                      setUid(undefined);
                      setUidInput("");
                    }}
                    type="button"
                    variant="ghost"
                  >
                    清除
                  </Button>
                ) : null}
              </form>
              <Select
                onValueChange={(value) => setState(value as typeof state)}
                value={state}
              >
                <SelectTrigger aria-label="筛选运行状态" className="h-9 w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stateOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>UID</TableHead>
                  <TableHead>综合状态</TableHead>
                  <TableHead>切片任务</TableHead>
                  <TableHead>分析任务</TableHead>
                  <TableHead>会话</TableHead>
                  <TableHead>切片水位</TableHead>
                  <TableHead>最近错误</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && !uidPage ? (
                  <TableRow>
                    <TableCell className="py-12 text-center" colSpan={7}>
                      <div
                        className="inline-flex items-center gap-2 text-sm text-muted-foreground"
                        role="status"
                      >
                        <Spinner size={18} variant="classic" />
                        <span>正在加载</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : error && !uidPage ? (
                  <TableRow>
                    <TableCell className="py-12 text-center text-sm text-destructive" colSpan={7}>
                      数据加载失败
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell className="py-12 text-center text-sm text-muted-foreground" colSpan={7}>
                      暂无数据
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item.uid}>
                      <TableCell>
                        <Button
                          className="h-auto p-0 font-mono text-sm"
                          onClick={() => setSelectedUid(item.uid)}
                          variant="link"
                        >
                          {item.uid}
                        </Button>
                      </TableCell>
                      <TableCell><StateBadge state={item.overallState} /></TableCell>
                      <TableCell>
                        <StateWithAge
                          ageMs={item.sessionization.queueAgeMs}
                          state={item.sessionization.state}
                        />
                      </TableCell>
                      <TableCell>
                        <StateWithAge
                          ageMs={item.analysis.queueAgeMs}
                          state={item.analysis.state}
                        />
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {item.sessions.open} 进行中
                        {item.sessions.overdue > 0 ? ` · ${item.sessions.overdue} 超期` : ""}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {item.cursor?.cursorAuditId ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-48">
                        {item.recentError ? (
                          <div className="truncate text-xs text-destructive" title={item.recentError.errorCode}>
                            {item.recentError.errorCode}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {uidPage ? (
            <InsightTablePagination
              className="border-t px-4 py-3"
              endRow={endRow}
              itemLabel="个 UID"
              onPageChange={setPage}
              page={uidPage.page}
              startRow={startRow}
              total={uidPage.total}
              totalPages={uidPage.totalPages}
            />
          ) : null}
        </section>
      </div>

      <UidDetailSheet
        detail={detail}
        error={detailError}
        loading={detailLoading}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedUid(undefined);
          }
        }}
        onRefresh={refresh}
        open={selectedUid != null}
        uid={selectedUid}
      />
    </InsightsLayout>
  );
}

function PipelineRail({
  loading,
  pipelines,
}: {
  loading: boolean;
  pipelines: InsightsWorkerPipelineRuntime[];
}) {
  const byPipeline = useMemo(
    () => new Map(pipelines.map((pipeline) => [pipeline.pipeline, pipeline])),
    [pipelines],
  );

  return (
    <section aria-label="Worker 管线状态" className="grid overflow-hidden rounded-[8px] border bg-background md:grid-cols-3">
      {(["discovery", "sessionization", "analysis"] as const).map((pipelineName) => {
        const pipeline = byPipeline.get(pipelineName);
        return (
          <div
            className="relative min-h-28 border-b p-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
            key={pipelineName}
          >
            <div
              className={cn(
                "absolute inset-x-0 top-0 h-0.5",
                pipeline?.health === "healthy" && "bg-success",
                pipeline?.health === "degraded" && "bg-warning",
                pipeline?.health === "offline" && "bg-destructive",
                (!pipeline || pipeline.health === "unknown") && "bg-muted-foreground/35",
              )}
            />
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <Spinner size={18} variant="classic" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">{pipelineLabels[pipelineName]}</h2>
                  <PipelineHealthBadge pipeline={pipeline} />
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  最近成功
                </p>
                <p className="mt-1 text-sm tabular-nums">
                  {formatTimestamp(pipeline?.lastSuccessAt)}
                </p>
                {pipeline?.activity === "possibly_stalled" ? (
                  <div className="mt-2 space-y-1 text-xs">
                    <p className="text-warning">
                      可能长时间运行（聚合判断）
                    </p>
                    <p className="text-muted-foreground">
                      开始 {formatTimestamp(pipeline.lastStartedAt)}
                      {" · "}
                      已运行 {formatDuration(pipeline.runningDurationMs ?? 0)}
                    </p>
                    <p className="truncate text-muted-foreground" title={pipeline.reportedBy}>
                      最近上报 {pipeline.reportedBy ?? "—"}
                    </p>
                  </div>
                ) : null}
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}

function GlobalSummary({
  loading,
  summary,
}: {
  loading: boolean;
  summary?: InsightsWorkerSummaryResponse;
}) {
  const cards = [
    {
      label: "发现位置差",
      value: summary?.discovery.auditIdGap == null
        ? "—"
        : formatInteger(summary.discovery.auditIdGap),
      detail: !summary
        ? "—"
        : summary.discovery.hasBacklog
          ? "仍有待发现位置"
          : "已到 source head",
    },
    {
      label: "切片任务",
      value: summary
        ? formatInteger(
            summary.sessionizationJobs.pending
            + summary.sessionizationJobs.running
            + summary.sessionizationJobs.retrying,
          )
        : "—",
      detail: summary
        ? `${summary.sessionizationJobs.expiredLease} 个租约过期`
        : "—",
    },
    {
      label: "超期会话",
      value: summary ? formatInteger(summary.sessions.overdue) : "—",
      detail: summary ? `${summary.sessions.open} 个进行中会话` : "—",
    },
    {
      label: "分析任务",
      value: summary
        ? formatInteger(
            summary.analysisJobs.pending
            + summary.analysisJobs.running
            + summary.analysisJobs.retrying,
          )
        : "—",
      detail: summary
        ? `${summary.analysisJobs.failedLast24h} 个近 24 小时失败`
        : "—",
    },
    {
      label: "观测 UID",
      value: summary ? formatInteger(summary.observedUids.total) : "—",
      detail: summary
        ? `${summary.observedUids.blocked} 阻塞 · ${summary.observedUids.error} 错误`
        : "—",
    },
  ];

  return (
    <section aria-label="全局推进摘要" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <div className="rounded-[8px] border bg-background p-4" key={card.label}>
          <p className="text-xs text-muted-foreground">{card.label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {loading ? "—" : card.value}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{card.detail}</p>
        </div>
      ))}
    </section>
  );
}

function PipelineHealthBadge({
  pipeline,
}: {
  pipeline?: InsightsWorkerPipelineRuntime;
}) {
  const label = pipeline?.health === "healthy"
    ? "正常"
    : pipeline?.health === "degraded"
      ? "降级"
      : pipeline?.health === "offline"
        ? "离线"
        : "未知";

  return (
    <Badge
      className={cn(
        "rounded-[6px] px-2 py-0.5",
        pipeline?.health === "healthy" && "bg-success/10 text-success",
        pipeline?.health === "degraded" && "bg-warning-muted/55 text-warning",
        pipeline?.health === "offline" && "bg-destructive/10 text-destructive",
      )}
      variant="secondary"
    >
      {label}
    </Badge>
  );
}

function StateWithAge({
  ageMs,
  state,
}: {
  ageMs: number;
  state: InsightsWorkerUidState;
}) {
  return (
    <div className="flex flex-col items-start gap-1">
      <StateBadge state={state} />
      {state === "queued" && ageMs > 0 ? (
        <span className="text-xs text-muted-foreground">
          已等待 {formatDuration(ageMs)}
        </span>
      ) : null}
    </div>
  );
}

function StateBadge({ state }: { state: InsightsWorkerUidState }) {
  const labels: Record<InsightsWorkerUidState, string> = {
    blocked: "阻塞",
    error: "错误",
    idle: "空闲",
    processing: "处理中",
    queued: "排队中",
    retrying: "重试中",
  };

  return (
    <Badge
      className={cn(
        "rounded-[6px] px-2 py-0.5",
        state === "blocked" && "bg-destructive/10 text-destructive",
        state === "error" && "bg-destructive/10 text-destructive",
        state === "retrying" && "bg-warning-muted/55 text-warning",
        state === "processing" && "bg-primary/10 text-primary",
        state === "queued" && "bg-muted text-muted-foreground",
        state === "idle" && "bg-success/10 text-success",
      )}
      variant="secondary"
    >
      {labels[state]}
    </Badge>
  );
}

function UidDetailSheet({
  detail,
  error,
  loading,
  onOpenChange,
  onRefresh,
  open,
  uid,
}: {
  detail?: InsightsWorkerUidDetailResponse;
  error: boolean;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void;
  open: boolean;
  uid?: number;
}) {
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <div className="flex items-center justify-between gap-3 pr-8">
            <SheetTitle>UID {uid ?? "—"}</SheetTitle>
            <Button
              aria-label="刷新 UID 详情"
              disabled={loading}
              onClick={onRefresh}
              size="icon"
              variant="ghost"
            >
              {loading ? (
                <Spinner size={16} variant="classic" />
              ) : (
                <HugeiconsIcon icon={Refresh03Icon} size={17} />
              )}
            </Button>
          </div>
          <SheetDescription>当前水位、会话与分析推进详情</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-6 pb-8">
          {loading && !detail ? (
            <div className="flex min-h-48 items-center justify-center" role="status">
              <Spinner size={20} variant="classic" />
              <span className="ml-2 text-sm text-muted-foreground">正在加载</span>
            </div>
          ) : error && !detail ? (
            <div className="py-12 text-center text-sm text-destructive">
              详情加载失败
            </div>
          ) : detail ? (
            <>
              {error ? (
                <div
                  className="rounded-[8px] border border-warning/30 bg-warning-muted/30 px-3 py-2 text-sm text-warning"
                  role="status"
                >
                  详情刷新失败，当前展示上次结果
                </div>
              ) : null}
              <DetailSection title="当前状态">
                <DetailGrid rows={[
                  ["综合状态", <StateBadge key="overall" state={detail.overallState} />],
                  ["切片任务", <StateBadge key="sessionization" state={detail.sessionization.state} />],
                  ["分析任务", <StateBadge key="analysis" state={detail.analysis.state} />],
                  ["观测时间", formatTimestamp(detail.observedAt)],
                  ["切片任务 ID", detail.sessionization.jobId ?? "—"],
                  ["切片执行时间", formatTimestamp(detail.sessionization.runAfter)],
                  ["切片租约到期", formatTimestamp(detail.sessionization.leaseUntil)],
                  [
                    "切片尝试次数",
                    detail.sessionization.attempt == null
                      ? "—"
                      : `${detail.sessionization.attempt} / ${detail.sessionization.maxAttempts ?? "—"}`,
                  ],
                  ["切片排队时长", formatOptionalDuration(detail.sessionization.queueAgeMs)],
                  [
                    "分析任务数",
                    `${detail.analysis.processing} 处理中 · ${detail.analysis.pending} 排队 · ${detail.analysis.retrying} 重试`,
                  ],
                  ["分析排队时长", formatOptionalDuration(detail.analysis.queueAgeMs)],
                  ["分析近 24 小时失败", detail.analysis.failedLast24h],
                ]} />
              </DetailSection>

              <DetailSection title="水位与消息源">
                <DetailGrid rows={[
                  ["切片水位", detail.cursor?.cursorAuditId ?? "—"],
                  ["水位消息时间", formatTimestamp(detail.cursor?.cursorMsgtime)],
                  ["UID source head", detail.sourceHead?.auditId ?? "—"],
                  ["水位后仍有消息", detail.hasPendingMessages == null ? "未知" : detail.hasPendingMessages ? "是" : "否"],
                ]} />
              </DetailSection>

              <DetailSection title="会话">
                <DetailGrid rows={[
                  ["进行中", detail.sessions.open],
                  ["超期", detail.sessions.overdue],
                  ["最早关闭检查", formatTimestamp(detail.sessions.earliestNextCloseAt)],
                ]} />
                <div className="mt-3 divide-y rounded-[8px] border">
                  {detail.recentSessions.length === 0 ? (
                    <p className="px-3 py-5 text-center text-sm text-muted-foreground">暂无数据</p>
                  ) : detail.recentSessions.map((session) => (
                    <div className="px-3 py-2.5 text-xs" key={session.sessionId}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono">{session.sessionId}</span>
                        <span className="text-muted-foreground">{session.status}</span>
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {formatTimestamp(session.startedAt)} → {formatTimestamp(session.endedAt)}
                      </p>
                    </div>
                  ))}
                </div>
              </DetailSection>

              <DetailSection title="最近分析运行">
                <div className="divide-y rounded-[8px] border">
                  {detail.recentAnalysisRuns.length === 0 ? (
                    <p className="px-3 py-5 text-center text-sm text-muted-foreground">暂无数据</p>
                  ) : detail.recentAnalysisRuns.map((run) => (
                    <div className="px-3 py-2.5 text-xs" key={run.runId}>
                      <div className="flex items-center justify-between gap-3">
                        <span>{run.mode} · {run.analysisScope}</span>
                        <span className={run.status === "failed" ? "text-destructive" : "text-muted-foreground"}>
                          {run.status}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-muted-foreground">
                        run {run.runId} · session {run.sessionId}
                      </p>
                    </div>
                  ))}
                </div>
              </DetailSection>

              <DetailSection title="最近错误">
                <div className="divide-y rounded-[8px] border">
                  {detail.recentErrors.length === 0 ? (
                    <p className="px-3 py-5 text-center text-sm text-muted-foreground">暂无错误</p>
                  ) : detail.recentErrors.map((item) => (
                    <div className="px-3 py-2.5 text-xs" key={`${item.jobId}:${item.occurredAt}`}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-destructive">{item.errorCode}</span>
                        <span className="text-muted-foreground">{formatTimestamp(item.occurredAt)}</span>
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {item.jobType} · job {item.jobId}
                      </p>
                    </div>
                  ))}
                </div>
              </DetailSection>

              <DetailSection title="最近重刷">
                <div className="divide-y rounded-[8px] border">
                  {detail.recentRescans.length === 0 ? (
                    <p className="px-3 py-5 text-center text-sm text-muted-foreground">暂无数据</p>
                  ) : detail.recentRescans.map((item) => (
                    <div className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs" key={item.taskId}>
                      <span>{item.analysisScope} · {item.status}</span>
                      <span className="text-muted-foreground">{formatTimestamp(item.updateTime)}</span>
                    </div>
                  ))}
                </div>
              </DetailSection>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function DetailGrid({
  rows,
}: {
  rows: Array<[string, ReactNode]>;
}) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border bg-border">
      {rows.map(([label, value]) => (
        <div className="bg-background p-3" key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-sm tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-[8px] border border-destructive/20 bg-destructive/5 px-5 py-8 text-center">
      <p className="text-sm text-destructive">运行状态加载失败</p>
      <Button className="mt-4" onClick={onRetry} variant="outline">
        重试
      </Button>
    </div>
  );
}

function formatTimestamp(value: number | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
  });
}

function formatDuration(value: number) {
  if (value < 60_000) {
    return `${Math.max(1, Math.round(value / 1_000))} 秒`;
  }
  if (value < 60 * 60_000) {
    return `${Math.round(value / 60_000)} 分钟`;
  }
  return `${Math.round(value / (60 * 60_000))} 小时`;
}

function formatOptionalDuration(value: number) {
  return value > 0 ? formatDuration(value) : "—";
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}
