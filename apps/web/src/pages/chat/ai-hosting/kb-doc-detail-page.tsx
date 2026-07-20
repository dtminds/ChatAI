import { useCallback, useEffect, useRef, useState } from "react";
import {
  Add01Icon,
  ArrowLeft01Icon,
  Delete02Icon,
  Edit02Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useParams, useSearchParams } from "react-router-dom";
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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
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
import { cn } from "@/lib/utils";
import { FileExtensionBadge } from "@/pages/chat/components/message/file";
import { AiHostingLayout, AiHostingPageHeader } from "./ai-hosting-layout";
import { AddChunkDialog } from "./kb-components/add-chunk-dialog";
import { ChunkImagePreview } from "./kb-components/chunk-image-preview";
import { EditChunkDialog } from "./kb-components/edit-chunk-dialog";
import { ImageKnowledgeChunkWorkspace } from "./kb-components/image-chunk-workspace";
import { KbTableLoadingRow } from "./kb-components/kb-table-loading-row";
import { resolveKbRequestErrorMessage, TableOverflowTooltip } from "./kb-components/shared";
import {
  createKbChunk,
  deleteKbChunk,
  updateKbChunk,
} from "./api/kb-chunk-service";
import {
  getKb,
  getKbDoc,
  listKbDocChunks,
  toKbDocChunkViewItem,
  toKbDocViewItem,
  toKbListViewItem,
} from "./api/kb-service";
import type { KbDocChunkViewItem, KbDocType, KbDocViewItem } from "./kb-types";

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
const IMAGE_CHUNK_PAGE_SIZE = 100;

