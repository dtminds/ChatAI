import { useCallback, useEffect, useRef, useState } from "react";
import {
  Add01Icon,
  AlertCircleIcon,
  AiMagicIcon,
  ArrowLeft01Icon,
  CheckmarkCircle02Icon,
  Clock04Icon,
  Knowledge02Icon,
  Loading03Icon,
  MessagePreview01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { KB_SEARCH_QUERY_MAX_LENGTH } from "@chatai/contracts";
import ReactMarkdown from "react-markdown";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
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
import {
  Spinner,
} from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  resolveTablePagination,
  TablePagination,
} from "@/components/ui/table-pagination";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FileExtensionBadge } from "@/pages/chat/components/message/file";
import {
  AiHostingLayout,
  AiHostingPageHeader,
  notifyAiHostingQuotaChanged,
} from "./ai-hosting-layout";
import { KbTableLoadingRow } from "./kb-components/kb-table-loading-row";
import { ImportDocumentDialog } from "./kb-components/import-document-dialog";
// import { ImportImageDialog } from "./kb-components/import-image-dialog";
import { ImportQaDialog } from "./kb-components/import-qa-dialog";
import { KbAttachmentsTab } from "./kb-components/kb-attachments-tab";
import { KbEmptyStatePanel } from "./kb-components/kb-empty-state-panel";
import {
  KB_ATTACHMENT_TYPE,
  type KbAttachmentType,
} from "./kb-components/kb-attachment-types";
import { TableOverflowTooltip } from "./kb-components/shared";
import { deleteKbDoc, retryKbDoc } from "./api/kb-doc-service";
import {
  getKbDoc,
  getKb,
  listKbDocs,
  toKbDocViewItem,
  toKbListViewItem,
} from "./api/kb-service";
import type { KbDocViewItem, KbListViewItem, KbStatus } from "./kb-types";

const PAGE_SIZE = 10;
const KB_DETAIL_TAB_PARAM = "tab";
const KB_ATTACHMENT_TYPE_PARAM = "attachmentType";

type KbDetailTab = "attachments" | "knowledge";

const kbAttachmentTypeParamEntries = [
  ["image", KB_ATTACHMENT_TYPE.IMAGE],
  ["file", KB_ATTACHMENT_TYPE.FILE],
  ["link", KB_ATTACHMENT_TYPE.LINK],
  ["miniProgram", KB_ATTACHMENT_TYPE.MINI_PROGRAM],
] as const;

const kbAttachmentTypeByParam = new Map<string, KbAttachmentType>(
  kbAttachmentTypeParamEntries,
);
const kbAttachmentTypeParamByType = new Map<KbAttachmentType, string>(
  kbAttachmentTypeParamEntries.map(([param, type]) => [type, param] as const),
);

const kbKnowledgeEmptyIllustrationUrl =
  "https://b5.bokr.com.cn/dist/ui/empty-state.svg";

const KB_KNOWLEDGE_EMPTY_DESCRIPTION =
  "添加各类知识，Agent 会参考相关的知识内容组织回复话术";
const KB_KNOWLEDGE_EMPTY_SUGGESTION =
  "建议添加的知识：商品知识、活动规则说明、订单售后问答、常见问题FAQ、退换货政策、物流发货政策等";

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

const addKnowledgeOptions = [
  {
    description: "上传问答表格，批量导入精准知识",
    imgSrc: "https://b5.bokr.com.cn/dist/excel.png",
    label: "问答",
    type: "qa",
  },
  // 图片添加入口暂时下线
  // {
  //   description: "上传图片并添加描述，按描述精准召回",
  //   imgSrc: "https://b5.bokr.com.cn/dist/image.png",
  //   label: "图片",
  //   type: "image",
  // },
  {
    description: "自动解析文档内容，效果取决于文档质量",
    imgSrc: "https://b5.bokr.com.cn/dist/file.png",
    label: "文档",
    type: "document",
  },
] as const;
type AddKnowledgeOption = (typeof addKnowledgeOptions)[number];

