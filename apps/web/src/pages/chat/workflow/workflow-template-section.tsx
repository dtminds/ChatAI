import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getWorkflowTemplateTagLabel, normalizeWorkflowTemplateTagIds, workflowTemplateTagDimensions, type WorkflowTemplateDetail, type WorkflowTemplateListItem } from "@chatai/contracts";
import { AlertCircleIcon, ArrowLeft02Icon, Cancel01Icon, DashboardCircleAddIcon, Delete01Icon, FlashIcon, MoreHorizontalIcon, WorkflowSquare06Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IconStack } from "@/components/ui/icon-stack";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { TablePagination } from "@/components/ui/table-pagination";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";
import { AiHostingLayout } from "../ai-hosting/ai-hosting-layout";
import { createEmptyWorkflowTemplateRepository, createWorkflowTemplateRepository, type WorkflowTemplateRepository } from "./workflow-template-repository";
import { canManageWorkflowTemplates } from "./workflow-template-access";
import { useWorkflowSurface, WorkflowSurfaceProvider } from "./workflow-surface";
import { nodeVisuals } from "./node-definitions";
import type { WorkflowDraft } from "./types";

const WorkflowGraphPreview = lazy(() => import("./workflow-graph-preview").then(module => ({
  default: module.WorkflowGraphPreview,
})));

