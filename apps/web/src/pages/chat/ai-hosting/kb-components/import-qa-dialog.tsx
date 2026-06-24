import type { Sheet } from "read-excel-file/browser";
import { useEffect, useRef, useState } from "react";
import { AlertCircleIcon, Download01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
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
  FileUploadDropzone,
  FileUploadSelectedFile,
} from "@/components/ui/file-upload";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { isRequestError } from "@/lib/request";
import { uploadKbQaFile } from "@/pages/chat/ai-hosting/api/kb-doc-service";
import { FileExtensionBadge } from "@/pages/chat/components/message/file";
import { createLocalDocId, getFileExtension, stripFileExtension, useAsyncValidation } from "./shared";

const QA_IMPORT_MAX_SHEETS = 30;
const QA_IMPORT_MAX_ROWS = 30000;
const QA_IMPORT_ACCEPT = {
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".faq.xlsx",
  ],
};
const QA_IMPORT_TEMPLATE_URL =
  "https://b5.bokr.com.cn/dist/Q&A问答对示例.faq.xlsx";

async function readAllQaImportSheets(file: File): Promise<Sheet[]> {
  const { default: readAllSheetsFromWorkbook } = await import(
    "read-excel-file/browser"
  );
  return readAllSheetsFromWorkbook(file);
}

