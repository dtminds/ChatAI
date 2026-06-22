import { useMemo, useState, useSyncExternalStore } from "react";
import {
  Add01Icon,
  AlertCircleIcon,
  ArrowLeft01Icon,
  ChatQuestion01Icon,
  CheckmarkCircle02Icon,
  FileAttachmentIcon,
  FileImageIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useParams } from "react-router-dom";
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
import { FileExtensionBadge } from "@/pages/chat/components/message/file";
import { AiHostingLayout, AiHostingPageHeader } from "./ai-hosting-layout";
import { ImportDocumentDialog } from "./kb-components/import-document-dialog";
import { ImportImageDialog } from "./kb-components/import-image-dialog";
import { ImportQaDialog } from "./kb-components/import-qa-dialog";
import {
  getMockKnowledgeBasesSnapshot,
  MOCK_KNOWLEDGE_BASES,
  MOCK_KNOWLEDGE_RECORDS,
  subscribeMockKnowledgeBases,
  type KnowledgeRecord,
  type KnowledgeStatus,
} from "./kb-mock-data";

const PAGE_SIZE = 10;
const addKnowledgeOptions = [
  {
    description: "上传问答表格，批量导入精准知识",
    icon: ChatQuestion01Icon,
    label: "问答",
    type: "qa",
  },
  {
    description: "上传图片并添加描述，按描述精准召回",
    icon: FileImageIcon,
    label: "图片",
    type: "image",
  },
  {
    description: "自动解析文档内容，效果取决于文档质量",
    icon: FileAttachmentIcon,
    label: "文档",
    type: "document",
  },
] as const;
type AddKnowledgeOption = (typeof addKnowledgeOptions)[number];

const statusMeta: Record<
  KnowledgeStatus,
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
    icon: AlertCircleIcon,
  },
  failed: {
    label: "失败",
    className: "text-destructive",
    icon: AlertCircleIcon,
  },
  queued: {
    label: "排队中",
    className: "text-muted-foreground",
    icon: AlertCircleIcon,
  },
};

export function KbDetailPage() {
  const knowledgeBases = useSyncExternalStore(
    subscribeMockKnowledgeBases,
    getMockKnowledgeBasesSnapshot,
    getMockKnowledgeBasesSnapshot,
  );
  const { knowledgeBaseId = MOCK_KNOWLEDGE_BASES[0]?.id } = useParams();
  const knowledgeBase = knowledgeBases.find((item) => item.id === knowledgeBaseId);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [importQaDialogOpen, setImportQaDialogOpen] = useState(false);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);

  const filteredRecords = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!knowledgeBase) {
      return [];
    }

    const records = MOCK_KNOWLEDGE_RECORDS.filter(
      (record) => record.knowledgeBaseId === knowledgeBase.id,
    );

    if (!normalizedQuery) {
      return records;
    }

    return records.filter(
      (record) =>
        record.name.toLowerCase().includes(normalizedQuery) ||
        record.typeLabel.toLowerCase().includes(normalizedQuery),
    );
  }, [knowledgeBase?.id, searchQuery]);
  const { activePage, totalPages } = resolveTablePagination({
    page: currentPage,
    pageSize: PAGE_SIZE,
    total: filteredRecords.length,
  });
  const pagedRecords = useMemo(() => {
    const start = (activePage - 1) * PAGE_SIZE;
    return filteredRecords.slice(start, start + PAGE_SIZE);
  }, [activePage, filteredRecords]);

  if (!knowledgeBase) {
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
    <AiHostingLayout title={knowledgeBase.name}>
      <div className="space-y-6">
        <div aria-label="知识库管理头部" className="space-y-3">
          <BackToKbListButton />
          <AiHostingPageHeader
            description={knowledgeBase.description}
            title={knowledgeBase.name}
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
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="搜索知识"
                value={searchQuery}
              />
            </div>

            <AddKnowledgeMenu
              onDocumentDialogOpen={() => setDocumentDialogOpen(true)}
              onImageDialogOpen={() => setImageDialogOpen(true)}
              onImportQaDialogOpen={() => setImportQaDialogOpen(true)}
            />
          </div>

          <div>
            <KnowledgeRecordsTable
              knowledgeBaseId={knowledgeBase.id}
              records={pagedRecords}
            />
            <TablePagination
              onPageChange={setCurrentPage}
              page={activePage}
              total={filteredRecords.length}
              totalPages={totalPages}
            />
          </div>
        </section>
      </div>
      <ImportQaDialog
        onOpenChange={setImportQaDialogOpen}
        open={importQaDialogOpen}
      />
      <ImportImageDialog
        onOpenChange={setImageDialogOpen}
        open={imageDialogOpen}
      />
      <ImportDocumentDialog
        onOpenChange={setDocumentDialogOpen}
        open={documentDialogOpen}
      />
    </AiHostingLayout>
  );
}

