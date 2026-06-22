import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  Add01Icon,
  ArrowLeft01Icon,
  ArrowDown01Icon,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { AiHostingLayout, AiHostingPageHeader } from "./ai-hosting-layout";
import { AddDocChunkDialog } from "./kb-components/add-doc-chunk-dialog";
import { AddQaChunkDialog } from "./kb-components/add-qa-chunk-dialog";
import { EditChunkDialog } from "./kb-components/edit-chunk-dialog";
import { ImportQaDialog } from "./kb-components/import-qa-dialog";
import {
  addMockKnowledgeChunk,
  addMockKnowledgeChunks,
  deleteMockKnowledgeChunk,
  getKnowledgeRecordById,
  getLocalTimeString,
  getMockKnowledgeBasesSnapshot,
  getMockKnowledgeChunksSnapshot,
  subscribeMockKnowledgeBases,
  subscribeMockKnowledgeChunks,
  updateMockKnowledgeChunk,
  type KnowledgeChunk,
  type KnowledgeDocType,
  type KnowledgeRecord,
} from "./kb-mock-data";

const PAGE_SIZE = 10;

const docTypeLabels: Record<KnowledgeDocType, string> = {
  qa: "FAQ",
  document: "文档",
  image: "图片",
};

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

function getChunkSearchTitle(chunk: KnowledgeChunk) {
  if (chunk.type === "qa") {
    return chunk.question ?? "";
  }

  return chunk.title ?? "";
}