function resolveChunkSearchField(docType: KbDocType | undefined) {
  if (docType === "qa") {
    return {
      ariaLabel: "搜索问题",
      placeholder: "搜索问题",
    };
  }

  return {
    ariaLabel: "搜索切片内容",
    placeholder: "搜索切片内容",
  };
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

export function KbDocDetailPage() {
  const { docId = "", kbId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const targetChunkId = searchParams.get("chunkId")?.trim() || undefined;
  const targetEntryId = searchParams.get("entryId")?.trim() || undefined;
  const [knowledgeBase, setKnowledgeBase] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [doc, setDoc] = useState<KbDocViewItem | null>(null);
  const [chunks, setChunks] = useState<KbDocChunkViewItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingPage, setLoadingPage] = useState(true);
  const [loadingChunks, setLoadingChunks] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [addQaDialogOpen, setAddQaDialogOpen] = useState(false);
  const [addDocDialogOpen, setAddDocDialogOpen] = useState(false);
  const [editChunk, setEditChunk] = useState<KbDocChunkViewItem | null>(null);
  const [deleteChunk, setDeleteChunk] = useState<KbDocChunkViewItem | null>(null);
  const requestVersionRef = useRef(0);
  const resolvedEntryChunkIdRef = useRef<string | undefined>(undefined);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const debouncedSearchQuery = useDebouncedValue(searchQuery.trim(), 300);
  const debouncedChunkId = useDebouncedValue(targetChunkId ?? "", 300).trim();

  useEffect(() => {
    if (
      !targetEntryId
      && resolvedEntryChunkIdRef.current
      && targetChunkId !== resolvedEntryChunkIdRef.current
    ) {
      resolvedEntryChunkIdRef.current = undefined;
    }
  }, [targetChunkId, targetEntryId]);

  const loadChunks = useCallback(async (options?: { page?: number }) => {
    if (!docId || !doc) {
      return;
    }

    const version = ++requestVersionRef.current;
    setLoadingChunks(true);

    try {
      const isImageDoc = doc.type === "image";
      const page = options?.page ?? (isImageDoc ? 1 : currentPage);
      const response = await listKbDocChunks(docId, {
        chunkId: targetEntryId
          ? undefined
          : resolvedEntryChunkIdRef.current || debouncedChunkId || undefined,
        content: !isImageDoc && doc.type !== "qa" ? debouncedSearchQuery || undefined : undefined,
        docType: doc.type,
        entryId: targetEntryId,
        page: isImageDoc ? 1 : page,
        pageSize: isImageDoc ? IMAGE_CHUNK_PAGE_SIZE : pageSize,
        title: doc.type === "qa" ? debouncedSearchQuery || undefined : undefined,
      });

      if (version !== requestVersionRef.current) {
        return;
      }

      const mappedChunks = response.chunks.map((chunk) => toKbDocChunkViewItem(chunk, doc.type));

      if (targetEntryId) {
        const targetChunk =
          mappedChunks.find((chunk) => chunk.id === targetEntryId)
          ?? (mappedChunks.length === 1 ? mappedChunks[0] : undefined);
        const normalizedChunkId = resolveVolcChunkIdTail(targetChunk?.volcChunkId);

        if (normalizedChunkId) {
          resolvedEntryChunkIdRef.current = normalizedChunkId;
          setSearchParams((currentSearchParams) => {
            const nextSearchParams = new URLSearchParams(currentSearchParams);

            nextSearchParams.delete("entryId");
            nextSearchParams.set("chunkId", normalizedChunkId);
            return nextSearchParams;
          }, { replace: true });
        }
      }

      setChunks(mappedChunks);
      setTotal(response.pagination.total);
    } catch {
      if (version !== requestVersionRef.current) {
        return;
      }

      setChunks([]);
      setTotal(0);
    } finally {
      if (version === requestVersionRef.current) {
        setLoadingChunks(false);
      }
    }
  }, [currentPage, debouncedChunkId, debouncedSearchQuery, doc, docId, pageSize, setSearchParams, targetEntryId]);

  const refreshChunksFromFirstPage = useCallback(async () => {
    if (currentPage !== 1) {
      setCurrentPage(1);
    } else {
      await loadChunks();
    }
  }, [currentPage, loadChunks]);

  useEffect(() => {
    return () => {
      requestVersionRef.current++;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDocPage() {
      if (!docId || !kbId) {
        setKnowledgeBase(null);
        setDoc(null);
        setLoadingPage(false);
        return;
      }

      setLoadingPage(true);

      try {
        const [kb, docDetail] = await Promise.all([getKb(kbId), getKbDoc(docId)]);

        if (cancelled) {
          return;
        }

        const mappedKb = toKbListViewItem(kb);
        const mappedDoc = toKbDocViewItem(docDetail);

        if (mappedDoc.kbId !== mappedKb.id) {
          setKnowledgeBase(null);
          setDoc(null);
          return;
        }

        setKnowledgeBase({ id: mappedKb.id, name: mappedKb.name });
        setDoc(mappedDoc);
      } catch {
        if (!cancelled) {
          setKnowledgeBase(null);
          setDoc(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingPage(false);
        }
      }
    }

    void loadDocPage();

    return () => {
      cancelled = true;
    };
  }, [docId, kbId]);

  useEffect(() => {
    if (!doc || loadingPage) {
      return;
    }

    void loadChunks();
  }, [doc, loadChunks, loadingPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedChunkId, debouncedSearchQuery, docId, pageSize]);

  useEffect(() => {
    if ((!targetChunkId && !targetEntryId) || loadingChunks) {
      return;
    }

    const targetChunk = chunks.find((chunk) =>
      targetEntryId ? chunk.id === targetEntryId : resolveChunkDisplayId(chunk) === targetChunkId,
    );

    if (!targetChunk) {
      return;
    }

    document.getElementById(`kb-chunk-${targetChunk.id}`)?.scrollIntoView?.({
      block: "center",
    });
  }, [chunks, loadingChunks, targetChunkId, targetEntryId]);

  const { activePage, totalPages } = resolveTablePagination({
    page: currentPage,
    pageSize,
    total,
  });

  function handlePageSizeChange(nextPageSize: number) {
    setPageSize(nextPageSize);
    setCurrentPage(1);
  }

  async function handleCreateQaChunk(values: { answer: string; question: string }) {
    if (!doc) {
      return;
    }

    await createKbChunk({
      chunkType: "faq",
      content: values.answer,
      docId: doc.id,
      title: values.question,
    });

    if (!isMountedRef.current) {
      return;
    }

    await refreshChunksFromFirstPage();

    if (isMountedRef.current) {
      toast.success("已添加问答切片");
    }
  }

  async function handleCreateDocChunk(values: { content: string; title: string }) {
    if (!doc) {
      return;
    }

    await createKbChunk({
      chunkType: "text",
      content: values.content,
      docId: doc.id,
      title: values.title,
    });

    if (!isMountedRef.current) {
      return;
    }

    await refreshChunksFromFirstPage();

    if (isMountedRef.current) {
      toast.success("已添加切片");
    }
  }

  async function handleEditChunk(
    chunkId: string,
    values: Partial<Pick<KbDocChunkViewItem, "question" | "answer" | "title" | "content">>,
  ) {
    const chunk = chunks.find((item) => item.id === chunkId);

    if (!chunk) {
      return;
    }

    if (chunk.type === "qa") {
      await updateKbChunk(chunkId, {
        content: values.answer ?? chunk.answer ?? "",
        title: values.question ?? chunk.question,
      });
    } else {
      await updateKbChunk(chunkId, {
        content: values.content ?? chunk.content ?? "",
        title: values.title ?? chunk.title,
      });
    }

    if (!isMountedRef.current) {
      return;
    }

    await loadChunks();

    if (isMountedRef.current) {
      toast.success("已保存");
    }
  }

  async function handleConfirmDelete() {
    if (!deleteChunk) {
      return;
    }

    try {
      await deleteKbChunk(deleteChunk.id);

      if (!isMountedRef.current) {
        return;
      }

      setDeleteChunk(null);
      await refreshChunksFromFirstPage();

      if (isMountedRef.current) {
        toast.success("已删除切片");
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error(resolveKbRequestErrorMessage(error, "删除失败，请稍后重试"));
      }
    }
  }

  if (!loadingPage && (!knowledgeBase || !doc || doc.kbId !== knowledgeBase.id)) {
    return (
      <AiHostingLayout title="文档不存在">
        <div className="space-y-6">
          <BackToKnowledgeListButton kbId={kbId} />
          <div className="py-16 text-center">
            <h1 className="text-lg font-semibold text-foreground">未找到文档</h1>
            <p className="mt-2 text-sm text-muted-foreground">当前文档不存在或已被删除</p>
          </div>
        </div>
      </AiHostingLayout>
    );
  }

  if (!loadingPage && doc && doc.status !== "completed") {
    return (
      <AiHostingLayout title={doc.nameWithExtension}>
        <div className="space-y-6">
          <BackToKnowledgeListButton kbId={knowledgeBase?.id ?? doc.kbId} />
          <div className="py-16 text-center">
            <h1 className="text-lg font-semibold text-foreground">文档尚未解析完成</h1>
            <p className="mt-2 text-sm text-muted-foreground">请等待解析完成后再查看切片</p>
          </div>
        </div>
      </AiHostingLayout>
    );
  }

  const chunkSearchField = resolveChunkSearchField(doc?.type);

  return (
    <AiHostingLayout title={doc?.nameWithExtension ?? "文档"}>
      <div className="space-y-6">
        <div aria-label="文档切片头部" className="space-y-3">
          <BackToKnowledgeListButton
            kbId={knowledgeBase?.id ?? kbId}
            label={knowledgeBase?.name}
          />
          <AiHostingPageHeader
            title={doc ? <KnowledgeDocTitle doc={doc} /> : "文档"}
            titleAriaLabel={doc?.nameWithExtension ?? "文档"}
          />
        </div>

        <section aria-label="切片列表区块" className="space-y-4">
          {doc?.type === "image" ? (
            doc ? (
              <ImageKnowledgeChunkWorkspace
                chunks={chunks}
                doc={doc}
                loading={loadingPage || loadingChunks}
              />
            ) : null
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <div className="relative w-[220px] max-w-full">
                    <HugeiconsIcon
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      color="currentColor"
                      icon={Search01Icon}
                      size={17}
                      strokeWidth={1.8}
                    />
                    <Input
                      aria-label="搜索切片 ID"
                      className="h-10 rounded-[8px] pl-9"
                      disabled={loadingPage || !doc || doc.status !== "completed"}
                      onChange={(event) => {
                        const nextSearchParams = new URLSearchParams(searchParams);
                        const nextChunkId = event.target.value.trim();

                        resolvedEntryChunkIdRef.current = undefined;
                        setSearchQuery("");

                        if (nextChunkId) {
                          nextSearchParams.set("chunkId", nextChunkId);
                        } else {
                          nextSearchParams.delete("chunkId");
                        }
                        nextSearchParams.delete("entryId");

                        setSearchParams(nextSearchParams, { replace: true });
                      }}
                      placeholder="搜索切片 ID"
                      value={targetChunkId ?? ""}
                    />
                  </div>
                  <div className="relative w-[280px] max-w-full">
                    <HugeiconsIcon
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      color="currentColor"
                      icon={Search01Icon}
                      size={17}
                      strokeWidth={1.8}
                    />
                    <Input
                      aria-label={chunkSearchField.ariaLabel}
                      className="h-10 rounded-[8px] pl-9"
                      disabled={loadingPage || !doc || doc.status !== "completed"}
                      onChange={(event) => {
                        const nextSearchParams = new URLSearchParams(searchParams);

                        resolvedEntryChunkIdRef.current = undefined;
                        nextSearchParams.delete("chunkId");
                        nextSearchParams.delete("entryId");
                        setSearchParams(nextSearchParams, { replace: true });
                        setSearchQuery(event.target.value);
                      }}
                      placeholder={chunkSearchField.placeholder}
                      value={searchQuery}
                    />
                  </div>
                </div>

                {doc && doc.status === "completed" ? (
                  <AddChunkActions
                    doc={doc}
                    onAddDoc={() => setAddDocDialogOpen(true)}
                    onAddQa={() => setAddQaDialogOpen(true)}
                  />
                ) : null}
              </div>

              <div className="space-y-4">
                {doc?.type === "qa" ? (
                  <KnowledgeChunksTable
                    chunks={chunks}
                    loading={loadingPage || loadingChunks}
                    onDelete={setDeleteChunk}
                    onEdit={setEditChunk}
                    targetChunkId={targetChunkId}
                    targetEntryId={targetEntryId}
                  />
                ) : (
                  <KnowledgeDocumentChunkCards
                    chunks={chunks}
                    itemStartIndex={(activePage - 1) * pageSize}
                    loading={loadingPage || loadingChunks}
                    onDelete={setDeleteChunk}
                    onEdit={setEditChunk}
                  />
                )}
                <TablePagination
                  className={doc?.type === "qa" ? undefined : "border-t-0 pt-0"}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={handlePageSizeChange}
                  page={activePage}
                  pageSize={pageSize}
                  pageSizeOptions={PAGE_SIZE_OPTIONS}
                  total={total}
                  totalPages={totalPages}
                />
              </div>
            </>
          )}
        </section>
      </div>

      <AddChunkDialog
        dialogTitle="添加问答"
        fieldIdPrefix="qa-chunk"
        firstFieldLabel="问题"
        onOpenChange={setAddQaDialogOpen}
        onSubmit={({ first, second }) =>
          handleCreateQaChunk({ question: first, answer: second })
        }
        open={addQaDialogOpen}
        secondFieldLabel="答案"
      />
      <AddChunkDialog
        dialogTitle="添加切片"
        fieldIdPrefix="doc-chunk"
        firstFieldLabel="切片标题"
        firstFieldRequired={false}
        onOpenChange={setAddDocDialogOpen}
        onSubmit={({ first, second }) =>
          handleCreateDocChunk({ title: first, content: second })
        }
        open={addDocDialogOpen}
        secondFieldLabel="切片内容"
      />
      <EditChunkDialog
        chunk={editChunk}
        onOpenChange={(open) => {
          if (!open) {
            setEditChunk(null);
          }
        }}
        onSubmit={handleEditChunk}
        open={editChunk !== null}
      />
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteChunk(null);
          }
        }}
        open={deleteChunk !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定删除该切片吗</AlertDialogTitle>
            <AlertDialogDescription>删除后无法恢复</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmDelete()} variant="destructive">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AiHostingLayout>
  );
}

