import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import type { WorkflowTemplateDetail, WorkflowTemplateListItem } from "@chatai/contracts";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { TablePagination } from "@/components/ui/table-pagination";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { WorkflowCanvas } from "./canvas/workflow-canvas";
import { createWorkflowReadOnlyRenderElements } from "./use-workflow-render-elements";
import { createEmptyWorkflowTemplateRepository, createWorkflowTemplateRepository, type WorkflowTemplateRepository } from "./workflow-template-repository";
import { useWorkflowSurface } from "./workflow-surface";
import { WorkflowListState } from "./workflow-list-components";
import type { WorkflowDraft } from "./types";

export function WorkflowTemplateSection({ repository }: { repository?: WorkflowTemplateRepository } = {}) {
  const surface = useWorkflowSurface();
  const navigate = useNavigate();
  const templateRepository = useMemo(() => repository
    ?? (import.meta.env.MODE === "test"
      ? createEmptyWorkflowTemplateRepository()
      : createWorkflowTemplateRepository(undefined, surface.apiBasePath.replace(/\/workflows$/, ""))), [repository, surface.apiBasePath]);
  const [items, setItems] = useState<WorkflowTemplateListItem[]>([]);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<WorkflowTemplateDetail | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const applyRequestIdRef = useRef<string | null>(null);
  const pageSize = 8;

  const load = useCallback(async (input: { featured?: boolean; page: number; query?: string }) => {
    setLoading(true);
    setError(false);
    try {
      const result = await templateRepository.list({
        featured: input.featured,
        limit: input.featured ? 4 : pageSize,
        page: input.featured ? undefined : input.page,
        query: input.featured ? undefined : input.query?.trim() || undefined,
      });
      setItems(result.items);
      setTotal(result.total);
      setPage(input.page);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [templateRepository]);

  useEffect(() => { void load({ featured: true, page: 1 }); }, [load]);

  const openBrowser = () => {
    setOpen(true);
    setDetail(null);
    setPage(1);
    void load({ page: 1, query });
  };
  const goToPage = (nextPage: number) => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const targetPage = Math.min(Math.max(1, nextPage), totalPages);
    if (targetPage === page) return;
    void load({ page: targetPage, query });
  };
  const openDetail = async (item: WorkflowTemplateListItem) => {
    try {
      setDetail(await templateRepository.get(item.id));
    } catch {
      toast.error("操作失败，请稍后重试");
    }
  };
  const apply = async () => {
    if (!detail) return;
    const requestId = applyRequestIdRef.current ?? (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
    applyRequestIdRef.current = requestId;
    try {
      const result = await templateRepository.apply(detail.id, { clientRequestId: requestId });
      setOpen(false);
      applyRequestIdRef.current = null;
      navigate(`${surface.webBasePath}/${result.id}`);
    } catch {
      toast.error("操作失败，请稍后重试");
    }
  };

  return <section aria-label="推荐模板" className="space-y-3">
    <div className="flex items-center justify-between"><h2 className="text-base font-semibold">推荐模板</h2><Button onClick={openBrowser} type="button" variant="ghost">查看更多</Button></div>
    {loading && items.length === 0 ? <div className="flex min-h-56 items-center justify-center" role="status"><Spinner /></div> : error ? <TemplateLoadErrorState onRetry={() => void load({ featured: true, page: 1 })} /> : items.length === 0 ? <WorkflowListState title="暂无数据" /> : <div className="grid gap-3 md:grid-cols-4">{items.slice(0, 4).map(item => <TemplateCard item={item} key={item.id} onClick={() => void openDetail(item)} />)}</div>}
    <Dialog onOpenChange={value => { setOpen(value); if (!value) { setDetail(null); applyRequestIdRef.current = null; } }} open={open}>
      <DialogContent className="max-w-5xl">
        <DialogHeader><DialogTitle>{detail ? detail.name : "模板中心"}</DialogTitle></DialogHeader>
        {detail ? <TemplateDetailView detail={detail} onApply={() => void apply()} onBack={() => setDetail(null)} /> : <div className="space-y-4">
          <Input aria-label="搜索模板" onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void load({ page: 1, query: event.currentTarget.value }); }} placeholder="搜索模板" value={query} />
          {loading ? <div className="flex min-h-56 items-center justify-center" role="status"><Spinner /></div> : error ? <TemplateLoadErrorState onRetry={() => void load({ page, query })} /> : items.length === 0 ? <WorkflowListState title="暂无数据" /> : <div className="grid gap-3 md:grid-cols-2">{items.map(item => <TemplateCard item={item} key={item.id} onClick={() => void openDetail(item)} />)}</div>}
          <TablePagination
            className="border-t-0"
            onPageChange={goToPage}
            page={page}
            showTotal
            total={total}
            totalPages={Math.max(1, Math.ceil(total / pageSize))}
          />
        </div>}
      </DialogContent>
    </Dialog>
  </section>;
}

function TemplateLoadErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 py-10 text-center" role="alert">
      <HugeiconsIcon aria-hidden="true" className="text-destructive" icon={AlertCircleIcon} size={28} strokeWidth={1.8} />
      <p className="text-sm text-muted-foreground">模板加载失败</p>
      <Button onClick={onRetry} size="sm" type="button" variant="outline">重试</Button>
    </div>
  );
}

function TemplateCard({ item, onClick }: { item: WorkflowTemplateListItem; onClick: () => void }) {
  return <button className="rounded-lg border p-4 text-left hover:bg-muted" onClick={onClick} type="button"><div className="font-medium">{item.name}</div><div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description || "暂无描述"}</div><div className="mt-2 flex gap-2 text-xs text-muted-foreground"><span>{item.category || "通用"}</span><span>{item.nodeCount} 个节点</span><span>{item.requiredConfigurationCount} 项待配置</span></div></button>;
}

function TemplateDetailView({ detail, onApply, onBack }: { detail: WorkflowTemplateDetail; onApply: () => void; onBack: () => void }) {
  const rendered = useMemo(() => createWorkflowReadOnlyRenderElements(detail.draft.nodes as WorkflowDraft["nodes"], detail.draft.edges as WorkflowDraft["edges"]), [detail.draft]);
  return <div className="space-y-4"><p className="text-sm text-muted-foreground">{detail.description || "暂无描述"}</p><div className="h-[420px] overflow-hidden rounded-lg border"><ReactFlowProvider><WorkflowCanvas allowedInsertableNodeKinds={[]} canRedo={false} canUndo={false} edges={rendered.edges} isReadOnly nodes={rendered.nodes} onAddNode={() => undefined} onArrange={() => undefined} onConnect={() => undefined} onEdgesChange={() => undefined} onIsValidConnection={() => false} onNodeDrag={() => undefined} onNodeDragStart={() => undefined} onNodeDragStop={() => undefined} onNodeHoverEnd={() => undefined} onNodeHoverStart={() => undefined} onNodesChange={() => undefined} onPaletteOpenChange={() => undefined} onPaneClick={() => undefined} onRedo={() => undefined} onSelectEdge={() => undefined} onSelectNode={() => undefined} onUndo={() => undefined} onViewportChangeEnd={() => undefined} paletteOpen={false} viewport={detail.draft.viewport} /></ReactFlowProvider></div><div className="flex justify-end gap-2"><Button onClick={onBack} type="button" variant="outline">返回</Button><Button onClick={onApply} type="button">一键应用</Button></div></div>;
}
