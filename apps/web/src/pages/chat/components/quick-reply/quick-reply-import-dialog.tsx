import { useRef, useState } from "react";
import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  Upload01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { QuickReplyScopeType } from "@chatai/contracts";
import { QUICK_REPLY_IMPORT_MAX_ROWS } from "@chatai/contracts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  buildQuickReplyImportFailureDisplay,
  downloadQuickReplyImportTemplate,
  parseQuickReplyImportFile,
  type QuickReplyImportFailureDisplay,
  type QuickReplyImportFailureResult,
  type QuickReplyImportParsedRow,
  type QuickReplyImportPrecheck,
} from "@/pages/chat/components/quick-reply/quick-reply-import";

type QuickReplyImportResult =
  | { importedCount: number; ok: true }
  | QuickReplyImportFailureResult;

export type QuickReplyImportDialogProps = {
  onImport: (
    rows: QuickReplyImportParsedRow[],
    onProgress: (input: {
      importedCount: number;
      progress: number;
      totalCount: number;
    }) => void,
  ) => Promise<QuickReplyImportResult>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  scopeType: QuickReplyScopeType;
};

export function QuickReplyImportDialog({
  onImport,
  onOpenChange,
  open,
}: QuickReplyImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [precheck, setPrecheck] = useState<QuickReplyImportPrecheck | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [isImportTerminal, setIsImportTerminal] = useState(false);
  const [importFailure, setImportFailure] =
    useState<QuickReplyImportFailureDisplay | null>(null);
  const [selectedFileName, setSelectedFileName] = useState("");

  const resetImportState = () => {
    setPrecheck(null);
    setIsParsing(false);
    setIsImporting(false);
    setProgress(0);
    setImportedCount(null);
    setIsImportTerminal(false);
    setImportFailure(null);
    setSelectedFileName("");

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetImportState();
    }

    onOpenChange(nextOpen);
  };

  const handleFileChange = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    setIsParsing(true);
    setProgress(0);
    setImportedCount(null);
    setIsImportTerminal(false);
    setImportFailure(null);
    setSelectedFileName(file.name);

    try {
      if (!file.name.toLowerCase().endsWith(".xlsx")) {
        setPrecheck({
          errors: [{ message: "仅支持 .xlsx 文件", rowNumber: 0 }],
          ok: false,
          rows: [],
          summary: {
            creatableQuickReplyCount: 0,
            distinctPrimaryCategoryCount: 0,
            distinctSecondaryCategoryCount: 0,
            errorCount: 1,
            totalRowCount: 0,
          },
        });
        return;
      }

      try {
        setPrecheck(await parseQuickReplyImportFile(file));
      } catch {
        setPrecheck({
          errors: [
            {
              message: "文件解析失败，请确认文件为标准 .xlsx",
              rowNumber: 0,
            },
          ],
          ok: false,
          rows: [],
          summary: {
            creatableQuickReplyCount: 0,
            distinctPrimaryCategoryCount: 0,
            distinctSecondaryCategoryCount: 0,
            errorCount: 1,
            totalRowCount: 0,
          },
        });
      }
    } finally {
      setIsParsing(false);
    }
  };

  const handleImport = async () => {
    if (!precheck?.ok) {
      return;
    }

    setIsImporting(true);
    setProgress(0);
    setImportFailure(null);

    try {
      const response = await onImport(precheck.rows, (next) =>
        setProgress(next.progress),
      );

      if (response.ok) {
        setProgress(100);
        setImportedCount(response.importedCount);
        return;
      }

      setImportFailure(buildQuickReplyImportFailureDisplay(response));
      setIsImportTerminal(true);
    } finally {
      setIsImporting(false);
    }
  };
  const canImport = precheck?.ok && importedCount === null && !isImportTerminal;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[min(86vh,640px)] max-w-[640px] overflow-hidden"
        closeButtonVisible={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>导入话术</DialogTitle>
          <DialogDescription className="sr-only">
            上传 Excel 文件批量导入快捷话术
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-5 pr-1">
          <input
            ref={inputRef}
            accept=".xlsx"
            className="sr-only"
            onChange={(event) => void handleFileChange(event.target.files?.[0])}
            type="file"
          />

          {importedCount !== null ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <HugeiconsIcon
                  icon={CheckmarkCircle02Icon}
                  size={26}
                  strokeWidth={1.9}
                />
              </div>
              <div className="space-y-1">
                <div className="text-base font-medium text-foreground">
                  导入完成
                </div>
                <div className="text-sm text-muted-foreground">
                  共导入 {importedCount} 条话术
                </div>
              </div>
            </div>
          ) : precheck ? (
            <div
              aria-label="文件校验结果"
              className={
                precheck.ok
                  ? "space-y-3 rounded-[8px] border border-primary/20 bg-primary/[0.04] p-3 text-sm"
                  : "space-y-3 rounded-[8px] border border-destructive/20 bg-destructive/[0.04] p-3 text-sm"
              }
              role="region"
            >
              <div className="flex items-start gap-2">
                <span
                  className={
                    precheck.ok
                      ? "mt-0.5 text-primary"
                      : "mt-0.5 text-destructive"
                  }
                >
                  <HugeiconsIcon
                    icon={precheck.ok ? CheckmarkCircle02Icon : AlertCircleIcon}
                    size={16}
                    strokeWidth={1.9}
                  />
                </span>
                <div className="min-w-0 space-y-1">
                  <div className="font-medium">
                    {precheck.ok ? "文件校验通过" : "文件校验未通过"}
                  </div>
                  {selectedFileName ? (
                    <div className="truncate text-muted-foreground">
                      已选择 {selectedFileName}
                    </div>
                  ) : null}
                </div>
              </div>

              {precheck.ok ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <ImportSummaryItem
                      label="可导入"
                      value={`${precheck.summary.creatableQuickReplyCount} 条`}
                    />
                    <ImportSummaryItem
                      label="分类"
                      value={`${precheck.summary.distinctPrimaryCategoryCount} 个`}
                    />
                    <ImportSummaryItem
                      label="话术分组"
                      value={`${precheck.summary.distinctSecondaryCategoryCount} 个`}
                    />
                  </div>
                  {isImporting ? (
                    <div className="space-y-2">
                      <Progress value={progress} />
                      <div className="text-sm text-muted-foreground">
                        正在导入 {progress}%
                      </div>
                    </div>
                  ) : null}
                  {importFailure ? (
                    <div className="space-y-2 rounded-[6px] border border-destructive/20 bg-destructive/[0.04] px-3 py-2 text-destructive">
                      <div>{importFailure.summary}</div>
                      {importFailure.errors.length > 0 ? (
                        <ScrollArea
                          aria-label="导入失败原因"
                          className="h-[min(240px,32vh)] rounded-[6px] border bg-background p-2 text-foreground"
                          type="always"
                        >
                          {importFailure.errors.map((error, index) => (
                            <div key={`${error.rowNumber}-${index}`}>
                              {error.rowNumber > 0
                                ? `第 ${error.rowNumber} 行：${error.message}`
                                : error.message}
                            </div>
                          ))}
                        </ScrollArea>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <ScrollArea
                  aria-label="文件校验失败原因"
                  className="h-[min(240px,32vh)] rounded-[6px] border bg-background p-2"
                  type="always"
                >
                  {precheck.errors.map((error, index) => (
                    <div key={`${error.rowNumber}-${index}`}>
                      第 {error.rowNumber} 行：{error.message}
                    </div>
                  ))}
                </ScrollArea>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[112px_minmax(0,1fr)]">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span className="text-destructive" aria-hidden="true">
                  *
                </span>
                <span>上传文件：</span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  className="min-w-32"
                  disabled={isParsing || isImporting}
                  onClick={() => inputRef.current?.click()}
                  type="button"
                  variant="outline"
                >
                  <HugeiconsIcon
                    icon={Upload01Icon}
                    size={17}
                    strokeWidth={1.9}
                  />
                  上传文件
                </Button>
                <Button
                  className="h-auto px-0 text-sm font-normal"
                  disabled={isParsing || isImporting}
                  onClick={downloadQuickReplyImportTemplate}
                  type="button"
                  variant="link"
                >
                  下载模板
                </Button>
              </div>

              <div className="hidden sm:block" />
              <div className="space-y-1.5 text-sm leading-6 text-muted-foreground">
                <div>导入说明：</div>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>请按照模板中要求的字段导入</li>
                  <li>模板中要求必填的字段请务必填写完整，否则导入后无法使用</li>
                  <li>
                    单次最多导入{QUICK_REPLY_IMPORT_MAX_ROWS}
                    条话术，超过请拆分成多个文件分批导入
                  </li>
                </ol>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            disabled={isImporting}
            onClick={() => handleOpenChange(false)}
            type="button"
            variant="outline"
          >
            关闭
          </Button>
          {canImport ? (
            <Button
              disabled={isImporting}
              onClick={() => void handleImport()}
              type="button"
            >
              {isImporting ? "导入中" : "开始导入"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportSummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[6px] bg-background px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-medium text-foreground">{value}</div>
    </div>
  );
}
