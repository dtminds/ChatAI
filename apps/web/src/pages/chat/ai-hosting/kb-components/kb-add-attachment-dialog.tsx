import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Cancel01Icon,
  FileImageIcon,
  PlayIcon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { WorkbenchMaterialCollectionItemDto } from "@chatai/contracts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/components/ui/file-upload";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { FileExtensionBadge } from "@/pages/chat/components/message/file";
import {
  QuickReplyMaterialPickerDialog,
  type QuickReplyAttachmentMaterialBizType,
} from "@/pages/chat/components/quick-reply/quick-reply-material-picker-dialog";
import type { QuickReplyDraftAttachment } from "@/pages/chat/components/quick-reply/quick-reply-attachment-picker";
import { QuickReplyAttachmentPreview } from "@/pages/chat/components/quick-reply/quick-reply-attachment-preview";
import {
  buildKbAttachmentPayloadFromMaterial,
  extractKbAttachmentMeta,
  getKbAttachmentDescriptionHint,
  getKbAttachmentDescriptionLabel,
  getKbAttachmentDialogTitle,
  getKbAttachmentFileExtension,
  getKbAttachmentPreviewUrl,
  getKbAttachmentSelectLabel,
  getKbAttachmentTitle,
  getKbMaterialBizType,
  KB_ATTACHMENT_DESCRIPTION_HINT_EMPHASIS,
  KB_ATTACHMENT_TYPE,
  type KbAttachmentItem,
  type KbAttachmentType,
} from "./kb-attachment-types";
import { RequiredLabel, createLocalDocId } from "./shared";

const IMAGE_ATTACHMENT_ACCEPT =
  "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

type KbAddAttachmentDialogProps = {
  attachmentType: KbAttachmentType;
  editingItem?: KbAttachmentItem | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (item: KbAttachmentItem) => void | Promise<void>;
  open: boolean;
};

