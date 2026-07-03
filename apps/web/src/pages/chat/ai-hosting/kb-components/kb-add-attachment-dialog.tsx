import { useEffect, useRef, useState } from "react";
import {
  Cancel01Icon,
  FileImageIcon,
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  QuickReplyMaterialPickerDialog,
  type QuickReplyAttachmentMaterialBizType,
} from "@/pages/chat/components/quick-reply/quick-reply-material-picker-dialog";
import type { QuickReplyDraftAttachment } from "@/pages/chat/components/quick-reply/quick-reply-attachment-picker";
import { QuickReplyAttachmentPreview } from "@/pages/chat/components/quick-reply/quick-reply-attachment-preview";
import {
  buildKbAttachmentPayloadFromMaterial,
  extractKbAttachmentMeta,
  getKbAttachmentDescriptionLabel,
  getKbAttachmentDialogTitle,
  getKbAttachmentSelectLabel,
  getKbMaterialBizType,
  KB_ATTACHMENT_TYPE,
  type KbAttachmentItem,
  type KbAttachmentType,
} from "./kb-attachment-types";
import { RequiredLabel, createLocalDocId } from "./shared";

const IMAGE_ATTACHMENT_ACCEPT =
  "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

type ImageUploadSource = "local" | "material";

type KbAddAttachmentDialogProps = {
  attachmentType: KbAttachmentType;
  editingItem?: KbAttachmentItem | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (item: KbAttachmentItem) => void;
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
  const [description, setDescription] = useState("");
  const [imageSource, setImageSource] = useState<ImageUploadSource>("local");
  const [selectedPayload, setSelectedPayload] = useState<QuickReplyDraftAttachment | null>(
    null,
  );
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
  const materialBizType = getKbMaterialBizType(attachmentType);

  useEffect(() => {
    if (!open) {
      setDescription("");
      setImageSource("local");
      setSelectedPayload(null);
      setMaterialPickerOpen(false);

      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }

      return;
    }

    if (!editingItem) {
      return;
    }

    setDescription(editingItem.description);
    setSelectedPayload(editingItem.payload);
    setImageSource(resolveImageUploadSource(editingItem.payload));
  }, [editingItem, open]);

  const canSubmit = Boolean(description.trim() && (selectedPayload || editingItem));

  const handleSubmit = () => {
    const nextPayload = selectedPayload ?? editingItem?.payload;

    if (!nextPayload || !description.trim()) {
      return;
    }

    if (editingItem) {
      onSubmit({
        ...editingItem,
        description: description.trim(),
        payload: nextPayload,
        ...extractKbAttachmentMeta(nextPayload),
        title: getAttachmentDisplayTitle(nextPayload),
      });
      onOpenChange(false);
      toast.success("附件已更新");
      return;
    }

    onSubmit({
      attachmentType,
      createdAt: Date.now(),
      description: description.trim(),
      id: createLocalDocId(),
      payload: nextPayload,
      ...extractKbAttachmentMeta(nextPayload),
      title: getAttachmentDisplayTitle(nextPayload),
    });
    onOpenChange(false);
    toast.success("附件已添加");
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
            {attachmentType === KB_ATTACHMENT_TYPE.IMAGE ? (
              <ImageAttachmentFields
                imageInputRef={imageInputRef}
                imageSource={imageSource}
                onImageSourceChange={setImageSource}
                onOpenMaterialPicker={() => setMaterialPickerOpen(true)}
                onSelectLocalImage={(file) => {
                  const localUrl = URL.createObjectURL(file);

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
                  setSelectedPayload(null);

                  if (imageInputRef.current) {
                    imageInputRef.current.value = "";
                  }
                }}
              />
            ) : (
              <MaterialAttachmentField
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
              <Textarea
                className="min-h-24 resize-none"
                id="kb-attachment-description"
                onChange={(event) => setDescription(event.target.value)}
                placeholder="请输入描述"
                value={description}
              />
              <p className="text-xs leading-5 text-muted-foreground">
                描述会作为发送附件时的消息文案
              </p>
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <Button disabled={!canSubmit} onClick={handleSubmit} type="button">
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

function ImageAttachmentFields({
  imageInputRef,
  imageSource,
  onClearSelection,
  onImageSourceChange,
  onOpenMaterialPicker,
  onSelectLocalImage,
  selectedPayload,
}: {
  imageInputRef: React.RefObject<HTMLInputElement | null>;
  imageSource: ImageUploadSource;
  onClearSelection: () => void;
  onImageSourceChange: (source: ImageUploadSource) => void;
  onOpenMaterialPicker: () => void;
  onSelectLocalImage: (file: File) => void;
  selectedPayload: QuickReplyDraftAttachment | null;
}) {
  const localFile =
    selectedPayload?.type === "image" && "localFile" in selectedPayload
      ? selectedPayload.localFile
      : undefined;

  return (
    <div className="space-y-4">
      <RadioGroup
        className="flex flex-wrap gap-6"
        onValueChange={(value) => {
          onImageSourceChange(value as ImageUploadSource);
          onClearSelection();
        }}
        value={imageSource}
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem id="kb-image-source-local" value="local" />
          <Label className="font-normal" htmlFor="kb-image-source-local">
            本地上传
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem id="kb-image-source-material" value="material" />
          <Label className="font-normal" htmlFor="kb-image-source-material">
            从采集素材库选择
          </Label>
        </div>
      </RadioGroup>

      {imageSource === "local" ? (
        <div className="space-y-2">
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
          ) : (
            <button
              className="flex size-28 flex-col items-center justify-center gap-2 rounded-[8px] border border-dashed border-border bg-muted/30 text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:bg-primary/[0.03] hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
              onClick={() => imageInputRef.current?.click()}
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

          <p className="text-xs leading-5 text-muted-foreground">
            仅支持上传 jpg、jpeg、png、webp 格式的图片
          </p>
        </div>
      ) : (
        <MaterialAttachmentField
          label="选择图片"
          onClearSelection={onClearSelection}
          onOpenPicker={onOpenMaterialPicker}
          selectedPayload={selectedPayload}
        />
      )}
    </div>
  );
}

function MaterialAttachmentField({
  label,
  onClearSelection,
  onOpenPicker,
  selectedPayload,
}: {
  label: string;
  onClearSelection: () => void;
  onOpenPicker: () => void;
  selectedPayload: QuickReplyDraftAttachment | null;
}) {
  return (
    <div className="space-y-2">
      <Label>从采集素材库选择</Label>

      {selectedPayload ? (
        <div className="flex min-w-0 items-center gap-3 rounded-[8px] border bg-background px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <QuickReplyAttachmentPreview attachment={selectedPayload} />
          </div>
          <Button
            aria-label="移除已选择素材"
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

function resolveImageUploadSource(payload: QuickReplyDraftAttachment): ImageUploadSource {
  if (payload.type === "image" && "localFile" in payload) {
    return "local";
  }

  if (payload.type === "image" && payload.materialCollectionId) {
    return "material";
  }

  return "local";
}
