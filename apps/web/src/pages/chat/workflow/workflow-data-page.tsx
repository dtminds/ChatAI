import {
  ArrowRight02Icon,
  Cancel01Icon,
  ComputerRemoveIcon,
  Progress02Icon,
  RacingFlagIcon,
  RefreshIcon,
  Task01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getWorkflowCustomFieldVariableIds,
  WORKFLOW_RUN_RETENTION_DAYS,
  type CustomFieldItem,
  type WorkflowDataOverview,
  type WorkflowEntryRecord,
  type WorkflowEntryRecordDetail,
  type WorkflowEntryRecordExecutionLog,
  type WorkflowEntryRecordPage,
  type WorkflowFlowChangedReason,
} from "@chatai/contracts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/ui/timeline";
import { cn } from "@/lib/utils";
import { WorkflowCanvas } from "./canvas/workflow-canvas";
import type { WorkflowDocument } from "./workflow-draft-service";
import {
  createWorkflowDataRepository,
  type WorkflowDataRepository,
} from "./workflow-data-repository";
import type { WorkflowDraft, WorkflowRenderNode } from "./types";
import { createWorkflowReadOnlyRenderElements } from "./use-workflow-render-elements";
import { useWorkflowSurface } from "./workflow-surface";
import type { WorkflowCustomFieldResource } from "./workflow-custom-field-resource";

type WorkflowRecordsSelection = {
  nodeId?: string;
};

const workflowDataSummaryHeight = 76;
const workflowDataSummaryInset = 16;
const workflowDataSummaryViewportOffsetY = workflowDataSummaryInset * 2 + workflowDataSummaryHeight;

const readyEmptyCustomFieldResource: WorkflowCustomFieldResource = {
  fields: [],
  reload: () => undefined,
  status: "ready",
};

function resolveWorkflowDataDraft(document: WorkflowDocument) {
  const publishedDraft = document.publishedDraft;
  if (!publishedDraft) return null;

  const currentPositions = new Map(document.draft.nodes.map(node => [node.id, node.position]));
  return {
    ...publishedDraft,
    nodes: publishedDraft.nodes.map(node => {
      const currentPosition = currentPositions.get(node.id);
      return currentPosition
        ? { ...node, position: { ...currentPosition } }
        : node;
    }),
  };
}

export function WorkflowDataPage({
  customFieldResource = readyEmptyCustomFieldResource,
  document,
  refreshVersion = 0,
  repository: repositoryProp,
}: {
  customFieldResource?: WorkflowCustomFieldResource;
  document: WorkflowDocument;
  refreshVersion?: number;
  repository?: WorkflowDataRepository;
}) {
  const surface = useWorkflowSurface();
  const repository = useMemo(
    () => repositoryProp ?? createWorkflowDataRepository(surface.apiBasePath),
    [repositoryProp, surface.apiBasePath],
  );
  const [recordsSelection, setRecordsSelection] = useState<WorkflowRecordsSelection | null>(null);
  const draft = useMemo(() => resolveWorkflowDataDraft(document), [document]);
  const requiresCustomFields = useMemo(
    () => draft !== null && getWorkflowCustomFieldVariableIds(draft).length > 0,
    [draft],
  );
  useEffect(() => setRecordsSelection(null), [document.publishedRevision]);

  if (document.publishedRevision === null || !draft) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">发布后可查看运行数据</div>;
  }

  if (requiresCustomFields && customFieldResource.status !== "ready") {
    return (
      <div className="relative flex h-full min-h-0 flex-col bg-background">
        {customFieldResource.status === "error"
          ? <ErrorState message="变量加载失败" onRetry={customFieldResource.reload} />
          : <LoadingState />}
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background">
      <WorkflowDataOverviewView
        customFields={customFieldResource.fields}
        document={document}
        draft={draft}
        onViewAllRecords={() => setRecordsSelection({})}
        onViewNodeRecords={nodeId => setRecordsSelection({ nodeId })}
        recordsPanel={recordsSelection ? (
          <WorkflowRecordsView
            document={document}
            key={recordsSelection.nodeId ?? "all"}
            nodeId={recordsSelection.nodeId}
            onClose={() => setRecordsSelection(null)}
            refreshVersion={refreshVersion}
            repository={repository}
          />
        ) : null}
        refreshVersion={refreshVersion}
        repository={repository}
      />
    </div>
  );
}

