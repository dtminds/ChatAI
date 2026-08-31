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
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  getWorkflowCustomFieldVariableIds,
  WORKFLOW_RUN_RETENTION_DAYS,
  type CustomFieldItem,
  type WorkflowDataOverview,
  type WorkflowEntryRecord,
  type WorkflowEntryRecordDetail,
  type WorkflowEntryRecordPage,
  type WorkflowFlowChangedReason,
} from "@chatai/contracts";
import { Button } from "@/components/ui/button";
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
      iconClassName: "bg-primary/10 text-primary",
      label: "进入次数",
      value: totals.entered,
    },
    {
      icon: Progress02Icon,
      iconClassName: "bg-success-muted text-success",
      label: "当前停留",
      value: totals.current,
    },
    {
      icon: RacingFlagIcon,
      iconClassName: "bg-indigo-500/10 text-indigo-500",
      label: "已完成",
      value: totals.completed,
    },
    {
      icon: ComputerRemoveIcon,
      iconClassName: "bg-warning-muted text-warning",
      label: "未完成",
      value: totals.incomplete,
    },
  ] as const;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--workflow-canvas-bg)]">
      <section
        aria-label="运行汇总"
        className="m-4 flex shrink-0 items-stretch overflow-hidden rounded-2xl border border-foreground/10 bg-background"
        role="region"
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
            查看全部记录
          </Button>
        </div>
      </section>
      <div className="relative min-h-0 flex-1 bg-[var(--workflow-canvas-bg)]">
        <WorkflowCanvas
          allowedInsertableNodeKinds={[]}
          canRedo={false} canUndo={false} edges={rendered.edges} isReadOnly nodes={nodes} showEditingTools={false}
          onAddNode={() => {}} onArrange={() => {}} onConnect={() => {}} onEdgesChange={() => {}}
          onIsValidConnection={() => false} onNodeDrag={() => {}} onNodeDragStart={() => {}} onNodeDragStop={() => {}}
          onNodeHoverEnd={() => {}} onNodeHoverStart={() => {}} onNodesChange={() => {}} onPaletteOpenChange={() => {}}
          onPaneClick={() => {}} onRedo={() => {}} onSelectEdge={() => {}} onSelectNode={() => {}} onUndo={() => {}}
          onViewportChangeEnd={() => {}} paletteOpen={false} viewport={draft.viewport}
        />
        {recordsPanel}
      </div>
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
  const title = nodeId && document.publishedRevision
    ? nodeTitle(document, document.publishedRevision, nodeId)
    : "全部进入记录";
  const panelLabel = nodeId ? `${title}进入记录` : title;
  return (
    <section
      aria-label={panelLabel}
      className="absolute inset-4 z-10 flex min-h-0 flex-col overflow-hidden rounded-[8px] border bg-background shadow-sm"
      role="dialog"
    >
      <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
            <span>共显示 {page?.items.length ?? 0} 条进入记录</span>
            <span>已结束记录仅保留最近 {WORKFLOW_RUN_RETENTION_DAYS} 天</span>
          </div>
        </div>
        <Button aria-label="关闭进入记录" className="size-8" onClick={onClose} size="icon" type="button" variant="ghost">
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
                  <td className="px-4 py-3 font-medium">{record.customer.name}</td>
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
      <RecordDetailSheet detail={detail} onOpenChange={open => { if (!open) setDetail(null); }} />
    </section>
  );
}

function RecordDetailSheet({ detail, onOpenChange }: { detail: WorkflowEntryRecordDetail | null; onOpenChange(open: boolean): void }) {
  return (
    <Sheet onOpenChange={onOpenChange} open={Boolean(detail)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[min(680px,calc(100vw-48px))]">
        {detail ? (
          <>
            <SheetHeader>
              <SheetTitle>{detail.customer.name}</SheetTitle>
              <SheetDescription>{statusLabel(detail.status)} · {formatDate(detail.createdAt)} 进入</SheetDescription>
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
                    <TimelineItem key={`${step.nodeId}-${index}`}>
                      <TimelineIndicator variant={timelineStepVariant(step.status)} />
                      <TimelineSeparator />
                      <TimelineTitle>{step.title}</TimelineTitle>
                      <TimelineDate dateTime={waitingUntil ?? step.occurredAt}>
                        {waitingUntil
                          ? `${step.nodeKind === "message" ? "等待发送" : "等待中"} · ${formatDate(waitingUntil)} 继续`
                          : formatDate(step.occurredAt)}
                      </TimelineDate>
                      {step.description ? <TimelineContent>{step.description}</TimelineContent> : null}
                    </TimelineItem>
                  );
                })}
              </Timeline>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
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

function nodeTitle(document: WorkflowDocument, revision: number, nodeId: string) {
  const draft = document.versionHistory.find(item => item.revision === revision)?.draft
    ?? (revision === document.publishedRevision ? document.publishedDraft : null);
  return draft?.nodes.find(node => node.id === nodeId)?.data.title ?? nodeId;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { day: "2-digit", hour: "2-digit", hour12: false, minute: "2-digit", month: "2-digit", timeZone: "Asia/Shanghai" }).format(new Date(value));
}

function LoadingState() {
  return <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground" role="status"><Spinner />正在加载</div>;
}

function ErrorState({ message = "数据加载失败", onRetry }: { message?: string; onRetry(): void }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground" role="alert"><span>{message}</span><Button onClick={onRetry} size="sm" type="button" variant="outline">重试</Button></div>;
}
