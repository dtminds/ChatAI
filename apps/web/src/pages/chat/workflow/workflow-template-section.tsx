import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type AnimationEvent } from "react";
import { getWorkflowTemplateTagLabel, normalizeWorkflowTemplateTagIds, workflowTemplateTagDimensions, type WorkflowTemplateDetail, type WorkflowTemplateDraftUpdateRequest, type WorkflowTemplateListItem } from "@chatai/contracts";
import { AlertCircleIcon, ArrowLeft02Icon, Cancel01Icon, DashboardCircleAddIcon, Delete01Icon, FlashIcon, MoreHorizontalIcon, ToolCaseIcon, WorkflowSquare06Icon } from "@hugeicons/core-free-icons";
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
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { canCreateWorkflows, canManageWorkflowTemplates } from "./workflow-template-access";
import { getWorkflowOperationErrorMessage } from "./workflow-error-messages";
import { WORKFLOW_TEMPLATE_METADATA_DIALOG_CLASS_NAME, WorkflowTemplateMetadataFields, type WorkflowTemplateMetadataValue } from "./workflow-template-metadata-fields";
import { useWorkflowSurface, WorkflowSurfaceProvider } from "./workflow-surface";
import { nodeVisuals } from "./node-definitions";
import type { WorkflowDraft } from "./types";
import "./workflow-page.css";

const WorkflowGraphPreview = lazy(() => import("./workflow-graph-preview").then(module => ({
  default: module.WorkflowGraphPreview,
})));

const WORKFLOW_TEMPLATE_BACKGROUND_COUNT = 22;
const WORKFLOW_TEMPLATE_BACKGROUND_BASE_URL = "https://b5.bokr.com.cn/dist/backgrounds";
const WORKFLOW_TEMPLATE_BACKGROUND_TONES = [
  "light",
  "light",
  "light",
  "dark",
  "light",
  "light",
  "dark",
  "dark",
  "light",
  "light",
  "dark",
  "light",
  "light",
  "dark",
  "light",
  "light",
  "dark",
  "light",
  "light",
  "light",
  "dark",
  "dark",
] as const;

function getWorkflowTemplateBackgroundId(templateId: string) {
  const numericId = Number(templateId);
  const stableId = Number.isSafeInteger(numericId) && numericId >= 0
    ? numericId
    : [...templateId].reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0, 0);
  return stableId % WORKFLOW_TEMPLATE_BACKGROUND_COUNT || WORKFLOW_TEMPLATE_BACKGROUND_COUNT;
}

function getWorkflowTemplateBackgroundUrl(templateId: string) {
  return `${WORKFLOW_TEMPLATE_BACKGROUND_BASE_URL}/${getWorkflowTemplateBackgroundId(templateId)}.png!w800.webp`;
}

