import { useState } from "react";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/components/ui/segmented-control";
import {
  FileUploadDropzone,
  FileUploadSelectedFile,
} from "@/components/ui/file-upload";
import { isRequestError } from "@/lib/request";
import { importKbDoc } from "@/pages/chat/ai-hosting/api/kb-doc-service";
import { FileExtensionBadge } from "@/pages/chat/components/message/file";
import {
  getFileExtension,
  RequiredLabel,
  stripFileExtension,
  useDialogSubmit,
} from "./shared";

const PARSE_MODE_OPTIONS = [
  {
    description: "仅解析文本，速度优先",
    label: "通用解析",
    price: "0.005元/页",
    value: "standard",
  },
  {
    description: "含图片解析，速度略慢",
    label: "增强解析",
    price: "0.01元/页",
    value: "enhanced",
  },
] as const;

const CHUNK_STRATEGY_OPTIONS = [
  {
    label: "按固定长度切分",
    value: "length",
  },
  {
    label: "按分隔符切分",
    value: "separator",
  },
] as const;

const CHUNK_LENGTH_OPTIONS = [
  { label: "2000", value: "2000" },
  { label: "1000", value: "1000" },
  { label: "500", value: "500" },
] as const;
const DOCUMENT_KNOWLEDGE_ACCEPT = {
  "application/msword": [".doc"],
  "application/pdf": [".pdf"],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    ".pptx",
  ],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "text/markdown": [".md"],
  "text/plain": [".txt"],
};
const PLAIN_TEXT_DOCUMENT_EXTENSIONS = new Set(["md", "txt"]);
const SUPPORTED_DOCUMENT_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "pptx",
  "ppt",
  "md",
  "txt",
]);

type ImportStep = "file" | "config";

