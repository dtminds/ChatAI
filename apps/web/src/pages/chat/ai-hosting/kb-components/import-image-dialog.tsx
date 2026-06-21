import { useRef, useState } from "react";
import {
  AlertCircleIcon,
  Cancel01Icon,
  FileImageIcon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/components/ui/file-upload";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getFileExtension,
  RequiredLabel,
  stripFileExtension,
  useAsyncValidation,
} from "./shared";

const IMAGE_KNOWLEDGE_MAX_FILE_SIZE = 5 * 1024 * 1024;
const IMAGE_KNOWLEDGE_MIN_EDGE = 10;
const IMAGE_KNOWLEDGE_MAX_EDGE = 6000;
const IMAGE_KNOWLEDGE_NAME_MAX_LENGTH = 16;
const IMAGE_KNOWLEDGE_ACCEPT =
  "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";
const IMAGE_KNOWLEDGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

export function ImportImageDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { beginValidation, invalidateValidation, isCurrentValidation } =
    useAsyncValidation();
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imageName, setImageName] = useState("");
  const [imageDescription, setImageDescription] = useState("");
  const [imageError, setImageError] = useState("");
  const [isCheckingImage, setIsCheckingImage] = useState(false);

  const reset = () => {
    invalidateValidation();
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

    const validationId = beginValidation();
    setSelectedImage(null);

    if (!isSupportedImageKnowledgeFile(file)) {
      if (!isCurrentValidation(validationId)) {
        return;
      }

      setImageError("仅支持 jpg、jpeg、png、webp 格式的图片");
      setIsCheckingImage(false);
      return;
    }

    if (file.size > IMAGE_KNOWLEDGE_MAX_FILE_SIZE) {
      if (!isCurrentValidation(validationId)) {
        return;
      }

      setImageError("图片大小不能超过 5MB");
      setIsCheckingImage(false);
      return;
    }

    if (!isCurrentValidation(validationId)) {
      return;
    }

    setImageError("");
    setIsCheckingImage(true);

    try {
      const dimensions = await readImageDimensions(file);

      if (!isCurrentValidation(validationId)) {
        return;
      }

      if (
        !isImageEdgeInRange(dimensions.width) ||
        !isImageEdgeInRange(dimensions.height)
      ) {
        setImageError("图片宽高必须在 10 到 6000 像素范围内");
        return;
      }

      setSelectedImage(file);
      setImageName((currentName) => {
        if (!isCurrentValidation(validationId) || currentName.trim()) {
          return currentName;
        }

        return stripFileExtension(file.name).slice(
          0,
          IMAGE_KNOWLEDGE_NAME_MAX_LENGTH,
        );
      });
    } catch {
      if (!isCurrentValidation(validationId)) {
        return;
      }

      setImageError("图片读取失败，请重新选择图片");
    } finally {
      if (isCurrentValidation(validationId)) {
        setIsCheckingImage(false);
      }
    }
  };

  const clearSelectedImage = () => {
    invalidateValidation();
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

function isSupportedImageKnowledgeFile(file: File) {
  return IMAGE_KNOWLEDGE_EXTENSIONS.has(
    getFileExtension(file.name).toLowerCase(),
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