export function WorkflowTemplateSection({ repository }: { repository?: WorkflowTemplateRepository } = {}) {
  const surface = useWorkflowSurface();
  const navigate = useNavigate();
  const templateRepository = useMemo(() => repository
    ?? (import.meta.env.MODE === "test"
      ? createEmptyWorkflowTemplateRepository()
      : createWorkflowTemplateRepository(undefined, surface.apiBasePath.replace(/\/workflows$/, ""))), [repository, surface.apiBasePath]);
  const [featuredItems, setFeaturedItems] = useState<WorkflowTemplateListItem[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(false);
  const [featuredError, setFeaturedError] = useState(false);
  const [browserItems, setBrowserItems] = useState<WorkflowTemplateListItem[]>([]);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<WorkflowTemplateDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [browserLoading, setBrowserLoading] = useState(false);
  const [browserError, setBrowserError] = useState(false);
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);
  const [withdrawConfirmOpen, setWithdrawConfirmOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const canManageTemplates = canManageWorkflowTemplates(useAuthStore(state => state.subUser));
  const canOpenDraftBox = canManageTemplates
    && Boolean(templateRepository.deleteDraft && templateRepository.listDrafts && templateRepository.getDraft && templateRepository.publish);
  const applyRequestRef = useRef<{ requestId: string; templateId: string } | null>(null);
  const pageSize = 8;

  const loadFeatured = useCallback(async () => {
    setFeaturedLoading(true);
    setFeaturedError(false);
    try {
      const result = await templateRepository.list({
        featured: true,
        limit: 4,
      });
      setFeaturedItems(result.items);
    } catch {
      setFeaturedError(true);
    } finally {
      setFeaturedLoading(false);
    }
  }, [templateRepository]);

  const loadBrowser = useCallback(async (input: { page: number; query?: string }) => {
    setBrowserLoading(true);
    setBrowserError(false);
    try {
      const result = await templateRepository.list({
        limit: pageSize,
        page: input.page,
        query: input.query?.trim() || undefined,
      });
      setBrowserItems(result.items);
      setTotal(result.total);
      setPage(input.page);
    } catch {
      setBrowserError(true);
    } finally {
      setBrowserLoading(false);
    }
  }, [templateRepository]);

  useEffect(() => { void loadFeatured(); }, [loadFeatured]);

  const openBrowser = () => {
    navigate(`${surface.webBasePath}/templates`);
  };
  const goToPage = (nextPage: number) => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const targetPage = Math.min(Math.max(1, nextPage), totalPages);
    if (targetPage === page) return;
    void loadBrowser({ page: targetPage, query });
  };
  const openDetail = async (item: WorkflowTemplateListItem) => {
    setOpen(true);
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await templateRepository.get(item.id));
    } catch {
      toast.error("操作失败，请稍后重试");
    } finally {
      setDetailLoading(false);
    }
  };
  const applyTemplate = async (templateId: string) => {
    if (applyingTemplateId) return;
    const currentRequest = applyRequestRef.current;
    const requestId = currentRequest?.templateId === templateId
      ? currentRequest.requestId
      : (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
    applyRequestRef.current = { requestId, templateId };
    setApplyingTemplateId(templateId);
    try {
      const result = await templateRepository.apply(templateId, { clientRequestId: requestId });
      setOpen(false);
      applyRequestRef.current = null;
      navigate(`${surface.webBasePath}/${result.id}`);
    } catch {
      toast.error("操作失败，请稍后重试");
    } finally {
      setApplyingTemplateId(null);
    }
  };

  const withdrawTemplate = async () => {
    if (!detail || !templateRepository.withdraw || withdrawing) return;
    setWithdrawing(true);
    try {
      await templateRepository.withdraw(detail.id);
      toast.success("模板已撤回");
      setWithdrawConfirmOpen(false);
      setDetail(null);
      setOpen(false);
      await loadFeatured();
    } catch {
      toast.error("操作失败，请稍后重试");
    } finally {
      setWithdrawing(false);
    }
  };

  return <section aria-label="推荐模板" className="space-y-3">
    <div className="flex items-center justify-between"><h2 className="text-base font-semibold">推荐模板</h2><div className="flex items-center gap-1">{canOpenDraftBox ? <TemplateDraftBox onPublished={loadFeatured} repository={templateRepository} /> : null}<Button onClick={openBrowser} type="button" variant="ghost">查看更多</Button></div></div>
    {featuredLoading && featuredItems.length === 0 ? <div className="flex min-h-56 items-center justify-center" role="status"><Spinner /></div> : featuredError ? <TemplateLoadErrorState onRetry={() => void loadFeatured()} /> : featuredItems.length === 0 ? <TemplateEmptyState /> : <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,_280px),_1fr))] gap-3">{featuredItems.map(item => <TemplateCard item={item} key={item.id} onPreview={() => void openDetail(item)} />)}</div>}
    <Dialog onOpenChange={value => { if (!withdrawing) { setOpen(value); if (!value) { setDetail(null); setDetailLoading(false); } } }} open={open}>
      <DialogContent className="flex h-[85vh] max-h-[85vh] w-[85vw] max-w-[85vw] flex-col" closeButtonDisabled={withdrawing} closeButtonVisible={!detail}>
        <DialogHeader className={detail ? "shrink-0 flex-row items-center justify-between gap-4 space-y-0" : "shrink-0"}>
          <DialogTitle className={detail ? "w-0 min-w-0 flex-1 truncate" : undefined}>{detail ? detail.name : "模板中心"}</DialogTitle>
          {detail ? <TemplateDetailActions
            actionLabel={applyingTemplateId === detail.id ? "使用中" : "使用模板"}
            actionClassName="bg-black text-white hover:bg-black/85"
            actionIcon={DashboardCircleAddIcon}
            actionPending={applyingTemplateId === detail.id || withdrawing}
            onAction={() => void applyTemplate(detail.id)}
            overflowLabel="撤回为草稿"
            onOverflow={() => setWithdrawConfirmOpen(true)}
            showOverflow={canManageTemplates && detail.status === "published" && Boolean(templateRepository.withdraw)}
          /> : null}
        </DialogHeader>
        {detailLoading ? <div className="flex min-h-0 flex-1 items-center justify-center" role="status"><Spinner /></div> : detail ? <TemplateDetailView canvasClassName="min-h-0 flex-1" detail={detail} /> : <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-1">
          <Input aria-label="搜索模板" className="w-[260px] max-w-full" onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void loadBrowser({ page: 1, query: event.currentTarget.value }); }} placeholder="搜索模板" value={query} />
          {browserLoading ? <div className="flex min-h-56 items-center justify-center" role="status"><Spinner /></div> : browserError ? <TemplateLoadErrorState onRetry={() => void loadBrowser({ page, query })} /> : browserItems.length === 0 ? <TemplateEmptyState /> : <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,_280px),_1fr))] gap-3">{browserItems.map(item => <TemplateCard item={item} key={item.id} onPreview={() => void openDetail(item)} />)}</div>}
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
    <AlertDialog onOpenChange={value => { if (!withdrawing) setWithdrawConfirmOpen(value); }} open={withdrawConfirmOpen}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>撤回模板</AlertDialogTitle>
          <AlertDialogDescription>撤回后模板将回到草稿箱，普通用户将无法继续使用</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={withdrawing}>取消</AlertDialogCancel>
          <AlertDialogAction disabled={withdrawing} onClick={event => { event.preventDefault(); void withdrawTemplate(); }}>
            {withdrawing ? "撤回中" : "撤回"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}

