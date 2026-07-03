import { useEffect, useRef, useState } from "react";
import { Add01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { KB_SEARCH_QUERY_MAX_LENGTH } from "@chatai/contracts";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableCellContent,
  TableHead,
  TableHeader,
  TablePinnedCell,
  TablePinnedHead,
  TableRow,
} from "@/components/ui/table";
import {
  resolveTablePagination,
  TablePagination,
} from "@/components/ui/table-pagination";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import {
  AiHostingLayout,
  AiHostingPageHeader,
  notifyAiHostingQuotaChanged,
} from "./ai-hosting-layout";
import { KbTableLoadingRow } from "./kb-components/kb-table-loading-row";
import { TableOverflowTooltip } from "./kb-components/shared";
import { fetchAiHostingQuota } from "./ai-hosting-quota-store";
import { checkKbDelete, createKb, deleteKb, listKbs, toKbListViewItem, updateKb } from "./api/kb-service";
import type { KbListViewItem } from "./kb-types";
import {
  AI_HOSTING_KB_QUOTA_REACHED_MESSAGE,
  AI_HOSTING_QUOTA_CHECK_FAILED_MESSAGE,
  isQuotaReached,
} from "./quota";

type CreateFormState = {
  name: string;
  description: string;
};

type KnowledgeBaseDialogMode = "create" | "edit";

const PAGE_SIZE = 10;
const KNOWLEDGE_BASE_NAME_MAX_LENGTH = 30;
const KNOWLEDGE_BASE_DESCRIPTION_MAX_LENGTH = 1000;
const KB_DELETE_BLOCKED_MESSAGE = "请先删除所有文档后，再删除知识库";
const KB_DELETE_DIALOG_CLASSNAME =
  "box-border flex h-[128px] w-[400px] max-w-[400px] flex-col justify-between gap-0 p-6";
const KB_DELETE_DIALOG_MESSAGE_CLASSNAME =
  "text-left text-sm font-normal text-foreground";
const kbIntroSteps = [
  {
    description: "按特定场景/领域管理知识库，支持结构化和非结构化类型知识",
    imageAlt: "创建知识库示意图",
    imageUrl: "https://b5.bokr.com.cn/dist/ui/kb_f1.png",
    step: "第 1 步",
    title: "创建知识库",
  },
  {
    description: "Excel、PDF、Markdown 等多种文档格式，支持图片 OCR",
    imageAlt: "上传文档示意图",
    imageUrl: "https://b5.bokr.com.cn/dist/ui/kb_f2.png",
    step: "第 2 步",
    title: "上传文档",
  },
  {
    description: "在 Agent 中关联知识库，提升回答的准确性",
    imageAlt: "Agent 集成示意图",
    imageUrl: "https://b5.bokr.com.cn/dist/ui/kb_f3.png",
    step: "第 3 步",
    title: "Agent 集成",
  },
] as const;

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

