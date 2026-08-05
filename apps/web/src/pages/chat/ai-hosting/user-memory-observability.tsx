import type { AgentUserMemoryObservabilityRun, AgentUserMemoryObservabilitySummaryResponse, AgentUserMemoryObservabilityTenant, AgentUserMemoryRun, AgentUserMemoryTenantState } from "@chatai/contracts";
import { AlertCircleIcon, ChartAreaIcon, Clock01Icon, RefreshIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { resolveTablePagination, TablePagination } from "@/components/ui/table-pagination";
import { cn } from "@/lib/utils";
import { insightResolutionColors } from "../insights/insights-chart-palette";
import { useVisiblePolling } from "../insights/use-visible-polling";
import { getUserMemoryObservabilitySummary, listUserMemoryObservabilityRuns, listUserMemoryObservabilityTenants } from "./api/user-memory-service";

const PAGE_SIZE = 20;
const trendSeries = [
  { key: "successCount", label: "成功", color: insightResolutionColors.resolved },
  { key: "failureCount", label: "失败", color: insightResolutionColors.unresolved },
  { key: "skippedCount", label: "跳过", color: insightResolutionColors.unknown },
] as const;

export function UserMemoryObservability() {
  const [summary, setSummary] = useState<AgentUserMemoryObservabilitySummaryResponse>();
  const [tenantPage, setTenantPage] = useState<Awaited<ReturnType<typeof listUserMemoryObservabilityTenants>>>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [uid, setUid] = useState<number>();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [selectedUid, setSelectedUid] = useState<number>();
  const [tenantRuns, setTenantRuns] = useState<AgentUserMemoryRun[]>([]);
  const [tenantRunsNextCursor, setTenantRunsNextCursor] = useState<string>();
  const [tenantRunsLoading, setTenantRunsLoading] = useState(false);
  const [tenantRunsError, setTenantRunsError] = useState(false);
  const tenantRunsRequest = useRef<AbortController | undefined>(undefined);

  const load = useCallback(async ({ showLoading, signal }: { showLoading: boolean; signal: AbortSignal }) => {
    if (showLoading) setLoading(true);
    try {
      const [nextSummary, nextTenantPage] = await Promise.all([
        getUserMemoryObservabilitySummary({ signal }),
        listUserMemoryObservabilityTenants({ page, pageSize: PAGE_SIZE, uid }, { signal }),
      ]);
      if (!signal.aborted) {
        setSummary(nextSummary);
        setTenantPage(nextTenantPage);
        setError(false);
      }
    } catch {
      if (!signal.aborted) setError(true);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [page, uid]);

  useVisiblePolling({ enabled: true, intervalMs: 15_000, load, refreshKey: `${page}:${uid ?? ""}:${refreshVersion}` });

  function search() {
    const normalized = query.trim();
    const parsedUid = normalized ? Number(normalized) : undefined;
    if (normalized && (!/^[1-9]\d*$/.test(normalized) || !Number.isSafeInteger(parsedUid))) {
      toast.error("请输入正确的 UID");
      return;
    }
    setPage(1);
    setUid(parsedUid);
    setRefreshVersion((value) => value + 1);
  }

  async function loadTenantRuns(targetUid: number, cursor?: string, append = false) {
    tenantRunsRequest.current?.abort();
    const controller = new AbortController();
    tenantRunsRequest.current = controller;
    setTenantRunsLoading(true);
    if (!append) setTenantRuns([]);
    try {
      const result = await listUserMemoryObservabilityRuns(targetUid, { cursor, pageSize: PAGE_SIZE }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setTenantRuns((current) => append ? [...current, ...result.items] : result.items);
      setTenantRunsNextCursor(result.nextCursor);
      setTenantRunsError(false);
    } catch {
      if (!controller.signal.aborted) setTenantRunsError(true);
    } finally {
      if (!controller.signal.aborted) setTenantRunsLoading(false);
    }
  }

  function openTenantRuns(targetUid: number) {
    setSelectedUid(targetUid);
    void loadTenantRuns(targetUid);
  }

  function closeTenantRuns(open: boolean) {
    if (open) return;
    tenantRunsRequest.current?.abort();
    setSelectedUid(undefined);
    setTenantRuns([]);
    setTenantRunsNextCursor(undefined);
    setTenantRunsError(false);
    setTenantRunsLoading(false);
  }

  if (loading && !summary) return <Loading />;
  if (error && !summary) return <LoadError onRetry={() => setRefreshVersion((value) => value + 1)} />;

  const pagination = resolveTablePagination({ page: tenantPage?.page ?? page, pageSize: tenantPage?.pageSize ?? PAGE_SIZE, total: tenantPage?.total ?? 0 });

  return (
    <div className="space-y-5">
      {error ? <div className="rounded-[8px] border border-warning/30 bg-warning-muted/30 px-4 py-2.5 text-sm text-warning" role="status">刷新失败，当前展示上次结果</div> : null}
      <section aria-label="Worker 运行状态" className="overflow-hidden rounded-[8px] border bg-background">
        <div className={cn("h-0.5", summary?.worker.health === "healthy" && "bg-success", summary?.worker.health === "error" && "bg-warning", summary?.worker.health === "offline" && "bg-destructive")} />
        <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[8px] bg-muted text-muted-foreground"><HugeiconsIcon icon={Clock01Icon} size={18} /></span>
            <div><div className="flex items-center gap-2"><h2 className="text-sm font-semibold">用户记忆 Worker</h2><WorkerHealthBadge health={summary?.worker.health} /></div><p className="mt-1 text-xs text-muted-foreground">最近上报 {formatTimestamp(summary?.worker.reportedAt)}</p></div>
          </div>
          <div className="grid min-w-0 flex-1 gap-4 text-sm sm:grid-cols-2 lg:max-w-3xl lg:grid-cols-4">
            <StatusValue label="最近成功" value={formatTimestamp(summary?.worker.lastSuccessAt)} />
            <StatusValue label="最近失败" value={formatTimestamp(summary?.worker.lastFailureAt)} />
            <StatusValue label="Tick 耗时" value={formatDuration(summary?.worker.lastDurationMs)} />
            <StatusValue label="上报实例" mono value={summary?.worker.reportedBy ?? "—"} />
          </div>
          <Button aria-label="刷新运行观测" disabled={loading} onClick={() => setRefreshVersion((value) => value + 1)} size="icon" variant="outline">{loading ? <Spinner size={16} /> : <HugeiconsIcon icon={RefreshIcon} size={16} />}</Button>
        </div>
        {summary?.worker.lastErrorCode ? <div className="border-t px-4 py-2.5 text-xs text-destructive">{summary.worker.lastErrorCode}</div> : null}
      </section>

      <section aria-label="任务概览" className="grid overflow-hidden rounded-[8px] border bg-background sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="已开启租户" value={summary?.totals.enabledTenantCount} />
        <Metric detail={summary?.totals.oldestDueAt ? `最早 ${formatTimestamp(summary.totals.oldestDueAt)}` : undefined} label="待调度" value={summary?.totals.dueTenantCount} />
        <Metric label="调度延迟" value={summary?.totals.delayedTenantCount} warning={Boolean(summary?.totals.delayedTenantCount)} />
        <Metric detail={summary?.totals.oldestRunnableAt ? `最早 ${formatTimestamp(summary.totals.oldestRunnableAt)}` : undefined} label="当前运行" value={summary?.totals.activeRunCount} />
        <Metric label="租约过期" value={summary?.totals.expiredLeaseCount} warning={Boolean(summary?.totals.expiredLeaseCount)} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.5fr)]">
        <section className="flex min-h-[250px] flex-col rounded-[8px] border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><HugeiconsIcon className="text-muted-foreground" icon={ChartAreaIcon} size={18} /><h2 className="text-sm font-semibold">近 14 天处理趋势</h2></div><div className="flex gap-3 text-xs text-muted-foreground">{trendSeries.map((series) => <span className="flex items-center gap-1.5" key={series.key}><span className="size-2 rounded-full" style={{ backgroundColor: series.color }} />{series.label}</span>)}</div></div>
          <div className="mt-3 min-h-[190px] flex-1">{summary?.trend.length ? <ResponsiveContainer height="100%" width="100%"><AreaChart data={summary.trend} margin={{ bottom: 0, left: -16, right: 12, top: 8 }}><CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.45} vertical={false} /><XAxis axisLine={false} dataKey="date" fontSize={11} tickFormatter={(value) => String(value).slice(5)} tickLine={false} /><YAxis allowDecimals={false} axisLine={false} fontSize={11} tickLine={false} /><Tooltip content={<TrendTooltip />} />{trendSeries.map((series) => <Area dataKey={series.key} fill={series.color} fillOpacity={0.07} key={series.key} name={series.label} stroke={series.color} strokeWidth={2} type="monotone" />)}</AreaChart></ResponsiveContainer> : <Empty />}</div>
        </section>
        <section className="rounded-[8px] border bg-background p-4"><h2 className="text-sm font-semibold">近 24 小时</h2><div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4"><PeriodValue label="成功运行" value={summary?.last24Hours.succeededRunCount} /><PeriodValue label="部分成功" value={summary?.last24Hours.partialRunCount} /><PeriodValue label="失败运行" value={summary?.last24Hours.failedRunCount} /><PeriodValue label="取消运行" value={summary?.last24Hours.canceledRunCount} /><PeriodValue label="处理客户" value={summary?.last24Hours.selectedCustomerCount} /><PeriodValue label="成功客户" value={summary?.last24Hours.successCount} /><PeriodValue label="输入 Token" value={summary?.last24Hours.inputTokens} /><PeriodValue label="输出 Token" value={summary?.last24Hours.outputTokens} /></div></section>
      </div>

      <section className="overflow-hidden rounded-[8px] border bg-background">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-sm font-semibold">租户运行状态</h2><div className="flex w-full gap-2 sm:w-auto"><Input aria-label="搜索 UID" className="w-full sm:w-56" inputMode="numeric" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") search(); }} placeholder="输入 UID" value={query} /><Button aria-label="搜索" onClick={search} size="icon" variant="outline"><HugeiconsIcon icon={Search01Icon} size={16} /></Button></div></div>
        <div className="overflow-x-auto"><Table aria-label="用户记忆租户运行状态"><TableHeader><TableRow className="hover:bg-transparent"><TableHead>UID</TableHead><TableHead>状态</TableHead><TableHead>功能</TableHead><TableHead>下次运行</TableHead><TableHead>当前进度</TableHead><TableHead>最近结果</TableHead><TableHead>最近运行 Token</TableHead><TableHead>最近错误</TableHead></TableRow></TableHeader><TableBody>{loading && !tenantPage ? <TableRow><TableCell colSpan={8}><Loading compact /></TableCell></TableRow> : tenantPage?.items.length ? tenantPage.items.map((tenant) => <TenantRow key={tenant.uid} onShowRuns={openTenantRuns} tenant={tenant} />) : <TableRow><TableCell colSpan={8}><Empty /></TableCell></TableRow>}</TableBody></Table></div>
        {tenantPage ? <TablePagination className="px-4" itemLabel="个租户" onPageChange={setPage} page={pagination.activePage} total={tenantPage.total} totalPages={pagination.totalPages} /> : null}
      </section>
      <TenantRunsSheet
        error={tenantRunsError}
        loading={tenantRunsLoading}
        nextCursor={tenantRunsNextCursor}
        onLoadMore={() => selectedUid != null && void loadTenantRuns(selectedUid, tenantRunsNextCursor, true)}
        onOpenChange={closeTenantRuns}
        onRetry={() => selectedUid != null && void loadTenantRuns(selectedUid)}
        open={selectedUid != null}
        runs={tenantRuns}
        uid={selectedUid}
      />
    </div>
  );
}

