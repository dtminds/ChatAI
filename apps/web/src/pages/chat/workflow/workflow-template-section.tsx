import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkflowTemplateDetail, WorkflowTemplateListItem } from "@chatai/contracts";
import { AlertCircleIcon, Cancel01Icon, Delete01Icon, MoreHorizontalIcon, WorkflowSquare06Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
import { useAuthStore } from "@/store/auth-store";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { createEmptyWorkflowTemplateRepository, createWorkflowTemplateRepository, type WorkflowTemplateRepository } from "./workflow-template-repository";
import { canManageWorkflowTemplates } from "./workflow-template-access";
import { useWorkflowSurface } from "./workflow-surface";
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
    setOpen(true);
    setDetail(null);
    setPage(1);
    void loadBrowser({ page: 1, query });
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
    {featuredLoading && featuredItems.length === 0 ? <div className="flex min-h-56 items-center justify-center" role="status"><Spinner /></div> : featuredError ? <TemplateLoadErrorState onRetry={() => void loadFeatured()} /> : featuredItems.length === 0 ? <TemplateEmptyState /> : <div className="grid gap-3 md:grid-cols-4">{featuredItems.map(item => <TemplateCard item={item} key={item.id} onPreview={() => void openDetail(item)} />)}</div>}
    <Dialog onOpenChange={value => { if (!withdrawing) { setOpen(value); if (!value) { setDetail(null); setDetailLoading(false); } } }} open={open}>
      <DialogContent className="max-w-5xl" closeButtonDisabled={withdrawing} closeButtonVisible={!detail}>
        <DialogHeader className={detail ? "flex-row items-center justify-between gap-4 space-y-0" : undefined}>
          <DialogTitle className={detail ? "min-w-0 flex-1 truncate" : undefined}>{detail ? detail.name : "模板中心"}</DialogTitle>
          {detail ? <TemplateDetailActions
            actionLabel={applyingTemplateId === detail.id ? "使用中" : "使用模板"}
            actionPending={applyingTemplateId === detail.id || withdrawing}
            onAction={() => void applyTemplate(detail.id)}
            overflowLabel="撤回为草稿"
            onOverflow={() => setWithdrawConfirmOpen(true)}
            showOverflow={canManageTemplates && detail.status === "published" && Boolean(templateRepository.withdraw)}
          /> : null}
        </DialogHeader>
        {detailLoading ? <div className="flex min-h-56 items-center justify-center" role="status"><Spinner /></div> : detail ? <TemplateDetailView detail={detail} /> : <div className="space-y-4">
          <Input aria-label="搜索模板" className="w-[260px] max-w-full" onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void loadBrowser({ page: 1, query: event.currentTarget.value }); }} placeholder="搜索模板" value={query} />
          {browserLoading ? <div className="flex min-h-56 items-center justify-center" role="status"><Spinner /></div> : browserError ? <TemplateLoadErrorState onRetry={() => void loadBrowser({ page, query })} /> : browserItems.length === 0 ? <TemplateEmptyState /> : <div className="grid gap-3 md:grid-cols-2">{browserItems.map(item => <TemplateCard item={item} key={item.id} onPreview={() => void openDetail(item)} />)}</div>}
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
        <DialogContent className="workflow-page max-w-5xl" closeButtonDisabled={deleting} closeButtonVisible={!detail}>
          <DialogHeader className={detail ? "flex-row items-center justify-between gap-4 space-y-0" : undefined}>
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
            <TemplateDetailView detail={detail} />
          ) : (
            <div className="space-y-4">
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
                <div className="grid gap-3 md:grid-cols-2">
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
    <button className="flex min-h-36 flex-col rounded-lg border bg-background p-4 text-left hover:bg-muted" onClick={onPreview} type="button">
      <div className="font-medium">{item.name}</div>
      <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description || "暂无描述"}</div>
      <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground"><span>{item.category || "通用"}</span><span>{item.nodeCount} 个节点</span></div>
      <span className="sr-only">查看模板详情</span>
    </button>
  );
}

function TemplateDetailActions({
  actionLabel,
  actionPending = false,
  destructiveOverflow = false,
  onAction,
  onOverflow,
  overflowLabel,
  showOverflow = false,
}: {
  actionLabel: string;
  actionPending?: boolean;
  destructiveOverflow?: boolean;
  onAction: () => void;
  onOverflow?: () => void;
  overflowLabel?: string;
  showOverflow?: boolean;
}) {
  return (
    <div aria-label="模板操作" className="flex shrink-0 items-center gap-2" role="group">
      <Button disabled={actionPending} onClick={onAction} size="sm" type="button">{actionLabel}</Button>
      {showOverflow && onOverflow && overflowLabel ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="更多模板操作" className="size-8 rounded-[8px] p-0" disabled={actionPending} size="icon" type="button" variant="secondary">
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
          className="size-8 rounded-[8px] p-0"
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

function TemplateDetailView({ detail }: { detail: WorkflowTemplateDetail }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{detail.description || "暂无描述"}</p>
      <Suspense fallback={<div className="flex h-[420px] items-center justify-center rounded-lg border" role="status"><Spinner /></div>}>
        <WorkflowGraphPreview className="h-[420px]" draft={detail.draft as WorkflowDraft} />
      </Suspense>
    </div>
  );
}