export function WorkflowTemplateCenterPage({
  repository,
  surface = "chatai",
}: {
  repository?: WorkflowTemplateRepository;
  surface?: "chatai" | "sop_embed";
} = {}) {
  return (
    <WorkflowSurfaceProvider surface={surface}>
      <WorkflowTemplateCenterContent repository={repository} />
    </WorkflowSurfaceProvider>
  );
}

function WorkflowTemplateCenterContent({ repository }: { repository?: WorkflowTemplateRepository }) {
  const surface = useWorkflowSurface();
  const navigate = useNavigate();
  const templateRepository = useMemo(() => repository
    ?? (import.meta.env.MODE === "test"
      ? createEmptyWorkflowTemplateRepository()
      : createWorkflowTemplateRepository(undefined, surface.apiBasePath.replace(/\/workflows$/, ""))), [repository, surface.apiBasePath]);
  const [items, setItems] = useState<WorkflowTemplateListItem[]>([]);
  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [detail, setDetail] = useState<WorkflowTemplateDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);
  const [withdrawConfirmOpen, setWithdrawConfirmOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const canManageTemplates = canManageWorkflowTemplates(useAuthStore(state => state.subUser));
  const applyRequestRef = useRef<{ requestId: string; templateId: string } | null>(null);
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(async (input: { page: number; query?: string; tags?: string[] }) => {
    setLoading(true);
    setError(false);
    try {
      const result = await templateRepository.list({
        limit: pageSize,
        page: input.page,
        query: input.query?.trim() || undefined,
        tags: input.tags ?? selectedTags,
      });
      setItems(result.items);
      setTotal(result.total);
      setPage(input.page);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [selectedTags, templateRepository]);

  useEffect(() => { void load({ page: 1, tags: selectedTags }); }, [load, selectedTags]);

  const openDetail = async (item: WorkflowTemplateListItem) => {
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await templateRepository.get(item.id));
    } catch {
      toast.error("操作失败，请稍后重试");
    } finally {
      setDetailLoading(false);
    }
  };
  const applyTemplate = async (templateId: string) => {
    if (applyingTemplateId) return;
    const currentRequest = applyRequestRef.current;
    const requestId = currentRequest?.templateId === templateId
      ? currentRequest.requestId
      : (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
    applyRequestRef.current = { requestId, templateId };
    setApplyingTemplateId(templateId);
    try {
      const result = await templateRepository.apply(templateId, { clientRequestId: requestId });
      setDetail(null);
      applyRequestRef.current = null;
      navigate(`${surface.webBasePath}/${result.id}`);
    } catch {
      toast.error("操作失败，请稍后重试");
    } finally {
      setApplyingTemplateId(null);
    }
  };
  const withdrawTemplate = async () => {
    if (!detail || !templateRepository.withdraw || withdrawing) return;
    setWithdrawing(true);
    try {
      await templateRepository.withdraw(detail.id);
      toast.success("模板已撤回");
      setWithdrawConfirmOpen(false);
      setDetail(null);
      await load({ page: Math.min(page, totalPages), query, tags: selectedTags });
    } catch {
      toast.error("操作失败，请稍后重试");
    } finally {
      setWithdrawing(false);
    }
  };
  const goToPage = (nextPage: number) => {
    const targetPage = Math.min(Math.max(1, nextPage), totalPages);
    if (targetPage === page) return;
    void load({ page: targetPage, query, tags: selectedTags });
  };
  const toggleTag = (tagId: string) => {
    const nextTags = selectedTags.includes(tagId)
      ? selectedTags.filter(id => id !== tagId)
      : [...selectedTags, tagId];
    setSelectedTags(nextTags);
  };
  const clearDimension = (dimensionId: string) => {
    const dimensionTagIds = new Set<string>(workflowTemplateTagDimensions.find(item => item.id === dimensionId)?.tags.map(tag => tag.id));
    const nextTags = selectedTags.filter(tagId => !dimensionTagIds.has(tagId));
    if (nextTags.length === selectedTags.length) return;
    setSelectedTags(nextTags);
  };

  const content = (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Button
          aria-label="返回工作流列表"
          asChild
          className="-ml-2 size-9 shrink-0 rounded-[8px]"
          size="icon"
          type="button"
          variant="ghost"
        >
          <Link to={surface.webBasePath}>
            <HugeiconsIcon aria-hidden="true" icon={ArrowLeft02Icon} size={18} strokeWidth={1.8} />
          </Link>
        </Button>
        <h1 className="text-[22px] font-semibold leading-tight">模板中心</h1>
      </header>
      <div className="space-y-4">
        <div aria-label="模板筛选" className="space-y-2">
          {workflowTemplateTagDimensions.map(dimension => {
            const selectedInDimension = selectedTags.filter(tagId => dimension.tags.some(tag => tag.id === tagId));
            return <div className="flex flex-wrap items-center gap-2" key={dimension.id}>
              <span className="w-24 shrink-0 text-sm text-muted-foreground">{dimension.label}</span>
              <Button aria-pressed={selectedInDimension.length === 0} className="h-8" onClick={() => clearDimension(dimension.id)} size="sm" type="button" variant={selectedInDimension.length === 0 ? "secondary" : "ghost"}>全部</Button>
              {dimension.tags.map(tag => <Button aria-pressed={selectedTags.includes(tag.id)} className="h-8" key={tag.id} onClick={() => toggleTag(tag.id)} size="sm" type="button" variant={selectedTags.includes(tag.id) ? "secondary" : "ghost"}>{tag.label}</Button>)}
            </div>;
          })}
        </div>
        <Input
          aria-label="搜索模板"
          className="w-[260px] max-w-full"
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter") void load({ page: 1, query: event.currentTarget.value, tags: selectedTags }); }}
          placeholder="搜索模板"
          value={query}
        />
        {loading ? <div className="flex min-h-56 items-center justify-center" role="status"><Spinner /></div> : error ? <TemplateLoadErrorState onRetry={() => void load({ page, query, tags: selectedTags })} /> : items.length === 0 ? <TemplateEmptyState /> : <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,_280px),_1fr))] gap-3">{items.map(item => <TemplateCard item={item} key={item.id} onPreview={() => { setDetailLoading(true); void openDetail(item); }} />)}</div>}
        <TablePagination className="border-t-0" onPageChange={goToPage} page={page} showTotal total={total} totalPages={totalPages} />
      </div>
      <Dialog onOpenChange={value => { if (!withdrawing) { if (!value) { setDetail(null); setDetailLoading(false); } } }} open={Boolean(detail) || detailLoading}>
        <DialogContent className="flex h-[85vh] max-h-[85vh] w-[85vw] max-w-[85vw] flex-col" closeButtonDisabled={withdrawing || detailLoading} closeButtonVisible={!detailLoading}>
          <DialogHeader className={detail ? "shrink-0 flex-row items-center justify-between gap-4 space-y-0" : "shrink-0"}>
            <DialogTitle className={detail ? "w-0 min-w-0 flex-1 truncate" : undefined}>{detail ? detail.name : "模板中心"}</DialogTitle>
            {detail ? <TemplateDetailActions
              actionLabel={applyingTemplateId === detail.id ? "使用中" : "使用模板"}
              actionClassName="bg-black text-white hover:bg-black/85"
              actionIcon={DashboardCircleAddIcon}
              actionPending={applyingTemplateId === detail.id || withdrawing}
              onAction={() => void applyTemplate(detail.id)}
              overflowLabel="撤回为草稿"
              onOverflow={() => setWithdrawConfirmOpen(true)}
              showOverflow={canManageTemplates && detail.status === "published" && Boolean(templateRepository.withdraw)}
            /> : null}
          </DialogHeader>
          {detailLoading ? <div className="flex min-h-0 flex-1 items-center justify-center" role="status"><Spinner /></div> : detail ? <TemplateDetailView canvasClassName="min-h-0 flex-1" detail={detail} /> : null}
        </DialogContent>
      </Dialog>
      <AlertDialog onOpenChange={value => { if (!withdrawing) setWithdrawConfirmOpen(value); }} open={withdrawConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader><AlertDialogTitle>撤回模板</AlertDialogTitle><AlertDialogDescription>撤回后模板将回到草稿箱，普通用户将无法继续使用</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={withdrawing}>取消</AlertDialogCancel><AlertDialogAction disabled={withdrawing} onClick={event => { event.preventDefault(); void withdrawTemplate(); }}>{withdrawing ? "撤回中" : "撤回"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  return surface.embedded ? <main className="min-h-svh bg-background p-6 text-foreground"><div className="mx-auto max-w-[1600px]">{content}</div></main> : <AiHostingLayout title="模板中心">{content}</AiHostingLayout>;
}

function TemplateDraftBox({ onPublished, repository }: { onPublished: () => Promise<void> | void; repository: WorkflowTemplateRepository }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<WorkflowTemplateListItem[]>([]);
  const [detail, setDetail] = useState<WorkflowTemplateDetail | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const pageSize = 8;

  const load = useCallback(async (input: { page: number; query?: string }) => {
    if (!repository.listDrafts) return;
    setLoading(true);
    setError(false);
    try {
      const result = await repository.listDrafts({
        limit: pageSize,
        page: input.page,
        query: input.query?.trim() || undefined,
      });
      setItems(result.items);
      setTotal(result.total);
      setPage(input.page);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [repository]);

  const openDraftBox = () => {
    setOpen(true);
    setDetail(null);
    void load({ page: 1, query });
  };
  const goToPage = (nextPage: number) => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const targetPage = Math.min(Math.max(1, nextPage), totalPages);
    if (targetPage === page) return;
    void load({ page: targetPage, query });
  };
  const openDetail = async (item: WorkflowTemplateListItem) => {
    if (!repository.getDraft) return;
    try {
      setDetail(await repository.getDraft(item.id));
    } catch {
      toast.error("操作失败，请稍后重试");
    }
  };
  const publish = async () => {
    if (!detail || !repository.publish || publishing) return;
    setPublishing(true);
    try {
      await repository.publish(detail.id);
      toast.success("模板已发布");
      setDetail(null);
      const nextPage = page > 1 && items.length === 1 ? page - 1 : page;
      await load({ page: nextPage, query });
      await onPublished();
    } catch {
      toast.error("操作失败，请稍后重试");
    } finally {
      setPublishing(false);
    }
  };
  const deleteDraft = async () => {
    if (!detail || !repository.deleteDraft || deleting) return;
    setDeleting(true);
    try {
      await repository.deleteDraft(detail.id);
      toast.success("草稿已删除");
      setDeleteConfirmOpen(false);
      setDetail(null);
      const nextPage = page > 1 && items.length === 1 ? page - 1 : page;
      await load({ page: nextPage, query });
    } catch {
      toast.error("操作失败，请稍后重试");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Button onClick={openDraftBox} type="button" variant="ghost">草稿箱</Button>
      <Dialog onOpenChange={value => { if (!deleting) { setOpen(value); if (!value) setDetail(null); } }} open={open}>
        <DialogContent className={cn("workflow-page flex h-auto max-h-[85vh] w-[85vw] max-w-[85vw] flex-col", detail ? "h-[85vh]" : undefined)} closeButtonDisabled={deleting} closeButtonVisible={!detail}>
          <DialogHeader className={detail ? "shrink-0 flex-row items-center justify-between gap-4 space-y-0" : "shrink-0"}>
            <DialogTitle className={detail ? "min-w-0 flex-1 truncate" : undefined}>{detail ? detail.name : "模板草稿"}</DialogTitle>
            {detail ? <TemplateDetailActions
              actionLabel={publishing ? "发布中" : "发布模板"}
              actionPending={publishing || deleting}
              onAction={() => void publish()}
              overflowLabel="删除草稿"
              onOverflow={() => setDeleteConfirmOpen(true)}
              showOverflow
              destructiveOverflow
            /> : null}
          </DialogHeader>
          {detail ? (
            <TemplateDetailView canvasClassName="min-h-0 flex-1" detail={detail} />
          ) : (
            <div className="min-h-0 space-y-4 overflow-y-auto p-1">
              <Input
                aria-label="搜索模板草稿"
                className="w-[260px] max-w-full"
                onChange={event => setQuery(event.target.value)}
                onKeyDown={event => { if (event.key === "Enter") void load({ page: 1, query: event.currentTarget.value }); }}
                placeholder="搜索模板草稿"
                value={query}
              />
              {loading ? (
                <div className="flex min-h-56 items-center justify-center" role="status"><Spinner /></div>
              ) : error ? (
                <TemplateLoadErrorState onRetry={() => void load({ page, query })} />
              ) : items.length === 0 ? (
                <TemplateEmptyState />
              ) : (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,_280px),_1fr))] gap-3">
                  {items.map(item => <TemplateCard item={item} key={item.id} onPreview={() => void openDetail(item)} />)}
                </div>
              )}
              <TablePagination
                className="border-t-0"
                onPageChange={goToPage}
                page={page}
                showTotal
                total={total}
                totalPages={Math.max(1, Math.ceil(total / pageSize))}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog onOpenChange={value => { if (!deleting) setDeleteConfirmOpen(value); }} open={deleteConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>删除模板草稿</AlertDialogTitle>
            <AlertDialogDescription>删除后无法恢复</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={event => {
                event.preventDefault();
                void deleteDraft();
              }}
              variant="destructive"
            >
              {deleting ? "删除中" : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TemplateEmptyState() {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center px-6 py-8 text-center" role="status">
      <IconStack aria-hidden="true" className="mb-3 h-20 w-18">
        <HugeiconsIcon aria-hidden="true" icon={WorkflowSquare06Icon} size={16} strokeWidth={1.8} />
      </IconStack>
      <span className="text-sm text-muted-foreground">暂无数据</span>
    </div>
  );
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

function TemplateCard({ item, onPreview }: { item: WorkflowTemplateListItem; onPreview: () => void }) {
  return (
    <article
      className="flex min-h-52 cursor-pointer flex-col overflow-hidden rounded-[14px] border border-border/80 bg-card p-3 transition-shadow hover:shadow-[0_10px_24px_var(--shadow-soft)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
      data-testid={`workflow-template-card-${item.id}`}
      onClick={onPreview}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPreview();
        }
      }}
      tabIndex={0}
    >
      <div className="relative aspect-[1.8] overflow-hidden rounded-lg bg-muted">
        {item.coverUrl ? <img alt="" className="h-full w-full object-cover" src={item.coverUrl} /> : (
          <div className="flex h-full items-center justify-center">
            <IconStack aria-hidden="true" className="h-16 w-14" variant="primary">
              <HugeiconsIcon aria-hidden="true" icon={WorkflowSquare06Icon} size={15} strokeWidth={1.8} />
            </IconStack>
          </div>
        )}
      </div>
      <div className="mt-3 min-w-0">
        <h3 className="truncate font-medium" title={item.name}>{item.name}</h3>
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <HugeiconsIcon aria-hidden="true" icon={FlashIcon} size={14} strokeWidth={1.8} />
          <span className="truncate" title={item.trigger || "未配置"}>{item.trigger || "未配置"}</span>
          <span aria-hidden="true">/</span>
          <HugeiconsIcon aria-hidden="true" icon={WorkflowSquare06Icon} size={14} strokeWidth={1.8} />
          <span className="shrink-0">{item.nodeCount} 个节点</span>
        </div>
        <TemplateTags tags={item.tags} />
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 pt-3">
        <TemplateNodeKinds nodeKinds={item.nodeKinds} />
        <Button
          aria-label={`查看模板 ${item.name}`}
          onClick={event => {
            event.stopPropagation();
            onPreview();
          }}
          size="sm"
          type="button"
          variant="secondary"
        >
          查看模板
        </Button>
      </div>
    </article>
  );
}

function TemplateTags({ max, tags }: { max?: number; tags?: readonly string[] }) {
  const visibleTags = normalizeWorkflowTemplateTagIds(tags);
  if (visibleTags.length === 0) return null;
  const shown = max === undefined ? visibleTags : visibleTags.slice(0, max);
  const remaining = visibleTags.length - shown.length;
  return <div aria-label="模板标签" className="mt-2 flex min-w-0 flex-wrap gap-1.5">
    {shown.map(tagId => <span className="max-w-32 truncate rounded border border-border/70 px-1.5 py-0.5 text-xs text-muted-foreground" key={tagId} title={getWorkflowTemplateTagLabel(tagId)}>{getWorkflowTemplateTagLabel(tagId)}</span>)}
    {remaining > 0 ? <span className="rounded border border-border/70 px-1.5 py-0.5 text-xs text-muted-foreground">+{remaining}</span> : null}
  </div>;
}

function TemplateNodeKinds({ nodeKinds }: { nodeKinds: WorkflowTemplateListItem["nodeKinds"] }) {
  const businessKinds = nodeKinds.filter(kind => kind !== "start" && kind !== "end");
  const allKinds = ["start" as const, ...businessKinds, "end" as const];
  const displayKinds = businessKinds.length < 3 ? allKinds : businessKinds;
  const visibleKinds = displayKinds.slice(0, 3);
  const remainingCount = allKinds.length - visibleKinds.length;
  return (
    <div aria-label="模板节点类型" className="flex min-w-0 items-center -space-x-2">
      {visibleKinds.map(kind => {
        const visual = nodeVisuals[kind];
        return visual ? <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background" key={kind} title={visual.label}>
          <HugeiconsIcon
            aria-hidden="true"
            className="workflow-template-node-icon"
            icon={visual.icon}
            size={15}
            strokeWidth={1.8}
            style={{ "--workflow-template-node-accent-rgb": visual.accentRgb } as CSSProperties}
          />
        </span> : null;
      })}
      {remainingCount > 0 ? <span className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-background bg-muted text-xs text-muted-foreground">+{remainingCount}</span> : null}
    </div>
  );
}

function TemplateDetailActions({
  actionLabel,
  actionClassName,
  actionIcon,
  actionPending = false,
  destructiveOverflow = false,
  onAction,
  onOverflow,
  overflowLabel,
  showOverflow = false,
}: {
  actionLabel: string;
  actionClassName?: string;
  actionIcon?: IconSvgElement;
  actionPending?: boolean;
  destructiveOverflow?: boolean;
  onAction: () => void;
  onOverflow?: () => void;
  overflowLabel?: string;
  showOverflow?: boolean;
}) {
  return (
    <div aria-label="模板操作" className="flex shrink-0 items-center gap-2" role="group">
      <Button className={actionClassName} disabled={actionPending} onClick={onAction} type="button">
        {actionIcon ? <HugeiconsIcon aria-hidden="true" icon={actionIcon} size={16} strokeWidth={1.8} /> : null}
        {actionLabel}
      </Button>
      {showOverflow && onOverflow && overflowLabel ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="更多模板操作" className="size-10 rounded-[10px] p-0" disabled={actionPending} size="icon" type="button" variant="secondary">
              <HugeiconsIcon aria-hidden="true" icon={MoreHorizontalIcon} size={18} strokeWidth={1.8} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className={destructiveOverflow ? "text-destructive focus:text-destructive" : undefined} onSelect={onOverflow}>
              {destructiveOverflow ? <HugeiconsIcon aria-hidden="true" icon={Delete01Icon} size={16} strokeWidth={1.8} /> : null}
              {overflowLabel}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <DialogClose asChild>
        <Button
          aria-label="关闭"
          className="size-10 rounded-[10px] p-0"
          disabled={actionPending}
          size="icon"
          type="button"
          variant="secondary"
        >
          <HugeiconsIcon aria-hidden="true" icon={Cancel01Icon} size={16} strokeWidth={1.8} />
        </Button>
      </DialogClose>
    </div>
  );
}

function TemplateDetailView({ canvasClassName = "h-[420px]", detail }: { canvasClassName?: string; detail: WorkflowTemplateDetail }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {detail.description ? <p className="text-sm text-muted-foreground">{detail.description}</p> : null}
      <TemplateTags max={Number.POSITIVE_INFINITY} tags={detail.tags} />
      <Suspense fallback={<div className={cn("flex items-center justify-center rounded-lg border", canvasClassName)} role="status"><Spinner /></div>}>
        <WorkflowGraphPreview className={canvasClassName} draft={detail.draft as WorkflowDraft} />
      </Suspense>
    </div>
  );
}