function TenantRow({ onShowRuns, tenant }: { onShowRuns: (uid: number) => void; tenant: AgentUserMemoryObservabilityTenant }) {
  const run = tenant.activeRun ?? tenant.recentRun;
  const completed = run ? run.successCount + run.failureCount + run.skippedCount : 0;
  return <TableRow><TableCell><Button className="h-auto p-0 font-mono text-sm" onClick={() => onShowRuns(tenant.uid)} variant="link">{tenant.uid}</Button></TableCell><TableCell><TenantStateBadge state={tenant.state} /></TableCell><TableCell>{tenant.enabled ? "已开启" : "未开启"}</TableCell><TableCell className="whitespace-nowrap text-muted-foreground">{formatTimestamp(tenant.nextRunAt)}</TableCell><TableCell className="whitespace-nowrap">{tenant.activeRun ? `${completed} / ${tenant.activeRun.selectedCustomerCount}` : "—"}</TableCell><TableCell>{run ? <RunStatusBadge run={run} /> : "—"}</TableCell><TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{run ? formatInteger(run.inputTokens + run.outputTokens) : "—"}</TableCell><TableCell className="max-w-48"><span className={cn("block truncate text-xs", run?.lastErrorCode ? "text-destructive" : "text-muted-foreground")} title={run?.lastErrorCode}>{run?.lastErrorCode ?? "—"}</span></TableCell></TableRow>;
}