export function KbListPage() {
  const [items, setItems] = useState<KbListViewItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const [currentPage, setCurrentPage] = useState(1);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<KnowledgeBaseDialogMode>("create");
  const [editingItem, setEditingItem] = useState<KbListViewItem | null>(null);
  const [createForm, setCreateForm] = useState<CreateFormState>({
    name: "",
    description: "",
  });
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [checkingQuota, setCheckingQuota] = useState(false);
  const [checkingDelete, setCheckingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<KbListViewItem | null>(null);
  const [blockedDeleteOpen, setBlockedDeleteOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteLinkedAgentCount, setDeleteLinkedAgentCount] = useState(0);
  const [listReloadKey, setListReloadKey] = useState(0);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery]);

  useEffect(() => {
    let cancelled = false;

    async function loadKbs() {
      setLoading(true);

      try {
        const response = await listKbs({
          page: currentPage,
          pageSize: PAGE_SIZE,
          query: debouncedSearchQuery,
        });

        if (cancelled) {
          return;
        }

        setItems(response.kbs.map(toKbListViewItem));
        setTotal(response.pagination.total);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadKbs();

    return () => {
      cancelled = true;
    };
  }, [currentPage, debouncedSearchQuery, listReloadKey]);

  const { activePage, totalPages } = resolveTablePagination({
    page: currentPage,
    pageSize: PAGE_SIZE,
    total,
  });
  const pagedItems = items;

  function resetCreateForm() {
    setCreateForm({ name: "", description: "" });
  }

  function handleOpenEditDialog(item: KbListViewItem) {
    setDialogMode("edit");
    setEditingItem(item);
    setCreateForm({
      description: item.description,
      name: item.name,
    });
    setCreateDialogOpen(true);
  }

  async function handleOpenCreateDialog() {
    if (checkingQuota) {
      return;
    }

    setCheckingQuota(true);

    try {
      const quota = await fetchAiHostingQuota({ force: true });

      if (quota && isQuotaReached(quota.kbs)) {
        toast.error(AI_HOSTING_KB_QUOTA_REACHED_MESSAGE);
        return;
      }

      resetCreateForm();
      setDialogMode("create");
      setEditingItem(null);
      setCreateDialogOpen(true);
    } catch {
      toast.error(AI_HOSTING_QUOTA_CHECK_FAILED_MESSAGE);
    } finally {
      setCheckingQuota(false);
    }
  }

  function handleCloseCreateDialog() {
    if (createSubmitting) {
      return;
    }

    setCreateDialogOpen(false);
    resetCreateForm();
    setDialogMode("create");
    setEditingItem(null);
  }

  async function handleDialogSubmit() {
    const name = createForm.name.trim();

    if (!name) {
      return;
    }

    setCreateSubmitting(true);

    try {
      if (dialogMode === "edit" && editingItem) {
        await updateKb(editingItem.id, {
          description: createForm.description.trim() || undefined,
          name,
        });
      } else {
        await createKb({
          description: createForm.description.trim() || undefined,
          name,
        });
      }

      if (!isMountedRef.current) {
        return;
      }

      setCreateDialogOpen(false);
      resetCreateForm();
      setDialogMode("create");
      setEditingItem(null);
      setCurrentPage(1);
      setListReloadKey((value) => value + 1);
      notifyAiHostingQuotaChanged();
    } finally {
      if (isMountedRef.current) {
        setCreateSubmitting(false);
      }
    }
  }

  function resetDeleteDialogState() {
    setDeleteTarget(null);
    setBlockedDeleteOpen(false);
    setConfirmDeleteOpen(false);
    setDeleteLinkedAgentCount(0);
  }

  async function handleDeleteClick(item: KbListViewItem) {
    if (checkingDelete || deleting) {
      return;
    }

    setDeleteTarget(item);
    setCheckingDelete(true);

    try {
      const result = await checkKbDelete(item.id);

      if (!isMountedRef.current) {
        return;
      }

      if (result.hasDocuments) {
        setBlockedDeleteOpen(true);
        return;
      }

      setDeleteLinkedAgentCount(result.linkedAgentCount);
      setConfirmDeleteOpen(true);
    } catch {
      if (isMountedRef.current) {
        toast.error("操作失败，请稍后重试");
        resetDeleteDialogState();
      }
    } finally {
      if (isMountedRef.current) {
        setCheckingDelete(false);
      }
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget || deleting) {
      return;
    }

    setDeleting(true);

    try {
      await deleteKb(deleteTarget.id);

      if (!isMountedRef.current) {
        return;
      }

      resetDeleteDialogState();
      setListReloadKey((value) => value + 1);
      notifyAiHostingQuotaChanged();
      toast.success("已删除");
    } catch {
      if (isMountedRef.current) {
        toast.error("删除失败，请稍后重试");
      }
    } finally {
      if (isMountedRef.current) {
        setDeleting(false);
      }
    }
  }

  return (
    <AiHostingLayout title="知识库">
      <div className="space-y-6">
        <AiHostingPageHeader
          description="为智能体补充私有知识，智能体在生成回答前会先从知识库检索相关内容，从而提升回答的准确性"
          title="知识库"
        />

        <KbIntroGuide />

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-[280px] max-w-full">
              <HugeiconsIcon
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                color="currentColor"
                icon={Search01Icon}
                size={17}
                strokeWidth={1.8}
              />
              <Input
                aria-label="搜索知识库"
                className="h-10 rounded-[8px] pl-9"
                maxLength={KB_SEARCH_QUERY_MAX_LENGTH}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索知识库"
                value={searchQuery}
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button
                className="h-10 px-4"
                disabled={checkingQuota}
                onClick={() => void handleOpenCreateDialog()}
                type="button"
              >
                <HugeiconsIcon color="currentColor" icon={Add01Icon} size={17} strokeWidth={1.8} />
                <span>创建知识库</span>
              </Button>
            </div>
          </div>

          <div>
            <TooltipProvider>
              <Table className="min-w-[1120px] table-fixed">
              <colgroup>
                <col className="w-[240px]" />
                <col className="w-[360px]" />
                <col className="w-[190px]" />
                <col className="w-[190px]" />
                <col className="w-[180px]" />
              </colgroup>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-11 px-4">知识库名称</TableHead>
                  <TableHead className="h-11 px-4">描述</TableHead>
                  <TableHead className="h-11 whitespace-nowrap px-4">最近更新时间</TableHead>
                  <TableHead className="h-11 whitespace-nowrap px-4">创建时间</TableHead>
                  <TablePinnedHead className="h-11 whitespace-nowrap px-4 text-right">
                    操作
                  </TablePinnedHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <KbTableLoadingRow colSpan={5} />
                ) : pagedItems.length > 0 ? (
                  pagedItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="px-4 py-4 font-medium text-foreground">
                        <Link
                          className="block min-w-0 max-w-full text-foreground no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                          to={`/chat/ai-hosting/kb/${item.id}`}
                        >
                          <TableOverflowTooltip
                            className="font-medium text-foreground"
                            tooltip={item.name}
                          >
                            {item.name}
                          </TableOverflowTooltip>
                        </Link>
                      </TableCell>
                      <TableCell
                        className="px-4 py-4 text-muted-foreground"
                        title={item.description}
                      >
                        <TableCellContent>{item.description || "-"}</TableCellContent>
                      </TableCell>
                      <TableCell
                        className="px-4 py-4 text-muted-foreground"
                        title={item.lastUpdatedAt}
                      >
                        <TableCellContent>{item.lastUpdatedAt}</TableCellContent>
                      </TableCell>
                      <TableCell
                        className="px-4 py-4 text-muted-foreground"
                        title={item.createdAt}
                      >
                        <TableCellContent>{item.createdAt}</TableCellContent>
                      </TableCell>
                      <TablePinnedCell className="whitespace-nowrap px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <Button
                            aria-label={`编辑 ${item.name}`}
                            className="h-auto p-0 text-primary"
                            disabled={checkingDelete || deleting}
                            onClick={() => handleOpenEditDialog(item)}
                            type="button"
                            variant="link"
                          >
                            编辑
                          </Button>
                          <Button
                            aria-label={`删除 ${item.name}`}
                            className="h-auto p-0 text-primary"
                            disabled={checkingDelete || deleting}
                            onClick={() => void handleDeleteClick(item)}
                            type="button"
                            variant="link"
                          >
                            删除
                          </Button>
                          <Button asChild className="h-auto p-0 text-primary" type="button" variant="link">
                            <Link to={`/chat/ai-hosting/kb/${item.id}`}>
                              查看
                            </Link>
                          </Button>
                        </div>
                      </TablePinnedCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell className="py-10 text-center text-sm text-muted-foreground" colSpan={5}>
                      暂无数据
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </TooltipProvider>
            <TablePagination
              onPageChange={setCurrentPage}
              page={activePage}
              total={total}
              totalPages={totalPages}
            />
          </div>
        </section>
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open && createSubmitting) {
            return;
          }

          setCreateDialogOpen(open);

          if (!open) {
            resetCreateForm();
            setDialogMode("create");
            setEditingItem(null);
          }
        }}
        open={createDialogOpen}
      >
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{dialogMode === "edit" ? "编辑知识库" : "创建知识库"}</DialogTitle>
          </DialogHeader>

          <KnowledgeBaseDialogForm
            descriptionInputId={dialogMode === "edit" ? "kb-edit-desc" : "kb-desc"}
            form={createForm}
            nameInputId={dialogMode === "edit" ? "kb-edit-name" : "kb-name"}
            onChange={setCreateForm}
          />

          <DialogFooter className="gap-2">
            <Button disabled={createSubmitting} onClick={handleCloseCreateDialog} type="button" variant="outline">
              取消
            </Button>
            <Button
              disabled={createSubmitting || !createForm.name.trim()}
              onClick={() => void handleDialogSubmit()}
              type="button"
            >
              {createSubmitting ? "提交中" : "确定"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setBlockedDeleteOpen(false);
            setDeleteTarget(null);
          }
        }}
        open={blockedDeleteOpen}
      >
        <AlertDialogContent className={KB_DELETE_DIALOG_CLASSNAME}>
          <AlertDialogHeader className="space-y-0 text-left">
            <AlertDialogDescription className={KB_DELETE_DIALOG_MESSAGE_CLASSNAME}>
              {KB_DELETE_BLOCKED_MESSAGE}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="border border-destructive bg-background text-destructive hover:bg-destructive/5 hover:text-destructive">
              确定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setConfirmDeleteOpen(false);
            setDeleteTarget(null);
          }
        }}
        open={confirmDeleteOpen}
      >
        <AlertDialogContent className={KB_DELETE_DIALOG_CLASSNAME}>
          <AlertDialogHeader className="space-y-0 text-left">
            <AlertDialogDescription className={KB_DELETE_DIALOG_MESSAGE_CLASSNAME}>
              {deleteLinkedAgentCount > 0
                ? `当前知识库已关联${deleteLinkedAgentCount}个Agent，是否确认删除？`
                : "是否确认删除？"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={() => void handleConfirmDelete()}
              variant="destructive"
            >
              确定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AiHostingLayout>
  );
}