function KnowledgeDocTitle({ doc }: { doc: KbDocViewItem }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-2.5">
      <FileExtensionBadge
        className="size-7"
        extension={doc.fileExtension}
      />
      <span className="min-w-0 truncate">{doc.nameWithExtension}</span>
      <Badge className="rounded-[6px] px-2 py-0.5 text-xs" variant="secondary">
        {getKnowledgeDocTitleTypeLabel(doc)}
      </Badge>
    </span>
  );
}

function getKnowledgeDocTitleTypeLabel(doc: KbDocViewItem) {
  if (doc.type === "qa") {
    return "FAQ";
  }

  if (doc.type === "image") {
    return "图片";
  }

  return doc.fileExtension === "txt" || doc.fileExtension === "md" ? "纯文本" : "文件";
}

function AddChunkActions({
  doc,
  onAddDoc,
  onAddQa,
}: {
  doc: KbDocViewItem;
  onAddDoc: () => void;
  onAddQa: () => void;
}) {
  if (doc.type === "image") {
    return null;
  }

  if (doc.type === "qa") {
    return (
      <Button className="h-10 px-4" onClick={onAddQa} type="button">
        <HugeiconsIcon color="currentColor" icon={Add01Icon} size={17} strokeWidth={1.8} />
        <span>添加问答</span>
      </Button>
    );
  }

  return (
    <Button className="h-10 px-4" onClick={onAddDoc} type="button">
      <HugeiconsIcon color="currentColor" icon={Add01Icon} size={17} strokeWidth={1.8} />
      <span>添加切片</span>
    </Button>
  );
}

