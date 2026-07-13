import {
  ArrowDown01Icon,
  Cancel01Icon,
  RefreshIcon,
  Task01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type {
  WorkflowDataOverview,
  WorkflowEntryRecord,
  WorkflowEntryRecordDetail,
  WorkflowEntryRecordPage,
} from "@chatai/contracts";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { WorkflowCanvas } from "./canvas/workflow-canvas";
import type { WorkflowDocument } from "./workflow-draft-service";
import {
  createWorkflowDataRepository,
  type WorkflowDataRepository,
} from "./workflow-data-repository";
import type { WorkflowDraft, WorkflowRenderNode } from "./types";

const defaultWorkflowDataRepository = createWorkflowDataRepository();

type WorkflowRecordsSelection = {
  nodeId?: string;
};

function resolveWorkflowDataDraft(document: WorkflowDocument, revision: number) {
  const version = document.versionHistory.find(item => item.revision === revision);
  const revisionDraft = version?.draft
    ?? (revision === document.publishedRevision ? document.publishedDraft : null);
  if (!revisionDraft || revision !== document.publishedRevision) return revisionDraft;

  const currentPositions = new Map(document.draft.nodes.map(node => [node.id, node.position]));
  return {
    ...revisionDraft,
    nodes: revisionDraft.nodes.map(node => {
      const currentPosition = currentPositions.get(node.id);
      return currentPosition
        ? { ...node, position: { ...currentPosition } }
        : node;
    }),
  };
}

export function WorkflowDataPage({
  document,
  refreshVersion = 0,
  repository = defaultWorkflowDataRepository,
  revision: selectedRevision,
}: {
  document: WorkflowDocument;
  refreshVersion?: number;
  repository?: WorkflowDataRepository;
  revision?: number;
}) {
  const [recordsSelection, setRecordsSelection] = useState<WorkflowRecordsSelection | null>(null);
  const revision = selectedRevision ?? document.publishedRevision;
  const draft = useMemo(
    () => revision === null ? null : resolveWorkflowDataDraft(document, revision),
    [document, revision],
  );
  useEffect(() => setRecordsSelection(null), [revision]);

  if (revision === null || !draft) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">发布后可查看运行数据</div>;
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background">
      <WorkflowDataOverviewView
        document={document}
        draft={draft}
        onViewAllRecords={() => setRecordsSelection({})}
        onViewNodeRecords={nodeId => setRecordsSelection({ nodeId })}
        recordsPanel={recordsSelection ? (
          <WorkflowRecordsView
            document={document}
            key={`${revision}:${recordsSelection.nodeId ?? "all"}`}
            nodeId={recordsSelection.nodeId}
            onClose={() => setRecordsSelection(null)}
            refreshVersion={refreshVersion}
            repository={repository}
            revision={revision}
          />
        ) : null}
        refreshVersion={refreshVersion}
        repository={repository}
        revision={revision}
      />
    </div>
  );
}

