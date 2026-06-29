import { useCallback, useEffect, useRef, useState } from "react";
import {
  Add01Icon,
  AlertCircleIcon,
  ArrowLeft01Icon,
  CheckmarkCircle02Icon,
  Clock04Icon,
  Loading03Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { KB_SEARCH_QUERY_MAX_LENGTH } from "@chatai/contracts";
import { Link, useParams } from "react-router-dom";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
import { FileExtensionBadge } from "@/pages/chat/components/message/file";
import {
  AiHostingLayout,
  AiHostingPageHeader,
  notifyAiHostingQuotaChanged,
} from "./ai-hosting-layout";
import { KbTableLoadingRow } from "./kb-components/kb-table-loading-row";
import { ImportDocumentDialog } from "./kb-components/import-document-dialog";
import { ImportImageDialog } from "./kb-components/import-image-dialog";
import { ImportQaDialog } from "./kb-components/import-qa-dialog";
import { TableOverflowTooltip } from "./kb-components/shared";
import { deleteKbDoc, retryKbDoc } from "./api/kb-doc-service";
import { getAiHostingQuota } from "./agent-service";
import {
  getKb,
  listKbDocs,
  toKbDocViewItem,
  toKbListViewItem,
} from "./api/kb-service";
import type { KbDocViewItem, KbListViewItem, KbStatus } from "./kb-types";
import {
  AI_HOSTING_KB_DOC_STORAGE_QUOTA_REACHED_MESSAGE,
  AI_HOSTING_QUOTA_CHECK_FAILED_MESSAGE,
  isQuotaReached,
} from "./quota";

const PAGE_SIZE = 10;

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
  {
    description: "上传图片并添加描述，按描述精准召回",
    imgSrc: "https://b5.bokr.com.cn/dist/image.png",
    label: "图片",
    type: "image",
  },
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
  const [knowledgeBase, setKnowledgeBase] = useState<KbListViewItem | null>(null);
  const [records, setRecords] = useState<KbDocViewItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingKb, setLoadingKb] = useState(true);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const [currentPage, setCurrentPage] = useState(1);
  const [importQaDialogOpen, setImportQaDialogOpen] = useState(false);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  const [deleteRecord, setDeleteRecord] = useState<KbDocViewItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [checkingKnowledgeQuota, setCheckingKnowledgeQuota] = useState(false);
  const [retryingDocId, setRetryingDocId] = useState<string | null>(null);
  const requestVersionRef = useRef(0);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

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

  async function handleAddKnowledgeSelect(optionType: AddKnowledgeOption["type"]) {
    if (checkingKnowledgeQuota) {
      return;
    }

    setCheckingKnowledgeQuota(true);

    try {
      const quota = await getAiHostingQuota();

      if (quota && isQuotaReached(quota.kbDocs)) {
        toast.error(AI_HOSTING_KB_DOC_STORAGE_QUOTA_REACHED_MESSAGE);
        return;
      }

      if (optionType === "qa") {
        setImportQaDialogOpen(true);
      }

      if (optionType === "image") {
        setImageDialogOpen(true);
      }

      if (optionType === "document") {
        setDocumentDialogOpen(true);
      }
    } catch {
      toast.error(AI_HOSTING_QUOTA_CHECK_FAILED_MESSAGE);
    } finally {
      setCheckingKnowledgeQuota(false);
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
              <AddKnowledgeMenu
                disabled={checkingKnowledgeQuota}
                onSelect={(type) => void handleAddKnowledgeSelect(type)}
              />
            </div>
          </div>

          <div>
            <KnowledgeRecordsTable
              kbId={knowledgeBase?.id ?? kbId}
              loading={recordsLoading}
              onDelete={setDeleteRecord}
              onRetry={handleRetryDoc}
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
        </section>
      </div>
      </TooltipProvider>
      <ImportQaDialog
        kbId={kbId}
        onImportComplete={() => {
          void loadDocs();
          notifyAiHostingQuotaChanged();
        }}
        onOpenChange={setImportQaDialogOpen}
        open={importQaDialogOpen}
      />
      <ImportImageDialog
        kbId={kbId}
        onCreated={() => {
          void loadDocs();
          notifyAiHostingQuotaChanged();
        }}
        onOpenChange={setImageDialogOpen}
        open={imageDialogOpen}
      />
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
    </AiHostingLayout>
  );
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
        {addKnowledgeOptions.slice(0, 2).map((option) =>
          renderAddKnowledgeOption(option, { onSelect }),
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="px-2.5 py-1 text-xs font-medium text-muted-foreground">
          原始文档
        </DropdownMenuLabel>
        {addKnowledgeOptions.slice(2).map((option) =>
          renderAddKnowledgeOption(option, { onSelect }),
        )}
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

function KnowledgeRecordsTable({
  kbId,
  loading,
  onDelete,
  onRetry,
  records,
  retryingDocId,
}: {
  kbId: string;
  loading: boolean;
  onDelete: (record: KbDocViewItem) => void;
  onRetry: (docId: string) => void | Promise<void>;
  records: KbDocViewItem[];
  retryingDocId: string | null;
}) {
  return (
    <Table aria-label="知识列表" className="min-w-[1120px] table-fixed">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-11 w-[24%] px-4">知识名称</TableHead>
          <TableHead className="h-11 w-[14%] px-4">类型</TableHead>
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
                    <TableOverflowTooltip
                      className="font-medium text-foreground"
                      tooltip={record.name}
                    >
                      {record.name}
                    </TableOverflowTooltip>
                  </div>
                </div>
              </TableCell>
              <TableCell className="px-4 py-4">
                <Badge className="rounded-[6px] px-2 py-0.5" variant="secondary">
                  {record.typeLabel}
                </Badge>
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
