import type {
  WorkflowObservabilityHealth,
  WorkflowObservabilityListState,
  WorkflowObservabilityRole,
  WorkflowObservabilitySummaryResponse,
  WorkflowObservabilityTaskDistribution,
  WorkflowObservabilityTransition,
  WorkflowObservabilityWorkflowDetailResponse,
  WorkflowObservabilityWorkflowItem,
  WorkflowObservabilityWorkflowListResponse,
  WorkflowRuntimeStatus,
} from "@chatai/contracts";
import {
  AlertCircleIcon,
  RefreshIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  resolveTablePagination,
  TablePagination,
} from "@/components/ui/table-pagination";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { RequestNormalizedError } from "@/lib/request";
import { useVisiblePolling } from "../insights/use-visible-polling";
import {
  AiHostingLayout,
  AiHostingPageHeader,
} from "../ai-hosting/ai-hosting-layout";
import {
  getWorkflowObservabilityDetail,
  getWorkflowObservabilitySummary,
  listWorkflowObservabilityWorkflows,
} from "./workflow-observability-api";

const PAGE_SIZE = 20;
const stateFilters: Array<{ label: string; value: WorkflowObservabilityListState }> = [
  { label: "全部", value: "all" },
  { label: "有积压", value: "backlog" },
  { label: "迁移中", value: "transitioning" },
  { label: "迁移失败", value: "dead" },
];
const roleLabels: Record<WorkflowObservabilityRole, string> = {
  scheduler: "调度",
  "task-consumer": "Task 消费",
  "entry-consumer": "入口消费",
  inference: "推理",
  outbox: "投递",
  reconciler: "对账",
};
const healthLabels: Record<WorkflowObservabilityHealth, string> = {
  healthy: "正常",
  degraded: "异常",
  offline: "离线",
  unknown: "未知",
};
const runtimeLabels: Record<WorkflowRuntimeStatus, string> = {
  inactive: "未启用",
  active: "运行中",
  paused: "已暂停",
  stopped: "已停止",
};
const taskStatusLabels: Record<keyof WorkflowObservabilityTaskDistribution, string> = {
  pending: "待调度",
  suspended: "已暂停",
  waiting_external: "等待外部",
  leased: "已租约",
  dispatched: "已派发",
  running: "运行中",
  completed: "已完成",
  cancelled: "已取消",
  dead: "失败",
};
const taskStatusOrder = Object.keys(taskStatusLabels) as Array<keyof WorkflowObservabilityTaskDistribution>;

