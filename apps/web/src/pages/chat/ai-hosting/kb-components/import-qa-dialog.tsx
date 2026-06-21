import { useState } from "react";
import { AlertCircleIcon, Download01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
import { FileExtensionBadge } from "@/pages/chat/components/message/file";

const QA_IMPORT_MAX_SHEETS = 30;
const QA_IMPORT_MAX_ROWS = 30000;
const QA_IMPORT_ACCEPT = {
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".faq.xlsx",
  ],
};
const QA_IMPORT_TEMPLATE_URL =
  "https://b5.bokr.com.cn/dist/Q&A问答对示例.faq.xlsx";

export function ImportQaDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
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
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-[760px]"
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
              <a download href={QA_IMPORT_TEMPLATE_URL}>
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

function getFileExtension(fileName: string) {
  const lastDotIndex = fileName.lastIndexOf(".");

  if (lastDotIndex < 0 || lastDotIndex === fileName.length - 1) {
    return "";
  }

  return fileName.slice(lastDotIndex + 1);
}
