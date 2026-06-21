import { useMemo, useState } from "react";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  resolveTablePagination,
  TablePagination,
} from "@/components/ui/table-pagination";
import { FileExtensionBadge } from "@/pages/chat/components/message/file";
import { AiHostingLayout, AiHostingPageHeader } from "./ai-hosting-layout";
import {
  MOCK_KNOWLEDGE_BASES,
  MOCK_KNOWLEDGE_RECORDS,
  type KnowledgeRecord,
  type KnowledgeStatus,
} from "./knowledge-base-mock-data";

const PAGE_SIZE = 10;

const addKnowledgeOptions = [
  {
    description: "适合沉淀常见问题和标准答案",
    icon: ChatQuestion01Icon,
    label: "添加问答",
  },
  {
    description: "上传图片后解析为可检索内容",
    icon: FileImageIcon,
    label: "添加图片",
  },
  {
    description: "支持 Word、PDF、TXT、Markdown 等内容",
    icon: FileAttachmentIcon,
    label: "添加文档",
  },
] as const;

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

export function KnowledgeBaseManagementPage() {
  const { knowledgeBaseId = MOCK_KNOWLEDGE_BASES[0]?.id } = useParams();
  const knowledgeBase =
    MOCK_KNOWLEDGE_BASES.find((item) => item.id === knowledgeBaseId) ??
    MOCK_KNOWLEDGE_BASES[0];
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredRecords = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const records = MOCK_KNOWLEDGE_RECORDS.filter(
      (record) => record.knowledgeBaseId === knowledgeBase?.id,
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

  return (
    <AiHostingLayout title={knowledgeBase?.name ?? "知识库管理"}>
      <div className="space-y-6">
        <div aria-label="知识库管理头部" className="space-y-3">
          <Button
            asChild
            className="-ml-2 h-8 w-fit justify-start rounded-[8px] px-2 text-muted-foreground hover:text-foreground"
            type="button"
            variant="ghost"
          >
            <Link to="/chat/ai-hosting/knowledge">
              <HugeiconsIcon color="currentColor" icon={ArrowLeft01Icon} size={17} strokeWidth={1.8} />
              <span>返回知识库</span>
            </Link>
          </Button>
          <AiHostingPageHeader
            description={knowledgeBase?.description ?? "管理知识库中的知识内容和解析状态"}
            title={knowledgeBase?.name ?? "知识库管理"}
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

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-10 px-4" type="button">
                  <HugeiconsIcon color="currentColor" icon={Add01Icon} size={17} strokeWidth={1.8} />
                  <span>添加知识</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[260px] p-1.5">
                {addKnowledgeOptions.map((option) => (
                  <DropdownMenuItem
                    className="h-auto items-start gap-3 px-2.5 py-2.5"
                    key={option.label}
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
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div>
            <KnowledgeRecordsTable records={pagedRecords} />
            <TablePagination
              onPageChange={setCurrentPage}
              page={activePage}
              total={filteredRecords.length}
              totalPages={totalPages}
            />
          </div>
        </section>
      </div>
    </AiHostingLayout>
  );
}

function KnowledgeRecordsTable({ records }: { records: KnowledgeRecord[] }) {
  return (
    <Table aria-label="知识列表" className="min-w-[1120px] table-fixed">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-11 w-[24%]">知识名称</TableHead>
          <TableHead className="h-11 w-[14%]">类型</TableHead>
          <TableHead className="h-11 w-[12%]">切片数量</TableHead>
          <TableHead className="h-11 w-[14%]">状态</TableHead>
          <TableHead className="h-11 w-[17%] whitespace-nowrap">创建时间</TableHead>
          <TableHead className="h-11 w-[17%] whitespace-nowrap">更新时间</TableHead>
          <TableHead className="h-11 w-[100px] whitespace-nowrap text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {records.length > 0 ? (
          records.map((record) => (
            <TableRow key={record.id}>
              <TableCell className="py-4" title={record.name}>
                <div className="flex min-w-0 items-center gap-2.5">
                  <FileExtensionBadge
                    className="size-8"
                    extension={record.fileExtension}
                  />
                  <span className="min-w-0 truncate font-medium text-foreground">
                    {record.name}
                  </span>
                </div>
              </TableCell>
              <TableCell className="py-4">
                <Badge className="rounded-[6px] px-2 py-0.5" variant="secondary">
                  {record.typeLabel}
                </Badge>
              </TableCell>
              <TableCell className="py-4 text-muted-foreground">
                {record.sliceCount ?? "-"}
              </TableCell>
              <TableCell className="py-4">
                <KnowledgeStatusBadge status={record.status} />
              </TableCell>
              <TableCell className="whitespace-nowrap py-4 text-muted-foreground">{record.createdAt}</TableCell>
              <TableCell className="whitespace-nowrap py-4 text-muted-foreground">{record.updatedAt}</TableCell>
              <TableCell className="whitespace-nowrap py-4 text-right">
                <div className="flex items-center justify-end gap-3">
                  <Button
                    className="h-auto p-0 text-primary"
                    disabled={record.status !== "completed"}
                    type="button"
                    variant="link"
                  >
                    查看
                  </Button>
                  <Button className="h-auto p-0 text-primary" type="button" variant="link">
                    删除
                  </Button>
                </div>
              </TableCell>
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