export function WorkflowObservabilityPage() {
  const [summary, setSummary] = useState<WorkflowObservabilitySummaryResponse>();
  const [list, setList] = useState<WorkflowObservabilityWorkflowListResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<WorkflowObservabilityListState>("all");
  const [uidInput, setUidInput] = useState("");
  const [workflowIdInput, setWorkflowIdInput] = useState("");
  const [uid, setUid] = useState<number>();
  const [workflowId, setWorkflowId] = useState<string>();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [selectedItem, setSelectedItem] = useState<WorkflowObservabilityWorkflowItem>();
  const [detail, setDetail] = useState<WorkflowObservabilityWorkflowDetailResponse>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [detailRefreshVersion, setDetailRefreshVersion] = useState(0);

  const load = useCallback(async ({
    showLoading,
    signal,
  }: {
    showLoading: boolean;
    signal: AbortSignal;
  }) => {
    if (showLoading) setLoading(true);
    try {
      const [nextSummary, nextList] = await Promise.all([
        getWorkflowObservabilitySummary({ signal }),
        listWorkflowObservabilityWorkflows({
          page,
          pageSize: PAGE_SIZE,
          state,
          uid,
          workflowId,
        }, { signal }),
      ]);
      if (!signal.aborted) {
        setSummary(nextSummary);
        setList(nextList);
        setError(false);
        setForbidden(false);
        if (page > nextList.totalPages) {
          setPage(Math.max(1, nextList.totalPages));
        }
      }
    } catch (caught) {
      if (signal.aborted) return;
      if (caught instanceof RequestNormalizedError && caught.status === 403) {
        setForbidden(true);
        setError(false);
        return;
      }
      setError(true);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [page, state, uid, workflowId]);

  useVisiblePolling({
    enabled: !forbidden,
    intervalMs: 15_000,
    load,
    refreshKey: `${page}:${state}:${uid ?? ""}:${workflowId ?? ""}:${refreshVersion}`,
  });

  const selectedWorkflowId = selectedItem?.workflowId;
  const loadDetail = useCallback(async ({
    showLoading,
    signal,
  }: {
    showLoading: boolean;
    signal: AbortSignal;
  }) => {
    if (!selectedWorkflowId) return;
    if (showLoading) setDetailLoading(true);
    try {
      const nextDetail = await getWorkflowObservabilityDetail(selectedWorkflowId, { signal });
      if (!signal.aborted) {
        setDetail(nextDetail);
        setDetailError(false);
      }
    } catch {
      if (!signal.aborted) setDetailError(true);
    } finally {
      if (!signal.aborted) setDetailLoading(false);
    }
  }, [selectedWorkflowId]);

  useVisiblePolling({
    enabled: !forbidden && selectedWorkflowId != null,
    intervalMs: 15_000,
    load: loadDetail,
    refreshKey: `${selectedWorkflowId ?? ""}:${detailRefreshVersion}`,
  });

  function openDetail(item: WorkflowObservabilityWorkflowItem) {
    if (selectedItem?.workflowId !== item.workflowId) {
      setDetail(undefined);
      setDetailError(false);
    }
    setSelectedItem(item);
  }

  function closeDetail(open: boolean) {
    if (open) return;
    setSelectedItem(undefined);
    setDetail(undefined);
    setDetailError(false);
    setDetailLoading(false);
  }

  function search() {
    const nextUid = parsePositiveInteger(uidInput, "请输入正确的 UID");
    if (nextUid === false) return;
    const nextWorkflowId = parseWorkflowId(workflowIdInput);
    if (nextWorkflowId === false) return;
    setPage(1);
    setUid(nextUid);
    setWorkflowId(nextWorkflowId);
    setRefreshVersion((value) => value + 1);
  }

  if (forbidden) {
    return (
      <AiHostingLayout title="运行观测">
        <div className="flex min-h-[420px] items-center justify-center">
          <div className="max-w-sm text-center">
            <h1 className="text-lg font-semibold">无权查看运行观测</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">该页面仅向平台观测账号开放</p>
          </div>
        </div>
      </AiHostingLayout>
    );
  }

  if (loading && !summary) {
    return (
      <AiHostingLayout title="运行观测">
        <Loading />
      </AiHostingLayout>
    );
  }
  if (error && !summary) {
    return (
      <AiHostingLayout title="运行观测">
        <LoadError onRetry={() => setRefreshVersion((value) => value + 1)} />
      </AiHostingLayout>
    );
  }

  const pagination = resolveTablePagination({
    page: list?.page ?? page,
    pageSize: list?.pageSize ?? PAGE_SIZE,
    total: list?.total ?? 0,
  });

  return (
    <AiHostingLayout title="运行观测">
      <div className="space-y-5">
        {error ? (
          <div className="rounded-[8px] border border-warning/30 bg-warning-muted/30 px-4 py-2.5 text-sm text-warning" role="status">
            刷新失败，当前展示上次结果
          </div>
        ) : null}

        <AiHostingPageHeader
          actions={(
            <div className="flex items-center gap-2">
              <Button asChild variant="outline">
                <Link to="/chat/workflows">返回工作流</Link>
              </Button>
              <Button
                aria-label="刷新运行观测"
                disabled={loading}
                onClick={() => setRefreshVersion((value) => value + 1)}
                size="icon"
                variant="outline"
              >
                {loading ? <Spinner size={16} /> : <HugeiconsIcon icon={RefreshIcon} size={16} />}
              </Button>
            </div>
          )}
          description="跨租户查看调度、队列和迁移状态"
          title="运行观测"
        />

        {summary && summary.deadTransitionCount > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="status">
            <span>{summary.deadTransitionCount} 个暂停或恢复请求已失败</span>
            <Button
              onClick={() => {
                setState("dead");
                setPage(1);
              }}
              size="sm"
              variant="outline"
            >
              查看迁移失败
            </Button>
          </div>
        ) : null}

        <section aria-label="Worker 角色健康" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {summary?.workers.map((worker) => (
            <article className="overflow-hidden rounded-[8px] border bg-background" key={worker.role}>
              <div className={cn(
                "h-0.5",
                worker.health === "healthy" && "bg-success",
                worker.health === "degraded" && "bg-warning",
                worker.health === "offline" && "bg-destructive",
                worker.health === "unknown" && "bg-muted",
              )} />
              <div className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">{roleLabels[worker.role]}</h2>
                  <HealthBadge health={worker.health} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <StatusValue label="最近成功" value={formatTimestamp(worker.lastSuccessAt)} />
                  <StatusValue label="最近失败" value={formatTimestamp(worker.lastFailureAt)} />
                  <StatusValue label="迭代耗时" value={formatDuration(worker.lastDurationMs)} />
                  <StatusValue label="上报实例" mono value={worker.reportedBy ?? "—"} />
                </div>
                {worker.lastErrorCode ? (
                  <p className="truncate text-xs text-destructive" title={worker.lastErrorCode}>{worker.lastErrorCode}</p>
                ) : null}
              </div>
            </article>
          ))}
        </section>

        <section aria-label="队列指标" className="grid overflow-hidden rounded-[8px] border bg-background sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            detail={summary?.tasks.oldestDueAt ? `最早 ${formatTimestamp(summary.tasks.oldestDueAt)}` : undefined}
            label="到期积压"
            value={summary?.tasks.dueBacklog}
            warning={Boolean(summary?.tasks.dueBacklog)}
          />
          <Metric label="租约过期" value={summary?.tasks.expiredLease} warning={Boolean(summary?.tasks.expiredLease)} />
          <Metric label="派发滞留" value={summary?.tasks.stalledDispatched} warning={Boolean(summary?.tasks.stalledDispatched)} />
          <Metric
            detail={summary?.transitions.dead ? `失败 ${formatInteger(summary.transitions.dead)}` : undefined}
            label="迁移中"
            value={summary ? summary.transitions.pending + summary.transitions.leased : undefined}
            warning={Boolean(summary?.transitions.dead)}
          />
          <Metric
            detail={summary?.outbox.oldestPendingAt ? `最早 ${formatTimestamp(summary.outbox.oldestPendingAt)}` : undefined}
            label="Outbox 积压"
            value={summary?.outbox.pending}
          />
          <Metric label="推理等待" value={summary ? summary.inference.pending + summary.inference.retryWait : undefined} />
          <Metric label="推理租约过期" value={summary?.inference.expiredLease} warning={Boolean(summary?.inference.expiredLease)} />
          <Metric label="运行中 Task" value={summary?.tasks.running} />
        </section>

        <section className="overflow-hidden rounded-[8px] border bg-background">
          <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
            <Tabs
              onValueChange={(value) => {
                setState(value as WorkflowObservabilityListState);
                setPage(1);
              }}
              value={state}
            >
              <TabsList className="h-10 rounded-[8px] bg-muted p-1">
                {stateFilters.map((filter) => (
                  <TabsTrigger
                    className="h-8 rounded-[6px] px-3 py-0 text-sm"
                    key={filter.value}
                    value={filter.value}
                  >
                    {filter.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="flex w-full flex-wrap gap-2 lg:w-auto">
              <Input
                aria-label="搜索 UID"
                className="w-full sm:w-36"
                inputMode="numeric"
                onChange={(event) => setUidInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") search();
                }}
                placeholder="UID"
                value={uidInput}
              />
              <Input
                aria-label="搜索 Workflow ID"
                className="w-full sm:w-40"
                inputMode="numeric"
                onChange={(event) => setWorkflowIdInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") search();
                }}
                placeholder="Workflow ID"
                value={workflowIdInput}
              />
              <Button aria-label="搜索" onClick={search} size="icon" variant="outline">
                <HugeiconsIcon icon={Search01Icon} size={16} />
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table aria-label="Workflow 运行状态">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>UID</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead>运行状态</TableHead>
                  <TableHead>到期积压</TableHead>
                  <TableHead>活动 Task</TableHead>
                  <TableHead>迁移</TableHead>
                  <TableHead>最近运行</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && !list ? (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Loading compact />
                    </TableCell>
                  </TableRow>
                ) : list?.items.length ? (
                  list.items.map((item) => (
                    <WorkflowRow
                      item={item}
                      key={`${item.uid}:${item.workflowId}`}
                      onOpen={openDetail}
                    />
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Empty />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {list ? (
            <TablePagination
              className="px-4"
              itemLabel="个工作流"
              onPageChange={setPage}
              page={pagination.activePage}
              total={list.total}
              totalPages={pagination.totalPages}
            />
          ) : null}
        </section>
      </div>
      <WorkflowDetailSheet
        detail={detail}
        error={detailError}
        loading={detailLoading}
        name={selectedItem?.name}
        onOpenChange={closeDetail}
        onRetry={() => setDetailRefreshVersion((value) => value + 1)}
        open={selectedItem != null}
        uid={selectedItem?.uid}
        workflowId={selectedItem?.workflowId}
      />
    </AiHostingLayout>
  );
}

function WorkflowRow({
  item,
  onOpen,
}: {
  item: WorkflowObservabilityWorkflowItem;
  onOpen: (item: WorkflowObservabilityWorkflowItem) => void;
}) {
  return (
    <TableRow>
      <TableCell className="font-mono tabular-nums">{item.uid}</TableCell>
      <TableCell>
        <Button className="h-auto p-0" onClick={() => onOpen(item)} variant="link">
          {item.name}
        </Button>
      </TableCell>
      <TableCell>{runtimeLabels[item.runtimeStatus]}</TableCell>
      <TableCell className={cn("tabular-nums", item.dueBacklogCount > 0 && "text-destructive")}>
        {formatInteger(item.dueBacklogCount)}
      </TableCell>
      <TableCell className="tabular-nums">{formatInteger(item.activeTaskCount)}</TableCell>
      <TableCell>
        {item.transition ? (
          <span className={cn("text-sm", item.transition.status === "dead" && "text-destructive")}>
            {transitionLabel(item.transition)}
          </span>
        ) : "—"}
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">{formatTimestamp(item.lastRunAt)}</TableCell>
    </TableRow>
  );
}

function WorkflowDetailSheet({
  detail,
  error,
  loading,
  name,
  onOpenChange,
  onRetry,
  open,
  uid,
  workflowId,
}: {
  detail?: WorkflowObservabilityWorkflowDetailResponse;
  error: boolean;
  loading: boolean;
  name?: string;
  onOpenChange: (open: boolean) => void;
  onRetry: () => void;
  open: boolean;
  uid?: number;
  workflowId?: string;
}) {
  const title = detail?.name ?? name ?? "工作流详情";
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="flex w-full flex-col overflow-hidden sm:max-w-[520px]">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            UID {uid ?? "—"} · {workflowId ?? "—"}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          {loading && !detail ? (
            <Loading compact />
          ) : error && !detail ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <span>加载失败</span>
              <Button onClick={onRetry} variant="outline">重新加载</Button>
            </div>
          ) : detail ? (
            <div className="space-y-5">
              {error ? (
                <div className="rounded-[8px] border border-warning/30 bg-warning-muted/30 px-3 py-2 text-sm text-warning" role="status">
                  刷新失败，当前展示上次结果
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <StatusValue label="运行状态" value={runtimeLabels[detail.runtimeStatus]} />
                <StatusValue
                  label="到期积压"
                  value={formatInteger(detail.dueBacklogCount)}
                />
                <StatusValue label="活动运行" value={formatInteger(detail.activeRunCount)} />
                <StatusValue
                  label="最早到期"
                  value={formatTimestamp(detail.oldestDueAt)}
                />
              </div>
              {detail.statusReason ? (
                <p className="text-sm text-muted-foreground">{detail.statusReason}</p>
              ) : null}
              <section>
                <h3 className="text-sm font-semibold">迁移</h3>
                {detail.transition ? (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <StatusValue
                      label="状态"
                      value={transitionLabel(detail.transition)}
                    />
                    <StatusValue label="尝试次数" value={formatInteger(detail.transition.attempt)} />
                    <StatusValue label="下次尝试" value={formatTimestamp(detail.transition.nextAttemptAt)} />
                    <StatusValue
                      label="最近错误"
                      value={detail.transition.lastErrorCode ?? "—"}
                    />
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">暂无数据</p>
                )}
              </section>
              <section>
                <h3 className="text-sm font-semibold">任务分布</h3>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {taskStatusOrder.map((status) => (
                    <StatusValue
                      key={status}
                      label={taskStatusLabels[status]}
                      value={formatInteger(detail.taskDistribution[status])}
                    />
                  ))}
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function transitionLabel(transition: WorkflowObservabilityTransition) {
  if (transition.status === "dead") {
    return transition.targetStatus === "pending" ? "恢复失败" : "暂停失败";
  }
  if (transition.status === "leased") {
    return transition.targetStatus === "pending" ? "恢复中" : "暂停中";
  }
  return transition.targetStatus === "pending" ? "待恢复" : "待暂停";
}

function HealthBadge({ health }: { health: WorkflowObservabilityHealth }) {
  return (
    <Badge
      className={cn(
        health === "healthy" && "border-success/30 text-success",
        health === "degraded" && "border-warning/30 text-warning",
        health === "offline" && "border-destructive/30 text-destructive",
      )}
      variant="outline"
    >
      {healthLabels[health]}
    </Badge>
  );
}

function Metric({
  detail,
  label,
  value,
  warning,
}: {
  detail?: string;
  label: string;
  value?: number;
  warning?: boolean;
}) {
  return (
    <div className="border-b p-4 last:border-b-0 sm:border-r sm:[&:nth-child(even)]:border-r-0 xl:border-b-0 xl:[&:nth-child(4n)]:border-r-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums", warning && "text-destructive")}>
        {value == null ? "—" : formatInteger(value)}
      </p>
      {detail ? <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function StatusValue({ label, mono, value }: { label: string; mono?: boolean; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 truncate tabular-nums", mono && "font-mono text-xs")} title={value}>{value}</p>
    </div>
  );
}

function Loading({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("flex items-center justify-center gap-2 text-sm text-muted-foreground", compact ? "min-h-24" : "min-h-[360px]")} role="status">
      <Spinner size={18} />
      <span>正在加载</span>
    </div>
  );
}

function Empty() {
  return <div className="flex min-h-28 items-center justify-center text-sm text-muted-foreground">暂无数据</div>;
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
      <HugeiconsIcon icon={AlertCircleIcon} size={20} />
      <span>加载失败</span>
      <Button onClick={onRetry} variant="outline">重试</Button>
    </div>
  );
}

function parsePositiveInteger(value: string, invalidMessage: string) {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  if (!/^[1-9]\d*$/.test(normalized) || !Number.isSafeInteger(parsed)) {
    toast.error(invalidMessage);
    return false;
  }
  return parsed;
}

function parseWorkflowId(value: string) {
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (!/^[1-9]\d*$/.test(normalized)) {
    toast.error("请输入正确的 Workflow ID");
    return false;
  }
  return normalized;
}

function formatTimestamp(value?: number) {
  return value == null
    ? "—"
    : new Intl.DateTimeFormat("zh-CN", {
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
      month: "2-digit",
      second: "2-digit",
    }).format(value);
}

function formatDuration(value?: number) {
  if (value == null) return "—";
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} s`;
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}