export function KbAddAttachmentDialog({
  attachmentType,
  editingItem = null,
  onOpenChange,
  onSubmit,
  open,
}: KbAddAttachmentDialogProps) {
  const isEditMode = editingItem != null;
  const imageInputRef = useRef<HTMLInputElement>(null);
  const isMountedRef = useRef(true);
  const localObjectUrlRef = useRef<string | null>(null);
  const [description, setDescription] = useState("");
  const [selectedPayload, setSelectedPayload] = useState<QuickReplyDraftAttachment | null>(
    null,
  );
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
  const [editEchoLoading, setEditEchoLoading] = useState(false);
  const materialBizType = getKbMaterialBizType(attachmentType);

  const handleEditPreviewReady = useCallback(() => {
    setEditEchoLoading(false);
  }, []);

  const revokeLocalObjectUrl = useCallback(() => {
    if (localObjectUrlRef.current) {
      URL.revokeObjectURL(localObjectUrlRef.current);
      localObjectUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      revokeLocalObjectUrl();
    };
  }, [revokeLocalObjectUrl]);

  useLayoutEffect(() => {
    if (!open) {
      revokeLocalObjectUrl();
      setDescription("");
      setSelectedPayload(null);
      setMaterialPickerOpen(false);
      setEditEchoLoading(false);

      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }

      return;
    }

    if (!editingItem) {
      setEditEchoLoading(false);
      return;
    }

    setDescription(editingItem.description);
    setSelectedPayload(editingItem.payload);
    setEditEchoLoading(
      needsEditAttachmentPreviewLoad(attachmentType, editingItem.payload),
    );
  }, [attachmentType, editingItem, open]);

  const canSubmit = Boolean(
    description.trim()
    && (selectedPayload || editingItem)
    && !editEchoLoading,
  );

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const nextPayload = selectedPayload ?? editingItem?.payload;

    if (!nextPayload || !description.trim() || submitting) {
      return;
    }

    const item = editingItem
      ? {
          ...editingItem,
          description: description.trim(),
          payload: nextPayload,
          ...extractKbAttachmentMeta(nextPayload),
          title: getAttachmentDisplayTitle(nextPayload),
        }
      : {
          attachmentType,
          createdAt: Date.now(),
          description: description.trim(),
          id: createLocalDocId(),
          payload: nextPayload,
          ...extractKbAttachmentMeta(nextPayload),
          title: getAttachmentDisplayTitle(nextPayload),
        };

    setSubmitting(true);

    try {
      await onSubmit(item);

      if (isMountedRef.current) {
        onOpenChange(false);
        toast.success(editingItem ? "附件已更新" : "附件已添加");
      }
    } catch {
      if (isMountedRef.current) {
        toast.error(editingItem ? "更新失败，请稍后重试" : "添加失败，请稍后重试");
      }
    } finally {
      if (isMountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  const handleMaterialSelect = (item: WorkbenchMaterialCollectionItemDto) => {
    const payload = buildKbAttachmentPayloadFromMaterial(attachmentType, item);

    if (!payload) {
      toast.error("素材类型不匹配");
      return;
    }

    setSelectedPayload(payload);
  };

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent className="max-w-[640px]">
          <DialogHeader>
            <DialogTitle>
              {getKbAttachmentDialogTitle(attachmentType, isEditMode ? "edit" : "create")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {isEditMode ? "编辑知识库附件" : "添加知识库附件"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {editEchoLoading ? (
              <>
                <EditAttachmentEchoLoadingState />
                {editingItem ? (
                  <div aria-hidden="true" className="sr-only">
                    <KbAttachmentPayloadPreview
                      attachmentType={attachmentType}
                      onPreviewReady={handleEditPreviewReady}
                      payload={editingItem.payload}
                    />
                  </div>
                ) : null}
              </>
            ) : attachmentType === KB_ATTACHMENT_TYPE.IMAGE ? (
              <ImageAttachmentFields
                imageInputRef={imageInputRef}
                onOpenMaterialPicker={() => setMaterialPickerOpen(true)}
                onSelectLocalImage={(file) => {
                  revokeLocalObjectUrl();
                  const localUrl = URL.createObjectURL(file);
                  localObjectUrlRef.current = localUrl;

                  setSelectedPayload({
                    content: {
                      alt: file.name || "图片",
                      localUrl,
                    },
                    localFile: file,
                    type: "image",
                  });
                }}
                selectedPayload={selectedPayload}
                onClearSelection={() => {
                  revokeLocalObjectUrl();
                  setSelectedPayload(null);

                  if (imageInputRef.current) {
                    imageInputRef.current.value = "";
                  }
                }}
              />
            ) : (
              <MaterialAttachmentField
                attachmentType={attachmentType}
                label={getKbAttachmentSelectLabel(attachmentType)}
                onOpenPicker={() => setMaterialPickerOpen(true)}
                selectedPayload={selectedPayload}
                onClearSelection={() => setSelectedPayload(null)}
              />
            )}

            <div className="space-y-2">
              <RequiredLabel htmlFor="kb-attachment-description">
                {getKbAttachmentDescriptionLabel(attachmentType)}
              </RequiredLabel>
              <p className="text-xs leading-5 text-muted-foreground">
                {getKbAttachmentDescriptionHint(attachmentType)}
                <span className="font-medium text-foreground">
                  {KB_ATTACHMENT_DESCRIPTION_HINT_EMPHASIS}
                </span>
              </p>
              <Textarea
                className="min-h-24 resize-none"
                disabled={editEchoLoading}
                id="kb-attachment-description"
                onChange={(event) => setDescription(event.target.value)}
                placeholder="请输入"
                value={description}
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button disabled={editEchoLoading} type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <Button
              disabled={!canSubmit || submitting || editEchoLoading}
              onClick={() => void handleSubmit()}
              type="button"
            >
              确认并提交
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {materialBizType ? (
        <QuickReplyMaterialPickerDialog
          bizType={materialBizType as QuickReplyAttachmentMaterialBizType}
          onOpenChange={setMaterialPickerOpen}
          onSelect={handleMaterialSelect}
          open={materialPickerOpen}
        />
      ) : null}
    </>
  );
}

function EditAttachmentEchoLoadingState() {
  return (
    <div
      className="flex min-h-[12rem] items-center justify-center gap-2 text-sm text-muted-foreground"
      role="status"
    >
      <Spinner size={16} />
      正在加载
    </div>
  );
}

function ImageAttachmentFields({
  imageInputRef,
  onClearSelection,
  onOpenMaterialPicker,
  onSelectLocalImage,
  selectedPayload,
}: {
  imageInputRef: React.RefObject<HTMLInputElement | null>;
  onClearSelection: () => void;
  onOpenMaterialPicker: () => void;
  onSelectLocalImage: (file: File) => void;
  selectedPayload: QuickReplyDraftAttachment | null;
}) {
  const localFile =
    selectedPayload?.type === "image" && "localFile" in selectedPayload
      ? selectedPayload.localFile
      : undefined;
  const localPreviewUrl =
    selectedPayload?.type === "image" && !localFile
      ? getKbAttachmentPreviewUrl(selectedPayload)
      : undefined;

  return (
    <div className="space-y-2">
      <Label>从收录的素材中选择</Label>
      <input
        accept={IMAGE_ATTACHMENT_ACCEPT}
        aria-label="上传图片"
        className="sr-only"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];

          if (file) {
            onSelectLocalImage(file);
          }
        }}
        ref={imageInputRef}
        type="file"
      />

      {localFile ? (
        <div className="flex min-w-0 items-center gap-3 rounded-[8px] border bg-background px-3 py-2.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[8px] bg-primary/10 text-primary">
            <HugeiconsIcon
              color="currentColor"
              icon={FileImageIcon}
              size={19}
              strokeWidth={1.8}
            />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {localFile.name}（{formatFileSize(localFile.size)}）
          </span>
          <Button
            aria-label="移除已选择图片"
            className="size-8 shrink-0"
            onClick={onClearSelection}
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
      ) : localPreviewUrl ? (
        <KbAttachmentPayloadPreview
          attachmentType={KB_ATTACHMENT_TYPE.IMAGE}
          onClear={onClearSelection}
          payload={selectedPayload!}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            className="h-10 gap-2"
            onClick={onOpenMaterialPicker}
            type="button"
            variant="outline"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={PlusSignIcon}
              size={16}
              strokeWidth={1.8}
            />
            选择图片
          </Button>
          <span className="text-sm text-muted-foreground">或</span>
          <Button
            className="h-10 px-0 text-sm"
            onClick={() => imageInputRef.current?.click()}
            type="button"
            variant="link"
          >
            本地上传
          </Button>
        </div>
      )}

      <p className="text-xs leading-5 text-muted-foreground">
        仅支持上传 jpg、jpeg、png、webp 格式的图片
      </p>
    </div>
  );
}

