import {
  AiScanIcon,
  Cancel01Icon,
  Copy01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ShinyText } from "@/components/ui/shiny-text";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ImageMessageContent } from "@/pages/chat/chat-types";
import {
  LoadableMessageImage,
  MessageMediaFallback,
} from "@/pages/chat/components/message/media-fallback";
import { getOptimizedMessageImageUrl } from "@/pages/chat/components/message/url";
import {
  recognizeImageText,
  type ImageOcrPhase,
  type ImageOcrResult,
} from "@/pages/chat/lib/image-ocr";

type ImageMessageCardProps = {
  content: ImageMessageContent;
};

export function ImageMessageCard({ content }: ImageMessageCardProps) {
  const mediaSize = getValidImageSize(content);
  const imageUrl = content.imageUrl.trim();
  const isEmotion = content.variant === "emotion";

  if (!imageUrl) {
    return (
      <ImageMessageFallback alt={content.alt} />
    );
  }

  return (
    <ImagePreviewDialog
      alt={content.alt}
      imageUrl={imageUrl}
      ocrEnabled={!isEmotion}
      triggerClassName="relative isolate inline-block overflow-hidden rounded-[8px] border border-border/40 bg-muted-foreground/10 p-0 outline-none transition-[border-color,filter] hover:brightness-[0.98] focus-visible:ring-4 focus-visible:ring-ring/25"
      triggerStyle={isEmotion ? emotionConstraintStyle : imageConstraintStyle}
    >
      <LoadableMessageImage
        alt={content.alt}
        className={
          isEmotion
            ? "block h-auto max-h-[120px] w-auto max-w-full object-contain"
            : "block h-auto max-h-[360px] w-auto max-w-full object-cover"
        }
        fallback={<ImageMessageFallback alt={content.alt} />}
        height={mediaSize?.height}
        loading="lazy"
        src={getOptimizedMessageImageUrl(imageUrl)}
        width={mediaSize?.width}
      />
    </ImagePreviewDialog>
  );
}

function ImageMessageFallback({ alt }: { alt: string }) {
  return (
    <MessageMediaFallback
      className="inline-flex h-[120px] w-[120px] items-center justify-center rounded-[8px] border border-border/40 bg-muted-foreground/5 text-muted-foreground/30"
      label={`图片不可用：${alt}`}
      testId="image-message-fallback"
    />
  );
}

type ImagePreviewDialogProps = {
  alt: string;
  children: ReactNode;
  imageUrl: string;
  ocrEnabled?: boolean;
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
};