export function ImportDocumentDialog({
  kbId,
  onCreated,
  onOpenChange,
  open,
}: {
  kbId: string;
  onCreated?: (result: {
    docId: string;
    docSuffix: string;
    name: string;
  }) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { handleOpenChange, runSubmit, submitting } = useDialogSubmit({
    onOpenChange,
    onReset: resetForm,
    open,
  });
  const [step, setStep] = useState<ImportStep>("file");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [parseMode, setParseMode] =
    useState<(typeof PARSE_MODE_OPTIONS)[number]["value"]>("standard");
  const [chunkStrategy, setChunkStrategy] =
    useState<(typeof CHUNK_STRATEGY_OPTIONS)[number]["value"]>("length");
  const [chunkLength, setChunkLength] =
    useState<(typeof CHUNK_LENGTH_OPTIONS)[number]["value"]>("2000");

  function resetForm() {
    setStep("file");
    setSelectedFile(null);
    setFileError("");
    setParseMode("standard");
    setChunkStrategy("length");
    setChunkLength("2000");
  }

  const handleFileSelect = (file: File | undefined) => {
    if (!file) {
      return;
    }

    if (!isSupportedDocumentKnowledgeFile(file)) {
      setSelectedFile(null);
      setFileError("仅支持 PDF、Word、PPT、Markdown、TXT 文档");
      return;
    }

    setSelectedFile(file);
    setFileError("");

    if (isPlainTextDocument(file.name)) {
      setParseMode("standard");
    }
  };

  const handleFileReject = () => {
    setSelectedFile(null);
    setFileError("仅支持 PDF、Word、PPT、Markdown、TXT 文档");
  };

  const handleSubmit = () => {
    if (!selectedFile) {
      return;
    }

    void runSubmit(async () => {
      try {
        const result = await importKbDoc({
          chunkParams:
            chunkStrategy === "length"
              ? {
                  maxLength: Number.parseInt(chunkLength, 10) as 500 | 1000 | 2000,
                  strategy: "length",
                }
              : {
                  separator: "newline",
                  strategy: "separator",
                },
          chunkStrategy,
          file: selectedFile,
          kbId,
          parseMode,
        });

        toast.success("文档已提交解析");
        onCreated?.({
          docId: result.docId,
          docSuffix: getFileExtension(selectedFile.name).toLowerCase(),
          name: stripFileExtension(selectedFile.name) || selectedFile.name,
        });
      } catch (error) {
        toast.error(isRequestError(error) ? error.message : "文档导入失败");
        return false;
      }
    });
  };

  const dialogTitle = "导入文档";
  const canGoNext = Boolean(selectedFile);
  const submitLabel =
    parseMode === "enhanced" ? "确认提交（限免）" : "确认提交";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-[760px]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription className="sr-only">
            上传文档并配置解析模式和切片策略
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {step === "file" ? (
            <>
              {selectedFile ? null : (
                <FileUploadDropzone
                  accept={DOCUMENT_KNOWLEDGE_ACCEPT}
                  ariaLabel="上传文档文件"
                  description="支持 PDF、Word、PPT、Markdown、TXT 文档"
                  inputAriaLabel="选择文档知识文件"
                  maxFiles={1}
                  onFilesAccepted={(files) => handleFileSelect(files[0])}
                  onFilesRejected={handleFileReject}
                  title="点击或拖拽上传文件"
                />
              )}

              {selectedFile ? (
                <FileUploadSelectedFile
                  file={selectedFile}
                  icon={
                    <FileExtensionBadge
                      className="size-8"
                      extension={getFileExtension(selectedFile.name)}
                    />
                  }
                  label="已选择文档"
                  onClear={() => {
                    setSelectedFile(null);
                    setFileError("");
                  }}
                />
              ) : null}
            </>
          ) : selectedFile ? (
            <>
              <FileUploadSelectedFile
                file={selectedFile}
                icon={
                  <FileExtensionBadge
                    className="size-8"
                    extension={getFileExtension(selectedFile.name)}
                  />
                }
                label="已选择文档"
                onClear={() => {
                  setStep("file");
                  setSelectedFile(null);
                  setFileError("");
                }}
              />

              <div className="grid gap-2">
                <RequiredLabel>知识名称</RequiredLabel>
                <p className="text-sm text-foreground">
                  {stripFileExtension(selectedFile.name) || selectedFile.name}
                </p>
              </div>

              <div className="grid gap-2">
                <RequiredLabel>解析模式</RequiredLabel>
                <RadioGroup
                  aria-label="解析模式"
                  className="grid gap-3 md:grid-cols-2"
                  onValueChange={(value) =>
                    setParseMode(value as typeof parseMode)
                  }
                  value={parseMode}
                >
                  {PARSE_MODE_OPTIONS.map((option) => (
                    <RadioOptionCard
                      description={option.description}
                      disabled={
                        option.value === "enhanced" &&
                        isPlainTextDocument(selectedFile.name)
                      }
                      key={option.value}
                      label={option.label}
                      price={option.price}
                      value={option.value}
                    />
                  ))}
                </RadioGroup>
              </div>

              <div className="grid gap-2">
                <RequiredLabel>切片策略</RequiredLabel>
                <SegmentedOptionGroup
                  aria-label="切片策略"
                  onValueChange={(value) =>
                    setChunkStrategy(value as typeof chunkStrategy)
                  }
                  options={CHUNK_STRATEGY_OPTIONS}
                  value={chunkStrategy}
                />
              </div>

              {chunkStrategy === "separator" ? (
                <p className="text-sm leading-6 text-muted-foreground">
                  分隔符为：换行符、换行符*2
                </p>
              ) : (
                <div className="grid gap-2">
                  <RequiredLabel>切片最长字符数</RequiredLabel>
                  <SegmentedOptionGroup
                    aria-label="切片最长字符数"
                    onValueChange={(value) =>
                      setChunkLength(value as typeof chunkLength)
                    }
                    options={CHUNK_LENGTH_OPTIONS}
                    value={chunkLength}
                  />
                </div>
              )}
            </>
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
        </div>

        <DialogFooter>
          {step === "config" ? (
            <Button
              disabled={submitting}
              onClick={() => setStep("file")}
              type="button"
              variant="outline"
            >
              上一步
            </Button>
          ) : null}
          <Button
            disabled={submitting}
            onClick={() => handleOpenChange(false)}
            type="button"
            variant="outline"
          >
            取消
          </Button>
          {step === "file" ? (
            <Button
              disabled={!canGoNext}
              onClick={() => setStep("config")}
              type="button"
            >
              下一步
            </Button>
          ) : (
            <Button disabled={submitting} onClick={handleSubmit} type="button">
              {submitting ? "提交中" : submitLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RadioOptionCard({
  description,
  disabled,
  label,
  price,
  value,
}: {
  description: string;
  disabled?: boolean;
  label: string;
  price: string;
  value: string;
}) {
  return (
    <Label className="relative flex cursor-pointer items-start gap-3 overflow-hidden rounded-[10px] border border-border px-4 py-3 transition-colors hover:border-primary/40 has-[[data-disabled]]:cursor-not-allowed has-[[data-disabled]]:opacity-50 has-[[data-state=checked]]:border-primary/80 has-[[data-state=checked]]:bg-primary/[0.04]">
      <span className="absolute right-0 top-0 inline-flex items-center rounded-bl-[8px] bg-primary px-2.5 py-1 text-xs font-medium leading-none text-primary-foreground">
        限免
      </span>
      <RadioGroupItem className="mt-0.5" disabled={disabled} value={value} />
      <span>
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
          {description}
        </span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
          {price}
        </span>
      </span>
    </Label>
  );
}

function SegmentedOptionGroup({
  "aria-label": ariaLabel,
  onValueChange,
  options,
  value,
}: {
  "aria-label": string;
  onValueChange: (value: string) => void;
  options: readonly {
    label: string;
    value: string;
  }[];
  value: string;
}) {
  return (
    <SegmentedControl
      aria-label={ariaLabel}
      className="h-auto flex-wrap gap-2 rounded-none border-0 bg-transparent p-0"
      onValueChange={(nextValue) => {
        if (nextValue) {
          onValueChange(nextValue);
        }
      }}
      type="single"
      value={value}
    >
      {options.map((option) => (
        <SegmentedControlItem
          className="h-10 w-auto min-w-24 rounded-[8px] border border-border bg-background px-4 text-sm font-medium text-foreground data-[state=on]:border-primary/70 data-[state=on]:bg-primary/[0.06] data-[state=on]:text-primary data-[state=on]:shadow-none"
          key={option.value}
          value={option.value}
        >
          {option.label}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  );
}

function isSupportedDocumentKnowledgeFile(file: File) {
  return SUPPORTED_DOCUMENT_EXTENSIONS.has(
    getFileExtension(file.name).toLowerCase(),
  );
}

function isPlainTextDocument(fileName: string) {
  return PLAIN_TEXT_DOCUMENT_EXTENSIONS.has(
    getFileExtension(fileName).toLowerCase(),
  );
}