function KbIntroGuide() {
  return (
    <section
      aria-label="知识库使用引导"
      className="overflow-hidden rounded-[8px] bg-primary/6 dark:bg-muted"
    >
      <div className="grid min-h-[176px] grid-cols-3">
        {kbIntroSteps.map((item) => (
          <div
            className="grid min-h-[176px] min-w-0 grid-cols-[minmax(0,1fr)_minmax(160px,42%)] items-end gap-4 overflow-hidden pl-6 pr-4 pt-8 max-xl:min-h-0 max-xl:grid-cols-1 max-xl:px-6 max-xl:py-5 max-md:px-5"
            key={item.title}
          >
            <div className="min-w-0 self-start max-xl:max-w-none">
              <div className="text-sm font-medium text-muted-foreground">{item.step}</div>
              <h2 className="mt-2 text-base font-semibold text-foreground">{item.title}</h2>
              <p
                className="mt-3 line-clamp-2 max-w-[240px] text-xs leading-6 text-muted-foreground"
                title={item.description}
              >
                {item.description}
              </p>
            </div>

            <img
              alt={item.imageAlt}
              className="h-auto w-full max-w-[250px] self-end justify-self-end max-xl:hidden"
              draggable={false}
              src={item.imageUrl}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function KnowledgeBaseDialogForm({
  descriptionInputId,
  form,
  nameInputId,
  onChange,
}: {
  descriptionInputId: string;
  form: CreateFormState;
  nameInputId: string;
  onChange: (updater: (prev: CreateFormState) => CreateFormState) => void;
}) {
  return (
    <div className="space-y-5 py-2">
      <div className="space-y-2">
        <Label htmlFor={nameInputId}>
          知识库名称 <span className="text-destructive">*</span>
        </Label>
        <div className="relative">
          <Input
            className="pr-16"
            id={nameInputId}
            maxLength={KNOWLEDGE_BASE_NAME_MAX_LENGTH}
            onChange={(event) => onChange((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="请输入"
            value={form.name}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {form.name.length}/{KNOWLEDGE_BASE_NAME_MAX_LENGTH}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={descriptionInputId}>知识库描述</Label>
        <Textarea
          className="min-h-[120px] resize-y"
          id={descriptionInputId}
          maxLength={KNOWLEDGE_BASE_DESCRIPTION_MAX_LENGTH}
          onChange={(event) =>
            onChange((prev) => ({ ...prev, description: event.target.value }))
          }
          placeholder="说明知识库的内容和用途，描述会用于指导智能体调用知识库"
          value={form.description}
        />
      </div>
    </div>
  );
}