function TenantRunsSheet({ error, loading, nextCursor, onLoadMore, onOpenChange, onRetry, open, runs, uid }: { error: boolean; loading: boolean; nextCursor?: string; onLoadMore: () => void; onOpenChange: (open: boolean) => void; onRetry: () => void; open: boolean; runs: AgentUserMemoryRun[]; uid?: number }) {
  return <Sheet onOpenChange={onOpenChange} open={open}><SheetContent className="flex w-full flex-col overflow-hidden sm:max-w-[680px]"><SheetHeader><SheetTitle>UID {uid ?? "—"}</SheetTitle><SheetDescription>用户记忆运行记录</SheetDescription></SheetHeader><div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">{loading && runs.length === 0 ? <Loading compact /> : error && runs.length === 0 ? <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-sm text-muted-foreground"><span>加载失败</span><Button onClick={onRetry} variant="outline">重新加载</Button></div> : <>{error ? <div className="mb-3 rounded-[8px] border border-warning/30 bg-warning-muted/30 px-3 py-2 text-sm text-warning" role="status">加载更多失败，当前展示已有记录</div> : null}<div className="overflow-x-auto rounded-[8px] border"><Table aria-label={`UID ${uid ?? ""} 用户记忆运行记录`}><TableHeader><TableRow className="hover:bg-transparent"><TableHead>日期</TableHead><TableHead>客户数</TableHead><TableHead>记忆变更</TableHead><TableHead className="text-right">Token</TableHead></TableRow></TableHeader><TableBody>{runs.length ? runs.map((run) => <TableRow key={run.id}><TableCell className="whitespace-nowrap font-medium">{run.quotaDate}</TableCell><TableCell>{run.selectedCustomerCount}</TableCell><TableCell className="whitespace-nowrap">{runMemoryChangeLabel(run)}</TableCell><TableCell className="text-right tabular-nums text-muted-foreground">{formatInteger(run.inputTokens + run.outputTokens)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={4}><Empty /></TableCell></TableRow>}</TableBody></Table></div>{nextCursor ? <div className="mt-4 flex justify-center"><Button disabled={loading} onClick={onLoadMore} variant="outline">{loading ? <><Spinner size={16} /><span>正在加载</span></> : "加载更多"}</Button></div> : null}</>}</div></SheetContent></Sheet>;
}

function runMemoryChangeLabel(run: AgentUserMemoryRun) {
  if (run.memoryAddedCount != null && run.memoryUpdatedCount != null && run.memoryRemovedCount != null) {
    const total = run.memoryAddedCount + run.memoryUpdatedCount + run.memoryRemovedCount;
    return total === 0 ? "无变化" : `新增 ${run.memoryAddedCount} · 更新 ${run.memoryUpdatedCount} · 删除 ${run.memoryRemovedCount}`;
  }
  return ["pending", "running", "waiting"].includes(run.status) ? "处理中" : "暂无变更记录";
}

function TrendTooltip({ active, label, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-lg"><div className="font-medium">{String(label).replaceAll("-", "/")}</div><div className="mt-2 grid gap-1.5">{trendSeries.map((series) => <div className="flex items-center gap-2" key={series.key}><span className="size-2 rounded-full" style={{ backgroundColor: series.color }} /><span className="text-muted-foreground">{series.label}</span><span className="font-semibold tabular-nums">{Number(payload.find((item) => item.dataKey === series.key)?.value ?? 0)}</span></div>)}</div></div>;
}

function WorkerHealthBadge({ health }: { health?: AgentUserMemoryObservabilitySummaryResponse["worker"]["health"] }) { const labels = { healthy: "正常", error: "异常", offline: "离线" }; return <Badge variant="outline" className={cn(health === "healthy" && "border-success/30 text-success", health === "error" && "border-warning/30 text-warning", health === "offline" && "border-destructive/30 text-destructive")}>{health ? labels[health] : "未知"}</Badge>; }
function TenantStateBadge({ state }: { state: AgentUserMemoryTenantState }) { const labels: Record<AgentUserMemoryTenantState, string> = { normal: "正常", due: "待调度", running: "运行中", warning: "异常", disabled: "未开启" }; return <Badge variant="outline" className={cn(state === "normal" && "border-success/30 text-success", state === "warning" && "border-destructive/30 text-destructive", state === "due" && "border-warning/30 text-warning")}>{labels[state]}</Badge>; }
function RunStatusBadge({ run }: { run: AgentUserMemoryObservabilityRun }) { const labels: Record<AgentUserMemoryObservabilityRun["status"], string> = { pending: "待处理", running: "运行中", waiting: "等待结果", succeeded: "成功", partial: "部分成功", failed: "失败", canceled: "已取消" }; return <span className={cn("text-sm", run.status === "failed" && "text-destructive", run.status === "partial" && "text-warning", run.status === "succeeded" && "text-success")}>{labels[run.status]}</span>; }
function Metric({ detail, label, value, warning }: { detail?: string; label: string; value?: number; warning?: boolean }) { return <div className="border-b p-4 last:border-b-0 sm:border-r sm:[&:nth-child(even)]:border-r-0 xl:border-b-0 xl:[&:nth-child(even)]:border-r xl:last:border-r-0"><p className="text-xs text-muted-foreground">{label}</p><p className={cn("mt-2 text-2xl font-semibold tabular-nums", warning && "text-destructive")}>{value == null ? "—" : formatInteger(value)}</p>{detail ? <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p> : null}</div>; }
function PeriodValue({ label, value }: { label: string; value?: number }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-base font-medium tabular-nums">{value == null ? "—" : formatInteger(value)}</p></div>; }
function StatusValue({ label, mono, value }: { label: string; mono?: boolean; value: string }) { return <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className={cn("mt-1 truncate tabular-nums", mono && "font-mono text-xs")} title={value}>{value}</p></div>; }
function Loading({ compact = false }: { compact?: boolean }) { return <div className={cn("flex items-center justify-center gap-2 text-sm text-muted-foreground", compact ? "min-h-24" : "min-h-[360px]")} role="status"><Spinner size={18} /><span>正在加载</span></div>; }
function Empty() { return <div className="flex min-h-28 items-center justify-center text-sm text-muted-foreground">暂无数据</div>; }
function LoadError({ onRetry }: { onRetry: () => void }) { return <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-sm text-muted-foreground"><HugeiconsIcon icon={AlertCircleIcon} size={20} /><span>加载失败</span><Button onClick={onRetry} variant="outline">重试</Button></div>; }
function formatTimestamp(value?: number) { return value == null ? "—" : new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(value); }
function formatDuration(value?: number) { if (value == null) return "—"; if (value < 1000) return `${value} ms`; return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} s`; }
function formatInteger(value: number) { return new Intl.NumberFormat("zh-CN").format(value); }
