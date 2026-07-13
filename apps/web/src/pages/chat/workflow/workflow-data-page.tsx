import {
  ArrowDown01Icon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [view, setView] = useState<"overview" | "records">("overview");
  const [nodeId, setNodeId] = useState<string | undefined>();
  const revision = selectedRevision ?? document.publishedRevision;
  const version = document.versionHistory.find(item => item.revision === revision);
  const draft = version?.draft ?? (revision === document.publishedRevision ? document.publishedDraft : null);

  if (revision === null || !draft) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">发布后可查看运行数据</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <nav aria-label="数据视图" className="flex h-12 shrink-0 items-end gap-6 border-b px-6" role="tablist">
        {(["overview", "records"] as const).map(item => (
          <button
            aria-selected={view === item}
            className={cn(
              "relative h-full px-1 text-sm text-muted-foreground",
              view === item && "font-medium text-primary after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary",
            )}
            key={item}
            onClick={() => setView(item)}
            role="tab"
            type="button"
          >
            {item === "overview" ? "概览" : "进入记录"}
          </button>
        ))}
      </nav>
      {view === "overview" ? (
        <WorkflowDataOverviewView
          document={document}
          draft={draft}
          onViewNodeRecords={(selectedNodeId) => {
            setNodeId(selectedNodeId);
            setView("records");
          }}
          refreshVersion={refreshVersion}
          repository={repository}
          revision={revision}
        />
      ) : (
        <WorkflowRecordsView
          document={document}
          nodeId={nodeId}
          refreshVersion={refreshVersion}
          repository={repository}
          revision={revision}
        />
      )}
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
  onViewNodeRecords,
  refreshVersion,
  repository,
  revision,
}: {
  document: WorkflowDocument;
  draft: WorkflowDraft;
  onViewNodeRecords: (nodeId: string) => void;
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
  const nodes = useMemo(() => draft.nodes.map(node => ({
    ...node,
    data: {
      ...node.data,
      dataMetric: metrics.get(node.id) ?? { completed: 0, current: 0, entered: 0, nodeId: node.id, passed: 0 },
      onDataMetricClick: () => onViewNodeRecords(node.id),
    },
  })) as WorkflowRenderNode[], [draft.nodes, metrics, onViewNodeRecords]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState onRetry={load} />;
  return (
    <div className="relative min-h-0 flex-1 bg-[var(--workflow-canvas-bg)]">
      <WorkflowCanvas
        canRedo={false} canUndo={false} edges={draft.edges} isReadOnly nodes={nodes} showEditingTools={false}
        onAddNode={() => {}} onArrange={() => {}} onConnect={() => {}} onEdgesChange={() => {}}
        onIsValidConnection={() => false} onNodeDrag={() => {}} onNodeDragStart={() => {}} onNodeDragStop={() => {}}
        onNodeHoverEnd={() => {}} onNodeHoverStart={() => {}} onNodesChange={() => {}} onPaletteOpenChange={() => {}}
        onPaneClick={() => {}} onRedo={() => {}} onSelectEdge={() => {}} onSelectNode={() => {}} onUndo={() => {}}
        onViewportChangeEnd={() => {}} paletteOpen={false} viewport={draft.viewport}
      />
    </div>
  );
}

function WorkflowRecordsView({ document, nodeId, refreshVersion, repository, revision }: { document: WorkflowDocument; nodeId?: string; refreshVersion: number; repository: WorkflowDataRepository; revision: number }) {
  const [page, setPage] = useState<WorkflowEntryRecordPage | null>(null);
  const [detail, setDetail] = useState<WorkflowEntryRecordDetail | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback((cursor?: string) => {
    let active = true;
    setLoading(true);
    setError(false);
    if (!cursor) setPage(null);
    void repository.listRecords({ cursor, nodeId, workflowId: document.id, revision }).then(value => {
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
  if (loading && !page) return <LoadingState />;
  if (error && !page) return <ErrorState onRetry={() => load()} />;
  return (
    <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
      <div className="mb-4 text-sm text-muted-foreground">
        {nodeId ? `${nodeTitle(document, revision, nodeId)} · ` : ""}共显示 {page?.items.length ?? 0} 条进入记录
      </div>
      {page?.nextCursor ? (
        <div className="mt-4 flex justify-center">
          <Button disabled={loading} onClick={() => load(page.nextCursor ?? undefined)} type="button" variant="outline">
            {loading ? "正在加载" : "加载更多"}
          </Button>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">客户</th><th className="px-4 py-3 font-medium">当前进度</th><th className="px-4 py-3 font-medium">状态</th><th className="px-4 py-3 font-medium">进入时间</th><th className="px-4 py-3 font-medium">最近更新</th></tr></thead>
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
      <RecordDetailSheet detail={detail} onOpenChange={open => { if (!open) setDetail(null); }} />
    </div>
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