export function WorkflowDataActions({
  onRefresh,
}: {
  onRefresh?: () => void;
}) {
  return (
    <Button aria-label="刷新数据" className="size-9" onClick={onRefresh} size="icon" type="button" variant="outline">
      <HugeiconsIcon icon={RefreshIcon} size={17} strokeWidth={1.8} />
    </Button>
  );
}

function WorkflowDataOverviewView({
  customFields,
  document,
  draft,
  onViewAllRecords,
  onViewNodeRecords,
  recordsPanel,
  refreshVersion,
  repository,
}: {
  customFields: readonly CustomFieldItem[];
  document: WorkflowDocument;
  draft: WorkflowDraft;
  onViewAllRecords: () => void;
  onViewNodeRecords: (nodeId: string) => void;
  recordsPanel: ReactNode;
  refreshVersion: number;
  repository: WorkflowDataRepository;
}) {
  const [overview, setOverview] = useState<WorkflowDataOverview | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(false);
    void repository.getOverview(document.id).then(value => {
      if (active) setOverview(value);
    }).catch(() => {
      if (active) setError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [document.id, repository]);
  useEffect(load, [load, refreshVersion]);
  const metrics = useMemo(() => new Map(overview?.nodes.map(item => [item.nodeId, item]) ?? []), [overview]);
  const totals = overview?.summary ?? { completed: 0, current: 0, entered: 0, incomplete: 0 };
  const rendered = useMemo(
    () => createWorkflowReadOnlyRenderElements(draft.nodes, draft.edges, customFields),
    [customFields, draft.edges, draft.nodes],
  );
  const dataViewport = useMemo(() => ({
    ...draft.viewport,
    y: draft.viewport.y + workflowDataSummaryViewportOffsetY,
  }), [draft.viewport]);
  const nodes = useMemo(() => rendered.nodes.map(node => ({
    ...node,
    data: {
      ...node.data,
      dataMetric: metrics.get(node.id) ?? {
        completed: 0,
        current: 0,
        entered: 0,
        incomplete: 0,
        nodeId: node.id,
        passed: 0,
      },
      onDataMetricClick: () => node.data.kind === "start" ? onViewAllRecords() : onViewNodeRecords(node.id),
    },
  })) as WorkflowRenderNode[], [metrics, onViewAllRecords, onViewNodeRecords, rendered.nodes]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState onRetry={load} />;
  const summaryItems = [
    {
      icon: ArrowRight02Icon,
      iconClassName: "bg-primary/8 text-primary",
      label: "累计进入",
      value: totals.entered,
    },
    {
      icon: Progress02Icon,
      iconClassName: "bg-success-muted/35 text-success",
      label: "当前停留",
      value: totals.current,
    },
    {
      icon: RacingFlagIcon,
      iconClassName: "bg-indigo-500/8 text-indigo-500",
      label: "累计完成",
      value: totals.completed,
    },
    {
      icon: ComputerRemoveIcon,
      iconClassName: "bg-warning-muted/35 text-warning",
      label: "未完成",
      value: totals.incomplete,
    },
  ] as const;

  return (
    <div className="relative min-h-0 flex-1 bg-[var(--workflow-canvas-bg)]">
      <WorkflowCanvas
        allowedInsertableNodeKinds={[]}
        canRedo={false} canUndo={false} edges={rendered.edges} isReadOnly nodes={nodes} showEditingTools={false}
        onAddNode={() => {}} onArrange={() => {}} onConnect={() => {}} onEdgesChange={() => {}}
        onIsValidConnection={() => false} onNodeDrag={() => {}} onNodeDragStart={() => {}} onNodeDragStop={() => {}}
        onNodeHoverEnd={() => {}} onNodeHoverStart={() => {}} onNodesChange={() => {}} onPaletteOpenChange={() => {}}
        onPaneClick={() => {}} onRedo={() => {}} onSelectEdge={() => {}} onSelectNode={() => {}} onUndo={() => {}}
        onViewportChangeEnd={() => {}} paletteOpen={false} viewport={dataViewport}
      />
      <section
        aria-label="运行汇总"
        className="absolute z-10 flex items-stretch overflow-hidden rounded-2xl border border-foreground/10 bg-background"
        role="region"
        style={{
          height: workflowDataSummaryHeight,
          left: workflowDataSummaryInset,
          right: workflowDataSummaryInset,
          top: workflowDataSummaryInset,
        }}
      >
        <dl className="grid min-w-0 flex-1 grid-cols-4">
          {summaryItems.map(({ icon, iconClassName, label, value }, index) => (
            <div
              className="relative flex min-w-0 items-center gap-3 px-5 py-4"
              key={label}
            >
              {index > 0 ? (
                <span aria-hidden="true" className="absolute inset-y-4 left-0 w-px bg-foreground/10" />
              ) : null}
              <span
                aria-hidden="true"
                className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", iconClassName)}
              >
                <HugeiconsIcon icon={icon} size={20} strokeWidth={1.8} />
              </span>
              <div className="min-w-0">
                <dt className="truncate text-xs font-medium text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                  {value.toLocaleString("zh-CN")}
                </dd>
              </div>
            </div>
          ))}
        </dl>
        <div className="flex shrink-0 items-center border-l px-5">
          <Button className="gap-2" onClick={onViewAllRecords} size="sm" type="button" variant="outline">
            <HugeiconsIcon icon={Task01Icon} size={16} strokeWidth={1.8} />
            运行明细
          </Button>
        </div>
      </section>
      {recordsPanel ? (
        <div
          className="absolute inset-x-0 bottom-0"
          style={{ top: workflowDataSummaryViewportOffsetY }}
        >
          {recordsPanel}
        </div>
      ) : null}
    </div>
  );
}

function WorkflowRecordsView({ document, nodeId, onClose, refreshVersion, repository }: { document: WorkflowDocument; nodeId?: string; onClose(): void; refreshVersion: number; repository: WorkflowDataRepository }) {
  const [page, setPage] = useState<WorkflowEntryRecordPage | null>(null);
  const [detail, setDetail] = useState<WorkflowEntryRecordDetail | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback((cursor?: string) => {
    let active = true;
    setLoading(true);
    setError(false);
    if (!cursor) setPage(null);
    void repository.listRecords({
      cursor,
      ...(nodeId ? { nodeId } : {}),
      workflowId: document.id,
    }).then(value => {
      if (active) setPage(current => cursor && current
        ? { items: [...current.items, ...value.items], nextCursor: value.nextCursor }
        : value);
    }).catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [document.id, nodeId, repository]);
  useEffect(() => load(), [load, refreshVersion]);
  const openDetail = useCallback((record: WorkflowEntryRecord) => {
    void repository.getRecord(document.id, record.recordId).then(setDetail);
  }, [document.id, repository]);
  const title = "运行明细";
  return (
    <section
      aria-label={title}
      className="absolute inset-4 z-10 flex min-h-0 flex-col overflow-hidden rounded-[8px] border bg-background shadow-sm"
      role="dialog"
    >
      <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          <div className="mt-1 text-xs text-muted-foreground">
            仅展示近{WORKFLOW_RUN_RETENTION_DAYS}天运行明细，共 {page?.items.length ?? 0} 条
          </div>
        </div>
        <Button aria-label="关闭运行明细" className="size-8" onClick={onClose} size="icon" type="button" variant="ghost">
          <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.8} />
        </Button>
      </div>
      {loading && !page ? <LoadingState /> : error && !page ? <ErrorState onRetry={() => load()} /> : (
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <div className="overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="text-foreground"><tr><th className="h-11 px-4 text-left font-semibold">客户</th><th className="h-11 px-4 text-left font-semibold">当前进度</th><th className="h-11 px-4 text-left font-semibold">状态</th><th className="h-11 px-4 text-left font-semibold">进入时间</th><th className="h-11 px-4 text-left font-semibold">最近更新</th></tr></thead>
              <tbody>{page?.items.map(record => (
                <tr className="cursor-pointer border-t hover:bg-muted/30" key={record.recordId} onClick={() => openDetail(record)}>
                  <td className="px-4 py-3 font-medium">
                    <RecordCustomer customer={record.customer} />
                  </td>
                  <td className="px-4 py-3">{nodeTitle(document, record.revision, record.currentNodeId)}</td>
                  <td className="px-4 py-3"><RecordStatus record={record} /></td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(record.createdAt)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(record.updatedAt)}</td>
                </tr>
              ))}{page?.items.length === 0 ? <tr><td className="px-4 py-12 text-center text-muted-foreground" colSpan={5}>暂无数据</td></tr> : null}</tbody>
            </table>
          </div>
          {page?.nextCursor ? (
            <div className="mt-4 flex justify-center">
              <Button disabled={loading} onClick={() => load(page.nextCursor ?? undefined)} type="button" variant="outline">
                {loading ? "正在加载" : "加载更多"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
      <RecordDetailSheet
        detail={detail}
        onOpenChange={open => { if (!open) setDetail(null); }}
        repository={repository}
        workflowId={document.id}
      />
    </section>
  );
}

function RecordDetailSheet({
  detail,
  onOpenChange,
  repository,
  workflowId,
}: {
  detail: WorkflowEntryRecordDetail | null;
  onOpenChange(open: boolean): void;
  repository: WorkflowDataRepository;
  workflowId: string;
}) {
  const [selectedStep, setSelectedStep] = useState<WorkflowEntryRecordDetail["steps"][number] | null>(null);
  const [executionLog, setExecutionLog] = useState<WorkflowEntryRecordExecutionLog | null>(null);
  const [loadingLog, setLoadingLog] = useState(false);
  const [logError, setLogError] = useState(false);
  const logRequestId = useRef(0);

  useEffect(() => {
    setSelectedStep(null);
    setExecutionLog(null);
    setLoadingLog(false);
    setLogError(false);
    logRequestId.current += 1;
  }, [detail?.recordId]);

  const loadExecutionLog = useCallback((step: WorkflowEntryRecordDetail["steps"][number]) => {
    if (step.sequence === undefined) return;
    const requestId = ++logRequestId.current;
    setSelectedStep(step);
    setExecutionLog(null);
    setLoadingLog(true);
    setLogError(false);
    void repository.getExecutionLog(workflowId, detail?.recordId ?? "", step.sequence)
      .then(value => {
        if (requestId === logRequestId.current) setExecutionLog(value);
      })
      .catch(() => {
        if (requestId === logRequestId.current) setLogError(true);
      })
      .finally(() => {
        if (requestId === logRequestId.current) setLoadingLog(false);
      });
  }, [detail?.recordId, repository, workflowId]);

  return (
    <Sheet onOpenChange={onOpenChange} open={Boolean(detail)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[min(680px,calc(100vw-48px))]">
        {detail ? (
          <>
            <SheetHeader className="gap-0 text-left">
              <SheetTitle className="text-base">运行详情</SheetTitle>
              <SheetDescription className="sr-only">运行记录详情</SheetDescription>
              <div className="mt-6 flex min-w-0 items-center gap-3">
                <Avatar className="size-12 rounded-full">
                  {detail.customer.avatar ? <AvatarImage alt="" src={detail.customer.avatar} /> : null}
                  <AvatarFallback>{detail.customer.name.trim().slice(0, 1) || undefined}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-base font-medium text-foreground">{detail.customer.name}</p>
                  <p className="truncate text-[13px] text-muted-foreground">{detail.memberName ?? "未知"}</p>
                </div>
              </div>
              <dl className="mt-6 grid grid-cols-2 gap-x-5 gap-y-5 rounded-[8px] bg-muted/40 p-5 sm:grid-cols-4">
                <RecordHeaderMetric
                  label="状态"
                  value={<span className={cn(detail.status === "failed" || detail.status === "cancelled" ? "text-destructive" : detail.status === "waiting" ? "text-warning" : "text-success")}>{statusLabel(detail.status)}</span>}
                />
                <RecordHeaderMetric label="进入时间" value={formatDate(detail.createdAt)} />
                <RecordHeaderMetric label="运行ID" value={detail.recordId} />
                <RecordHeaderMetric label="运行版本" value={detail.revision} />
              </dl>
              {detail.terminalReason ? (
                <p aria-label="流程变更说明" className="text-sm text-destructive" role="status">
                  {flowChangedReasonLabel(detail.terminalReason)}
                </p>
              ) : null}
            </SheetHeader>
            <div className="border-t px-6 py-5">
              <h3 className="mb-5 text-sm font-semibold">运行轨迹</h3>
              <Timeline aria-label="运行轨迹">
                {detail.steps.map((step, index) => {
                  const waitingUntil = step.status === "waiting" ? step.nextExecuteAt : undefined;
                  return (
                    <TimelineItem className="pr-24" key={`${step.nodeId}-${index}`}>
                      <TimelineIndicator variant={timelineStepVariant(step.status)} />
                      <TimelineSeparator />
                      <TimelineTitle>{step.title}</TimelineTitle>
                      <TimelineDate dateTime={waitingUntil ?? step.occurredAt}>
                        {waitingUntil
                          ? `${step.nodeKind === "message" ? "等待发送" : "等待中"} · ${formatDate(waitingUntil)} 继续`
                          : formatDate(step.occurredAt)}
                      </TimelineDate>
                      {step.description ? <TimelineContent>{step.description}</TimelineContent> : null}
                      {step.sourceOutletId ? <TimelineContent>出口 {step.sourceOutletId}</TimelineContent> : null}
                      {step.executionAvailable && step.sequence !== undefined ? (
                        <Button
                          className="pointer-events-none absolute right-0 top-0 opacity-0 transition-opacity group-hover/timeline-item:pointer-events-auto group-hover/timeline-item:opacity-100"
                          disabled={loadingLog && selectedStep?.sequence === step.sequence}
                          onClick={() => loadExecutionLog(step)}
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          查看日志
                        </Button>
                      ) : null}
                    </TimelineItem>
                  );
                })}
              </Timeline>
            </div>
          </>
        ) : null}
      </SheetContent>
      <Dialog
        onOpenChange={open => {
          if (!open) {
            setSelectedStep(null);
            setExecutionLog(null);
            setLoadingLog(false);
            setLogError(false);
          }
        }}
        open={Boolean(selectedStep)}
      >
        <DialogContent
          aria-describedby={undefined}
          className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden sm:max-w-[min(680px,calc(100vw-48px))]"
        >
          <DialogHeader>
            <DialogTitle>执行日志</DialogTitle>
          </DialogHeader>
          {selectedStep ? (
            <ExecutionLogPanel
              error={logError}
              loading={loadingLog}
              log={executionLog}
              onRetry={() => loadExecutionLog(selectedStep)}
              step={selectedStep}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}

function ExecutionLogPanel({
  error,
  loading,
  log,
  onRetry,
  step,
}: {
  error: boolean;
  loading: boolean;
  log: WorkflowEntryRecordExecutionLog | null;
  onRetry(): void;
  step: WorkflowEntryRecordDetail["steps"][number];
}) {
  return (
    <section aria-label={`${step.title}日志`} className="min-h-0 overflow-y-auto">
      {loading ? <div className="mt-4"><LoadingState /></div> : error ? (
        <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground" role="alert">
          <span>日志加载失败</span>
          <Button onClick={onRetry} size="sm" type="button" variant="outline">重试</Button>
        </div>
      ) : log ? (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
            <span>状态：{executionStatusLabel(log.status)}</span>
            {log.startedAt ? <span>开始：{formatDateTime(log.startedAt)}</span> : null}
            {log.completedAt ? <span>完成：{formatDateTime(log.completedAt)}</span> : null}
            {log.sourceOutletId ? <span>出口：{log.sourceOutletId}</span> : null}
          </div>
          {log.inputAvailable ? (
            <JsonBlock label="输入快照" value={log.inputSnapshot} />
          ) : (
            <ExecutionIdBlock value={log.executionId} />
          )}
          <JsonBlock label="输出" value={log.output} />
          {log.errorCode || log.errorMessage ? (
            <div>
              <h5 className="mb-1 text-xs font-medium text-destructive">错误</h5>
              <p className="whitespace-pre-wrap text-sm text-destructive">
                {[log.errorCode, log.errorMessage].filter(Boolean).join(" · ")}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function JsonBlock({ label, value }: { label: string; value: Record<string, unknown> }) {
  return (
    <div>
      <h5 className="mb-1 text-xs font-medium">{label}</h5>
      <pre className="max-h-72 overflow-auto rounded-[8px] bg-muted/80 p-3 text-xs leading-5">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function ExecutionIdBlock({ value }: { value: string }) {
  return (
    <div>
      <h5 className="mb-1 text-xs font-medium">执行ID</h5>
      <code className="block rounded-[8px] bg-muted/80 p-3 text-xs leading-5">{value}</code>
    </div>
  );
}

function RecordHeaderMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-2 truncate text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function executionStatusLabel(status: WorkflowEntryRecordExecutionLog["status"]) {
  return ({ completed: "已完成", failed: "失败", retrying: "重试中", running: "执行中" } as const)[status];
}

function timelineStepVariant(status: WorkflowEntryRecordDetail["steps"][number]["status"]) {
  if (status === "failed") return "destructive";
  if (status === "current" || status === "waiting") return "warning";
  return "success";
}

function RecordStatus({ record }: { record: WorkflowEntryRecord }) {
  return <span className={cn(record.status === "failed" || record.status === "cancelled" ? "text-destructive" : record.status === "waiting" ? "text-warning" : "text-success")}>{statusLabel(record.status)}{record.status === "waiting" && record.nextExecuteAt ? ` · ${formatDate(record.nextExecuteAt)} 继续` : ""}</span>;
}

function statusLabel(status: WorkflowEntryRecord["status"]) {
  return ({ cancelled: "未完成", completed: "已完成", failed: "未完成", queued: "准备中", running: "进行中", waiting: "等待中" } as const)[status];
}

function flowChangedReasonLabel(reason: WorkflowFlowChangedReason) {
  return ({
    flow_changed_context_incompatible: "流程配置已更新，后续节点所需数据不可用",
    flow_changed_current_node_deleted: "流程配置已更新，当前节点已删除",
    flow_changed_node_kind_changed: "流程配置已更新，当前节点类型已变更",
    flow_changed_outlet_deleted: "流程配置已更新，当前节点出口已删除",
  } as const)[reason];
}

function RecordCustomer({
  customer,
}: {
  customer: WorkflowEntryRecord["customer"];
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Avatar className="size-8 rounded-full">
        {customer.avatar ? <AvatarImage alt="" src={customer.avatar} /> : null}
        <AvatarFallback>{customer.name.trim().slice(0, 1) || undefined}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 truncate">{customer.name}</span>
    </span>
  );
}

function nodeTitle(document: WorkflowDocument, revision: number, nodeId: string) {
  const draft = document.versionHistory.find(item => item.revision === revision)?.draft
    ?? (revision === document.publishedRevision ? document.publishedDraft : null);
  return draft?.nodes.find(node => node.id === nodeId)?.data.title ?? nodeId;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { day: "2-digit", hour: "2-digit", hour12: false, minute: "2-digit", month: "2-digit", timeZone: "Asia/Shanghai" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

function LoadingState() {
  return <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground" role="status"><Spinner />正在加载</div>;
}

function ErrorState({ message = "数据加载失败", onRetry }: { message?: string; onRetry(): void }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground" role="alert"><span>{message}</span><Button onClick={onRetry} size="sm" type="button" variant="outline">重试</Button></div>;
}