function AddKnowledgeMenu({
  onDocumentDialogOpen,
  onImageDialogOpen,
  onImportQaDialogOpen,
}: {
  onDocumentDialogOpen: () => void;
  onImageDialogOpen: () => void;
  onImportQaDialogOpen: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="h-10 px-4" type="button">
          <HugeiconsIcon color="currentColor" icon={Add01Icon} size={17} strokeWidth={1.8} />
          <span>添加知识</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[320px] p-1.5">
        <DropdownMenuLabel className="px-2.5 py-1 text-xs font-medium text-muted-foreground">
          高质量人工知识
        </DropdownMenuLabel>
        {addKnowledgeOptions.slice(0, 2).map((option) =>
          renderAddKnowledgeOption(option, {
            onImageDialogOpen,
            onImportQaDialogOpen,
            onDocumentDialogOpen,
          }),
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="px-2.5 py-1 text-xs font-medium text-muted-foreground">
          原始文档
        </DropdownMenuLabel>
        {addKnowledgeOptions.slice(2).map((option) =>
          renderAddKnowledgeOption(option, {
            onImageDialogOpen,
            onImportQaDialogOpen,
            onDocumentDialogOpen,
          }),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function renderAddKnowledgeOption(
  option: AddKnowledgeOption,
  {
    onDocumentDialogOpen,
    onImageDialogOpen,
    onImportQaDialogOpen,
  }: {
    onDocumentDialogOpen: () => void;
    onImageDialogOpen: () => void;
    onImportQaDialogOpen: () => void;
  },
) {
  return (
    <DropdownMenuItem
      className="h-auto items-start gap-3 px-2.5 py-2.5"
      key={option.label}
      onSelect={() => {
        if (option.type === "qa") {
          onImportQaDialogOpen();
        }

        if (option.type === "image") {
          onImageDialogOpen();
        }

        if (option.type === "document") {
          onDocumentDialogOpen();
        }
      }}
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-muted text-muted-foreground">
        <HugeiconsIcon
          color="currentColor"
          data-testid="knowledge-add-option-icon"
          icon={option.icon}
          size={17}
          strokeWidth={1.8}
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
  knowledgeBaseId,
  records,
}: {
  knowledgeBaseId: string;
  records: KnowledgeRecord[];
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
        {records.length > 0 ? (
          records.map((record) => (
            <TableRow key={record.id}>
              <TableCell className="px-4 py-4" title={record.name}>
                <div className="flex min-w-0 items-center gap-2.5">
                  <FileExtensionBadge
                    className="size-8"
                    extension={record.fileExtension}
                  />
                  <TableCellContent className="font-medium text-foreground">
                    {record.name}
                  </TableCellContent>
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
                <KnowledgeStatusBadge status={record.status} />
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
                      <Link to={`/chat/ai-hosting/kb/${knowledgeBaseId}/docs/${record.id}`}>
                        查看
                      </Link>
                    ) : (
                      <span>查看</span>
                    )}
                  </Button>
                  <Button className="h-auto p-0 text-primary" type="button" variant="link">
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

function KnowledgeStatusBadge({ status }: { status: KnowledgeStatus }) {
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
