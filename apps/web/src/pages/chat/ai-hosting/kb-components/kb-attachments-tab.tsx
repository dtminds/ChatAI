import { useCallback, useEffect, useRef, useState } from "react";
import {
  Add01Icon,
  AlertCircleIcon,
  Album02Icon,
  File02Icon,
  Link04Icon,
  Search01Icon,
  Video01Icon,
  VideoAiIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import {
  resolveTablePagination,
  TablePagination,
} from "@/components/ui/table-pagination";
import { cn } from "@/lib/utils";
import { MiniProgramMark } from "@/pages/chat/components/message/miniapp";
import { retryKbDoc } from "@/pages/chat/ai-hosting/api/kb-doc-service";
import {
  batchDeleteKbAttachments,
  buildKbAttachmentCreateRequest,
  buildKbAttachmentUpdateRequest,
  createKbAttachment,
  deleteKbAttachment,
  getKbAttachmentStatus,
  initKbAttachments,
  listKbAttachments,
  toKbAttachmentItem,
  updateKbAttachment,
} from "@/pages/chat/ai-hosting/api/kb-attachment-service";
import { KbAddAttachmentDialog } from "./kb-add-attachment-dialog";
import { KbAttachmentsTable } from "./kb-attachments-table";
import {
  getKbAttachmentTitle,
  kbAttachmentTypeFilters,
  type KbAttachmentItem,
  type KbAttachmentType,
} from "./kb-attachment-types";

const PAGE_SIZE = 10;

const kbAttachmentInitIllustrationUrl =
  "https://b5.bokr.com.cn/dist/ui/attachment_bg_1.png";

const kbAttachmentEmptyIllustrationUrl =
  "https://b5.bokr.com.cn/dist/ui/attachment_bg_3.png";

const kbAttachmentInitLoadingIllustrationUrl =
  "https://b5.bokr.com.cn/dist/ui/attachment_bg_4.gif";

const ATTACHMENT_INIT_PROGRESS_MIN = 15;
const ATTACHMENT_INIT_PROGRESS_MAX = 85;
const ATTACHMENT_INIT_PROGRESS_STEP_MS = 400;
const ATTACHMENT_SYNC_POLL_MS = 5000;

const kbAttachmentExampleTagRows = [
  [
    { icon: "file" as const, label: "产品说明书" },
    { icon: "image" as const, label: "营销活动海报" },
    { icon: "poster" as const, label: "直播预告海报" },
    { icon: "video" as const, label: "产品安装视频" },
  ],
  [
    { brand: "mini-program" as const, label: "小程序商城链接" },
    { brand: "wechat" as const, label: "公众号文章" },
    { brand: "xiaohongshu" as const, label: "小红书链接" },
    { brand: "more" as const, label: "..." },
  ],
] as const;

type AttachmentPhase =
  | "loading"
  | "uninitialized"
  | "initializing"
  | "failed"
  | "ready";

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

function useAttachmentInitProgress(active: boolean) {
  const [progress, setProgress] = useState(ATTACHMENT_INIT_PROGRESS_MIN);

  useEffect(() => {
    if (!active) {
      setProgress(ATTACHMENT_INIT_PROGRESS_MIN);
      return;
    }

    const timer = window.setInterval(() => {
      setProgress((current) => {
        if (current >= ATTACHMENT_INIT_PROGRESS_MAX) {
          return ATTACHMENT_INIT_PROGRESS_MIN;
        }

        return current + 5;
      });
    }, ATTACHMENT_INIT_PROGRESS_STEP_MS);

    return () => window.clearInterval(timer);
  }, [active]);

  return progress;
}

type KbAttachmentsTabProps = {
  activeType: KbAttachmentType;
  kbId: string;
  onInitializedChange?: (initialized: boolean) => void;
};

export function KbAttachmentsTab({
  activeType,
  kbId,
  onInitializedChange,
}: KbAttachmentsTabProps) {
  const [phase, setPhase] = useState<AttachmentPhase>("loading");
  const [attachmentDocId, setAttachmentDocId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<KbAttachmentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingList, setLoadingList] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery.trim(), 300);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<KbAttachmentItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<"batch" | string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const requestVersionRef = useRef(0);
  const isMountedRef = useRef(false);
  const kbIdRef = useRef(kbId);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextListLoadRef = useRef(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  kbIdRef.current = kbId;

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      clearPollTimer();
    };
  }, [clearPollTimer]);

  const loadAttachments = useCallback(async (options?: { page?: number; silent?: boolean }) => {
    if (!kbId || !attachmentDocId) {
      return;
    }

    const version = ++requestVersionRef.current;
    setLoadingList(true);

    try {
      const requestedPage = options?.page ?? currentPage;
      const response = await listKbAttachments(kbId, {
        attachmentType: activeType,
        docId: attachmentDocId,
        page: requestedPage,
        pageSize: PAGE_SIZE,
        query: debouncedSearchQuery || undefined,
      });

      if (version !== requestVersionRef.current || !isMountedRef.current) {
        return;
      }

      const newTotal = response.pagination.total;
      const newTotalPages = Math.max(1, Math.ceil(newTotal / PAGE_SIZE));
      const resolvedPage =
        newTotal === 0 ? 1 : Math.min(Math.max(1, requestedPage), newTotalPages);

      if (resolvedPage !== requestedPage && newTotal > 0) {
        const corrected = await listKbAttachments(kbId, {
          attachmentType: activeType,
          docId: attachmentDocId,
          page: resolvedPage,
          pageSize: PAGE_SIZE,
          query: debouncedSearchQuery || undefined,
        });

        if (version !== requestVersionRef.current || !isMountedRef.current) {
          return;
        }

        setAttachments(corrected.attachments.map(toKbAttachmentItem));
        setTotal(corrected.pagination.total);
        skipNextListLoadRef.current = true;
        setCurrentPage(resolvedPage);
        if (phaseRef.current !== "initializing") {
          setPhase("ready");
        }
        return;
      }

      setAttachments(response.attachments.map(toKbAttachmentItem));
      setTotal(newTotal);
      if (resolvedPage !== currentPage) {
        skipNextListLoadRef.current = true;
        setCurrentPage(resolvedPage);
      }
      if (phaseRef.current !== "initializing") {
        setPhase("ready");
      }
    } catch (error) {
      if (version !== requestVersionRef.current || !isMountedRef.current) {
        return;
      }

      setAttachments([]);
      setTotal(0);
      if (!options?.silent) {
        toast.error("加载失败，请稍后重试");
      } else {
        throw error;
      }
    } finally {
      if (version === requestVersionRef.current && isMountedRef.current) {
        setLoadingList(false);
      }
    }
  }, [activeType, attachmentDocId, currentPage, debouncedSearchQuery, kbId]);

  const probeInitialState = useCallback(async () => {
    if (!kbId) {
      setPhase("uninitialized");
      setLoadingList(false);
      onInitializedChange?.(false);
      return;
    }

    setPhase("loading");
    setLoadingList(true);

    try {
      const status = await getKbAttachmentStatus(kbId);

      if (!isMountedRef.current) {
        return;
      }

      if (!status.initialized || !status.docId) {
        setAttachmentDocId(null);
        setAttachments([]);
        setTotal(0);
        setPhase("uninitialized");
        onInitializedChange?.(false);
        return;
      }

      setAttachmentDocId(status.docId);
      onInitializedChange?.(true);

      setAttachments([]);
      setTotal(0);
      setCurrentPage(1);
      setPhase("ready");
      skipNextListLoadRef.current = false;
    } catch {
      if (!isMountedRef.current) {
        return;
      }

      setAttachmentDocId(null);
      setAttachments([]);
      setTotal(0);
      setPhase("uninitialized");
      onInitializedChange?.(false);
      toast.error("加载失败，请稍后重试");
    } finally {
      if (isMountedRef.current) {
        setLoadingList(false);
      }
    }
  }, [kbId, onInitializedChange]);

  useEffect(() => {
    void probeInitialState();
    clearPollTimer();

    return () => {
      requestVersionRef.current++;
      skipNextListLoadRef.current = false;
      clearPollTimer();
    };
  }, [clearPollTimer, kbId, probeInitialState]);

  useEffect(() => {
    if (phase !== "ready") {
      return;
    }

    setCurrentPage(1);
    setSelectedIds([]);
  }, [activeType, debouncedSearchQuery, phase]);

  useEffect(() => {
    if (phase !== "ready" || !kbId || !attachmentDocId) {
      return;
    }

    if (skipNextListLoadRef.current) {
      skipNextListLoadRef.current = false;
    }

    void loadAttachments();
  }, [
    activeType,
    attachmentDocId,
    currentPage,
    debouncedSearchQuery,
    kbId,
    loadAttachments,
    phase,
  ]);

  const finishAttachmentSync = useCallback(async (currentKbId: string) => {
    setCurrentPage(1);
    skipNextListLoadRef.current = true;
    await loadAttachments({ page: 1, silent: true });

    if (isMountedRef.current && kbIdRef.current === currentKbId) {
      setPhase("ready");
      onInitializedChange?.(true);
    }
  }, [loadAttachments, onInitializedChange]);

  const pollAttachmentSyncStatus = useCallback((
    currentKbId: string,
    pollError: {
      errorMessage: string;
      failurePhase: Extract<AttachmentPhase, "failed" | "uninitialized">;
    },
  ) => {
    clearPollTimer();

    const poll = async () => {
      try {
        const result = await initKbAttachments(currentKbId);

        if (!isMountedRef.current || kbIdRef.current !== currentKbId) {
          return;
        }

        setAttachmentDocId(result.docId);

        if (result.status === "queued" || result.status === "parsing") {
          pollTimerRef.current = setTimeout(() => {
            void poll();
          }, ATTACHMENT_SYNC_POLL_MS);
          return;
        }

        if (result.status === "failed") {
          setPhase("failed");
          return;
        }

        await finishAttachmentSync(currentKbId);
      } catch {
        if (isMountedRef.current && kbIdRef.current === currentKbId) {
          setPhase(pollError.failurePhase);
          toast.error(pollError.errorMessage);
        }
      }
    };

    pollTimerRef.current = setTimeout(() => {
      void poll();
    }, ATTACHMENT_SYNC_POLL_MS);
  }, [clearPollTimer, finishAttachmentSync]);

  const handleAttachmentSyncResult = useCallback(async (
    currentKbId: string,
    initResult: Awaited<ReturnType<typeof initKbAttachments>>,
    pollError: {
      errorMessage: string;
      failurePhase: Extract<AttachmentPhase, "failed" | "uninitialized">;
    },
  ) => {
    setAttachmentDocId(initResult.docId);

    if (initResult.status === "failed") {
      setPhase("failed");
      return;
    }

    if (initResult.status === "queued" || initResult.status === "parsing") {
      pollAttachmentSyncStatus(currentKbId, pollError);
      return;
    }

    await finishAttachmentSync(currentKbId);
  }, [finishAttachmentSync, pollAttachmentSyncStatus]);

  const handleInitialize = async () => {
    if (!kbId || phase === "initializing") {
      return;
    }

    const currentKbId = kbId;
    clearPollTimer();
    setPhase("initializing");
    onInitializedChange?.(false);

    try {
      const initResult = await initKbAttachments(kbId);

      if (!isMountedRef.current || kbIdRef.current !== currentKbId) {
        return;
      }

      await handleAttachmentSyncResult(currentKbId, initResult, {
        errorMessage: "初始化失败，请稍后重试",
        failurePhase: "uninitialized",
      });
    } catch {
      if (isMountedRef.current && kbIdRef.current === currentKbId) {
        setPhase("uninitialized");
        toast.error("初始化失败，请稍后重试");
      }
    }
  };

  const handleRetrySync = async () => {
    if (!attachmentDocId || retrying || !kbId) {
      return;
    }

    const currentKbId = kbId;
    clearPollTimer();
    setRetrying(true);
    setPhase("initializing");

    try {
      await retryKbDoc(attachmentDocId);

      if (!isMountedRef.current || kbIdRef.current !== currentKbId) {
        return;
      }

      const initResult = await initKbAttachments(kbId);

      if (!isMountedRef.current || kbIdRef.current !== currentKbId) {
        return;
      }

      await handleAttachmentSyncResult(currentKbId, initResult, {
        errorMessage: "重试失败，请稍后重试",
        failurePhase: "failed",
      });
    } catch {
      if (isMountedRef.current && kbIdRef.current === currentKbId) {
        setPhase("failed");
        toast.error("重试失败，请稍后重试");
      }
    } finally {
      if (isMountedRef.current && kbIdRef.current === currentKbId) {
        setRetrying(false);
      }
    }
  };

  const handleAttachmentDialogSubmit = async (item: KbAttachmentItem) => {
    if (!kbId) {
      return;
    }

    const currentKbId = kbId;

    if (editingItem) {
      const request = await buildKbAttachmentUpdateRequest({
        description: item.description,
        kbId,
        nextPayload: item.payload,
        previousPayload: editingItem.payload,
        title: getKbAttachmentTitle(item.payload),
      });

      await updateKbAttachment(editingItem.id, request);

      if (isMountedRef.current && kbIdRef.current === currentKbId) {
        await loadAttachments();
      }

      return;
    }

    const request = await buildKbAttachmentCreateRequest({
      attachmentType: item.attachmentType,
      description: item.description,
      kbId,
      payload: item.payload,
      title: getKbAttachmentTitle(item.payload),
    });

    await createKbAttachment(kbId, request);

    if (isMountedRef.current && kbIdRef.current === currentKbId) {
      setCurrentPage(1);
      await loadAttachments({ page: 1 });
    }
  };

  const handleAttachmentDialogOpenChange = (open: boolean) => {
    if (!open) {
      setAddDialogOpen(false);
      setEditingItem(null);
      return;
    }

    setAddDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleting) {
      setDeleteTarget(null);
      return;
    }

    setDeleting(true);

    try {
      if (deleteTarget === "batch") {
        if (selectedIds.length === 0) {
          setDeleteTarget(null);
          return;
        }

        const result = await batchDeleteKbAttachments(selectedIds);

        if (!isMountedRef.current) {
          return;
        }

        setDeleteTarget(null);
        setSelectedIds([]);
        if (result.failCount > 0 && result.successCount === 0) {
          toast.error("删除失败，请稍后重试");
        } else if (result.failCount > 0) {
          toast.warning(`已删除 ${result.successCount} 个，${result.failCount} 个失败`);
        } else {
          toast.success("已删除");
        }
        await loadAttachments();
        return;
      }

      await deleteKbAttachment(deleteTarget);

      if (!isMountedRef.current) {
        return;
      }

      setDeleteTarget(null);
      setSelectedIds((current) => current.filter((id) => id !== deleteTarget));
      toast.success("已删除");
      await loadAttachments();
    } catch {
      if (isMountedRef.current) {
        toast.error("删除失败，请稍后重试");
      }
    } finally {
      if (isMountedRef.current) {
        setDeleting(false);
      }
    }
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(attachments.map((item) => item.id));
      return;
    }

    setSelectedIds([]);
  };

  const toggleSelectItem = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) {
        return current.includes(id) ? current : [...current, id];
      }

      return current.filter((itemId) => itemId !== id);
    });
  };

  const selectedCount = selectedIds.length;
  const isBatchDelete = deleteTarget === "batch";
  const { activePage, totalPages } = resolveTablePagination({
    page: currentPage,
    pageSize: PAGE_SIZE,
    total,
  });
  const isListLoading = loadingList;
  const showListTable =
    isListLoading || attachments.length > 0 || debouncedSearchQuery.length > 0;

  if (phase === "loading") {
    return <KbAttachmentsTabLoadingState />;
  }

  if (phase === "initializing") {
    return <KbAttachmentsInitLoadingState />;
  }

  if (phase === "uninitialized") {
    return (
      <KbAttachmentsInitState onInitialize={() => void handleInitialize()} />
    );
  }

  if (phase === "failed") {
    return (
      <KbAttachmentsFailedState
        onRetry={() => void handleRetrySync()}
        retrying={retrying}
      />
    );
  }

  return (
    <section aria-label="附件列表区块" className="space-y-4">
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
            aria-label="搜索附件"
            className="h-10 rounded-[8px] pl-9"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索附件"
            value={searchQuery}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            className="h-10 px-4"
            disabled={selectedCount === 0}
            onClick={() => setDeleteTarget("batch")}
            type="button"
            variant="outline"
          >
            批量删除
          </Button>
          <Button
            className="h-10 gap-2 px-4"
            onClick={() => setAddDialogOpen(true)}
            type="button"
          >
            <HugeiconsIcon color="currentColor" icon={Add01Icon} size={17} strokeWidth={1.8} />
            添加附件
          </Button>
        </div>
      </div>

      {showListTable ? (
        <div>
          <KbAttachmentsTable
            activeType={activeType}
            items={attachments}
            loading={isListLoading}
            onDelete={setDeleteTarget}
            onEdit={setEditingItem}
            onToggleSelectAll={toggleSelectAll}
            onToggleSelectItem={toggleSelectItem}
            selectedIds={selectedIds}
          />
          <TablePagination
            onPageChange={setCurrentPage}
            page={activePage}
            total={total}
            totalPages={totalPages}
          />
        </div>
      ) : (
        <KbAttachmentsEmptyState />
      )}

      <KbAddAttachmentDialog
        attachmentType={editingItem?.attachmentType ?? activeType}
        editingItem={editingItem}
        onOpenChange={handleAttachmentDialogOpenChange}
        onSubmit={handleAttachmentDialogSubmit}
        open={addDialogOpen || editingItem != null}
      />

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        open={deleteTarget !== null}
      >
        <AlertDialogContent className="max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isBatchDelete ? `是否确认删除 ${selectedCount} 个附件` : "是否确认删除"}
            </AlertDialogTitle>
            <AlertDialogDescription className="sr-only">
              删除后无法恢复
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="border-destructive bg-background text-destructive hover:bg-destructive/5"
              disabled={deleting}
              onClick={() => void handleConfirmDelete()}
            >
              确定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export function KbAttachmentTypeTabs({
  activeType,
  onActiveTypeChange,
}: {
  activeType: KbAttachmentType;
  onActiveTypeChange: (type: KbAttachmentType) => void;
}) {
  return (
    <div
      aria-label="附件类型筛选"
      className="inline-flex h-10 -translate-y-0.5 items-center gap-5"
      role="tablist"
    >
      {kbAttachmentTypeFilters.map((filter) => (
        <button
          aria-selected={activeType === filter.value}
          className={cn(
            "relative inline-flex h-10 min-w-0 items-center justify-center px-0 text-sm font-medium leading-none transition-colors after:absolute after:bottom-0.5 after:left-1/2 after:h-[3px] after:w-6 after:-translate-x-1/2 after:rounded-full after:bg-primary after:opacity-0 after:content-['']",
            activeType === filter.value
              ? "text-primary after:opacity-100"
              : "text-foreground hover:text-foreground",
          )}
          key={filter.value}
          onClick={() => onActiveTypeChange(filter.value)}
          role="tab"
          type="button"
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}

function KbAttachmentsTabLoadingState() {
  return (
    <div
      className="flex min-h-[420px] flex-col items-center justify-center px-6 py-10"
      role="status"
    >
      <div
        aria-label="正在加载"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground"
      >
        <Spinner aria-hidden="true" size={14} />
        <span>正在加载</span>
      </div>
    </div>
  );
}

function KbAttachmentsInitState({
  onInitialize,
}: {
  onInitialize: () => void;
}) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center px-6 py-10 text-center">
      <img
        alt=""
        aria-hidden="true"
        className="mb-6 h-40 w-40 object-contain"
        src={kbAttachmentInitIllustrationUrl}
      />
      <p className="max-w-md text-sm leading-6 text-muted-foreground">
        暂未启用附件库，开启后，可统一管理图片、链接、小程序等附件，Agent 在回答时会引用并发送
      </p>
      <Button
        className="mt-6 h-10 px-6"
        onClick={onInitialize}
        type="button"
        variant="outline"
      >
        立即启用
      </Button>
    </div>
  );
}

function KbAttachmentsInitLoadingState() {
  const progress = useAttachmentInitProgress(true);

  return (
    <div
      className="flex min-h-[420px] flex-col items-center justify-center px-6 py-10 text-center"
      role="status"
    >
      <img
        alt=""
        aria-hidden="true"
        className="mb-8 h-40 w-40 object-contain"
        src={kbAttachmentInitLoadingIllustrationUrl}
      />
      <div className="w-full max-w-[280px]">
        <Progress
          aria-label="附件库初始化进度"
          className="h-2 bg-muted"
          value={progress}
        />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">请耐心等待哦～</p>
    </div>
  );
}

function KbAttachmentsFailedState({
  onRetry,
  retrying,
}: {
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <HugeiconsIcon
        aria-hidden="true"
        className="text-destructive"
        color="currentColor"
        icon={AlertCircleIcon}
        size={28}
        strokeWidth={1.8}
      />
      <p className="text-sm text-muted-foreground">附件库同步失败</p>
      <Button
        className="h-10 px-6"
        disabled={retrying}
        onClick={onRetry}
        type="button"
        variant="outline"
      >
        {retrying ? "正在重试" : "重试"}
      </Button>
    </div>
  );
}

function KbAttachmentsEmptyState() {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center px-6 py-10 text-center">
      <img
        alt=""
        aria-hidden="true"
        className="mb-6 h-40 w-40 object-contain"
        src={kbAttachmentEmptyIllustrationUrl}
      />

      <div
        aria-hidden="true"
        className="flex max-w-3xl flex-col items-center gap-3"
      >
        {kbAttachmentExampleTagRows.map((row, rowIndex) => (
          <div
            className="flex flex-wrap items-center justify-center gap-2"
            key={rowIndex}
          >
            {row.map((tag) => (
              <span
                className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-muted/70 px-3 text-sm text-muted-foreground"
                key={tag.label}
              >
                {"brand" in tag && tag.brand === "more" ? (
                  "..."
                ) : (
                  <>
                    {"icon" in tag ? (
                      <KbAttachmentExampleOutlineIcon type={tag.icon} />
                    ) : (
                      <KbAttachmentExampleBrandIcon type={tag.brand} />
                    )}
                    {tag.label}
                  </>
                )}
              </span>
            ))}
          </div>
        ))}
      </div>

      <p className="mt-6 max-w-xl text-sm leading-6 text-muted-foreground">
        你可以添加各类附件，用于 Agent 在做话术推荐或自动回复时，检索并发送该附件
      </p>
    </div>
  );
}

function KbAttachmentExampleOutlineIcon({
  type,
}: {
  type: "file" | "image" | "poster" | "video";
}) {
  const icon =
    type === "file"
      ? File02Icon
      : type === "image"
        ? Album02Icon
        : type === "poster"
          ? Video01Icon
          : VideoAiIcon;

  return (
    <span className="inline-flex size-5 items-center justify-center text-muted-foreground/80">
      <HugeiconsIcon
        aria-hidden="true"
        color="currentColor"
        icon={icon}
        size={15}
        strokeWidth={1.8}
      />
    </span>
  );
}

function KbAttachmentExampleBrandIcon({
  type,
}: {
  type: "mini-program" | "wechat" | "xiaohongshu";
}) {
  if (type === "mini-program") {
    return (
      <span className="inline-flex size-5 items-center justify-center rounded-full bg-mini-program-brand text-white">
        <MiniProgramMark className="size-3! text-white" />
      </span>
    );
  }

  const icon = type === "wechat" ? File02Icon : Link04Icon;

  return (
    <span className="inline-flex size-5 items-center justify-center text-muted-foreground/80">
      <HugeiconsIcon
        aria-hidden="true"
        color="currentColor"
        icon={icon}
        size={15}
        strokeWidth={1.8}
      />
    </span>
  );
}