const statusMeta: Record<
  KbStatus,
  {
    label: string;
    className: string;
    icon: typeof CheckmarkCircle02Icon;
  }
> = {
  completed: {
    label: "已完成",
    className: "text-emerald-600",
    icon: CheckmarkCircle02Icon,
  },
  parsing: {
    label: "解析中",
    className: "text-muted-foreground",
    icon: Loading03Icon,
  },
  failed: {
    label: "失败",
    className: "text-destructive",
    icon: AlertCircleIcon,
  },
  queued: {
    label: "排队中",
    className: "text-muted-foreground",
    icon: Clock04Icon,
  },
};

export function KbDetailPage() {
  const { kbId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const detailTab: KbDetailTab =
    searchParams.get(KB_DETAIL_TAB_PARAM) === "attachments" ? "attachments" : "knowledge";
  const activeAttachmentType =
    resolveKbAttachmentTypeParam(searchParams.get(KB_ATTACHMENT_TYPE_PARAM))
    ?? KB_ATTACHMENT_TYPE.IMAGE;
  const targetAttachmentChunkId =
    detailTab === "attachments" ? searchParams.get("chunkId")?.trim() || undefined : undefined;
  const targetAttachmentDocId =
    detailTab === "attachments" && targetAttachmentChunkId
      ? searchParams.get("docId")?.trim() || undefined
      : undefined;
  const [knowledgeBase, setKnowledgeBase] = useState<KbListViewItem | null>(null);
  const [records, setRecords] = useState<KbDocViewItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingKb, setLoadingKb] = useState(true);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const [currentPage, setCurrentPage] = useState(1);
  const [qaDialogDefaultAddMethod, setQaDialogDefaultAddMethod] = useState<"file" | "new">("file");
  const [importQaDialogOpen, setImportQaDialogOpen] = useState(false);
  // const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  const [deleteRecord, setDeleteRecord] = useState<KbDocViewItem | null>(null);
  const [summaryRecord, setSummaryRecord] = useState<KbDocViewItem | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [retryingDocId, setRetryingDocId] = useState<string | null>(null);
  const requestVersionRef = useRef(0);
  const summaryRequestVersionRef = useRef(0);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (searchParams.get("addKnowledge") !== "qa:new") {
      return;
    }

    setQaDialogDefaultAddMethod("new");
    setImportQaDialogOpen(true);
    setSearchParams((currentSearchParams) => {
      const nextSearchParams = new URLSearchParams(currentSearchParams);
      nextSearchParams.delete("addKnowledge");
      return nextSearchParams;
    }, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const normalizedSearchParams = normalizeKbDetailViewSearchParams(searchParams);

    if (normalizedSearchParams) {
      setSearchParams(normalizedSearchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  function handleDetailTabChange(value: string) {
    const nextSearchParams = new URLSearchParams(searchParams);

    if (value === "attachments") {
      nextSearchParams.set(KB_DETAIL_TAB_PARAM, "attachments");
      nextSearchParams.set(
        KB_ATTACHMENT_TYPE_PARAM,
        resolveKbAttachmentTypeSearchParam(activeAttachmentType),
      );
    } else {
      nextSearchParams.delete(KB_DETAIL_TAB_PARAM);
      nextSearchParams.delete(KB_ATTACHMENT_TYPE_PARAM);
      nextSearchParams.delete("chunkId");
      nextSearchParams.delete("docId");
    }

    setSearchParams(nextSearchParams);
  }

  function handleAttachmentTypeChange(type: KbAttachmentType) {
    const nextSearchParams = new URLSearchParams(searchParams);

    nextSearchParams.set(KB_DETAIL_TAB_PARAM, "attachments");
    nextSearchParams.set(KB_ATTACHMENT_TYPE_PARAM, resolveKbAttachmentTypeSearchParam(type));
    nextSearchParams.delete("chunkId");
    nextSearchParams.delete("docId");
    setSearchParams(nextSearchParams);
  }

  function handleAttachmentTargetTypeResolved(type: KbAttachmentType) {
    const nextAttachmentType = resolveKbAttachmentTypeSearchParam(type);

    if (searchParams.get(KB_ATTACHMENT_TYPE_PARAM) === nextAttachmentType) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set(KB_DETAIL_TAB_PARAM, "attachments");
    nextSearchParams.set(KB_ATTACHMENT_TYPE_PARAM, nextAttachmentType);
    setSearchParams(nextSearchParams, { replace: true });
  }

  function handleAttachmentTargetClear() {
    if (!searchParams.has("chunkId")) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("chunkId");
    nextSearchParams.delete("docId");
    setSearchParams(nextSearchParams, { replace: true });
  }

  const loadDocs = useCallback(async () => {
    if (!kbId) {
      return;
    }

    const version = ++requestVersionRef.current;
    setLoadingDocs(true);

    try {
      const response = await listKbDocs(kbId, {
        page: currentPage,
        pageSize: PAGE_SIZE,
        query: debouncedSearchQuery,
      });

      if (version !== requestVersionRef.current) {
        return;
      }

      setRecords(response.docs.map(toKbDocViewItem));
      setTotal(response.pagination.total);
    } catch {
      if (version !== requestVersionRef.current) {
        return;
      }

      setRecords([]);
      setTotal(0);
    } finally {
      if (version === requestVersionRef.current) {
        setLoadingDocs(false);
      }
    }
  }, [currentPage, debouncedSearchQuery, kbId]);

  const handleShowSummary = useCallback(async (record: KbDocViewItem) => {
    const version = ++summaryRequestVersionRef.current;
    setSummaryRecord(record);
    setLoadingSummary(true);
    setSummaryError(false);

    try {
      const detail = toKbDocViewItem(await getKbDoc(record.id));

      if (!isMountedRef.current || version !== summaryRequestVersionRef.current) {
        return;
      }

      setSummaryRecord((current) => (current?.id === record.id ? detail : current));
    } catch {
      if (!isMountedRef.current || version !== summaryRequestVersionRef.current) {
        return;
      }

      setSummaryError(true);
    } finally {
      if (!isMountedRef.current || version !== summaryRequestVersionRef.current) {
        return;
      }

      setLoadingSummary(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      requestVersionRef.current++;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadKb() {
      if (!kbId) {
        setKnowledgeBase(null);
        setLoadingKb(false);
        return;
      }

      setLoadingKb(true);

      try {
        const kb = await getKb(kbId);

        if (cancelled) {
          return;
        }

        setKnowledgeBase(toKbListViewItem(kb));
      } catch {
        if (!cancelled) {
          setKnowledgeBase(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingKb(false);
        }
      }
    }

    void loadKb();

    return () => {
      cancelled = true;
    };
  }, [kbId]);

  useEffect(() => {
    if (!kbId || loadingKb || !knowledgeBase) {
      return;
    }

    void loadDocs();
  }, [kbId, knowledgeBase, loadDocs, loadingKb]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, kbId]);

  const { activePage, totalPages } = resolveTablePagination({
    page: currentPage,
    pageSize: PAGE_SIZE,
    total,
  });
  const pagedRecords = records;
  const recordsLoading = loadingKb || loadingDocs;
  const showKnowledgeList =
    recordsLoading || total > 0 || debouncedSearchQuery.length > 0;

  async function handleConfirmDelete() {
    if (!deleteRecord || deleting) {
      return;
    }

    setDeleting(true);

    try {
      await deleteKbDoc(deleteRecord.id);

      if (!isMountedRef.current) {
        return;
      }

      setDeleteRecord(null);
      toast.success("已删除");
      await loadDocs();
      notifyAiHostingQuotaChanged();
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

  async function handleRetryDoc(docId: string) {
    if (retryingDocId) {
      return;
    }

    setRetryingDocId(docId);

    try {
      await retryKbDoc(docId);

      if (!isMountedRef.current) {
        return;
      }

      toast.success("已提交重试");
      await loadDocs();
    } catch {
      if (isMountedRef.current) {
        toast.error("重试失败，请稍后重试");
      }
    } finally {
      if (isMountedRef.current) {
        setRetryingDocId(null);
      }
    }
  }

  function handleAddKnowledgeSelect(optionType: AddKnowledgeOption["type"]) {
    if (optionType === "qa") {
      setQaDialogDefaultAddMethod("file");
      setImportQaDialogOpen(true);
    }

    if (optionType === "document") {
      setDocumentDialogOpen(true);
    }
  }

  if (!loadingKb && !knowledgeBase) {
    return (
      <AiHostingLayout title="知识库不存在">
        <div className="space-y-6">
          <BackToKbListButton />
          <div className="py-16 text-center">
            <h1 className="text-lg font-semibold text-foreground">未找到知识库</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              当前知识库不存在或已被删除
            </p>
          </div>
        </div>
      </AiHostingLayout>
    );
  }

  return (
    <AiHostingLayout title={knowledgeBase?.name ?? "知识库"}>
      <TooltipProvider>
      <div className="space-y-6">
        <div aria-label="知识库管理头部" className="space-y-3">
          <BackToKbListButton />
          <AiHostingPageHeader
            description={knowledgeBase?.description}
            title={
              knowledgeBase ? (
                <TableOverflowTooltip
                  className="text-[22px] font-semibold leading-tight text-foreground"
                  tooltip={knowledgeBase.name}
                >
                  {knowledgeBase.name}
                </TableOverflowTooltip>
              ) : (
                "知识库"
              )
            }
          />
        </div>

        <Tabs className="gap-5" onValueChange={handleDetailTabChange} value={detailTab}>
          <div className="flex flex-wrap items-center gap-5">
            <TabsList className="h-10 w-fit justify-start gap-0 rounded-[10px] bg-muted p-1">
              <TabsTrigger
                className="h-8 min-w-18 gap-1.5 rounded-[8px] px-4 text-sm text-foreground shadow-none data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                value="knowledge"
              >
                <HugeiconsIcon
                  aria-hidden="true"
                  color="currentColor"
                  icon={Knowledge02Icon}
                  size={15}
                  strokeWidth={1.8}
                />
                知识
              </TabsTrigger>
              <TabsTrigger
                className="h-8 min-w-18 gap-1.5 rounded-[8px] px-4 text-sm text-foreground shadow-none data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                value="attachments"
              >
                <HugeiconsIcon
                  aria-hidden="true"
                  color="currentColor"
                  icon={MessagePreview01Icon}
                  size={15}
                  strokeWidth={1.8}
                />
                附件
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="knowledge">
        <section aria-label="知识列表区块" className="space-y-4">
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
                aria-label="搜索知识"
                className="h-10 rounded-[8px] pl-9"
                maxLength={KB_SEARCH_QUERY_MAX_LENGTH}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="搜索知识"
                value={searchQuery}
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <AddKnowledgeMenu onSelect={handleAddKnowledgeSelect} />
            </div>
          </div>

          {showKnowledgeList ? (
            <div>
              <KnowledgeRecordsTable
                kbId={knowledgeBase?.id ?? kbId}
                loading={recordsLoading}
                onDelete={setDeleteRecord}
                onRetry={handleRetryDoc}
                onShowSummary={(record) => {
                  void handleShowSummary(record);
                }}
                records={pagedRecords}
                retryingDocId={retryingDocId}
              />
              <TablePagination
                onPageChange={setCurrentPage}
                page={activePage}
                total={total}
                totalPages={totalPages}
              />
            </div>
          ) : (
            <KbKnowledgeEmptyState />
          )}
        </section>
          </TabsContent>

          <TabsContent value="attachments">
            <KbAttachmentsTab
              activeType={activeAttachmentType}
              kbId={kbId}
              onActiveTypeChange={handleAttachmentTypeChange}
              onTargetChunkClear={handleAttachmentTargetClear}
              onTargetTypeResolved={handleAttachmentTargetTypeResolved}
              targetChunkId={targetAttachmentChunkId}
              targetDocId={targetAttachmentDocId}
            />
          </TabsContent>
        </Tabs>
      </div>
      </TooltipProvider>
      <ImportQaDialog
        defaultAddMethod={qaDialogDefaultAddMethod}
        kbId={kbId}
        onImportComplete={() => {
          void loadDocs();
          notifyAiHostingQuotaChanged();
        }}
        onOpenChange={(open) => {
          setImportQaDialogOpen(open);
          if (!open) {
            setQaDialogDefaultAddMethod("file");
          }
        }}
        open={importQaDialogOpen}
      />
      {/* 图片添加入口暂时下线
      <ImportImageDialog
        kbId={kbId}
        onCreated={() => {
          void loadDocs();
          notifyAiHostingQuotaChanged();
        }}
        onOpenChange={setImageDialogOpen}
        open={imageDialogOpen}
      />
      */}
      <ImportDocumentDialog
        kbId={kbId}
        onCreated={() => {
          void loadDocs();
          notifyAiHostingQuotaChanged();
        }}
        onOpenChange={setDocumentDialogOpen}
        open={documentDialogOpen}
      />
      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setDeleteRecord(null);
          }
        }}
        open={deleteRecord != null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定删除该知识吗</AlertDialogTitle>
            <AlertDialogDescription>删除后无法恢复</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={() => void handleConfirmDelete()}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <KnowledgeDocSummarySheet
        onOpenChange={(open) => {
          if (!open) {
            summaryRequestVersionRef.current += 1;
            setSummaryRecord(null);
            setLoadingSummary(false);
            setSummaryError(false);
          }
        }}
        error={summaryError}
        loading={loadingSummary}
        record={summaryRecord}
      />
    </AiHostingLayout>
  );
}

function resolveKbAttachmentTypeParam(value: string | null) {
  return value ? kbAttachmentTypeByParam.get(value) : undefined;
}

function resolveKbAttachmentTypeSearchParam(type: KbAttachmentType) {
  return kbAttachmentTypeParamByType.get(type) ?? "image";
}

function normalizeKbDetailViewSearchParams(searchParams: URLSearchParams) {
  const tabParam = searchParams.get(KB_DETAIL_TAB_PARAM);
  const attachmentTypeParam = searchParams.get(KB_ATTACHMENT_TYPE_PARAM);
  const nextSearchParams = new URLSearchParams(searchParams);

  if (tabParam !== "attachments") {
    if (tabParam == null && attachmentTypeParam == null) {
      return null;
    }

    nextSearchParams.delete(KB_DETAIL_TAB_PARAM);
    nextSearchParams.delete(KB_ATTACHMENT_TYPE_PARAM);
  } else if (!resolveKbAttachmentTypeParam(attachmentTypeParam)) {
    if (searchParams.get("chunkId")) {
      if (attachmentTypeParam == null) {
        return null;
      }

      nextSearchParams.delete(KB_ATTACHMENT_TYPE_PARAM);
    } else {
      nextSearchParams.set(KB_ATTACHMENT_TYPE_PARAM, "image");
    }
  } else {
    return null;
  }

  return nextSearchParams;
}

function AddKnowledgeMenu({
  disabled = false,
  onSelect,
}: {
  disabled?: boolean;
  onSelect: (type: AddKnowledgeOption["type"]) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="h-10 px-4" disabled={disabled} type="button">
          <HugeiconsIcon color="currentColor" icon={Add01Icon} size={17} strokeWidth={1.8} />
          <span>添加知识</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[320px] p-1.5">
        <DropdownMenuLabel className="px-2.5 py-1 text-xs font-medium text-muted-foreground">
          高质量人工知识
        </DropdownMenuLabel>
        {addKnowledgeOptions
          .filter((option) => option.type !== "document")
          .map((option) => renderAddKnowledgeOption(option, { onSelect }))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="px-2.5 py-1 text-xs font-medium text-muted-foreground">
          原始文档
        </DropdownMenuLabel>
        {addKnowledgeOptions
          .filter((option) => option.type === "document")
          .map((option) => renderAddKnowledgeOption(option, { onSelect }))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function renderAddKnowledgeOption(
  option: AddKnowledgeOption,
  { onSelect }: { onSelect: (type: AddKnowledgeOption["type"]) => void },
) {
  return (
    <DropdownMenuItem
      className="h-auto items-start gap-3 px-2.5 py-2.5"
      key={option.label}
      onSelect={() => {
        onSelect(option.type);
      }}
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-muted">
        <img
          alt={option.label}
          className="size-6 object-contain"
          data-testid="knowledge-add-option-icon"
          src={option.imgSrc}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">
          {option.label}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
          {option.description}
        </span>
      </span>
    </DropdownMenuItem>
  );
}

function KbKnowledgeEmptyState() {
  return (
    <KbEmptyStatePanel
      description={KB_KNOWLEDGE_EMPTY_DESCRIPTION}
      illustrationUrl={kbKnowledgeEmptyIllustrationUrl}
      suggestionContent={KB_KNOWLEDGE_EMPTY_SUGGESTION}
      suggestionLabel="查看建议"
    />
  );
}

function KnowledgeRecordsTable({
  kbId,
  loading,
  onDelete,
  onRetry,
  onShowSummary,
  records,
  retryingDocId,
}: {
  kbId: string;
  loading: boolean;
  onDelete: (record: KbDocViewItem) => void;
  onRetry: (docId: string) => void | Promise<void>;
  onShowSummary: (record: KbDocViewItem) => void;
  records: KbDocViewItem[];
  retryingDocId: string | null;
}) {
  const navigate = useNavigate();

  return (
    <Table aria-label="知识列表" className="min-w-[1120px] table-fixed">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-11 w-[30%] px-4">知识名称</TableHead>
          <TableHead className="h-11 w-[10%] px-4">文件大小</TableHead>
          <TableHead className="h-11 w-[12%] px-4">切片数量</TableHead>
          <TableHead className="h-11 w-[14%] px-4">状态</TableHead>
          <TableHead className="h-11 w-[17%] whitespace-nowrap px-4">创建时间</TableHead>
          <TableHead className="h-11 w-[17%] whitespace-nowrap px-4">更新时间</TableHead>
          <TablePinnedHead className="h-11 w-[100px] whitespace-nowrap px-4 text-right">
            操作
          </TablePinnedHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <KbTableLoadingRow colSpan={7} />
        ) : records.length > 0 ? (
          records.map((record) => (
            <TableRow key={record.id}>
              <TableCell className="px-4 py-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <FileExtensionBadge
                    className="size-8"
                    extension={record.fileExtension}
                  />
                  <div className="min-w-0 flex-1">
                    <KnowledgeNameWithSummary
                      onOpenDetail={() => navigate(`/chat/ai-hosting/kb/${kbId}/docs/${record.id}`)}
                      onShowSummary={() => onShowSummary(record)}
                      record={record}
                    />
                  </div>
                </div>
              </TableCell>
              <TableCell className="px-4 py-4 text-muted-foreground">
                {record.fileSize}
              </TableCell>
              <TableCell className="px-4 py-4 text-muted-foreground">
                {record.sliceCount ?? "-"}
              </TableCell>
              <TableCell className="px-4 py-4">
                <div className="flex items-center gap-2">
                  <KnowledgeStatusBadge status={record.status} />
                  {record.status === "failed" ? (
                    <Button
                      aria-label={`重试 ${record.name}`}
                      className="h-auto p-0 text-primary"
                      disabled={retryingDocId !== null}
                      onClick={() => {
                        void onRetry(record.id);
                      }}
                      type="button"
                      variant="link"
                    >
                      重试
                    </Button>
                  ) : null}
                </div>
              </TableCell>
              <TableCell
                className="px-4 py-4 text-muted-foreground"
                title={record.createdAt}
              >
                <TableCellContent>{record.createdAt}</TableCellContent>
              </TableCell>
              <TableCell
                className="px-4 py-4 text-muted-foreground"
                title={record.updatedAt}
              >
                <TableCellContent>{record.updatedAt}</TableCellContent>
              </TableCell>
              <TablePinnedCell className="whitespace-nowrap px-4 py-4 text-right">
                <div className="flex items-center justify-end gap-3">
                  <Button
                    asChild={record.status === "completed"}
                    className="h-auto p-0 text-primary"
                    disabled={record.status !== "completed"}
                    type="button"
                    variant="link"
                  >
                    {record.status === "completed" ? (
                      <Link to={`/chat/ai-hosting/kb/${kbId}/docs/${record.id}`}>
                        查看
                      </Link>
                    ) : (
                      <span>查看</span>
                    )}
                  </Button>
                  <Button
                    className="h-auto p-0 text-primary"
                    onClick={() => onDelete(record)}
                    type="button"
                    variant="link"
                  >
                    删除
                  </Button>
                </div>
              </TablePinnedCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell className="py-10 text-center text-sm text-muted-foreground" colSpan={7}>
              暂无数据
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

function KnowledgeNameWithSummary({
  onOpenDetail,
  onShowSummary,
  record,
}: {
  onOpenDetail: () => void;
  onShowSummary: () => void;
  record: KbDocViewItem;
}) {
  const canOpenDetail = record.status === "completed";
  const [isSummaryPreviewOpen, setIsSummaryPreviewOpen] = useState(false);
  const name = record.nameWithExtension;
  const nameTitle = record.briefSummary ? undefined : name;
  const nameContent = canOpenDetail ? (
    <button
      className="block max-w-full cursor-pointer truncate border-0 bg-transparent p-0 text-left font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
      onClick={onOpenDetail}
      title={nameTitle}
      type="button"
    >
      {name}
    </button>
  ) : (
    <span className="block truncate text-foreground" title={nameTitle}>
      {name}
    </span>
  );

  if (!record.briefSummary) {
    return nameContent;
  }

  return (
    <HoverCard
      closeDelay={120}
      onOpenChange={setIsSummaryPreviewOpen}
      open={isSummaryPreviewOpen}
      openDelay={120}
    >
      <HoverCardTrigger asChild>
        {nameContent}
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        aria-label={`${name} 摘要`}
        className="w-[min(24rem,calc(100vw-2rem))] rounded-[10px] p-0 shadow-[0_16px_40px_var(--shadow-medium)]"
        role="dialog"
        side="right"
        sideOffset={10}
      >
        <div className="space-y-3 p-4">
          <div className="flex min-w-0 items-center gap-2">
            <FileExtensionBadge className="size-6" extension={record.fileExtension} />
            <p className="min-w-0 truncate text-[13px] font-semibold leading-5 text-foreground" title={name}>
              {name}
            </p>
          </div>
          <div className="border-t border-border" />
          <div className="space-y-3">
            <p className="text-[13px] leading-6 text-foreground">
              <span className="mr-2 inline-flex h-6 items-center gap-1.5 rounded-[4px] bg-primary/8 px-2 align-top text-[13px] font-medium leading-6 text-primary">
                <HugeiconsIcon
                  aria-hidden
                  color="currentColor"
                  icon={AiMagicIcon}
                  size={14}
                  strokeWidth={1.8}
                />
                文章速览
              </span>
              {record.briefSummary}
            </p>
            <div className="flex flex-wrap gap-2">
              {record.hasDocSummary ? (
                <Button
                  className="h-8 rounded-[6px] px-3 text-[13px]"
                  onClick={() => {
                    setIsSummaryPreviewOpen(false);
                    onShowSummary();
                  }}
                  type="button"
                  variant="secondary"
                >
                  <span>全文摘要</span>
                </Button>
              ) : null}
              <Button
                className="h-8 rounded-[6px] px-3 text-[13px]"
                disabled={!canOpenDetail}
                onClick={onOpenDetail}
                type="button"
                variant="secondary"
              >
                <span>切片详情</span>
              </Button>
            </div>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function KnowledgeDocSummarySheet({
  error,
  loading,
  onOpenChange,
  record,
}: {
  error: boolean;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  record: KbDocViewItem | null;
}) {
  return (
    <Sheet onOpenChange={onOpenChange} open={Boolean(record)}>
      <SheetContent className="w-full overflow-hidden sm:max-w-[min(720px,calc(100vw-48px))]">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle>全文摘要</SheetTitle>
          <SheetDescription className="sr-only">
            查看知识文档全文摘要
          </SheetDescription>
          {record ? (
            <div className="mt-4 flex min-w-0 items-center gap-3 rounded-[10px] border border-border bg-background px-4 py-3">
              <FileExtensionBadge className="size-8" extension={record.fileExtension} />
              <span className="min-w-0 truncate text-sm font-medium text-foreground">
                {record.nameWithExtension}
              </span>
            </div>
          ) : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {loading ? (
            <div
              className="flex min-h-[160px] items-center justify-center gap-2 text-sm text-muted-foreground"
              role="status"
            >
              <Spinner aria-hidden="true" size={14} />
              正在加载
            </div>
          ) : error ? (
            <p className="text-sm text-muted-foreground">加载失败</p>
          ) : record?.docSummary ? (
            <KnowledgeMarkdown content={record.docSummary} />
          ) : (
            <p className="text-sm text-muted-foreground">暂无数据</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function KnowledgeMarkdown({ content }: { content: string }) {
  if (!content.trim()) {
    return (
      <p className="text-sm text-muted-foreground">
        暂无数据
      </p>
    );
  }

  return (
    <div className="space-y-5 text-foreground">
      <ReactMarkdown
        components={{
          a: ({ children, node: _node, ...props }) => (
            <a
              className="text-primary underline-offset-4 hover:underline"
              rel="noreferrer"
              target="_blank"
              {...props}
            >
              {children}
            </a>
          ),
          code: ({ children, node: _node, ...props }) => (
            <code className="rounded bg-muted px-1 py-0.5 text-[0.92em]" {...props}>
              {children}
            </code>
          ),
          h1: ({ children }) => (
            <h1 className="text-xl font-semibold leading-8 text-foreground">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-semibold leading-8 text-foreground">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold leading-7 text-foreground">{children}</h3>
          ),
          li: ({ children }) => <li className="pl-1">{children}</li>,
          ol: ({ children }) => (
            <ol className="ml-5 list-decimal space-y-2 text-sm leading-7">{children}</ol>
          ),
          p: ({ children }) => (
            <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{children}</p>
          ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-[8px] bg-muted p-3 text-sm leading-6">
              {children}
            </pre>
          ),
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          ul: ({ children }) => (
            <ul className="ml-5 list-disc space-y-2 text-sm leading-7">{children}</ul>
          ),
        }}
        remarkPlugins={[remarkGfm]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function KnowledgeStatusBadge({ status }: { status: KbStatus }) {
  const meta = statusMeta[status];

  return (
    <span className={`inline-flex items-center gap-1.5 ${meta.className}`}>
      <HugeiconsIcon color="currentColor" icon={meta.icon} size={15} strokeWidth={1.8} />
      <span>{meta.label}</span>
    </span>
  );
}

function BackToKbListButton() {
  return (
    <Button
      asChild
      className="-ml-2 h-8 w-fit justify-start rounded-[8px] px-2 text-muted-foreground hover:text-foreground"
      type="button"
      variant="ghost"
    >
      <Link to="/chat/ai-hosting/kb">
        <HugeiconsIcon color="currentColor" icon={ArrowLeft01Icon} size={17} strokeWidth={1.8} />
        <span>返回知识库</span>
      </Link>
    </Button>
  );
}
