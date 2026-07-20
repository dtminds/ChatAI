import { useCallback, useEffect, useRef, useState } from "react";
import {
  Add01Icon,
  AlertCircleIcon,
  Search01Icon,
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
import { Spinner } from "@/components/ui/spinner";
import {
  resolveTablePagination,
  TablePagination,
} from "@/components/ui/table-pagination";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { KbChunkTargetTag } from "./kb-chunk-target-tag";
import { KbEmptyStatePanel } from "./kb-empty-state-panel";
import {
  getKbAttachmentTitle,
  kbAttachmentTypeFilters,
  type KbAttachmentItem,
  type KbAttachmentType,
} from "./kb-attachment-types";

const PAGE_SIZE = 10;

const kbAttachmentInitIllustrationUrl =
  "https://b5.bokr.com.cn/dist/ui/empty-state.svg";

const kbAttachmentEmptyIllustrationUrl =
  "https://b5.bokr.com.cn/dist/ui/empty-state.svg";

const kbAttachmentInitLoadingIllustrationUrl =
  "https://b5.bokr.com.cn/dist/ui/attachment_bg_4.gif";

const ATTACHMENT_SYNC_POLL_MS = 5000;
const ATTACHMENT_DOC_VISIBILITY_TIMEOUT_MS = 3 * 60 * 1000;

const KB_ATTACHMENT_EMPTY_DESCRIPTION =
  "添加各类附件，Agent 会根据附件描述，自动检索并发送该附件";
const KB_ATTACHMENT_EMPTY_SUGGESTION =
  "建议添加的附件：产品说明书、营销活动海报、直播预告海报、产品安装视频、小程序商城链接、公众号文章、小红书链接等";

type AttachmentPhase =
  | "loading"
  | "uninitialized"
  | "initializing"
  | "failed"
  | "ready";
type AttachmentSyncStatus = "completed" | "failed" | "parsing" | "queued";
type PollAttachmentSyncStatus = (
  currentKbId: string,
  pollError: {
    errorMessage: string;
    failurePhase: Extract<AttachmentPhase, "failed" | "uninitialized">;
  },
  options?: { immediate?: boolean; knownDocId?: string },
) => void;

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

type KbAttachmentsTabProps = {
  activeType: KbAttachmentType;
  kbId: string;
  onActiveTypeChange: (type: KbAttachmentType) => void;
  onTargetChunkClear?: () => void;
  onTargetTypeResolved?: (type: KbAttachmentType) => void;
  targetChunkId?: string;
  targetDocId?: string;
};

export function KbAttachmentsTab({
  activeType,
  kbId,
  onActiveTypeChange,
  onTargetChunkClear,
  onTargetTypeResolved,
  targetChunkId,
  targetDocId,
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
  const onTargetTypeResolvedRef = useRef(onTargetTypeResolved);
  const pollAttachmentSyncStatusRef = useRef<PollAttachmentSyncStatus | null>(null);
  phaseRef.current = phase;
  kbIdRef.current = kbId;
  onTargetTypeResolvedRef.current = onTargetTypeResolved;
  const requestedAttachmentType = targetChunkId ? undefined : activeType;
  const requestedSearchQuery = targetChunkId ? undefined : debouncedSearchQuery || undefined;

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

  const loadAttachments = useCallback(async (options?: {
    docId?: string;
    page?: number;
    silent?: boolean;
  }) => {
    const resolvedDocId =
      targetChunkId && targetDocId ? targetDocId : options?.docId ?? attachmentDocId;

    if (!kbId || !resolvedDocId) {
      return;
    }

    const version = ++requestVersionRef.current;
    setLoadingList(true);

    try {
      const requestedPage = options?.page ?? (targetChunkId ? 1 : currentPage);
      const response = await listKbAttachments(kbId, {
        attachmentType: requestedAttachmentType,
        chunkId: targetChunkId,
        docId: resolvedDocId,
        page: requestedPage,
        pageSize: PAGE_SIZE,
        query: requestedSearchQuery,
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
          attachmentType: requestedAttachmentType,
          chunkId: targetChunkId,
          docId: resolvedDocId,
          page: resolvedPage,
          pageSize: PAGE_SIZE,
          query: requestedSearchQuery,
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

      const mappedAttachments = response.attachments.map(toKbAttachmentItem);

      if (targetChunkId && mappedAttachments[0]) {
        onTargetTypeResolvedRef.current?.(mappedAttachments[0].attachmentType);
      }

      setAttachments(mappedAttachments);
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
  }, [
    attachmentDocId,
    currentPage,
    kbId,
    requestedAttachmentType,
    requestedSearchQuery,
    targetChunkId,
    targetDocId,
  ]);

  useEffect(() => {
    if (targetChunkId) {
      setSearchQuery("");
    }
  }, [targetChunkId]);

  const finishAttachmentSync = useCallback(async (currentKbId: string, docId: string) => {
    setCurrentPage(1);
    skipNextListLoadRef.current = true;
    await loadAttachments({ docId, page: 1, silent: true });

    if (isMountedRef.current && kbIdRef.current === currentKbId) {
      setPhase("ready");
    }
  }, [loadAttachments]);

  const pollAttachmentSyncStatus = useCallback((
    currentKbId: string,
    pollError: {
      errorMessage: string;
      failurePhase: Extract<AttachmentPhase, "failed" | "uninitialized">;
    },
    options?: { immediate?: boolean; knownDocId?: string },
  ) => {
    clearPollTimer();
    const pollStartedAt = Date.now();

    const scheduleNextPoll = () => {
      pollTimerRef.current = setTimeout(() => {
        void poll();
      }, ATTACHMENT_SYNC_POLL_MS);
    };

    const poll = async () => {
      try {
        const result = await getKbAttachmentStatus(currentKbId);

        if (!isMountedRef.current || kbIdRef.current !== currentKbId) {
          return;
        }

        if (!result.initialized || !result.docId) {
          if (options?.knownDocId) {
            if (Date.now() - pollStartedAt >= ATTACHMENT_DOC_VISIBILITY_TIMEOUT_MS) {
              setPhase(pollError.failurePhase);
              toast.error(pollError.errorMessage);
              return;
            }

            scheduleNextPoll();
            return;
          }

          setPhase(pollError.failurePhase);
          toast.error(pollError.errorMessage);
          return;
        }

        setAttachmentDocId(result.docId);
        const status = resolveAttachmentSyncStatus(result.syncStatus);

        if (status === "queued" || status === "parsing") {
          scheduleNextPoll();
          return;
        }

        if (status === "failed") {
          setPhase("failed");
          return;
        }

        await finishAttachmentSync(currentKbId, result.docId);
      } catch {
        if (isMountedRef.current && kbIdRef.current === currentKbId) {
          setPhase(pollError.failurePhase);
          toast.error(pollError.errorMessage);
        }
      }
    };

    if (options?.immediate) {
      void poll();
      return;
    }

    scheduleNextPoll();
  }, [clearPollTimer, finishAttachmentSync]);
  pollAttachmentSyncStatusRef.current = pollAttachmentSyncStatus;

  const probeInitialState = useCallback(async () => {
    if (!kbId) {
      setPhase("uninitialized");
      setLoadingList(false);
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
        return;
      }

      setAttachmentDocId(status.docId);

      setAttachments([]);
      setTotal(0);
      setCurrentPage(1);
      skipNextListLoadRef.current = false;

      const syncStatus = resolveAttachmentSyncStatus(status.syncStatus);

      if (syncStatus === "failed") {
        setPhase("failed");
        return;
      }

      if (syncStatus === "queued" || syncStatus === "parsing") {
        setPhase("initializing");
        pollAttachmentSyncStatusRef.current?.(kbId, {
          errorMessage: "加载失败，请稍后重试",
          failurePhase: "failed",
        }, {
          knownDocId: status.docId,
        });
        return;
      }

      setPhase("ready");
    } catch {
      if (!isMountedRef.current) {
        return;
      }

      setAttachmentDocId(null);
      setAttachments([]);
      setTotal(0);
      setPhase("uninitialized");
      toast.error("加载失败，请稍后重试");
    } finally {
      if (isMountedRef.current) {
        setLoadingList(false);
      }
    }
  }, [kbId]);

  useEffect(() => {
    clearPollTimer();
    void probeInitialState();

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
  }, [debouncedSearchQuery, phase, requestedAttachmentType, targetChunkId]);

  useEffect(() => {
    if (phase !== "ready" || !kbId || !attachmentDocId) {
      return;
    }

    if (skipNextListLoadRef.current) {
      skipNextListLoadRef.current = false;
      return;
    }

    void loadAttachments();
  }, [
    attachmentDocId,
    currentPage,
    debouncedSearchQuery,
    kbId,
    loadAttachments,
    phase,
    requestedAttachmentType,
    targetChunkId,
  ]);

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
      pollAttachmentSyncStatus(currentKbId, pollError, {
        immediate: true,
        knownDocId: initResult.docId,
      });
      return;
    }

    await finishAttachmentSync(currentKbId, initResult.docId);
  }, [finishAttachmentSync, pollAttachmentSyncStatus]);

  const handleInitialize = async () => {
    if (!kbId || phase === "initializing") {
      return;
    }

    const currentKbId = kbId;
    clearPollTimer();
    setPhase("initializing");

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

      pollAttachmentSyncStatus(
        currentKbId,
        {
          errorMessage: "重试失败，请稍后重试",
          failurePhase: "failed",
        },
        { immediate: true, knownDocId: attachmentDocId },
      );
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
    isListLoading
    || attachments.length > 0
    || debouncedSearchQuery.length > 0
    || Boolean(targetChunkId);

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
    <section aria-label="附件列表区块" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <KbAttachmentTypeTabs
            activeType={activeType}
            onActiveTypeChange={onActiveTypeChange}
          />
          {targetChunkId ? (
            <KbChunkTargetTag
              chunkId={targetChunkId}
              onClear={() => onTargetChunkClear?.()}
            />
          ) : null}
          {!targetChunkId ? (
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
                onChange={(event) => {
                  onTargetChunkClear?.();
                  setSearchQuery(event.target.value);
                }}
                placeholder="搜索附件"
                value={searchQuery}
              />
            </div>
          ) : null}
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
    <Tabs
      onValueChange={(value) => {
        const nextType = kbAttachmentTypeFilters.find(
          (filter) => String(filter.value) === value,
        )?.value;

        if (nextType !== undefined) {
          onActiveTypeChange(nextType);
        }
      }}
      value={String(activeType)}
    >
      <TabsList aria-label="附件类型筛选">
        {kbAttachmentTypeFilters.map((filter) => (
          <TabsTrigger
            key={filter.value}
            value={String(filter.value)}
          >
            {filter.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
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
        className="mb-6 size-[200px] object-contain"
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
  return (
    <div
      className="flex min-h-[420px] flex-col items-center justify-center px-6 py-10 text-center"
      role="status"
    >
      <img
        alt=""
        aria-hidden="true"
        className="mb-8 size-[200px] object-contain"
        src={kbAttachmentInitLoadingIllustrationUrl}
      />
      <Spinner aria-hidden="true" className="text-primary" size={24} />
      <p className="mt-4 text-sm text-muted-foreground">正在初始化附件库，预计需要1-2分钟</p>
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
    <KbEmptyStatePanel
      description={KB_ATTACHMENT_EMPTY_DESCRIPTION}
      illustrationUrl={kbAttachmentEmptyIllustrationUrl}
      keepSuggestionOnSameLine
      suggestionContent={KB_ATTACHMENT_EMPTY_SUGGESTION}
      suggestionLabel="查看建议"
    />
  );
}

function resolveAttachmentSyncStatus(syncStatus: number | undefined): AttachmentSyncStatus {
  if (syncStatus === 0) {
    return "completed";
  }

  if (syncStatus === 1) {
    return "failed";
  }

  if (syncStatus === 3 || syncStatus === 5 || syncStatus === 6) {
    return "parsing";
  }

  return "queued";
}