function resolveChunkDisplayId(chunk: KbDocChunkViewItem) {
  return chunk.displayChunkId || chunk.volcChunkId || chunk.id;
}

function resolveVolcChunkIdTail(volcChunkId?: string) {
  return volcChunkId?.split("_").pop()?.trim() || undefined;
}

function KnowledgeChunksTable({
  chunks,
  loading,
  onDelete,
  onEdit,
  targetEntryId,
  targetChunkId,
}: {
  chunks: KbDocChunkViewItem[];
  loading: boolean;
  onDelete: (chunk: KbDocChunkViewItem) => void;
  onEdit: (chunk: KbDocChunkViewItem) => void;
  targetEntryId?: string;
  targetChunkId?: string;
}) {
  const columnCount = 5;

  return (
    <TooltipProvider>
      <Table aria-label="切片列表" className="min-w-[960px] table-fixed">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-11 w-[18%] px-4">切片ID</TableHead>
          <TableHead className="h-11 w-[24%] px-4">问题</TableHead>
          <TableHead className="h-11 w-[38%] px-4">答案</TableHead>
          <TableHead className="h-11 w-[16%] px-4">更新时间</TableHead>
          <TablePinnedHead className="h-11 w-[120px] whitespace-nowrap px-4 text-right">
            操作
          </TablePinnedHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <KbTableLoadingRow colSpan={columnCount} />
        ) : chunks.length > 0 ? (
          chunks.map((chunk) => (
            <TableRow
              aria-current={
                (targetEntryId ? chunk.id === targetEntryId : resolveChunkDisplayId(chunk) === targetChunkId)
                  ? "true"
                  : undefined
              }
              id={`kb-chunk-${chunk.id}`}
              key={chunk.id}
            >
              <TableCell className="px-4 py-4">
                <TableOverflowTooltip
                  className="inline-block rounded-[6px] bg-muted px-3 py-1.5 text-xs font-semibold leading-none text-foreground"
                  tooltip={resolveChunkDisplayId(chunk)}
                >
                  {resolveChunkDisplayId(chunk)}
                </TableOverflowTooltip>
              </TableCell>
              <TableCell className="px-4 py-4">
                <TableOverflowTooltip
                  className="font-medium text-foreground"
                  tooltip={chunk.question}
                >
                  {chunk.question}
                </TableOverflowTooltip>
              </TableCell>
              <TableCell className="px-4 py-4">
                <TableOverflowTooltip className="text-muted-foreground" tooltip={chunk.answer}>
                  {chunk.answer}
                </TableOverflowTooltip>
              </TableCell>
              <TableCell
                className="px-4 py-4 text-muted-foreground"
                title={chunk.updatedAt}
              >
                <TableCellContent>{chunk.updatedAt}</TableCellContent>
              </TableCell>
              <TablePinnedCell className="whitespace-nowrap px-4 py-4 text-right">
                <div className="flex items-center justify-end gap-3">
                  <Button
                    className="h-auto p-0 text-primary"
                    onClick={() => onEdit(chunk)}
                    type="button"
                    variant="link"
                  >
                    编辑
                  </Button>
                  <Button
                    className="h-auto p-0 text-primary"
                    onClick={() => onDelete(chunk)}
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
            <TableCell className="py-10 text-center text-sm text-muted-foreground" colSpan={columnCount}>
              暂无切片数据
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
    </TooltipProvider>
  );
}

function KnowledgeDocumentChunkCards({
  chunks,
  itemStartIndex,
  loading,
  onDelete,
  onEdit,
}: {
  chunks: KbDocChunkViewItem[];
  itemStartIndex: number;
  loading: boolean;
  onDelete: (chunk: KbDocChunkViewItem) => void;
  onEdit: (chunk: KbDocChunkViewItem) => void;
}) {
  if (loading) {
    return (
      <div
        className="flex min-h-[180px] items-center justify-center rounded-[8px] border bg-card text-sm text-muted-foreground"
        role="status"
      >
        <Spinner className="mr-2" size={16} />
        <span>正在加载</span>
      </div>
    );
  }

  if (chunks.length === 0) {
    return (
      <div className="rounded-[8px] border bg-card py-10 text-center text-sm text-muted-foreground">
        暂无切片数据
      </div>
    );
  }

  return (
    <ul aria-label="切片列表" className="grid gap-4 lg:grid-cols-2" role="list">
      {chunks.map((chunk, index) => (
        <KnowledgeDocumentChunkCard
          chunk={chunk}
          displayIndex={itemStartIndex + index + 1}
          key={chunk.id}
          onDelete={onDelete}
          onEdit={onEdit}
        />
      ))}
    </ul>
  );
}

function KnowledgeDocumentChunkCard({
  chunk,
  displayIndex,
  onDelete,
  onEdit,
}: {
  chunk: KbDocChunkViewItem;
  displayIndex: number;
  onDelete: (chunk: KbDocChunkViewItem) => void;
  onEdit: (chunk: KbDocChunkViewItem) => void;
}) {
  const title = chunk.title?.trim() ?? "";
  const content = chunk.content ?? "";
  const characterCount = `${title}${content}`.length;
  const displayChunkId = resolveChunkDisplayId(chunk);

  return (
    <li
      className="group flex h-[204px] flex-col overflow-hidden rounded-[14px] border border-border/80 bg-card px-4 py-3.5 transition-shadow hover:shadow-[0_10px_24px_var(--shadow-soft)]"
      id={`kb-chunk-${chunk.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded-[6px] bg-muted px-3 py-1.5 text-xs font-semibold leading-none text-foreground">
            #{displayIndex}
          </span>
          <span className="min-w-0 truncate rounded-[6px] bg-muted px-3 py-1.5 text-xs font-semibold leading-none text-foreground">
            ID {displayChunkId}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <Button
            aria-label={`编辑 ${chunk.id}`}
            className="size-8 rounded-[6px] bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            onClick={() => onEdit(chunk)}
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon color="currentColor" icon={Edit02Icon} size={16} strokeWidth={1.8} />
          </Button>
          <Button
            aria-label={`删除 ${chunk.id}`}
            className="size-8 rounded-[6px] bg-muted text-muted-foreground hover:bg-muted/80 hover:text-destructive"
            onClick={() => onDelete(chunk)}
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon color="currentColor" icon={Delete02Icon} size={16} strokeWidth={1.8} />
          </Button>
        </div>
      </div>

      <div className="mt-2 flex min-h-0 flex-1 gap-3 overflow-hidden">
        {chunk.imageUrls?.[0] ? (
          <div className="shrink-0">
            <ChunkImagePreview
              alt={content || title}
              className="h-[92px] w-[132px] rounded-[4px] border-border/70 bg-muted/20"
              imageUrl={chunk.imageUrls[0]}
              size="list"
            />
          </div>
        ) : null}
        <div className="min-w-0 flex-1 space-y-1 overflow-hidden">
          {title ? (
            <button
              className="line-clamp-1 block max-h-5 w-full break-words text-left text-[13px] font-medium leading-5 text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15"
              onClick={() => onEdit(chunk)}
              type="button"
            >
              {title}
            </button>
          ) : null}
          <ChunkContentPreview
            clampClassName={title ? "line-clamp-3" : "line-clamp-4"}
            className={cn(
              "text-[13px] leading-6 text-foreground",
              title ? "max-h-[72px]" : "max-h-24",
            )}
            content={content}
            onClick={() => onEdit(chunk)}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0">字符</span>
          <span className="shrink-0 font-semibold text-foreground">{characterCount}</span>
        </div>
        <span className="shrink-0">更新于 {chunk.updatedAt}</span>
      </div>
    </li>
  );
}

function ChunkContentPreview({
  clampClassName = "line-clamp-2",
  className,
  content,
  onClick,
}: {
  clampClassName?: string;
  className?: string;
  content?: string;
  onClick: () => void;
}) {
  if (!content) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <button
      className={cn(
        "w-full whitespace-pre-line break-words text-left text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15",
        clampClassName,
        className,
      )}
      data-slot="chunk-content-preview"
      onClick={onClick}
      type="button"
    >
      {content}
    </button>
  );
}

function BackToKnowledgeListButton({
  kbId,
  label = "返回知识列表",
}: {
  kbId: string;
  label?: string;
}) {
  return (
    <Button
      asChild
      className="-ml-2 h-8 w-fit justify-start rounded-[8px] px-2 text-muted-foreground hover:text-foreground"
      type="button"
      variant="ghost"
    >
      <Link to={`/chat/ai-hosting/kb/${kbId}`}>
        <HugeiconsIcon color="currentColor" icon={ArrowLeft01Icon} size={17} strokeWidth={1.8} />
        <span>{label}</span>
      </Link>
    </Button>
  );
}