export function ImportQaDialog({
  onImportComplete,
  onOpenChange,
  open,
}: {
  onImportComplete?: (result: {
    docId: string;
    docSuffix: string;
    docUrl: string;
    entries: Array<{ answer: string; question: string }>;
    name: string;
    url: string;
  }) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { beginValidation, invalidateValidation, isCurrentValidation } =
    useAsyncValidation();
  const isMountedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [selectedFile, setSelectedFile] = useState<{
    file: File;
    rowCount: number;
    sheetCount: number;
  } | null>(null);
  const [fileError, setFileError] = useState("");
  const [isCheckingFile, setIsCheckingFile] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  function reset() {
    abortControllerRef.current?.abort();
    invalidateValidation();
    setSelectedFile(null);
    setFileError("");
    setIsCheckingFile(false);
    setIsImporting(false);
  }

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open]);

  async function handleImport() {
    if (!selectedFile || isImporting) {
      return;
    }

    setIsImporting(true);
    let importSuccessful = false;

    try {
      const sheets = await readAllQaImportSheets(selectedFile.file);
      if (!isMountedRef.current) {
        return;
      }

      const entries = sheets.flatMap((sheet) =>
        sheet.data
          .slice(1)
          .map((row) => ({
            question: String(row[0] ?? "").trim(),
            answer: String(row[1] ?? "").trim(),
          }))
          .filter((entry) => entry.question && entry.answer),
      );

      if (entries.length === 0) {
        setFileError("未解析到有效问答，请检查文件内容");
        return;
      }

      try {
        abortControllerRef.current?.abort();
        abortControllerRef.current = new AbortController();

        const uploadResult = await uploadKbQaFile(selectedFile.file, {
          signal: abortControllerRef.current.signal,
        });

        if (!isMountedRef.current) {
          return;
        }

        const docId = createLocalDocId();
        const name =
          stripFileExtension(selectedFile.file.name) || selectedFile.file.name;

        toast.success("问答已提交");
        onImportComplete?.({
          docId,
          docSuffix: getKbQaDocSuffix(selectedFile.file.name),
          docUrl: uploadResult.docUrl,
          entries,
          name,
          url: uploadResult.url,
        });
        importSuccessful = true;
      } catch (uploadError) {
        if (!isMountedRef.current) {
          return;
        }

        if (uploadError instanceof DOMException && uploadError.name === "AbortError") {
          return;
        }

        toast.error(
          isRequestError(uploadError) ? uploadError.message : "问答上传失败",
        );
      }
    } catch {
      if (isMountedRef.current) {
        setFileError("文件解析失败，请确认文件为标准 .faq.xlsx");
      }
    } finally {
      if (isMountedRef.current) {
        setIsImporting(false);
      }
    }

    if (importSuccessful && isMountedRef.current) {
      onOpenChange(false);
    }
  }

  const handleFileSelect = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    const validationId = beginValidation();
    setSelectedFile(null);

    if (!file.name.toLowerCase().endsWith(".faq.xlsx")) {
      if (!isCurrentValidation(validationId)) {
        return;
      }

      setFileError("仅支持 .faq.xlsx 文件");
      setIsCheckingFile(false);
      return;
    }

    if (!isCurrentValidation(validationId)) {
      return;
    }

    setFileError("");
    setIsCheckingFile(true);

    try {
      const sheets = await readAllQaImportSheets(file);
      if (!isMountedRef.current || !isCurrentValidation(validationId)) {
        return;
      }

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
      if (!isMountedRef.current || !isCurrentValidation(validationId)) {
        return;
      }

      setFileError("文件解析失败，请确认文件为标准 .faq.xlsx");
    } finally {
      if (isMountedRef.current && isCurrentValidation(validationId)) {
        setIsCheckingFile(false);
      }
    }
  };

  const handleFileReject = () => {
    invalidateValidation();
    setSelectedFile(null);
    setFileError("仅支持 .faq.xlsx 文件");
    setIsCheckingFile(false);
  };

  const clearSelectedFile = () => {
    invalidateValidation();
    setSelectedFile(null);
    setFileError("");
    setIsCheckingFile(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[760px]"
        closeButtonVisible={false}
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
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
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      className="h-auto px-0 font-normal"
                      type="button"
                      variant="link"
                    >
                      查看导入说明
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent
                    align="start"
                    className="max-w-[360px] space-y-2 text-left leading-5 text-background"
                    side="bottom"
                  >
                    <p>
                      对于 faq 特殊格式的说明：上传文档时，需要通过特殊的后缀
                      .faq
                      进行标识，格式为「文档名.faq.xlsx」；文档固定格式为一列问题、一列答案。
                    </p>
                    <p>
                      解析限制说明：对于问题或答案为空的行会跳过不做处理。
                    </p>
                    <p>
                      结构化文档限制：每个可解析的切片（即原文档中单行或单列）字符长度最多为
                      65535。
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Button asChild variant="outline">
              <a
                download
                href={QA_IMPORT_TEMPLATE_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={Download01Icon}
                  size={17}
                  strokeWidth={1.8}
                />
                Q&A问答对示例.faq.xlsx
              </a>
            </Button>
          </div>

          <FileUploadDropzone
            accept={QA_IMPORT_ACCEPT}
            ariaLabel="上传问答文件"
            description="文档支持 .faq.xlsx，最多 30 个 sheet，文件行数总和不超过 30000 行"
            inputAriaLabel="选择问答导入文件"
            maxFiles={1}
            onFilesAccepted={(files) => void handleFileSelect(files[0])}
            onFilesRejected={handleFileReject}
            title="点击或拖拽上传文件"
          />

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
            <FileUploadSelectedFile
              clearDisabled={isImporting}
              file={selectedFile.file}
              icon={
                <FileExtensionBadge
                  className="size-8"
                  extension={getFileExtension(selectedFile.file.name)}
                />
              }
              label="已选择文件"
              meta={`共 ${selectedFile.sheetCount} 个 sheet，${selectedFile.rowCount} 行`}
              onClear={clearSelectedFile}
            />
          ) : null}
        </div>

        <DialogFooter>
          <Button
            disabled={isImporting}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            取消
          </Button>
          <Button
            disabled={!selectedFile || isCheckingFile || isImporting}
            onClick={() => void handleImport()}
            type="button"
          >
            {isImporting ? "提交中" : "导入文档"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getKbQaDocSuffix(fileName: string) {
  return fileName.toLowerCase().endsWith(".faq.xlsx")
    ? "faq"
    : getFileExtension(fileName).toLowerCase();
}