function getWorkflowTemplateCoverTone(item: Pick<WorkflowTemplateListItem, "coverUrl" | "id">) {
  if (item.coverUrl) return "light";
  return WORKFLOW_TEMPLATE_BACKGROUND_TONES[getWorkflowTemplateBackgroundId(item.id) - 1] ?? "light";
}

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
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<WorkflowTemplateDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [detailItem, setDetailItem] = useState<WorkflowTemplateListItem | null>(null);
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);
  const [withdrawConfirmOpen, setWithdrawConfirmOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const canManageTemplates = canManageWorkflowTemplates(useAuthStore(state => state.subUser));
  const canCreateWorkflow = canCreateWorkflows(useAuthStore(state => state.subUser));
  const applyRequestRef = useRef<{ requestId: string; templateId: string } | null>(null);
  const clearDetail = () => {
    setDetail(null);
    setDetailItem(null);
    setDetailError(false);
    setDetailLoading(false);
  };
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

  useEffect(() => { void loadFeatured(); }, [loadFeatured]);

  const openBrowser = () => {
    navigate(`${surface.webBasePath}/templates`);
  };
  const openDetail = async (item: WorkflowTemplateListItem) => {
    setOpen(true);
    setDetailItem(item);
    setDetail(null);
    setDetailError(false);
    setDetailLoading(true);
    try {
      setDetail(await templateRepository.get(item.id));
    } catch {
      setDetailError(true);
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
    } catch (error) {
      toast.error(getWorkflowOperationErrorMessage(error));
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
      setOpen(false);
      await loadFeatured();
    } catch (error) {
      toast.error(getWorkflowOperationErrorMessage(error));
    } finally {
      setWithdrawing(false);
    }
  };
  const updateTemplateInfo = async (input: WorkflowTemplateDraftUpdateRequest) => {
    if (!detail || !templateRepository.updateInfo || editing) return;
    setEditing(true);
    try {
      const updated = await templateRepository.updateInfo(detail.id, input);
      setDetail(updated);
      setEditOpen(false);
      toast.success("模板信息已更新");
      await loadFeatured();
    } catch (error) {
      toast.error(getWorkflowOperationErrorMessage(error));
    } finally {
      setEditing(false);
    }
  };

  return <section aria-label="推荐模板" className="space-y-3">
    <div className="flex items-center justify-between px-1.5"><h2 className="flex items-center gap-2 text-base font-semibold"><HugeiconsIcon aria-hidden="true" icon={ToolCaseIcon} size={17} strokeWidth={1.8} />推荐模板</h2><Button onClick={openBrowser} type="button" variant="link">查看更多</Button></div>
    {featuredLoading && featuredItems.length === 0 ? <div className="flex min-h-56 items-center justify-center" role="status"><Spinner /></div> : featuredError ? <TemplateLoadErrorState onRetry={() => void loadFeatured()} /> : featuredItems.length === 0 ? <TemplateEmptyState /> : <div className="workflow-template-featured-container"><div className="workflow-template-featured-grid">{featuredItems.map(item => <TemplateCard item={item} key={item.id} onPreview={() => void openDetail(item)} />)}</div></div>}
    <Dialog onOpenChange={value => { if (!withdrawing) setOpen(value); }} open={open}>
      <DialogContent className="flex h-[85vh] max-h-[85vh] w-[85vw] max-w-[85vw] flex-col" closeButtonDisabled={withdrawing} closeButtonVisible={!detail} onAnimationEnd={event => { if (isTemplateDialogCloseAnimation(event)) clearDetail(); }}>
        <DialogHeader className={detail ? "shrink-0 flex-row items-center justify-between gap-4 space-y-0" : "shrink-0"}>
          <DialogTitle className={detail ? "w-0 min-w-0 flex-1 truncate" : undefined}>{detail?.name ?? detailItem?.name ?? "模板详情"}</DialogTitle>
          {detail ? <TemplateDetailActions
            actionLabel={canCreateWorkflow ? (applyingTemplateId === detail.id ? "使用中" : "使用模板") : undefined}
            actionClassName="bg-black text-white hover:bg-black/85"
            actionIcon={DashboardCircleAddIcon}
            actionPending={applyingTemplateId === detail.id || withdrawing || editing}
            onAction={canCreateWorkflow ? () => void applyTemplate(detail.id) : undefined}
            overflowItems={canManageTemplates && detail.status === "published" ? [
              ...(templateRepository.updateInfo ? [{ label: "编辑信息", onSelect: () => setEditOpen(true) }] : []),
              ...(templateRepository.withdraw ? [{ destructive: true, label: "撤回为草稿", onSelect: () => setWithdrawConfirmOpen(true) }] : []),
            ] : undefined}
          /> : null}
        </DialogHeader>
        {detailLoading ? <div className="flex min-h-0 flex-1 items-center justify-center" role="status"><Spinner /></div> : detail ? <TemplateDetailView canvasClassName="min-h-0 flex-1" detail={detail} /> : detailError ? <TemplateLoadErrorState onRetry={() => { if (detailItem) void openDetail(detailItem); }} /> : null}
      </DialogContent>
    </Dialog>
    {detail ? <TemplateMetadataDialog detail={detail} onOpenChange={setEditOpen} onSubmit={updateTemplateInfo} open={editOpen} pending={editing} submitLabel="保存" title="编辑模板信息" /> : null}
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
  const [committedQuery, setCommittedQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [detail, setDetail] = useState<WorkflowTemplateDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [detailItem, setDetailItem] = useState<WorkflowTemplateListItem | null>(null);
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);
  const [withdrawConfirmOpen, setWithdrawConfirmOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const canManageTemplates = canManageWorkflowTemplates(useAuthStore(state => state.subUser));
  const canCreateWorkflow = canCreateWorkflows(useAuthStore(state => state.subUser));
  const [open, setOpen] = useState(false);
  const clearDetail = () => {
    setDetail(null);
    setDetailItem(null);
    setDetailError(false);
    setDetailLoading(false);
  };
  const canOpenDraftBox = canManageTemplates
    && Boolean(templateRepository.deleteDraft && templateRepository.listDrafts && templateRepository.getDraft && templateRepository.publish);
  const applyRequestRef = useRef<{ requestId: string; templateId: string } | null>(null);
  const loadRequestRef = useRef(0);
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(async (input: { page: number; query?: string; tags?: string[] }) => {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    setLoading(true);
    setError(false);
    try {
      const result = await templateRepository.list({
        limit: pageSize,
        page: input.page,
        query: input.query?.trim() || undefined,
        tags: input.tags ?? [],
      });
      if (loadRequestRef.current !== requestId) return;
      setItems(result.items);
      setTotal(result.total);
      setPage(input.page);
    } catch {
      if (loadRequestRef.current !== requestId) return;
      setError(true);
    } finally {
      if (loadRequestRef.current === requestId) setLoading(false);
    }
  }, [templateRepository]);

  useEffect(() => {
    void load({ page: 1, query: committedQuery, tags: selectedTags });
    return () => {
      loadRequestRef.current += 1;
    };
  }, [committedQuery, load, selectedTags]);

  const openDetail = async (item: WorkflowTemplateListItem) => {
    setOpen(true);
    setDetailItem(item);
    setDetail(null);
    setDetailError(false);
    setDetailLoading(true);
    try {
      setDetail(await templateRepository.get(item.id));
    } catch {
      setDetailError(true);
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
    } catch (error) {
      toast.error(getWorkflowOperationErrorMessage(error));
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
      setOpen(false);
      await load({ page: Math.min(page, totalPages), query: committedQuery, tags: selectedTags });
    } catch (error) {
      toast.error(getWorkflowOperationErrorMessage(error));
    } finally {
      setWithdrawing(false);
    }
  };
  const updateTemplateInfo = async (input: WorkflowTemplateDraftUpdateRequest) => {
    if (!detail || !templateRepository.updateInfo || editing) return;
    setEditing(true);
    try {
      const updated = await templateRepository.updateInfo(detail.id, input);
      setDetail(updated);
      setEditOpen(false);
      toast.success("模板信息已更新");
      await load({ page, query: committedQuery, tags: selectedTags });
    } catch (error) {
      toast.error(getWorkflowOperationErrorMessage(error));
    } finally {
      setEditing(false);
    }
  };
  const goToPage = (nextPage: number) => {
    const targetPage = Math.min(Math.max(1, nextPage), totalPages);
    if (targetPage === page) return;
    void load({ page: targetPage, query: committedQuery, tags: selectedTags });
  };
  const toggleTag = (tagId: string) => {
    const nextTags = selectedTags.includes(tagId)
      ? selectedTags.filter(id => id !== tagId)
      : [...selectedTags, tagId];
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
        {canOpenDraftBox ? <div className="ml-auto"><TemplateDraftBox onPublished={() => void load({ page: 1, query: committedQuery, tags: selectedTags })} repository={templateRepository} /></div> : null}
      </header>
      <div className="space-y-4">
        <div aria-label="模板筛选" className="space-y-2">
          {workflowTemplateTagDimensions.map(dimension => {
            return <div className="flex flex-wrap items-center gap-2" key={dimension.id}>
              <span className="w-24 shrink-0 text-sm text-muted-foreground">{dimension.label}</span>
              {dimension.tags.map(tag => <Button aria-pressed={selectedTags.includes(tag.id)} className="h-8" key={tag.id} onClick={() => toggleTag(tag.id)} size="sm" type="button" variant={selectedTags.includes(tag.id) ? "secondary" : "ghost"}>{tag.label}</Button>)}
            </div>;
          })}
        </div>
        <Input
          aria-label="搜索模板"
          className="w-[260px] max-w-full"
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter") setCommittedQuery(event.currentTarget.value); }}
          placeholder="搜索模板"
          value={query}
        />
        {loading ? <div className="flex min-h-56 items-center justify-center" role="status"><Spinner /></div> : error ? <TemplateLoadErrorState onRetry={() => void load({ page, query: committedQuery, tags: selectedTags })} /> : items.length === 0 ? <TemplateEmptyState /> : <div className="workflow-template-grid">{items.map(item => <TemplateCard item={item} key={item.id} onPreview={() => void openDetail(item)} />)}</div>}
        <TablePagination className="border-t-0" onPageChange={goToPage} page={page} showTotal total={total} totalPages={totalPages} />
      </div>
      <Dialog onOpenChange={value => { if (!withdrawing) setOpen(value); }} open={open}>
        <DialogContent className="flex h-[85vh] max-h-[85vh] w-[85vw] max-w-[85vw] flex-col" closeButtonDisabled={withdrawing || detailLoading} closeButtonVisible={!detail} onAnimationEnd={event => { if (isTemplateDialogCloseAnimation(event)) clearDetail(); }}>
          <DialogHeader className={detail ? "shrink-0 flex-row items-center justify-between gap-4 space-y-0" : "shrink-0"}>
            <DialogTitle className={detail ? "w-0 min-w-0 flex-1 truncate" : undefined}>{detail?.name ?? detailItem?.name ?? "模板详情"}</DialogTitle>
            {detail ? <TemplateDetailActions
              actionLabel={canCreateWorkflow ? (applyingTemplateId === detail.id ? "使用中" : "使用模板") : undefined}
              actionClassName="bg-black text-white hover:bg-black/85"
              actionIcon={DashboardCircleAddIcon}
              actionPending={applyingTemplateId === detail.id || withdrawing || editing}
              onAction={canCreateWorkflow ? () => void applyTemplate(detail.id) : undefined}
              overflowItems={canManageTemplates && detail.status === "published" ? [
                ...(templateRepository.updateInfo ? [{ label: "编辑信息", onSelect: () => setEditOpen(true) }] : []),
                ...(templateRepository.withdraw ? [{ destructive: true, label: "撤回为草稿", onSelect: () => setWithdrawConfirmOpen(true) }] : []),
              ] : undefined}
          /> : null}
          </DialogHeader>
          {detailLoading ? <div className="flex min-h-0 flex-1 items-center justify-center" role="status"><Spinner /></div> : detail ? <TemplateDetailView canvasClassName="min-h-0 flex-1" detail={detail} /> : detailError ? <TemplateLoadErrorState onRetry={() => { if (detailItem) void openDetail(detailItem); }} /> : null}
        </DialogContent>
      </Dialog>
      {detail ? <TemplateMetadataDialog detail={detail} onOpenChange={setEditOpen} onSubmit={updateTemplateInfo} open={editOpen} pending={editing} submitLabel="保存" title="编辑模板信息" /> : null}
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
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [detailItem, setDetailItem] = useState<WorkflowTemplateListItem | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
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
    setDetailItem(null);
    setDetailError(false);
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
    setDetailItem(item);
    setDetail(null);
    setDetailError(false);
    setDetailLoading(true);
    try {
      setDetail(await repository.getDraft(item.id));
    } catch {
      setDetailError(true);
    } finally {
      setDetailLoading(false);
    }
  };
  const publish = async (input?: WorkflowTemplateDraftUpdateRequest) => {
    if (!detail || !repository.publish || publishing) return;
    setPublishing(true);
    try {
      if (input && repository.updateDraft) await repository.updateDraft(detail.id, input);
      await repository.publish(detail.id);
      toast.success("模板已发布");
      setDetail(null);
      const nextPage = page > 1 && items.length === 1 ? page - 1 : page;
      await load({ page: nextPage, query });
      await onPublished();
    } catch (error) {
      toast.error(getWorkflowOperationErrorMessage(error));
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
    } catch (error) {
      toast.error(getWorkflowOperationErrorMessage(error));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Button onClick={openDraftBox} type="button" variant="secondary">草稿箱</Button>
      <Dialog onOpenChange={value => { if (!deleting) setOpen(value); }} open={open}>
        <DialogContent className={cn("workflow-page flex h-auto max-h-[85vh] w-[85vw] max-w-[85vw] flex-col", detail ? "h-[85vh]" : undefined)} closeButtonDisabled={deleting} closeButtonVisible={!detail} onAnimationEnd={event => { if (isTemplateDialogCloseAnimation(event)) { setDetail(null); setDetailItem(null); setDetailError(false); setDetailLoading(false); } }}>
          <DialogHeader className={detail ? "shrink-0 flex-row items-center justify-between gap-4 space-y-0" : "shrink-0"}>
            <DialogTitle className={detail ? "min-w-0 flex-1 truncate" : undefined}>{detail ? detail.name : "模板草稿"}</DialogTitle>
          {detail ? <TemplateDetailActions
              actionLabel={publishing ? "发布中" : "发布模板"}
              actionPending={publishing || deleting}
              onAction={() => setEditOpen(true)}
              overflowItems={[{ destructive: true, icon: Delete01Icon, label: "删除草稿", onSelect: () => setDeleteConfirmOpen(true) }]}
            /> : null}
          </DialogHeader>
          {detailLoading ? (
            <div className="flex min-h-0 flex-1 items-center justify-center" role="status"><Spinner /></div>
          ) : detail ? (
            <TemplateDetailView canvasClassName="min-h-0 flex-1" detail={detail} />
          ) : detailError ? (
            <TemplateLoadErrorState onRetry={() => { if (detailItem) void openDetail(detailItem); }} />
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
                <div className="workflow-template-grid">
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
      {detail ? <TemplateMetadataDialog detail={detail} onOpenChange={setEditOpen} onSubmit={publish} open={editOpen} pending={publishing} submitLabel="发布模板" title="发布模板" /> : null}
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

function TemplateMetadataDialog({ detail, onOpenChange, onSubmit, open, pending, submitLabel, title }: { detail: WorkflowTemplateDetail; onOpenChange: (open: boolean) => void; onSubmit: (input: WorkflowTemplateDraftUpdateRequest) => Promise<void>; open: boolean; pending: boolean; submitLabel: string; title: string }) {
  const [metadata, setMetadata] = useState<WorkflowTemplateMetadataValue>({
    coverUrl: detail.coverUrl ?? "",
    description: detail.description,
    name: detail.name,
    sortOrder: String(detail.sortOrder ?? 0),
    tags: detail.tags ?? [],
  });
  useEffect(() => {
    if (!open) return;
    setMetadata({
      coverUrl: detail.coverUrl ?? "",
      description: detail.description,
      name: detail.name,
      sortOrder: String(detail.sortOrder ?? 0),
      tags: detail.tags ?? [],
    });
  }, [detail, open]);
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={WORKFLOW_TEMPLATE_METADATA_DIALOG_CLASS_NAME}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <WorkflowTemplateMetadataFields onChange={setMetadata} value={metadata} />
        </div>
        <DialogFooter className="pt-2">
          <Button disabled={pending} onClick={() => onOpenChange(false)} variant="outline">关闭</Button>
          <Button disabled={pending || !metadata.name.trim() || !metadata.description.trim() || !Number.isInteger(Number(metadata.sortOrder))} onClick={() => void onSubmit({ coverUrl: metadata.coverUrl.trim() || null, description: metadata.description.trim(), name: metadata.name.trim(), sortOrder: Number(metadata.sortOrder), tags: metadata.tags })}>{pending ? `${submitLabel}中` : submitLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

function isTemplateDialogCloseAnimation(event: AnimationEvent<HTMLDivElement>) {
  return event.target === event.currentTarget && event.currentTarget.dataset.state === "closed";
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
        <img alt="" className="h-full w-full object-cover" src={item.coverUrl || getWorkflowTemplateBackgroundUrl(item.id)} />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <TemplateNodeKinds nodeKinds={item.nodeKinds} tone={getWorkflowTemplateCoverTone(item)} />
        </div>
      </div>
      <div className="mt-3 flex min-h-0 flex-1 min-w-0 flex-col">
        <h3 className="truncate text-[15px] font-medium" title={item.name}>{item.name}</h3>
        {item.description ? <p className="mt-1 truncate text-[13px] text-muted-foreground" title={item.description}>{item.description}</p> : null}
        <div className="mt-auto flex min-w-0 items-center justify-between gap-3 pt-3">
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <HugeiconsIcon aria-hidden="true" icon={FlashIcon} size={14} strokeWidth={1.8} />
            <span className="truncate" title={item.trigger || "未配置"}>{item.trigger || "未配置"}</span>
          </div>
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

function TemplateNodeKinds({
  nodeKinds,
  tone,
}: {
  nodeKinds: WorkflowTemplateListItem["nodeKinds"];
  tone: "light" | "dark";
}) {
  const businessKinds = nodeKinds.filter(kind => kind !== "start" && kind !== "end");
  const allKinds = ["start" as const, ...businessKinds, "end" as const];
  const displayKinds = businessKinds.length < 3 ? allKinds : businessKinds;
  const visibleKinds = displayKinds.slice(0, 3);
  const remainingCount = allKinds.length - visibleKinds.length;
  return (
    <div aria-label="模板节点类型" className="workflow-template-cover-overlay" data-tone={tone}>
      {visibleKinds.map(kind => {
        const visual = nodeVisuals[kind];
        return visual ? <span className="flex size-5 shrink-0 items-center justify-center" key={kind} title={visual.label}>
          <HugeiconsIcon
            aria-hidden="true"
            className="workflow-template-node-icon"
            icon={visual.icon}
            size={17}
            strokeWidth={1.8}
          />
        </span> : null;
      })}
      {remainingCount > 0 ? <span className="workflow-template-cover-overlay-count">+{remainingCount}</span> : null}
    </div>
  );
}

function TemplateDetailActions({
  actionLabel,
  actionClassName,
  actionIcon,
  actionPending = false,
  onAction,
  overflowItems = [],
}: {
  actionLabel?: string;
  actionClassName?: string;
  actionIcon?: IconSvgElement;
  actionPending?: boolean;
  onAction?: () => void;
  overflowItems?: readonly { destructive?: boolean; icon?: IconSvgElement; label: string; onSelect: () => void }[];
}) {
  return (
    <div aria-label="模板操作" className="flex shrink-0 items-center gap-2" role="group">
      {onAction && actionLabel ? (
        <Button className={actionClassName} disabled={actionPending} onClick={onAction} type="button">
          {actionIcon ? <HugeiconsIcon aria-hidden="true" icon={actionIcon} size={16} strokeWidth={1.8} /> : null}
          {actionLabel}
        </Button>
      ) : null}
      {overflowItems.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="更多模板操作" className="size-10 rounded-[10px] p-0" disabled={actionPending} size="icon" type="button" variant="secondary">
              <HugeiconsIcon aria-hidden="true" icon={MoreHorizontalIcon} size={18} strokeWidth={1.8} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {overflowItems.map(item => <DropdownMenuItem className={item.destructive ? "text-destructive focus:text-destructive" : undefined} key={item.label} onSelect={item.onSelect}>
              {item.icon ? <HugeiconsIcon aria-hidden="true" icon={item.icon} size={16} strokeWidth={1.8} /> : null}
              {item.label}
            </DropdownMenuItem>)}
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
