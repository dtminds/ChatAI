import { useEffect, useRef, useState } from "react";
import {
  QUICK_REPLY_ATTACHMENT_MAX_COUNT,
  validateQuickReplyPayload,
  type WorkbenchQuickReplyAttachment,
  type WorkbenchQuickReplyCategoryDto,
} from "@chatai/contracts";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { uploadWorkbenchImageFile } from "@/pages/chat/api/media-upload-service";
import {
  MessageAttachmentPicker,
  type MessageDraftAttachment,
  type MessageLocalImageAttachment,
} from "@/pages/chat/components/message-content/message-attachment-picker";
import { quickReplyTitlePalette } from "@/pages/chat/components/quick-reply/quick-reply-title-palette";
import type { QuickReplyFormValues } from "@/pages/chat/hooks/use-quick-replies";

type QuickReplyFormDialogProps = {
  categories: WorkbenchQuickReplyCategoryDto[];
  conversationId?: string;
  initialValues?: QuickReplyFormValues;
  mode?: "create" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: QuickReplyFormValues) => Promise<void> | void;
};

export function QuickReplyFormDialog({
  conversationId,
  initialValues,
  mode = initialValues ? "edit" : "create",
  open,
  onOpenChange,
  onSubmit,
}: QuickReplyFormDialogProps) {
  const [categoryId, setCategoryId] = useState<string | 0>(
    initialValues?.categoryId ?? 0,
  );
  const [contentText, setContentText] = useState(initialValues?.contentText ?? "");
  const [labelText, setLabelText] = useState(initialValues?.labelText ?? "");
  const [labelColor, setLabelColor] = useState(initialValues?.labelColor ?? "");
  const [attachments, setAttachments] = useState<MessageDraftAttachment[]>(
    initialValues?.attachments ?? [],
  );
  const attachmentsRef = useRef<MessageDraftAttachment[]>(attachments);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      revokeLocalImageUrls(attachmentsRef.current);
      setCategoryId(initialValues?.categoryId ?? 0);
      setContentText(initialValues?.contentText ?? "");
      setLabelText(initialValues?.labelText ?? "");
      setLabelColor(initialValues?.labelColor ?? "");
      const nextAttachments = initialValues?.attachments ?? [];

      attachmentsRef.current = nextAttachments;
      setAttachments(nextAttachments);
      setError("");
      setIsSubmitting(false);
    }
  }, [initialValues, open]);

  useEffect(() => {
    return () => {
      revokeLocalImageUrls(attachmentsRef.current);
      attachmentsRef.current = [];
    };
  }, []);

  const handleAttachmentsChange = (nextAttachments: MessageDraftAttachment[]) => {
    revokeRemovedLocalImageUrls(attachmentsRef.current, nextAttachments);
    attachmentsRef.current = nextAttachments;
    setAttachments(nextAttachments);
  };

  const handleSubmit = async () => {
    const normalizedContentText = contentText.trim();
    const normalizedLabelText = labelText.trim();

    if (!normalizedContentText && attachments.length === 0) {
      setError("请填写话术内容或添加附件");
      return;
    }

    if (normalizedContentText.length > 1000) {
      setError("话术内容不能超过1000字");
      return;
    }

    if (normalizedLabelText.length > 10) {
      setError("短标题不能超过10个字");
      return;
    }

    if (attachments.length > QUICK_REPLY_ATTACHMENT_MAX_COUNT) {
      setError("附件最多添加5个");
      return;
    }

    if (categoryId === 0) {
      setError("请选择二级分类");
      return;
    }

    setIsSubmitting(true);

    try {
      const resolvedAttachments = await resolveAttachmentsForSubmit(
        conversationId,
        attachments,
      );
      const validation = validateQuickReplyPayload({
        attachments: resolvedAttachments,
        contentText: normalizedContentText,
      });

      if (!validation.ok) {
        setError(validation.errorMsg);
        return;
      }

      await onSubmit({
        attachments: resolvedAttachments,
        categoryId,
        contentText: normalizedContentText,
        labelColor,
        labelText: normalizedLabelText,
      });
      onOpenChange(false);
    } catch (submitError) {
      setError(getSubmitErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-[calc(100vw-2rem)] min-w-0 overflow-hidden sm:max-w-[42rem] [&>*]:min-w-0">
        <DialogHeader className="min-w-0">
          <DialogTitle>{mode === "edit" ? "编辑话术" : "新建话术"}</DialogTitle>
        </DialogHeader>
        <div className="min-w-0 space-y-4 overflow-hidden">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-foreground">
                短标题<span className="text-muted-foreground">（选填）</span>
              </label>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-muted-foreground">
                  背景色：
                </span>
                {quickReplyTitlePalette.map((color) => (
                  <button
                    aria-label={
                      color.value ? `${color.value}短标题颜色` : "无短标题颜色"
                    }
                    aria-pressed={labelColor === color.value}
                    className={cn(
                      "flex size-6 items-center justify-center rounded-[3px] border text-[14px] font-semibold leading-none transition-colors hover:opacity-90",
                      labelColor === color.value
                        ? "border-primary ring-1 ring-primary"
                        : "border-transparent hover:border-primary/50",
                    )}
                    key={color.value || "empty"}
                    onClick={() => setLabelColor(color.value)}
                    style={{
                      backgroundColor: color.backgroundColor,
                      borderColor:
                        labelColor === color.value
                          ? "var(--primary)"
                          : color.borderColor,
                      color: color.foregroundColor,
                    }}
                    type="button"
                  >
                    {color.label}
                  </button>
                ))}
              </div>
            </div>
            <Input
              maxLength={10}
              onChange={(event) => setLabelText(event.target.value)}
              placeholder="请输入短标题，10字以内"
              value={labelText}
            />
          </div>

          <div className="min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-foreground">内容</label>
              <span className="text-xs text-muted-foreground">
                {contentText.trim().length}/1000
              </span>
            </div>
            <Textarea
              maxLength={1000}
              onChange={(event) => setContentText(event.target.value)}
              placeholder="请输入话术内容"
              rows={5}
              value={contentText}
            />
          </div>

          <MessageAttachmentPicker
            attachments={attachments}
            imageSource="local-upload"
            maxCount={QUICK_REPLY_ATTACHMENT_MAX_COUNT}
            onChange={handleAttachmentsChange}
          />

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            取消
          </Button>
          <Button disabled={isSubmitting} onClick={handleSubmit} type="button">
            {isSubmitting ? (
              <>
                <Spinner
                  aria-hidden="true"
                  className="text-current"
                  size={14}
                  variant="classic"
                />
                <span className="sr-only">保存中</span>
              </>
            ) : null}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function resolveAttachmentsForSubmit(
  conversationId: string | undefined,
  attachments: MessageDraftAttachment[],
): Promise<WorkbenchQuickReplyAttachment[]> {
  const resolved: WorkbenchQuickReplyAttachment[] = [];

  for (const attachment of attachments) {
    if (!isLocalImageAttachment(attachment)) {
      resolved.push(stripLocalImageContent(attachment));
      continue;
    }

    if (!conversationId) {
      throw new Error("图片上传失败，请重试");
    }

    try {
      const segment = await uploadWorkbenchImageFile(
        conversationId,
        attachment.localFile,
      );

      if (!segment.url) {
        throw new Error("missing uploaded image url");
      }

      resolved.push({
        content: {
          alt: attachment.content.alt || segment.alt || attachment.localFile.name || "图片",
          fileUrl: segment.url,
        },
        type: "image",
      });
    } catch {
      throw new Error("图片上传失败，请重试");
    }
  }

  return resolved;
}

function isLocalImageAttachment(
  attachment: MessageDraftAttachment,
): attachment is MessageLocalImageAttachment {
  return attachment.type === "image" && "localFile" in attachment;
}

function revokeRemovedLocalImageUrls(
  currentAttachments: MessageDraftAttachment[],
  nextAttachments: MessageDraftAttachment[],
) {
  const nextLocalUrls = new Set(
    nextAttachments
      .filter(isLocalImageAttachment)
      .map((attachment) => readLocalUrl(attachment))
      .filter(Boolean),
  );

  for (const attachment of currentAttachments) {
    const localUrl = isLocalImageAttachment(attachment)
      ? readLocalUrl(attachment)
      : "";

    if (localUrl && !nextLocalUrls.has(localUrl)) {
      URL.revokeObjectURL(localUrl);
    }
  }
}

function revokeLocalImageUrls(attachments: MessageDraftAttachment[]) {
  for (const attachment of attachments) {
    if (!isLocalImageAttachment(attachment)) {
      continue;
    }

    const localUrl = readLocalUrl(attachment);

    if (localUrl) {
      URL.revokeObjectURL(localUrl);
    }
  }
}

function readLocalUrl(attachment: MessageLocalImageAttachment) {
  const value = attachment.content.localUrl;

  return typeof value === "string" ? value : "";
}

function stripLocalImageContent(
  attachment: WorkbenchQuickReplyAttachment,
): WorkbenchQuickReplyAttachment {
  if (attachment.type !== "image") {
    return attachment;
  }

  const content = { ...attachment.content };
  delete content.localUrl;

  return {
    ...attachment,
    content,
  };
}

function getSubmitErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message.trim();
  }

  return "保存失败，请稍后重试";
}