export function ImagePreviewDialog({
  alt,
  children,
  imageUrl,
  ocrEnabled = true,
  triggerClassName,
  triggerStyle,
}: ImagePreviewDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [ocrPhase, setOcrPhase] = useState<ImageOcrPhase>("loading-model");
  const [activeOcrRegionId, setActiveOcrRegionId] = useState<string | null>(null);
  const [previewImageSize, setPreviewImageSize] = useState<{
    height: number;
    width: number;
  } | null>(null);
  const [ocrResult, setOcrResult] = useState<ImageOcrResult | null>(null);
  const [ocrError, setOcrError] = useState("");
  const ocrRequestIdRef = useRef(0);
  const isMountedRef = useRef(false);
  const previewImageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      ocrRequestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      return;
    }

    ocrRequestIdRef.current += 1;
    setOcrStatus("idle");
    setOcrPhase("loading-model");
    setActiveOcrRegionId(null);
    setPreviewImageSize(null);
    setOcrResult(null);
    setOcrError("");
  }, [isOpen]);

  const handleRecognizeText = async () => {
    if (ocrStatus === "loading") {
      return;
    }

    const requestId = ocrRequestIdRef.current + 1;

    ocrRequestIdRef.current = requestId;
    setOcrStatus("loading");
    setOcrPhase("loading-model");
    setOcrError("");

    try {
      await waitForNextPaint();

      if (!isMountedRef.current || ocrRequestIdRef.current !== requestId) {
        return;
      }

      const nextResult = await recognizeImageText({
        alt,
        imageUrl,
        onPhaseChange: (phase) => {
          if (isMountedRef.current && ocrRequestIdRef.current === requestId) {
            setOcrPhase(phase);
          }
        },
      });

      if (!isMountedRef.current || ocrRequestIdRef.current !== requestId) {
        return;
      }

      setOcrResult(nextResult);
      setOcrStatus("success");
    } catch (error) {
      if (!isMountedRef.current || ocrRequestIdRef.current !== requestId) {
        return;
      }

      setOcrResult(null);
      setOcrStatus("error");
      setOcrError(getOcrErrorMessage(error));
    }
  };

  const isOcrPanelOpen = ocrStatus === "loading" || ocrStatus === "success" || ocrStatus === "error";
  const handlePreviewImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;

    setPreviewImageSize({
      height: image.naturalHeight,
      width: image.naturalWidth,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        aria-label={`查看大图：${alt}`}
        className={triggerClassName}
        style={triggerStyle}
        type="button"
      >
        {children}
      </DialogTrigger>
      <DialogPortal>
        {isOpen ? (
          <DialogClose asChild>
            <Button
              aria-label="关闭图片预览"
              className="fixed right-4 top-4 z-[60] bg-black/35 text-white opacity-100 shadow-[0_10px_30px_var(--shadow-strong)] backdrop-blur hover:bg-black/55 hover:text-white"
              data-testid="image-preview-close"
              size="icon"
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
            </Button>
          </DialogClose>
        ) : null}
      </DialogPortal>
      <DialogContent
        aria-describedby={undefined}
        className="top-[calc(50%+1rem)] max-h-[calc(100vh-4rem)] max-w-[calc(100vw-2rem)] border-0 bg-transparent p-0 shadow-none sm:max-w-[calc(100vw-2rem)] [&>button:last-child]:hidden"
      >
        <DialogTitle className="sr-only">图片预览</DialogTitle>
        <div
          className="relative flex max-h-[calc(100vh-4rem)] max-w-[calc(100vw-2rem)] items-center justify-center"
          data-testid="image-preview-backdrop"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="flex max-h-[calc(100vh-4rem)] max-w-[calc(100vw-2rem)] items-stretch gap-3"
            data-ocr-panel={isOcrPanelOpen ? "open" : "closed"}
            data-testid="image-preview-layout"
          >
            <div className="flex min-w-0 flex-col items-center justify-center gap-3">
              <div
                className="relative flex min-h-0 items-center justify-center"
                data-testid="image-preview-image-frame"
                onClick={(event) => event.stopPropagation()}
              >
                <img
                  alt={alt}
                  className="max-h-[calc(100vh-8.5rem)] max-w-[calc(100vw-2rem)] rounded-[8px] object-contain shadow-[0_18px_60px_var(--shadow-strong)] data-[ocr-panel=open]:max-w-[calc(100vw-25rem)]"
                  crossOrigin="anonymous"
                  data-ocr-panel={isOcrPanelOpen ? "open" : "closed"}
                  data-testid="image-preview-full"
                  onLoad={handlePreviewImageLoad}
                  ref={previewImageRef}
                  src={imageUrl}
                />
                {ocrResult && previewImageSize ? (
                  <ImageOcrOverlay
                    activeRegionId={activeOcrRegionId}
                    imageSize={previewImageSize}
                    regions={ocrResult.regions}
                    setActiveRegionId={setActiveOcrRegionId}
                  />
                ) : null}
              </div>
              <div
                className="flex h-10 shrink-0 items-center justify-center"
                data-testid="image-preview-action-bar"
              >
                {ocrEnabled && (ocrStatus === "idle" || ocrStatus === "error") ? (
                  <Button
                    className="border border-white/12 bg-neutral-950/86 text-white shadow-[0_10px_30px_var(--shadow-strong)] backdrop-blur hover:bg-neutral-900 hover:text-white"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleRecognizeText();
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <HugeiconsIcon
                      icon={AiScanIcon}
                      size={16}
                      strokeWidth={2}
                    />
                    提取图片文字
                  </Button>
                ) : null}
              </div>
            </div>
            {isOcrPanelOpen ? (
              <div onClick={(event) => event.stopPropagation()}>
                <ImageOcrPanel
                  activeRegionId={activeOcrRegionId}
                  error={ocrError}
                  loadingPhase={ocrStatus === "loading" ? ocrPhase : null}
                  result={ocrResult}
                  setActiveRegionId={setActiveOcrRegionId}
                />
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ImageOcrPanel({
  activeRegionId,
  error,
  loadingPhase,
  result,
  setActiveRegionId,
}: {
  activeRegionId: string | null;
  error: string;
  loadingPhase: ImageOcrPhase | null;
  result: ImageOcrResult | null;
  setActiveRegionId: (regionId: string | null) => void;
}) {
  const recognizedText = result?.text.trim() ?? "";
  const regions = result?.regions ?? [];
  const isLoading = loadingPhase !== null;
  const panelTitle = getOcrPanelTitle({ error, loadingPhase, result });
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const copyText = async (text: string, successMessage: string) => {
    if (!text) {
      toast.warning("复制失败，请稍后重试");
      return;
    }

    const copied = await copyTextToClipboard(text);

    if (!isMountedRef.current) {
      return;
    }

    if (copied) {
      toast.success(successMessage);
      return;
    }

    toast.warning("复制失败，请稍后重试");
  };

  return (
    <aside
      className="flex h-[calc(100vh-8.5rem)] w-[22rem] shrink-0 flex-col rounded-[8px] border border-white/12 bg-neutral-950/88 text-white shadow-[0_18px_60px_var(--shadow-strong)] backdrop-blur-md"
      data-testid="image-preview-ocr-panel"
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">
          {isLoading ? (
            <ShinyText className="text-white/82" duration={1.15} shimmerWidth={48}>
              {panelTitle}
            </ShinyText>
          ) : (
            panelTitle
          )}
        </h2>
        {!isLoading && recognizedText ? (
          <Button
            aria-label="复制全部识别文字"
            className="size-8 border-white/12 bg-white/8 p-0 text-white hover:bg-white/14 hover:text-white"
            onClick={() => void copyText(recognizedText, "已复制识别文字")}
            size="icon"
            type="button"
            variant="outline"
          >
            <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={2} />
          </Button>
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2.5 p-4">
          {!isLoading && error ? (
            <div className="rounded-[8px] border border-red-300/35 bg-red-500/14 px-3 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}
          {!isLoading && !error && result && regions.length === 0 ? (
            <div className="rounded-[8px] border border-white/10 bg-white/6 px-3 py-3 text-sm text-white/70">
              未识别到图片文字
            </div>
          ) : null}
          {regions.map((region, index) => (
            <div
              className="group/ocr-result relative rounded-[8px] border border-white/10 bg-white/7 px-3 py-4 text-sm text-white/90 transition-colors hover:border-white/24 hover:bg-white/10 data-[active=true]:border-white/34 data-[active=true]:bg-white/13"
              data-active={activeRegionId === region.id}
              key={region.id}
              onMouseEnter={() => setActiveRegionId(region.id)}
              onMouseLeave={() => setActiveRegionId(null)}
            >
              <span className="absolute left-0 top-0 flex min-w-5 items-center justify-center rounded-br-[8px] rounded-tl-[8px] bg-white/13 px-1.5 py-1 text-[11px] font-medium leading-none text-white/72 ring-1 ring-inset ring-white/10">
                {index + 1}
              </span>
              <Button
                aria-label={`复制第 ${index + 1} 条识别文字`}
                className="absolute bottom-0 right-0 size-7 rounded-none rounded-br-[8px] rounded-tl-[8px] bg-neutral-950/76 p-0 text-white opacity-0 shadow-sm backdrop-blur transition-opacity hover:bg-neutral-900 hover:text-white focus-visible:opacity-100 group-hover/ocr-result:opacity-100"
                onClick={() => void copyText(region.text, "已复制单条文字")}
                size="icon"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon icon={Copy01Icon} size={13} strokeWidth={2} />
              </Button>
              <p className="whitespace-pre-wrap break-words leading-6">{region.text}</p>
            </div>
          ))}
        </div>
      </ScrollArea>
    </aside>
  );
}

function getOcrPanelTitle({
  error,
  loadingPhase,
  result,
}: {
  error: string;
  loadingPhase: ImageOcrPhase | null;
  result: ImageOcrResult | null;
}) {
  if (loadingPhase === "loading-model") {
    return "正在加载 OCR 模型";
  }

  if (loadingPhase === "recognizing") {
    return "正在识别图片文字";
  }

  if (error) {
    return "识别失败";
  }

  if (result) {
    return "识别结果";
  }

  return "提取图片文字";
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    if (typeof window.requestAnimationFrame !== "function") {
      window.setTimeout(resolve, 0);
      return;
    }

    // Let the loading state paint before OCR initialization can block the main thread.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

async function copyTextToClipboard(text: string) {
  if (!window.isSecureContext && copyTextWithSelection(text)) {
    return true;
  }

  const clipboard = navigator.clipboard;

  if (clipboard) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      return copyTextWithSelection(text);
    }
  }

  return copyTextWithSelection(text);
}

function copyTextWithSelection(text: string) {
  if (typeof document.execCommand !== "function") {
    return false;
  }

  const textArea = document.createElement("textarea");
  const selection = document.getSelection();
  const selectedRange = selection && selection.rangeCount > 0
    ? selection.getRangeAt(0)
    : null;

  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.left = "-9999px";
  textArea.style.position = "fixed";
  textArea.style.top = "0";
  document.body.appendChild(textArea);
  textArea.select();
  textArea.setSelectionRange(0, textArea.value.length);

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textArea);

    if (selection && selectedRange) {
      selection.removeAllRanges();
      selection.addRange(selectedRange);
    }
  }
}

function ImageOcrOverlay({
  activeRegionId,
  imageSize,
  regions,
  setActiveRegionId,
}: {
  activeRegionId: string | null;
  imageSize: {
    height: number;
    width: number;
  };
  regions: ImageOcrResult["regions"];
  setActiveRegionId: (regionId: string | null) => void;
}) {
  const drawableRegions = regions.filter((region) => region.points.length >= 3);

  if (
    drawableRegions.length === 0 ||
    imageSize.width <= 0 ||
    imageSize.height <= 0
  ) {
    return null;
  }

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full rounded-[8px]"
      data-testid="image-preview-ocr-overlay"
      preserveAspectRatio="none"
      viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
    >
      {drawableRegions.map((region) => (
        <polygon
          className="pointer-events-auto cursor-pointer fill-black/5 stroke-white/78 transition-colors [paint-order:stroke] [stroke-dasharray:8_6] [vector-effect:non-scaling-stroke] hover:fill-amber-300/18 hover:stroke-amber-200 data-[active=true]:fill-amber-300/28 data-[active=true]:stroke-amber-200 data-[active=true]:[stroke-dasharray:0]"
          data-active={activeRegionId === region.id}
          data-testid="image-preview-ocr-region"
          key={region.id}
          onMouseEnter={() => setActiveRegionId(region.id)}
          onMouseLeave={() => setActiveRegionId(null)}
          points={region.points.map(([x, y]) => `${x},${y}`).join(" ")}
          strokeWidth={activeRegionId === region.id ? 3 : 1.5}
        />
      ))}
    </svg>
  );
}

function getOcrErrorMessage(error: unknown) {
  if (isCanvasSecurityError(error)) {
    return "图片服务器未允许跨域读取，无法在浏览器内识别这张图片";
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "文字识别失败，请稍后重试";
}

function isCanvasSecurityError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorText = `${error.name} ${error.message}`.toLowerCase();

  return (
    errorText.includes("securityerror") ||
    errorText.includes("tainted canvas") ||
    errorText.includes("tainted canvases") ||
    errorText.includes("teximage2d")
  );
}

const imageConstraintStyle = {
  maxHeight: "360px",
  maxWidth: "300px",
  minWidth: "120px",
  width: "fit-content",
} satisfies CSSProperties;

const emotionConstraintStyle = {
  maxHeight: "120px",
  maxWidth: "120px",
  minHeight: "48px",
  minWidth: "48px",
  width: "fit-content",
} satisfies CSSProperties;

function getValidImageSize(content: ImageMessageContent) {
  if (
    !isPositiveFiniteNumber(content.width) ||
    !isPositiveFiniteNumber(content.height)
  ) {
    return undefined;
  }

  return {
    width: content.width,
    height: content.height,
  };
}

function isPositiveFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