function MaterialAttachmentField({
  attachmentType,
  label,
  onClearSelection,
  onOpenPicker,
  selectedPayload,
}: {
  attachmentType: KbAttachmentType;
  label: string;
  onClearSelection: () => void;
  onOpenPicker: () => void;
  selectedPayload: QuickReplyDraftAttachment | null;
}) {
  return (
    <div className="space-y-2">
      <Label>从收录的素材中选择</Label>

      {selectedPayload ? (
        <KbAttachmentPayloadPreview
          attachmentType={attachmentType}
          onClear={onClearSelection}
          payload={selectedPayload}
        />
      ) : (
        <Button
          className="h-10 gap-2"
          onClick={onOpenPicker}
          type="button"
          variant="outline"
        >
          <HugeiconsIcon color="currentColor" icon={PlusSignIcon} size={16} strokeWidth={1.8} />
          {label}
        </Button>
      )}
    </div>
  );
}

function MaterialPreviewClearButton({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="absolute -right-0.5 -top-0.5 z-10 inline-flex size-[18px] items-center justify-center rounded-full bg-black/55 text-white shadow-sm transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClear();
      }}
      type="button"
    >
      <HugeiconsIcon
        aria-hidden="true"
        color="currentColor"
        icon={Cancel01Icon}
        size={10}
        strokeWidth={2}
      />
    </button>
  );
}

function MaterialPreviewShell({
  children,
  clearLabel,
  onClear,
}: {
  children: React.ReactNode;
  clearLabel: string;
  onClear?: () => void;
}) {
  return (
    <div className="relative inline-block w-fit max-w-full">
      {children}
      {onClear ? <MaterialPreviewClearButton label={clearLabel} onClear={onClear} /> : null}
    </div>
  );
}

