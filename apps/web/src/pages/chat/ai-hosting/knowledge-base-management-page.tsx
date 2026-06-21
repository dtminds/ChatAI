import { type ComponentProps, useMemo, useRef, useState } from "react";
import {
  Add01Icon,
  AlertCircleIcon,
  ArrowLeft01Icon,
  Cancel01Icon,
  ChatQuestion01Icon,
  CheckmarkCircle02Icon,
  Download01Icon,
  FileAttachmentIcon,
  FileImageIcon,
  PlusSignIcon,
  Search01Icon,
  Upload01Icon,
  Xls01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { FileExtensionBadge } from "@/pages/chat/components/message/file";
import { AiHostingLayout, AiHostingPageHeader } from "./ai-hosting-layout";
import {
  MOCK_KNOWLEDGE_BASES,
  MOCK_KNOWLEDGE_RECORDS,
  type KnowledgeRecord,
  type KnowledgeStatus,
} from "./knowledge-base-mock-data";

const PAGE_SIZE = 10;
const QA_IMPORT_MAX_SHEETS = 30;
const QA_IMPORT_MAX_ROWS = 30000;
const QA_IMPORT_ACCEPT =
  ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const IMAGE_KNOWLEDGE_MAX_FILE_SIZE = 5 * 1024 * 1024;
const IMAGE_KNOWLEDGE_MIN_EDGE = 10;
const IMAGE_KNOWLEDGE_MAX_EDGE = 6000;
const IMAGE_KNOWLEDGE_NAME_MAX_LENGTH = 16;
const IMAGE_KNOWLEDGE_ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

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
  const [qaImportDialogOpen, setQaImportDialogOpen] = useState(false);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);

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
                    onSelect={() => {
                      if (option.label === "添加问答") {
                        setQaImportDialogOpen(true);
                      }

                      if (option.label === "添加图片") {
                        setImageDialogOpen(true);
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
      <QaImportDialog
        onOpenChange={setQaImportDialogOpen}
        open={qaImportDialogOpen}
      />
      <ImageKnowledgeDialog
        onOpenChange={setImageDialogOpen}
        open={imageDialogOpen}
      />
    </AiHostingLayout>
  );
}

function KnowledgeRecordsTable({ records }: { records: KnowledgeRecord[] }) {
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

function ImageKnowledgeDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imageName, setImageName] = useState("");
  const [imageDescription, setImageDescription] = useState("");
  const [imageError, setImageError] = useState("");
  const [isCheckingImage, setIsCheckingImage] = useState(false);

  const reset = () => {
    setSelectedImage(null);
    setImageName("");
    setImageDescription("");
    setImageError("");
    setIsCheckingImage(false);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      reset();
    }

    onOpenChange(nextOpen);
  };

  const handleImageSelect = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    setSelectedImage(null);

    if (!isSupportedImageKnowledgeFile(file)) {
      setImageError("仅支持 jpg、jpeg、png、webp 格式的图片");
      return;
    }

    if (file.size > IMAGE_KNOWLEDGE_MAX_FILE_SIZE) {
      setImageError("图片大小不能超过 5MB");
      return;
    }

    setImageError("");
    setIsCheckingImage(true);

    try {
      const dimensions = await readImageDimensions(file);

      if (
        !isImageEdgeInRange(dimensions.width) ||
        !isImageEdgeInRange(dimensions.height)
      ) {
        setImageError("图片宽高必须在 10 到 6000 像素范围内");
        return;
      }

      setSelectedImage(file);

      if (!imageName.trim()) {
        setImageName(
          stripFileExtension(file.name).slice(0, IMAGE_KNOWLEDGE_NAME_MAX_LENGTH),
        );
      }
    } catch {
      setImageError("图片读取失败，请重新选择图片");
    } finally {
      setIsCheckingImage(false);
    }
  };

  const clearSelectedImage = () => {
    setSelectedImage(null);
    setImageError("");
    setIsCheckingImage(false);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };
  const canSubmit = Boolean(
    selectedImage &&
      imageName.trim() &&
      imageDescription.trim() &&
      !isCheckingImage,
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>添加图片知识</DialogTitle>
          <DialogDescription className="sr-only">
            上传图片并填写图片知识信息
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2.5">
            <RequiredLabel htmlFor="knowledge-image-upload">上传图片</RequiredLabel>
            <input
              ref={inputRef}
              accept={IMAGE_KNOWLEDGE_ACCEPT}
              aria-label="选择图片知识文件"
              className="sr-only"
              id="knowledge-image-upload"
              onChange={(event) =>
                void handleImageSelect(event.currentTarget.files?.[0])
              }
              type="file"
            />

            {selectedImage ? (
              <div
                aria-label="已选择图片"
                className="flex min-w-0 items-center gap-3 rounded-[8px] border bg-background px-3 py-2.5"
                role="region"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[8px] bg-primary/10 text-primary">
                  <HugeiconsIcon
                    color="currentColor"
                    icon={FileImageIcon}
                    size={19}
                    strokeWidth={1.8}
                  />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {selectedImage.name}（{formatFileSize(selectedImage.size)}）
                </span>
                <Button
                  aria-label="移除已选择图片"
                  className="size-8 shrink-0"
                  onClick={clearSelectedImage}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <HugeiconsIcon
                    color="currentColor"
                    icon={Cancel01Icon}
                    size={16}
                    strokeWidth={1.8}
                  />
                </Button>
              </div>
            ) : (
              <button
                className="flex size-28 flex-col items-center justify-center gap-2 rounded-[8px] border border-dashed border-border bg-muted/30 text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:bg-primary/[0.03] hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
                onClick={() => inputRef.current?.click()}
                type="button"
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={PlusSignIcon}
                  size={24}
                  strokeWidth={1.8}
                />
                上传图片
              </button>
            )}

            {isCheckingImage ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <HugeiconsIcon
                  color="currentColor"
                  icon={AlertCircleIcon}
                  size={16}
                  strokeWidth={1.8}
                />
                正在校验图片
              </div>
            ) : null}

            {imageError ? (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <HugeiconsIcon
                  color="currentColor"
                  icon={AlertCircleIcon}
                  size={16}
                  strokeWidth={1.8}
                />
                {imageError}
              </div>
            ) : null}
          </div>

          <div className="space-y-2.5">
            <RequiredLabel htmlFor="knowledge-image-name">知识名称</RequiredLabel>
            <div className="relative">
              <Input
                className="pr-14"
                id="knowledge-image-name"
                maxLength={IMAGE_KNOWLEDGE_NAME_MAX_LENGTH}
                onChange={(event) => setImageName(event.target.value)}
                placeholder="请输入知识名称"
                value={imageName}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                {imageName.length}/{IMAGE_KNOWLEDGE_NAME_MAX_LENGTH}
              </span>
            </div>
          </div>

          <div className="space-y-2.5">
            <RequiredLabel htmlFor="knowledge-image-description">图片描述</RequiredLabel>
            <Textarea
              id="knowledge-image-description"
              onChange={(event) => setImageDescription(event.target.value)}
              placeholder="描述会参与图片检索，可填写图片对应的商品说明、售卖亮点或价格等"
              value={imageDescription}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={() => handleOpenChange(false)}
            type="button"
            variant="outline"
          >
            取消
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() => handleOpenChange(false)}
            type="button"
          >
            确认提交
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QaImportDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<{
    file: File;
    rowCount: number;
    sheetCount: number;
  } | null>(null);
  const [fileError, setFileError] = useState("");
  const [isCheckingFile, setIsCheckingFile] = useState(false);

  const reset = () => {
    setSelectedFile(null);
    setFileError("");
    setIsCheckingFile(false);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      reset();
    }

    onOpenChange(nextOpen);
  };

  const handleFileSelect = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    setSelectedFile(null);

    if (!file.name.toLowerCase().endsWith(".faq.xlsx")) {
      setFileError("仅支持 .faq.xlsx 文件");
      return;
    }

    setFileError("");
    setIsCheckingFile(true);

    try {
      const { default: readXlsxFile } = await import("read-excel-file/browser");
      const sheets = await readXlsxFile(file);
      const sheetCount = sheets.length;
      const rowCount = sheets.reduce((sum, sheet) => sum + sheet.data.length, 0);

      if (sheetCount > QA_IMPORT_MAX_SHEETS) {
        setFileError(`最多支持 ${QA_IMPORT_MAX_SHEETS} 个 sheet`);
        return;
      }

      if (rowCount > QA_IMPORT_MAX_ROWS) {
        setFileError(`文件行数总和不能超过 ${QA_IMPORT_MAX_ROWS} 行`);
        return;
      }

      setSelectedFile({ file, rowCount, sheetCount });
    } catch {
      setFileError("文件解析失败，请确认文件为标准 .faq.xlsx");
    } finally {
      setIsCheckingFile(false);
    }
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setFileError("");
    setIsCheckingFile(false);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[760px]">
        <DialogHeader>
          <DialogTitle>批量导入问答</DialogTitle>
          <DialogDescription className="sr-only">
            上传 Excel 文件批量导入问答
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3 text-sm text-muted-foreground">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted/60 text-sm">
                1
              </span>
              <span>下载模板</span>
              <Button
                className="h-auto px-0 font-normal"
                type="button"
                variant="link"
              >
                查看导入说明
              </Button>
            </div>
            <Button type="button" variant="outline">
              <HugeiconsIcon
                color="currentColor"
                icon={Download01Icon}
                size={17}
                strokeWidth={1.8}
              />
              下载模板
            </Button>
          </div>

          <input
            ref={inputRef}
            accept={QA_IMPORT_ACCEPT}
            aria-label="选择问答导入文件"
            className="sr-only"
            onChange={(event) =>
              void handleFileSelect(event.currentTarget.files?.[0])
            }
            type="file"
          />

          <button
            aria-label="上传问答文件"
            className="flex min-h-40 w-full flex-col items-center justify-center rounded-[8px] border border-dashed border-border bg-muted/30 px-4 py-8 text-center transition-colors hover:border-primary/60 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              void handleFileSelect(event.dataTransfer.files[0]);
            }}
            type="button"
          >
            <HugeiconsIcon
              className="text-primary"
              color="currentColor"
              icon={Upload01Icon}
              size={34}
              strokeWidth={1.8}
            />
            <span className="mt-4 text-sm font-medium text-foreground">
              点击或拖拽上传文件
            </span>
            <span className="mt-2 text-sm text-muted-foreground">
              文档支持 .faq.xlsx，最多 30 个 sheet，文件行数总和不超过 30000 行
            </span>
          </button>

          {isCheckingFile ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <HugeiconsIcon
                color="currentColor"
                icon={AlertCircleIcon}
                size={16}
                strokeWidth={1.8}
              />
              正在校验文件
            </div>
          ) : null}

          {fileError ? (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <HugeiconsIcon
                color="currentColor"
                icon={AlertCircleIcon}
                size={16}
                strokeWidth={1.8}
              />
              {fileError}
            </div>
          ) : null}

          {selectedFile ? (
            <div
              aria-label="已选择文件"
              className="flex min-w-0 items-center gap-3 rounded-[8px] border bg-background px-3 py-2.5"
              role="region"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-[6px] bg-emerald-50 text-emerald-600 dark:bg-emerald-500/12 dark:text-emerald-400">
                <HugeiconsIcon
                  color="currentColor"
                  icon={Xls01Icon}
                  size={18}
                  strokeWidth={1.8}
                />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {selectedFile.file.name}（{formatFileSize(selectedFile.file.size)}，
                共 {selectedFile.sheetCount} 个 sheet，{selectedFile.rowCount} 行）
              </span>
              <Button
                aria-label="移除已选择文件"
                className="size-8 shrink-0"
                onClick={clearSelectedFile}
                size="icon"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={Cancel01Icon}
                  size={16}
                  strokeWidth={1.8}
                />
              </Button>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            disabled={!selectedFile || isCheckingFile}
            onClick={() => handleOpenChange(false)}
            type="button"
          >
            导入文档
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size}B`;
  }

  const kb = size / 1024;
  if (kb < 1024) {
    return `${formatFileSizeNumber(kb)}KB`;
  }

  return `${formatFileSizeNumber(kb / 1024)}MB`;
}

function formatFileSizeNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function RequiredLabel(props: ComponentProps<typeof Label>) {
  return (
    <Label {...props}>
      <span className="text-destructive" aria-hidden="true">
        *
      </span>
      {props.children}
    </Label>
  );
}

function isSupportedImageKnowledgeFile(file: File) {
  const normalizedName = file.name.toLowerCase();
  const supportedExtensions = [".jpg", ".jpeg", ".png", ".webp"];

  return (
    file.type.startsWith("image/") &&
    supportedExtensions.some((extension) => normalizedName.endsWith(extension))
  );
}

function isImageEdgeInRange(value: number) {
  return (
    value >= IMAGE_KNOWLEDGE_MIN_EDGE && value <= IMAGE_KNOWLEDGE_MAX_EDGE
  );
}

function readImageDimensions(file: File) {
  return new Promise<{ height: number; width: number }>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ height: image.naturalHeight, width: image.naturalWidth });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("image load failed"));
    };
    image.src = objectUrl;
  });
}

function stripFileExtension(fileName: string) {
  const lastDotIndex = fileName.lastIndexOf(".");

  if (lastDotIndex <= 0) {
    return fileName;
  }

  return fileName.slice(0, lastDotIndex);
}
