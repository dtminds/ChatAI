import { useCallback, useEffect, useRef, useState } from "react";
import {
  Add01Icon,
  AlertCircleIcon,
  File01Icon,
  Image01Icon,
  PlayIcon,
  Search01Icon,
  Video01Icon,
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
import { cn } from "@/lib/utils";
import { MiniProgramMark } from "@/pages/chat/components/message/miniapp";
import { getKbDoc } from "@/pages/chat/ai-hosting/api/kb-service";
import { retryKbDoc } from "@/pages/chat/ai-hosting/api/kb-doc-service";
import {
  buildKbAttachmentCreateRequest,
  buildKbAttachmentUpdateRequest,
  createKbAttachment,
  deleteKbAttachment,
  initKbAttachments,
  isKbAttachmentNotInitialized,
  listKbAttachments,
  toKbAttachmentItem,
  updateKbAttachment,
} from "@/pages/chat/ai-hosting/api/kb-attachment-service";
import { KbAddAttachmentDialog } from "./kb-add-attachment-dialog";
import { KbAttachmentsTable } from "./kb-attachments-table";
import {
  getKbAttachmentTitle,
  kbAttachmentTypeFilters,
  KB_ATTACHMENT_TYPE,
  type KbAttachmentItem,
  type KbAttachmentType,
} from "./kb-attachment-types";

const PAGE_SIZE = 20;
const DOC_POLL_INTERVAL_MS = 5000;

const kbAttachmentInitIllustrationUrl =
  "https://b5.bokr.com.cn/dist/ui/attachment_bg_1.png";

const kbAttachmentEmptyIllustrationUrl =
  "https://b5.bokr.com.cn/dist/ui/attachment_bg_3.png";

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
  | "syncing"
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

export function KbAttachmentsTab({ kbId }: { kbId: string }) {
  const [phase, setPhase] = useState<AttachmentPhase>("loading");
  const [attachmentDocId, setAttachmentDocId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<KbAttachmentType>(KB_ATTACHMENT_TYPE.IMAGE);
  const [attachments, setAttachments] = useState<KbAttachmentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingList, setLoadingList] = useState(true);
  const [initializing, setInitializing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery.trim(), 300);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<KbAttachmentItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<"batch" | string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const requestVersionRef = useRef(0);
  const pollTimerRef = useRef<number | null>(null);
  const isMountedRef = useRef(false);
  const skipNextListLoadRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current != null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const loadAttachments = useCallback(async (options?: { page?: number }) => {
    if (!kbId) {
      return;
    }

    const version = ++requestVersionRef.current;
    setLoadingList(true);

    try {
      const response = await listKbAttachments(kbId, {
        attachmentType: activeType,
        page: options?.page ?? currentPage,
        pageSize: PAGE_SIZE,
        query: debouncedSearchQuery || undefined,
      });

      if (version !== requestVersionRef.current || !isMountedRef.current) {
        return;
      }

      setAttachments(response.attachments.map(toKbAttachmentItem));
      setTotal(response.pagination.total);
      setPhase("ready");
    } catch (error) {
      if (version !== requestVersionRef.current || !isMountedRef.current) {
        return;
      }

      if (isKbAttachmentNotInitialized(error)) {
        setAttachments([]);
        setTotal(0);
        setPhase("uninitialized");
        return;
      }

      setAttachments([]);
      setTotal(0);
      toast.error("加载失败，请稍后重试");
    } finally {
      if (version === requestVersionRef.current && isMountedRef.current) {
        setLoadingList(false);
      }
    }
  }, [activeType, currentPage, debouncedSearchQuery, kbId]);

  const loadAttachmentsRef = useRef(loadAttachments);
  loadAttachmentsRef.current = loadAttachments;

  const pollAttachmentDocStatus = useCallback(async (docId: string) => {
    try {
      const doc = await getKbDoc(docId);

      if (!isMountedRef.current) {
        return;
      }

      if (doc.status === "completed") {
        clearPollTimer();
        setPhase("ready");
        await loadAttachmentsRef.current({ page: 1 });
        return;
      }

      if (doc.status === "failed") {
        clearPollTimer();
        setPhase("failed");
      }
    } catch {
      if (!isMountedRef.current) {
        return;
      }
    }
  }, [clearPollTimer]);

  const startDocStatusPolling = useCallback((docId: string) => {
    clearPollTimer();
    setAttachmentDocId(docId);
    setPhase("syncing");

    void pollAttachmentDocStatus(docId);

    pollTimerRef.current = window.setInterval(() => {
      void pollAttachmentDocStatus(docId);
    }, DOC_POLL_INTERVAL_MS);
  }, [clearPollTimer, pollAttachmentDocStatus]);

  const startDocStatusPollingRef = useRef(startDocStatusPolling);
  startDocStatusPollingRef.current = startDocStatusPolling;

  const probeInitialState = useCallback(async () => {
    if (!kbId) {
      setPhase("uninitialized");
      setLoadingList(false);
      return;
    }

    setPhase("loading");
    setLoadingList(true);

    let enteredSyncing = false;

    try {
      const response = await listKbAttachments(kbId, {
        attachmentType: KB_ATTACHMENT_TYPE.IMAGE,
        page: 1,
        pageSize: PAGE_SIZE,
      });

      if (!isMountedRef.current) {
        return;
      }

      setAttachments(response.attachments.map(toKbAttachmentItem));
      setTotal(response.pagination.total);
      setCurrentPage(1);
      setPhase("ready");
      skipNextListLoadRef.current = true;
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }

      if (isKbAttachmentNotInitialized(error)) {
        setPhase("uninitialized");
        return;
      }

      try {
        const initResult = await initKbAttachments(kbId);

        if (!isMountedRef.current) {
          return;
        }

        setAttachmentDocId(initResult.docId);

        if (initResult.status === "completed") {
          setPhase("ready");
          setCurrentPage(1);
          return;
        }

        if (initResult.status === "failed") {
          setPhase("failed");
          return;
        }

        startDocStatusPollingRef.current(initResult.docId);
        enteredSyncing = true;
      } catch {
        if (isMountedRef.current) {
          setPhase("uninitialized");
        }
      }
    } finally {
      if (isMountedRef.current && !enteredSyncing) {
        setLoadingList(false);
      }
    }
  }, [kbId]);

  useEffect(() => {
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
  }, [activeType, debouncedSearchQuery, phase]);

  useEffect(() => {
    if (phase !== "ready" || !kbId) {
      return;
    }

    if (skipNextListLoadRef.current) {
      skipNextListLoadRef.current = false;
      return;
    }

    void loadAttachments();
  }, [activeType, currentPage, debouncedSearchQuery, kbId, loadAttachments, phase]);

  const handleInitialize = async () => {
    if (!kbId || initializing) {
      return;
    }

    setInitializing(true);

    try {
      const initResult = await initKbAttachments(kbId);

      if (!isMountedRef.current) {
        return;
      }

      setAttachmentDocId(initResult.docId);

      if (initResult.status === "completed") {
        setPhase("ready");
        setCurrentPage(1);
        await loadAttachments({ page: 1 });
        return;
      }

      if (initResult.status === "failed") {
        setPhase("failed");
        return;
      }

      startDocStatusPolling(initResult.docId);
    } catch {
      if (isMountedRef.current) {
        toast.error("初始化失败，请稍后重试");
      }
    } finally {
      if (isMountedRef.current) {
        setInitializing(false);
      }
    }
  };

  const handleRetrySync = async () => {
    if (!attachmentDocId || retrying) {
      return;
    }

    setRetrying(true);

    try {
      await retryKbDoc(attachmentDocId);

      if (!isMountedRef.current) {
        return;
      }

      startDocStatusPolling(attachmentDocId);
    } catch {
      if (isMountedRef.current) {
        toast.error("重试失败，请稍后重试");
      }
    } finally {
      if (isMountedRef.current) {
        setRetrying(false);
      }
    }
  };

  const handleAttachmentDialogSubmit = async (item: KbAttachmentItem) => {
    if (!kbId) {
      return;
    }

    if (editingItem) {
      const request = await buildKbAttachmentUpdateRequest({
        description: item.description,
        nextPayload: item.payload,
        previousPayload: editingItem.payload,
        title: getKbAttachmentTitle(item.payload),
      });

      await updateKbAttachment(editingItem.id, request);
      await loadAttachments();
      return;
    }

    const request = await buildKbAttachmentCreateRequest({
      attachmentType: item.attachmentType,
      description: item.description,
      payload: item.payload,
      title: getKbAttachmentTitle(item.payload),
    });

    await createKbAttachment(kbId, request);
    setCurrentPage(1);
    await loadAttachments({ page: 1 });
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
    if (!deleteTarget || deleteTarget === "batch" || deleting) {
      setDeleteTarget(null);
      return;
    }

    setDeleting(true);

    try {
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
  const { activePage, totalPages } = resolveTablePagination({
    page: currentPage,
    pageSize: PAGE_SIZE,
    total,
  });
  const isListLoading = loadingList;
  const showListTable = isListLoading || attachments.length > 0;

  if (phase === "uninitialized") {
    return (
      <KbAttachmentsInitState
        initializing={initializing}
        onInitialize={() => void handleInitialize()}
      />
    );
  }

  if (phase === "syncing") {
    return <KbAttachmentsSyncingState />;
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
      <div
        aria-label="附件类型筛选"
        className="inline-flex h-10 items-center rounded-[10px] bg-muted p-1"
        role="tablist"
      >
        {kbAttachmentTypeFilters.map((filter) => (
          <button
            aria-selected={activeType === filter.value}
            className={cn(
              "inline-flex h-8 min-w-[4.5rem] items-center justify-center rounded-[8px] px-4 text-sm transition-[background-color,box-shadow,color]",
              activeType === filter.value
                ? "bg-background font-medium text-foreground shadow-sm"
                : "text-foreground hover:text-foreground",
            )}
            key={filter.value}
            onClick={() => {
              setActiveType(filter.value);
              setSelectedIds([]);
            }}
            role="tab"
            type="button"
          >
            {filter.label}
          </button>
        ))}
      </div>

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
        <>
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
          {!isListLoading && totalPages > 1 ? (
            <TablePagination
              onPageChange={setCurrentPage}
              page={activePage}
              total={total}
              totalPages={totalPages}
            />
          ) : null}
        </>
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
        open={deleteTarget !== null && deleteTarget !== "batch"}
      >
        <AlertDialogContent className="max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>是否确认删除</AlertDialogTitle>
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

function KbAttachmentsInitState({
  initializing,
  onInitialize,
}: {
  initializing: boolean;
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
        附件库需要初始化来完整一些准备工作，如需使用，请点击以下按钮
      </p>
      <Button
        className="mt-6 h-10 px-6"
        disabled={initializing}
        onClick={onInitialize}
        type="button"
        variant="outline"
      >
        {initializing ? "正在初始化" : "开始初始化"}
      </Button>
    </div>
  );
}

function KbAttachmentsSyncingState() {
  return (
    <div
      className="flex min-h-[420px] flex-col items-center justify-center gap-3 px-6 py-10 text-center"
      role="status"
    >
      <Spinner className="size-6" />
      <p className="text-sm text-muted-foreground">附件库正在同步</p>
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
                {"icon" in tag ? (
                  <KbAttachmentExampleOutlineIcon type={tag.icon} />
                ) : (
                  <KbAttachmentExampleBrandIcon type={tag.brand} />
                )}
                {tag.label}
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
      ? File01Icon
      : type === "image"
        ? Image01Icon
        : type === "poster"
          ? Video01Icon
          : PlayIcon;

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
  type: "mini-program" | "more" | "wechat" | "xiaohongshu";
}) {
  if (type === "more") {
    return (
      <span className="inline-flex size-5 items-center justify-center text-sm leading-none text-muted-foreground">
        ...
      </span>
    );
  }

  if (type === "mini-program") {
    return (
      <span className="inline-flex size-5 items-center justify-center rounded-full bg-[#7b61ff] text-white">
        <MiniProgramMark className="size-3! text-white" />
      </span>
    );
  }

  if (type === "wechat") {
    return (
      <span className="inline-flex size-5 items-center justify-center rounded-full bg-[#07c160] text-[10px] font-semibold leading-none text-white">
        公
      </span>
    );
  }

  return (
    <span className="inline-flex size-5 items-center justify-center rounded-full bg-[#ff2442] text-[10px] font-semibold leading-none text-white">
      红
    </span>
  );
}