function KbAttachmentPayloadPreview({
  attachmentType,
  onClear,
  onPreviewReady,
  payload,
}: {
  attachmentType: KbAttachmentType;
  onClear?: () => void;
  onPreviewReady?: () => void;
  payload: QuickReplyDraftAttachment;
}) {
  const previewUrl = resolveKbAttachmentRemotePreviewUrl(attachmentType, payload);

  useEffect(() => {
    if (!onPreviewReady || previewUrl) {
      return;
    }

    onPreviewReady();
  }, [onPreviewReady, previewUrl]);

  if (attachmentType === KB_ATTACHMENT_TYPE.IMAGE && payload.type === "image") {
    return (
      <MaterialPreviewShell clearLabel="移除已选择图片" onClear={onClear}>
        {previewUrl ? (
          <RemotePreviewImage
            className="block max-h-44 max-w-60 rounded-[8px] border border-border object-contain"
            onPreviewReady={onPreviewReady}
            previewUrl={previewUrl}
          />
        ) : (
          <div className="flex size-28 items-center justify-center rounded-[8px] border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
            图片
          </div>
        )}
      </MaterialPreviewShell>
    );
  }

  if (attachmentType === KB_ATTACHMENT_TYPE.VIDEO && payload.type === "file") {
    return (
      <MaterialPreviewShell clearLabel="移除已选择视频" onClear={onClear}>
        <div
          className={cn(
            "relative size-16 overflow-hidden rounded-[8px] border border-border bg-muted",
            !previewUrl && "border-dashed",
          )}
        >
          {previewUrl ? (
            <RemotePreviewImage
              className="size-full object-cover"
              onPreviewReady={onPreviewReady}
              previewUrl={previewUrl}
            />
          ) : null}
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10">
            <span className="flex size-7 items-center justify-center rounded-full bg-black/45 text-white">
              <HugeiconsIcon
                aria-hidden="true"
                color="currentColor"
                icon={PlayIcon}
                size={14}
                strokeWidth={1.8}
              />
            </span>
          </span>
        </div>
      </MaterialPreviewShell>
    );
  }

  if (attachmentType === KB_ATTACHMENT_TYPE.FILE && payload.type === "file") {
    return (
      <MaterialPreviewShell clearLabel="移除已选择文件" onClear={onClear}>
        <div className="flex min-w-0 max-w-full items-center gap-3 rounded-[8px] border border-border bg-surface py-2 pl-2 pr-3">
          <FileExtensionBadge
            className="size-10"
            extension={getKbAttachmentFileExtension(payload)}
          />
          <span className="min-w-0 max-w-60 truncate text-sm text-foreground">
            {getKbAttachmentTitle(payload)}
          </span>
        </div>
      </MaterialPreviewShell>
    );
  }

  if (attachmentType === KB_ATTACHMENT_TYPE.LINK && payload.type === "h5") {
    return (
      <div className="inline-flex min-w-0 max-w-full items-start gap-3">
        <MaterialPreviewShell clearLabel="移除已选择链接" onClear={onClear}>
          <div
            className={cn(
              "size-16 overflow-hidden rounded-[8px] border border-border bg-muted",
              !previewUrl && "border-dashed",
            )}
          >
            {previewUrl ? (
              <RemotePreviewImage
                className="size-full object-cover"
                onPreviewReady={onPreviewReady}
                previewUrl={previewUrl}
              />
            ) : (
              <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                链接
              </div>
            )}
          </div>
        </MaterialPreviewShell>
        <p className="min-w-0 max-w-60 line-clamp-2 text-sm leading-6 text-foreground">
          {getKbAttachmentTitle(payload)}
        </p>
      </div>
    );
  }

  if (attachmentType === KB_ATTACHMENT_TYPE.MINI_PROGRAM && payload.type === "weapp") {
    const subtitle = readString(payload.content.appName) || "小程序";

    return (
      <div className="inline-flex min-w-0 max-w-full items-start gap-3">
        <MaterialPreviewShell clearLabel="移除已选择小程序" onClear={onClear}>
          <div
            className={cn(
              "size-16 overflow-hidden rounded-[8px] border border-border bg-muted",
              !previewUrl && "border-dashed",
            )}
          >
            {previewUrl ? (
              <RemotePreviewImage
                className="size-full object-cover"
                onPreviewReady={onPreviewReady}
                previewUrl={previewUrl}
              />
            ) : (
              <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                小程序
              </div>
            )}
          </div>
        </MaterialPreviewShell>
        <div className="min-w-0 max-w-60">
          <p className="line-clamp-2 text-sm leading-6 text-foreground">
            {getKbAttachmentTitle(payload)}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    );
  }

  return <QuickReplyAttachmentPreview attachment={payload} />;
}

function RemotePreviewImage({
  className,
  onPreviewReady,
  previewUrl,
}: {
  className?: string;
  onPreviewReady?: () => void;
  previewUrl: string;
}) {
  const notifiedRef = useRef(false);

  const notifyPreviewReady = useCallback(() => {
    if (!onPreviewReady || notifiedRef.current) {
      return;
    }

    notifiedRef.current = true;
    onPreviewReady();
  }, [onPreviewReady]);

  useEffect(() => {
    notifiedRef.current = false;
  }, [previewUrl]);

  return (
    <img
      alt=""
      aria-hidden="true"
      className={className}
      onError={notifyPreviewReady}
      onLoad={notifyPreviewReady}
      src={previewUrl}
    />
  );
}

function resolveKbAttachmentRemotePreviewUrl(
  attachmentType: KbAttachmentType,
  payload: QuickReplyDraftAttachment,
) {
  if (attachmentType === KB_ATTACHMENT_TYPE.FILE) {
    return undefined;
  }

  return getKbAttachmentPreviewUrl(payload);
}

function needsEditAttachmentPreviewLoad(
  attachmentType: KbAttachmentType,
  payload: QuickReplyDraftAttachment,
) {
  return Boolean(resolveKbAttachmentRemotePreviewUrl(attachmentType, payload));
}

function getAttachmentDisplayTitle(payload: QuickReplyDraftAttachment) {
  const content = payload.content;

  if (payload.type === "file") {
    return readString(content.fileName) || "文件";
  }

  if (payload.type === "h5") {
    return readString(content.title) || "链接";
  }

  if (payload.type === "weapp") {
    return readString(content.title) || "小程序";
  }

  if ("localFile" in payload) {
    return payload.localFile.name || "图片";
  }

  return readString(content.alt) || "图片";
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