function createChunkId() {
  return `chunk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function KbDocDetailPage() {
  const { docId = "", knowledgeBaseId = "" } = useParams();
  const knowledgeBases = useSyncExternalStore(
    subscribeMockKnowledgeBases,
    getMockKnowledgeBasesSnapshot,
    getMockKnowledgeBasesSnapshot,
  );
  const chunks = useSyncExternalStore(
    subscribeMockKnowledgeChunks,
    getMockKnowledgeChunksSnapshot,
    getMockKnowledgeChunksSnapshot,
  );

  const knowledgeBase = knowledgeBases.find((item) => item.id === knowledgeBaseId);
  const doc = getKnowledgeRecordById(docId);

  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [importQaDialogOpen, setImportQaDialogOpen] = useState(false);
  const [addQaDialogOpen, setAddQaDialogOpen] = useState(false);
  const [addDocDialogOpen, setAddDocDialogOpen] = useState(false);
  const [editChunk, setEditChunk] = useState<KnowledgeChunk | null>(null);
  const [deleteChunk, setDeleteChunk] = useState<KnowledgeChunk | null>(null);

  const debouncedSearchQuery = useDebouncedValue(searchQuery.trim().toLowerCase(), 300);

  const docChunks = useMemo(() => {
    if (!doc) {
      return [];
    }

    return chunks.filter((chunk) => chunk.docId === doc.id);
  }, [chunks, doc]);

  const filteredChunks = useMemo(() => {
    if (!debouncedSearchQuery) {
      return docChunks;
    }

    return docChunks.filter((chunk) =>
      getChunkSearchTitle(chunk).toLowerCase().includes(debouncedSearchQuery),
    );
  }, [debouncedSearchQuery, docChunks]);

  const { activePage, totalPages } = resolveTablePagination({
    page: currentPage,
    pageSize: PAGE_SIZE,
    total: filteredChunks.length,
  });

  const pagedChunks = useMemo(() => {
    const start = (activePage - 1) * PAGE_SIZE;
    return filteredChunks.slice(start, start + PAGE_SIZE);
  }, [activePage, filteredChunks]);

  function handleCreateQaChunk(values: { answer: string; question: string }) {
    if (!doc || !knowledgeBase) {
      return;
    }

    const now = getLocalTimeString();
    addMockKnowledgeChunk({
      id: createChunkId(),
      knowledgeBaseId: knowledgeBase.id,
      docId: doc.id,
      type: "qa",
      question: values.question,
      answer: values.answer,
      createdAt: now,
      updatedAt: now,
    });
    setCurrentPage(1);
    toast.success("已添加问答切片");
  }

  function handleImportQaChunks(entries: Array<{ answer: string; question: string }>) {
    if (!doc || !knowledgeBase || entries.length === 0) {
      return;
    }

    const now = getLocalTimeString();
    addMockKnowledgeChunks(
      entries.map((entry) => ({
        id: createChunkId(),
        knowledgeBaseId: knowledgeBase.id,
        docId: doc.id,
        type: "qa",
        question: entry.question,
        answer: entry.answer,
        createdAt: now,
        updatedAt: now,
      })),
    );
    setCurrentPage(1);
    toast.success(`已导入 ${entries.length} 条问答切片`);
  }

  function handleCreateDocChunk(values: { content: string; title: string }) {
    if (!doc || !knowledgeBase) {
      return;
    }

    const now = getLocalTimeString();
    addMockKnowledgeChunk({
      id: createChunkId(),
      knowledgeBaseId: knowledgeBase.id,
      docId: doc.id,
      type: "document",
      title: values.title,
      content: values.content,
      createdAt: now,
      updatedAt: now,
    });
    setCurrentPage(1);
    toast.success("已添加切片");
  }

  function handleEditChunk(
    chunkId: string,
    values: Partial<Pick<KnowledgeChunk, "question" | "answer" | "title" | "content">>,
  ) {
    updateMockKnowledgeChunk(chunkId, values);
    toast.success("已保存");
  }

  function handleConfirmDelete() {
    if (!deleteChunk) {
      return;
    }

    deleteMockKnowledgeChunk(deleteChunk.id);
    setDeleteChunk(null);
    toast.success("已删除切片");
  }

  if (!knowledgeBase || !doc || doc.knowledgeBaseId !== knowledgeBase.id) {
    return (
      <AiHostingLayout title="文档不存在">
        <div className="space-y-6">
          <BackToKnowledgeListButton knowledgeBaseId={knowledgeBaseId} />
          <div className="py-16 text-center">
            <h1 className="text-lg font-semibold text-foreground">未找到文档</h1>
            <p className="mt-2 text-sm text-muted-foreground">当前文档不存在或已被删除</p>
          </div>
        </div>
      </AiHostingLayout>
    );
  }

  if (doc.status !== "completed") {
    return (
      <AiHostingLayout title={doc.name}>
        <div className="space-y-6">
          <BackToKnowledgeListButton knowledgeBaseId={knowledgeBase.id} />
          <div className="py-16 text-center">
            <h1 className="text-lg font-semibold text-foreground">文档尚未解析完成</h1>
            <p className="mt-2 text-sm text-muted-foreground">请等待解析完成后再查看切片</p>
          </div>
        </div>
      </AiHostingLayout>
    );
  }

  return (
    <AiHostingLayout title={doc.name}>
      <div className="space-y-6">
        <div aria-label="文档切片头部" className="space-y-3">
          <BackToKnowledgeListButton knowledgeBaseId={knowledgeBase.id} />
          <AiHostingPageHeader
            description={`${docTypeLabels[doc.type]} · ${knowledgeBase.name}`}
            title={doc.name}
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
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="搜索切片标题"
                value={searchQuery}
              />
            </div>

            <AddChunkActions doc={doc} onAddDoc={() => setAddDocDialogOpen(true)} onAddQa={() => setAddQaDialogOpen(true)} onImportQa={() => setImportQaDialogOpen(true)} />
          </div>

          <div>
            <KnowledgeChunksTable
              chunks={pagedChunks}
              docType={doc.type}
              onDelete={setDeleteChunk}
              onEdit={setEditChunk}
            />
            <TablePagination
              onPageChange={setCurrentPage}
              page={activePage}
              total={filteredChunks.length}
              totalPages={totalPages}
            />
          </div>
        </section>
      </div>

      <ImportQaDialog
        onImportComplete={handleImportQaChunks}
        onOpenChange={setImportQaDialogOpen}
        open={importQaDialogOpen}
      />
      <AddQaChunkDialog
        onOpenChange={setAddQaDialogOpen}
        onSubmit={handleCreateQaChunk}
        open={addQaDialogOpen}
      />
      <AddDocChunkDialog
        onOpenChange={setAddDocDialogOpen}
        onSubmit={handleCreateDocChunk}
        open={addDocDialogOpen}
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
            <AlertDialogAction onClick={handleConfirmDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AiHostingLayout>
  );
}

function AddChunkActions({
  doc,
  onAddDoc,
  onAddQa,
  onImportQa,
}: {
  doc: KnowledgeRecord;
  onAddDoc: () => void;
  onAddQa: () => void;
  onImportQa: () => void;
}) {
  if (doc.type === "image") {
    return null;
  }

  if (doc.type === "qa") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-10 px-4" type="button">
            <HugeiconsIcon color="currentColor" icon={Add01Icon} size={17} strokeWidth={1.8} />
            <span>添加切片</span>
            <HugeiconsIcon color="currentColor" icon={ArrowDown01Icon} size={16} strokeWidth={1.8} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[180px]">
          <DropdownMenuItem onSelect={onImportQa}>批量导入问答</DropdownMenuItem>
          <DropdownMenuItem onSelect={onAddQa}>手动添加</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
  onDelete,
  onEdit,
}: {
  chunks: KnowledgeChunk[];
  docType: KnowledgeDocType;
  onDelete: (chunk: KnowledgeChunk) => void;
  onEdit: (chunk: KnowledgeChunk) => void;
}) {
  const isQa = docType === "qa";
  const allowDelete = docType !== "image";

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
        {chunks.length > 0 ? (
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
                    <TableCellContent className="text-muted-foreground">
                      {chunk.content}
                    </TableCellContent>
                  </TableCell>
                </>
              )}
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
                  {allowDelete ? (
                    <Button
                      className="h-auto p-0 text-primary"
                      onClick={() => onDelete(chunk)}
                      type="button"
                      variant="link"
                    >
                      删除
                    </Button>
                  ) : null}
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

function BackToKnowledgeListButton({ knowledgeBaseId }: { knowledgeBaseId: string }) {
  return (
    <Button
      asChild
      className="-ml-2 h-8 w-fit justify-start rounded-[8px] px-2 text-muted-foreground hover:text-foreground"
      type="button"
      variant="ghost"
    >
      <Link to={`/chat/ai-hosting/kb/${knowledgeBaseId}`}>
        <HugeiconsIcon color="currentColor" icon={ArrowLeft01Icon} size={17} strokeWidth={1.8} />
        <span>返回知识列表</span>
      </Link>
    </Button>
  );
}
