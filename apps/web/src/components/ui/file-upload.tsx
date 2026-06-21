import type { ReactNode } from "react";
import { Cancel01Icon, Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  type Accept,
  type FileRejection,
  useDropzone,
} from "react-dropzone";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type FileUploadRejectedFile = FileRejection;

export function FileUploadDropzone({
  accept,
  ariaLabel,
  className,
  description,
  disabled,
  inputAriaLabel,
  maxFiles,
  maxSize,
  multiple = false,
  onFilesAccepted,
  onFilesRejected,
  title,
}: {
  accept?: Accept;
  ariaLabel: string;
  className?: string;
  description: string;
  disabled?: boolean;
  inputAriaLabel?: string;
  maxFiles?: number;
  maxSize?: number;
  multiple?: boolean;
  onFilesAccepted: (files: File[]) => void;
  onFilesRejected?: (files: FileUploadRejectedFile[]) => void;
  title: string;
}) {
  const { getInputProps, getRootProps, isDragActive, isDragReject } =
    useDropzone({
      accept,
      disabled,
      maxFiles,
      maxSize,
      multiple,
      onDropAccepted: onFilesAccepted,
      onDropRejected: onFilesRejected,
    });

  return (
    <div
      {...getRootProps({
        "aria-label": ariaLabel,
        className: cn(
          "flex min-h-40 w-full cursor-pointer flex-col items-center justify-center rounded-[8px] border border-dashed border-border bg-muted/30 px-4 py-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20",
          "hover:border-primary/60 hover:bg-primary/[0.03]",
          isDragActive && "border-primary/60 bg-primary/[0.03]",
          isDragReject && "border-destructive/60 bg-destructive/[0.03]",
          disabled && "cursor-not-allowed opacity-60 hover:border-border hover:bg-muted/30",
          className,
        ),
        role: "button",
      })}
    >
      <input {...getInputProps({ "aria-label": inputAriaLabel ?? ariaLabel })} />
      <HugeiconsIcon
        className="text-primary"
        color="currentColor"
        icon={Upload01Icon}
        size={34}
        strokeWidth={1.8}
      />
      <span className="mt-4 text-sm font-medium text-foreground">{title}</span>
      <span className="mt-2 text-sm text-muted-foreground">{description}</span>
    </div>
  );
}

export function FileUploadSelectedFile({
  file,
  icon,
  label,
  meta,
  onClear,
}: {
  file: File;
  icon?: ReactNode;
  label: string;
  meta?: string;
  onClear: () => void;
}) {
  return (
    <div
      aria-label={label}
      className="flex min-w-0 items-center gap-3 rounded-[8px] border bg-background px-3 py-2.5"
      role="region"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        {file.name}（{formatFileSize(file.size)}
        {meta ? `，${meta}` : ""}）
      </span>
      <Button
        aria-label="移除已选择文件"
        className="size-8 shrink-0"
        onClick={onClear}
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
  );
}

export function formatFileSize(size: number) {
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
