import { useCallback, useEffect, useRef, useState } from "react";
import {
  Add01Icon,
  ArrowLeft01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { FileExtensionBadge } from "@/pages/chat/components/message/file";
import { AiHostingLayout, AiHostingPageHeader } from "./ai-hosting-layout";
import { AddChunkDialog } from "./kb-components/add-chunk-dialog";
import { ChunkImagePreview } from "./kb-components/chunk-image-preview";
import { EditChunkDialog } from "./kb-components/edit-chunk-dialog";
import { KbTableLoadingRow } from "./kb-components/kb-table-loading-row";
import { resolveKbRequestErrorMessage } from "./kb-components/shared";
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

const PAGE_SIZE = 10;

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
  const [addQaDialogOpen, setAddQaDialogOpen] = useState(false);
  const [addDocDialogOpen, setAddDocDialogOpen] = useState(false);
  const [editChunk, setEditChunk] = useState<KbDocChunkViewItem | null>(null);
  const [deleteChunk, setDeleteChunk] = useState<KbDocChunkViewItem | null>(null);
  const requestVersionRef = useRef(0);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const debouncedSearchQuery = useDebouncedValue(searchQuery.trim(), 300);

  const loadChunks = useCallback(async () => {
    if (!docId || !doc) {
      return;
    }

    const version = ++requestVersionRef.current;
    setLoadingChunks(true);

    try {
      const response = await listKbDocChunks(docId, {
        page: currentPage,
        pageSize: PAGE_SIZE,
        query: debouncedSearchQuery,
      });

      if (version !== requestVersionRef.current) {
        return;
      }

      setChunks(
        response.chunks.map((chunk) =>
          toKbDocChunkViewItem(chunk, doc.type, { docUrl: doc.docUrl }),
        ),
      );
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
  }, [currentPage, debouncedSearchQuery, doc, docId]);

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
  }, [debouncedSearchQuery, docId]);

  const { activePage, totalPages } = resolveTablePagination({
    page: currentPage,
    pageSize: PAGE_SIZE,
    total,
  });

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

    setCurrentPage(1);
    await loadChunks();

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

    setCurrentPage(1);
    await loadChunks();

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
      await loadChunks();

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
      <AiHostingLayout title={doc.name}>
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

  return (
    <AiHostingLayout title={doc?.name ?? "文档"}>
      <div className="space-y-6">
        <div aria-label="文档切片头部" className="space-y-3">
          <BackToKnowledgeListButton
            kbId={knowledgeBase?.id ?? kbId}
            label={knowledgeBase?.name}
          />
          <AiHostingPageHeader
            title={doc ? <KnowledgeDocTitle doc={doc} /> : "文档"}
            titleAriaLabel={doc?.name ?? "文档"}
          />
        </div>

        <section aria-label="切片列表区块" className="space-y-4">
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
                aria-label="搜索切片标题"
                className="h-10 rounded-[8px] pl-9"
                disabled={loadingPage || !doc || doc.status !== "completed"}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                }}
                placeholder="搜索切片标题"
                value={searchQuery}
              />
            </div>

            {doc && doc.status === "completed" ? (
              <AddChunkActions
                doc={doc}
                onAddDoc={() => setAddDocDialogOpen(true)}
                onAddQa={() => setAddQaDialogOpen(true)}
              />
            ) : null}
          </div>

          <div>
            <KnowledgeChunksTable
              chunks={chunks}
              docType={doc?.type ?? "document"}
              loading={loadingPage || loadingChunks}
              onDelete={setDeleteChunk}
              onEdit={setEditChunk}
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
      <span className="min-w-0 truncate">{doc.name}</span>
      <Badge className="rounded-[6px] px-2 py-0.5 text-xs" variant="secondary">
        {doc.typeLabel}
      </Badge>
    </span>
  );
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

function KnowledgeChunksTable({
  chunks,
  docType,
  loading,
  onDelete,
  onEdit,
}: {
  chunks: KbDocChunkViewItem[];
  docType: KbDocType;
  loading: boolean;
  onDelete: (chunk: KbDocChunkViewItem) => void;
  onEdit: (chunk: KbDocChunkViewItem) => void;
}) {
  const isQa = docType === "qa";

  return (
    <Table aria-label="切片列表" className="min-w-[960px] table-fixed">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {isQa ? (
            <>
              <TableHead className="h-11 w-[34%] px-4">问题</TableHead>
              <TableHead className="h-11 w-[46%] px-4">答案</TableHead>
            </>
          ) : (
            <>
              <TableHead className="h-11 w-[34%] px-4">切片标题</TableHead>
              <TableHead className="h-11 w-[46%] px-4">切片内容</TableHead>
            </>
          )}
          <TablePinnedHead className="h-11 w-[120px] whitespace-nowrap px-4 text-right">
            操作
          </TablePinnedHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <KbTableLoadingRow colSpan={3} />
        ) : chunks.length > 0 ? (
          chunks.map((chunk) => (
            <TableRow key={chunk.id}>
              {isQa ? (
                <>
                  <TableCell className="px-4 py-4" title={chunk.question}>
                    <TableCellContent className="font-medium text-foreground">
                      {chunk.question}
                    </TableCellContent>
                  </TableCell>
                  <TableCell className="px-4 py-4" title={chunk.answer}>
                    <TableCellContent className="text-muted-foreground">
                      {chunk.answer}
                    </TableCellContent>
                  </TableCell>
                </>
              ) : (
                <>
                  <TableCell className="px-4 py-4" title={chunk.title}>
                    <TableCellContent className="font-medium text-foreground">
                      {chunk.title}
                    </TableCellContent>
                  </TableCell>
                  <TableCell className="px-4 py-4" title={chunk.content}>
                    <ChunkContentCell content={chunk.content} imageUrls={chunk.imageUrls} />
                  </TableCell>
                </>
              )}
              <TablePinnedCell className="whitespace-nowrap px-4 py-4 text-right">
                <div className="flex items-center justify-end gap-3">
                  {chunk.source !== "system" ? (
                    <Button
                      className="h-auto p-0 text-primary"
                      onClick={() => onEdit(chunk)}
                      type="button"
                      variant="link"
                    >
                      编辑
                    </Button>
                  ) : null}
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
            <TableCell className="py-10 text-center text-sm text-muted-foreground" colSpan={3}>
              暂无切片数据
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

function ChunkContentCell({
  content,
  imageUrls,
}: {
  content?: string;
  imageUrls?: string[];
}) {
  if (imageUrls && imageUrls.length > 0) {
    return (
      <div className="flex items-start gap-3">
        <div className="flex shrink-0 items-start gap-2">
          {imageUrls.map((imageUrl, index) => (
            <ChunkImagePreview
              key={`${imageUrl}-${index}`}
              alt={content}
              imageUrl={imageUrl}
              size="sm"
            />
          ))}
        </div>
        <TableCellContent className="min-w-0 text-muted-foreground">
          {content}
        </TableCellContent>
      </div>
    );
  }

  return (
    <TableCellContent className="text-muted-foreground">{content}</TableCellContent>
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