export function WorkflowDataActions({
  label,
  onRefresh,
  onSelectRevision,
  versions = [],
}: {
  label: string;
  onRefresh?: () => void;
  onSelectRevision?: (revision: number) => void;
  versions?: Array<{ label: string; revision: number }>;
}) {
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-9 gap-2 px-3" size="sm" type="button" variant="outline">
            {label}
            <HugeiconsIcon icon={ArrowDown01Icon} size={15} strokeWidth={1.8} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {versions.map(version => (
            <DropdownMenuItem key={version.revision} onSelect={() => onSelectRevision?.(version.revision)}>
              {version.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button aria-label="刷新数据" className="size-9" onClick={onRefresh} size="icon" type="button" variant="outline">
        <HugeiconsIcon icon={RefreshIcon} size={17} strokeWidth={1.8} />
      </Button>
    </>
  );
}

function WorkflowDataOverviewView({
  document,
  draft,
  onViewAllRecords,
  onViewNodeRecords,
  recordsPanel,
  refreshVersion,
  repository,
  revision,
}: {
  document: WorkflowDocument;
  draft: WorkflowDraft;
  onViewAllRecords: () => void;
  onViewNodeRecords: (nodeId: string) => void;
  recordsPanel: ReactNode;
  refreshVersion: number;
  repository: WorkflowDataRepository;
  revision: number;
}) {
  const [overview, setOverview] = useState<WorkflowDataOverview | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(false);
    void repository.getOverview(document.id, revision).then(value => {
      if (active) setOverview(value);
    }).catch(() => {
      if (active) setError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [document.id, repository, revision]);
  useEffect(load, [load, refreshVersion]);
  const metrics = useMemo(() => new Map(overview?.nodes.map(item => [item.nodeId, item]) ?? []), [overview]);
  const totals = useMemo(() => draft.nodes.reduce((result, node) => {
    const metric = metrics.get(node.id);
    result.current += metric?.current ?? 0;
    if (node.data.kind === "start") result.entered += metric?.entered ?? 0;
    if (node.data.kind === "end") result.completed += metric?.completed ?? 0;
    return result;
  }, { completed: 0, current: 0, entered: 0 }), [draft.nodes, metrics]);
  const nodes = useMemo(() => draft.nodes.map(node => ({
    ...node,
    data: {
      ...node.data,
      dataMetric: metrics.get(node.id) ?? { completed: 0, current: 0, entered: 0, nodeId: node.id, passed: 0 },
      onDataMetricClick: () => node.data.kind === "start" ? onViewAllRecords() : onViewNodeRecords(node.id),
    },
  })) as WorkflowRenderNode[], [draft.nodes, metrics, onViewAllRecords, onViewNodeRecords]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState onRetry={load} />;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <section aria-label="运行汇总" className="flex shrink-0 items-stretch border-b bg-background" role="region">
        <dl className="grid min-w-0 flex-1 grid-cols-3">
          {([
            ["进入次数", totals.entered],
            ["当前停留", totals.current],
            ["已完成", totals.completed],
          ] as const).map(([label, value], index) => (
            <div className={cn("min-w-0 px-6 py-3", index > 0 && "border-l")} key={label}>
              <dt className="truncate text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value.toLocaleString("zh-CN")}</dd>
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
          canRedo={false} canUndo={false} edges={draft.edges} isReadOnly nodes={nodes} showEditingTools={false}
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

function WorkflowRecordsView({ document, nodeId, onClose, refreshVersion, repository, revision }: { document: WorkflowDocument; nodeId?: string; onClose(): void; refreshVersion: number; repository: WorkflowDataRepository; revision: number }) {
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
      revision,
    }).then(value => {
      if (active) setPage(current => cursor && current
        ? { items: [...current.items, ...value.items], nextCursor: value.nextCursor }
        : value);
    }).catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [document.id, nodeId, repository, revision]);
  useEffect(() => load(), [load, refreshVersion]);
  const openDetail = useCallback((record: WorkflowEntryRecord) => {
    void repository.getRecord(document.id, record.recordId).then(setDetail);
  }, [document.id, repository]);
  const title = nodeId ? nodeTitle(document, revision, nodeId) : "全部进入记录";
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
          <div className="mt-1 text-xs text-muted-foreground">共显示 {page?.items.length ?? 0} 条进入记录</div>
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
        {detail ? <><SheetHeader><SheetTitle>{detail.customer.name}</SheetTitle><SheetDescription>{statusLabel(detail.status)} · {formatDate(detail.createdAt)} 进入</SheetDescription></SheetHeader><div className="border-t px-6 py-5"><h3 className="mb-5 text-sm font-semibold">运行轨迹</h3><ol className="space-y-0">{detail.steps.map((step, index) => <li className="relative flex gap-4 pb-6" key={`${step.nodeId}-${index}`}><span className={cn("mt-1 size-2.5 rounded-full", step.status === "failed" ? "bg-destructive" : step.status === "current" ? "bg-amber-500" : "bg-emerald-500")} />{index < detail.steps.length - 1 ? <span className="absolute left-[4px] top-3 h-full w-px bg-border" /> : null}<div><div className="text-sm font-medium">{step.title}</div><div className="mt-1 text-xs text-muted-foreground">{formatDate(step.occurredAt)}</div>{step.description ? <div className="mt-1 text-xs text-muted-foreground">{step.description}</div> : null}</div></li>)}</ol></div></> : null}
      </SheetContent>
    </Sheet>
  );
}

function RecordStatus({ record }: { record: WorkflowEntryRecord }) {
  return <span className={cn(record.status === "failed" || record.status === "cancelled" ? "text-destructive" : record.status === "waiting" ? "text-amber-600" : "text-emerald-600")}>{statusLabel(record.status)}{record.status === "waiting" && record.nextExecuteAt ? ` · ${formatDate(record.nextExecuteAt)} 继续` : ""}</span>;
}

function statusLabel(status: WorkflowEntryRecord["status"]) {
  return ({ cancelled: "未完成", completed: "已完成", failed: "未完成", queued: "准备中", running: "进行中", waiting: "等待中" } as const)[status];
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

function ErrorState({ onRetry }: { onRetry(): void }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground" role="alert"><span>数据加载失败</span><Button onClick={onRetry} size="sm" type="button" variant="outline">重试</Button></div>;
}
