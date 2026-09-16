import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Blobatar } from "@blobatar/react";
import { useGaze } from "@blobatar/react/gaze";
import {
  AiMagicIcon,
  AiContentGenerator02Icon,
  AiAutoRotateIcon,
  NerdIcon,
  MuteIcon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  ExpandParagraphIcon,
  Minimize01Icon,
  Sad01Icon,
  SmileIcon,
  TongueWinkRightIcon,
  XIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { thinking } from "blobatar/expression";
import "blobatar/gaze.css";
import "blobatar/motion.css";
import { COMMAND_PRIORITY_LOW, SELECTION_CHANGE_COMMAND } from "lexical";
import {
  COMPOSER_AI_EDIT_INPUT_MAX_LENGTH,
  COMPOSER_AI_EDIT_INPUT_MIN_LENGTH,
  type ComposerAiEditAction,
  type ComposerAiEditResponse,
} from "@chatai/contracts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShinyText } from "@/components/ui/shiny-text";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RequestNormalizedError } from "@/lib/request";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getWorkbenchService } from "@/pages/chat/api/workbench-service";
import {
  $getComposerTextSelectionSnapshot,
  $replaceComposerTextSelection,
  type ComposerTextSelectionReplacementResult,
  type ComposerTextSelectionSnapshot,
} from "@/pages/chat/components/composer/lexical-utils";
import { COMPOSER_TEXT_MAX_LENGTH } from "@/pages/chat/chat-constants";

type ComposerAiEditPluginProps = {
  canEdit: boolean;
  conversationId?: string;
};

type SelectionState = ComposerTextSelectionSnapshot & {
  rect: DOMRect;
};

type EditState = "menu" | "preview" | "loading";

const PRIMARY_ACTIONS: Array<{
  action: ComposerAiEditAction;
  icon: typeof AiMagicIcon;
  label: string;
}> = [
  { action: "polish", icon: AiContentGenerator02Icon, label: "润色文案" },
  { action: "lengthen", icon: ExpandParagraphIcon, label: "更长一点" },
  { action: "shorten", icon: Minimize01Icon, label: "更短一点" },
];

const TONE_ACTIONS: Array<{
  action: ComposerAiEditAction;
  icon: typeof AiMagicIcon;
  label: string;
}> = [
  { action: "professional", icon: NerdIcon, label: "专业" },
  { action: "friendly", icon: SmileIcon, label: "友好" },
  { action: "playful", icon: TongueWinkRightIcon, label: "俏皮" },
  { action: "apologetic", icon: Sad01Icon, label: "表达歉意" },
];

const SHORTEN_ACTION_MIN_LENGTH = 15;
const COMPOSER_AI_ASSISTANT_ID = "chatai-composer-ai-assistant-v1";

export function ComposerAiEditPlugin({
  canEdit,
  conversationId,
}: ComposerAiEditPluginProps) {
  const [editor] = useLexicalComposerContext();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);
  const requestAbortControllerRef = useRef<AbortController | null>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [editState, setEditState] = useState<EditState>("menu");
  const [menuOpen, setMenuOpen] = useState(false);
  const [toneMenuOpen, setToneMenuOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<ComposerAiEditAction | null>(null);
  const [result, setResult] = useState("");
  const [quotaUnavailableDialogOpen, setQuotaUnavailableDialogOpen] = useState(false);
  const isPointerSelectingRef = useRef(false);
  const isSurfaceInteractingRef = useRef(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [surfaceHeight, setSurfaceHeight] = useState(32);
  const { ref: assistantGazeRef } = useGaze({
    lookAt: editState === "loading" ? null : "pointer",
    travel: 12,
  });

  const readSelection = useCallback(() => {
    if (
      isPointerSelectingRef.current ||
      editState === "preview" ||
      editState === "loading" ||
      menuOpen
    ) {
      return;
    }

    let nextSnapshot: ComposerTextSelectionSnapshot | null = null;

    editor.read("latest", () => {
      nextSnapshot = $getComposerTextSelectionSnapshot();
    });

    const snapshot = nextSnapshot as ComposerTextSelectionSnapshot | null;

    if (
      !snapshot ||
      !canEdit ||
      snapshot.text.length < COMPOSER_AI_EDIT_INPUT_MIN_LENGTH ||
      snapshot.text.length > COMPOSER_AI_EDIT_INPUT_MAX_LENGTH
    ) {
      if (surfaceRef.current?.contains(document.activeElement)) {
        return;
      }

      setSelection(null);
      setEditState("menu");
      return;
    }

    const domSelection = window.getSelection();
    const range = domSelection?.rangeCount ? domSelection.getRangeAt(0) : null;
    const rootElement = editor.getRootElement();

    if (
      !rootElement ||
      !range ||
      !rootElement.contains(range.commonAncestorContainer)
    ) {
      if (surfaceRef.current?.contains(document.activeElement)) {
        return;
      }

      setSelection(null);
      setEditState("menu");
      return;
    }

    const rect =
      Array.from(range.getClientRects()).find(
        (clientRect) => clientRect.width > 0 && clientRect.height > 0,
      ) ?? range.getBoundingClientRect();

    if (!rect) {
      return;
    }

    const nextSelection = { ...snapshot, rect };
    setSelection(nextSelection);
    setEditState((current) => (current === "preview" || current === "loading" ? current : "menu"));
  }, [canEdit, editState, editor, menuOpen]);

  useEffect(() => {
    const unregister = editor.registerUpdateListener(() => {
      readSelection();
    });
    const unregisterSelectionChange = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        readSelection();
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
    const handlePointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) {
        return;
      }

      const rootElement = editor.getRootElement();
      const target = event.target;

      if (target && surfaceRef.current?.contains(target as Node)) {
        isSurfaceInteractingRef.current = true;
        return;
      }

      if (!rootElement || !target || !rootElement.contains(target as Node)) {
        return;
      }

      isPointerSelectingRef.current = true;

      if (editState === "menu") {
        setSelection(null);
        setMenuOpen(false);
        setToneMenuOpen(false);
      }
    };
    const handlePointerEnd = () => {
      isSurfaceInteractingRef.current = false;

      if (!isPointerSelectingRef.current) {
        return;
      }

      isPointerSelectingRef.current = false;
      readSelection();
    };
    const handleDocumentSelectionChange = () => {
      if (
        !selection ||
        isPointerSelectingRef.current ||
        isSurfaceInteractingRef.current ||
        editState !== "menu" ||
        menuOpen
      ) {
        return;
      }

      const domSelection = window.getSelection();
      const range = domSelection?.rangeCount ? domSelection.getRangeAt(0) : null;
      const rootElement = editor.getRootElement();

      if (
        rootElement &&
        range &&
        rootElement.contains(range.commonAncestorContainer)
      ) {
        return;
      }

      if (surfaceRef.current?.contains(document.activeElement)) {
        return;
      }

      setSelection(null);
      setEditState("menu");
      setMenuOpen(false);
      setToneMenuOpen(false);
    };
    const handleViewportChange = () => {
      if (selection) {
        readSelection();
      }
    };

    document.addEventListener("selectionchange", handleDocumentSelectionChange);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("pointerup", handlePointerEnd);
    document.addEventListener("pointercancel", handlePointerEnd);
    window.addEventListener("blur", handlePointerEnd);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      unregister();
      unregisterSelectionChange();
      document.removeEventListener("selectionchange", handleDocumentSelectionChange);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointerup", handlePointerEnd);
      document.removeEventListener("pointercancel", handlePointerEnd);
      window.removeEventListener("blur", handlePointerEnd);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [editor, readSelection, selection]);

  const close = useCallback(() => {
    requestIdRef.current += 1;
    requestAbortControllerRef.current?.abort();
    requestAbortControllerRef.current = null;
    setSelection(null);
    setEditState("menu");
    setMenuOpen(false);
    setToneMenuOpen(false);
    setActiveAction(null);
    setResult("");
  }, []);

  useEffect(() => () => {
    requestIdRef.current += 1;
    requestAbortControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!canEdit) {
      close();
    }
  }, [canEdit, close]);

  const previousConversationIdRef = useRef(conversationId);

  useEffect(() => {
    if (previousConversationIdRef.current === conversationId) {
      return;
    }

    previousConversationIdRef.current = conversationId;
    close();
  }, [close, conversationId]);

  const requestRewrite = useCallback(
    async (action: ComposerAiEditAction) => {
      if (
        !selection ||
        !conversationId ||
        selection.text.length < COMPOSER_AI_EDIT_INPUT_MIN_LENGTH ||
        selection.text.length > COMPOSER_AI_EDIT_INPUT_MAX_LENGTH
      ) {
        return;
      }

      const requestId = ++requestIdRef.current;
      requestAbortControllerRef.current?.abort();
      const abortController = new AbortController();
      requestAbortControllerRef.current = abortController;
      setMenuOpen(false);
      setToneMenuOpen(false);
      setActiveAction(action);
      setEditState("loading");

      try {
        const response: ComposerAiEditResponse = await getWorkbenchService().rewriteComposerText(
          {
            action,
            content: selection.text,
            contextAfter: selection.contextAfter,
            contextBefore: selection.contextBefore,
            conversationId,
            rewriteMode: selection.rewriteMode,
          },
          { signal: abortController.signal },
        );

        if (requestId !== requestIdRef.current) {
          return;
        }

        setResult(response.content);
        setEditState("preview");
      } catch (error) {
        if (requestId === requestIdRef.current && !abortController.signal.aborted) {
          if (isQuotaUnavailableError(error)) {
            close();
            setQuotaUnavailableDialogOpen(true);
          } else {
            setEditState("menu");
            toast.error(getRewriteErrorMessage(error));
          }
        }
      } finally {
        if (requestAbortControllerRef.current === abortController) {
          requestAbortControllerRef.current = null;
        }
      }
    },
    [close, conversationId, selection],
  );

  const cancelRewrite = useCallback(() => {
    requestIdRef.current += 1;
    requestAbortControllerRef.current?.abort();
    requestAbortControllerRef.current = null;
    setEditState("menu");
    setActiveAction(null);
    setResult("");
  }, []);

  const applyResult = useCallback(() => {
    if (!selection || !result) {
      return;
    }

    const replacementState: {
      result: ComposerTextSelectionReplacementResult | null;
    } = { result: null };
    editor.update(() => {
      replacementState.result = $replaceComposerTextSelection(
        selection,
        result,
        COMPOSER_TEXT_MAX_LENGTH,
      );
    });

    const replacementResult = replacementState.result ?? "node_missing";

    if (replacementResult !== "applied") {
      toast.error(
        replacementResult === "length_exceeded"
          ? "内容超过字数限制，请缩短后重试"
          : replacementResult === "node_missing"
            ? "选区已失效，请重新选择"
            : "原文已变化，请重新选择",
      );
      close();
      return;
    }

    close();
    editor.focus();
  }, [close, editor, result, selection]);

  const isExpanded = editState !== "menu";

  useLayoutEffect(() => {
    if (!isExpanded) {
      setSurfaceHeight(32);
      return;
    }

    const content = contentRef.current;

    if (!content) {
      return;
    }

    const measure = () => {
      if (content.scrollHeight > 0) {
        setSurfaceHeight(content.scrollHeight);
      }
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(measure);
    observer.observe(content);

    return () => observer.disconnect();
  }, [isExpanded, result]);

  const left = selection
    ? Math.max(
        8,
        Math.min(selection.rect.left, window.innerWidth - (isExpanded ? 360 : 40)),
      )
    : 8;

  return (
    <>
      <Dialog
        onOpenChange={setQuotaUnavailableDialogOpen}
        open={quotaUnavailableDialogOpen}
      >
        <DialogContent className="max-w-[22rem] gap-3 p-4">
          <DialogHeader>
            <DialogTitle className="text-sm leading-5">AI 助写暂时不可用</DialogTitle>
            <DialogDescription className="text-[13px] leading-5">
              服务暂时不可用，请稍后重试
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button className="h-8 text-xs" size="sm" type="button">
                知道了
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selection && canEdit && conversationId ? (
        <div
          ref={surfaceRef}
          className={cn(
            "fixed z-50 overflow-visible text-[13px] text-popover-foreground transition-[width,height] duration-200 ease-out",
            isExpanded
              ? "w-[min(22rem,calc(100vw-1rem))] overflow-hidden rounded-[10px] border border-border bg-popover shadow-[0_12px_32px_var(--shadow-soft)]"
              : "h-8 w-8",
            "-translate-y-full",
          )}
          data-testid="composer-ai-edit-surface"
          style={{ height: `${surfaceHeight}px`, left, top: selection.rect.top - 8 }}
        >
          {editState === "preview" ? (
            <div ref={contentRef} className="space-y-2 px-2 pb-1 pt-2">
              <div className="max-h-36 overflow-y-auto whitespace-pre-wrap rounded-[6px] bg-surface-muted px-2.5 py-2 leading-5">
                {result}
              </div>
              <div className="flex items-center justify-between gap-2 px-0.5 pb-1">
                <Button
                  aria-label="重新生成 AI 助写建议"
                  className="h-7 rounded-[7px] px-1.5 text-xs"
                  onClick={() => void requestRewrite(activeAction ?? "polish")}
                  onMouseDown={(event) => event.preventDefault()}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <HugeiconsIcon aria-hidden="true" icon={AiAutoRotateIcon} size={13} />
                  重新生成
                </Button>
                <div className="flex items-center gap-1">
                  <Button
                    aria-label="放弃 AI 助写建议"
                    className="h-7 rounded-[7px] px-1.5 text-xs"
                    onClick={close}
                    onMouseDown={(event) => event.preventDefault()}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    <HugeiconsIcon aria-hidden="true" icon={Cancel01Icon} size={13} />
                    放弃
                  </Button>
                  <Button
                    aria-label="采用 AI 助写建议"
                    className="h-7 rounded-[7px] px-2 text-xs"
                    onClick={applyResult}
                    onMouseDown={(event) => event.preventDefault()}
                    size="sm"
                    type="button"
                  >
                    <HugeiconsIcon aria-hidden="true" icon={CheckmarkCircle02Icon} size={13} />
                    采用
                  </Button>
                </div>
              </div>
            </div>
          ) : editState === "loading" ? (
            <div ref={contentRef} className="flex items-center justify-between gap-2 px-2.5 py-2 text-muted-foreground" role="status">
              <div className="flex items-center gap-2">
                <ComposerAiAssistantAvatar
                  gazeRef={assistantGazeRef}
                  size={24}
                  thinking
                />
                <ShinyText duration={1.15}>
                  正在生成
                </ShinyText>
              </div>
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label="终止生成"
                      className="h-5 w-5 rounded-full bg-foreground p-0 text-background shadow-none hover:bg-foreground/80 hover:text-background"
                      onClick={cancelRewrite}
                      onMouseDown={(event) => event.preventDefault()}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <HugeiconsIcon
                        aria-hidden="true"
                        icon={XIcon}
                        size={12}
                        strokeWidth={1.8}
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={6}>
                    终止生成
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          ) : (
            <DropdownMenu
              open={menuOpen}
              onOpenChange={(open) => {
                setMenuOpen(open);

                if (!open) {
                  setToneMenuOpen(false);
                }
              }}
            >
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <button
                        aria-label="打开 AI 助写菜单"
                        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-[8px] border border-border bg-popover p-0 text-foreground shadow-[0_4px_12px_var(--shadow-soft)] outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
                        onMouseDown={(event) => event.preventDefault()}
                        type="button"
                      >
                        <ComposerAiAssistantAvatar
                          gazeRef={assistantGazeRef}
                          size={24}
                        />
                      </button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={6}>
                    AI 助写
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <DropdownMenuContent
                align="start"
                side="top"
                sideOffset={8}
              >
                <DropdownMenuLabel className="font-medium text-[12px] text-muted-foreground/60">
                  AI 助写
                </DropdownMenuLabel>
                {PRIMARY_ACTIONS.map(({ action, icon, label }) => (
                  <DropdownMenuItem
                    className="gap-2 font-normal"
                    disabled={
                      action === "shorten" &&
                      selection.text.length < SHORTEN_ACTION_MIN_LENGTH
                    }
                    key={action}
                    onSelect={() => void requestRewrite(action)}
                  >
                    <HugeiconsIcon
                      aria-hidden="true"
                      icon={icon}
                      size={16}
                      strokeWidth={1.8}
                    />
                    {label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSub onOpenChange={setToneMenuOpen} open={toneMenuOpen}>
                  <DropdownMenuSubTrigger
                    className="font-normal"
                    onClick={() => setToneMenuOpen(true)}
                  >
                    <HugeiconsIcon
                      aria-hidden="true"
                      icon={MuteIcon}
                      size={16}
                      strokeWidth={1.8}
                    />
                    改变语气
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {TONE_ACTIONS.map(({ action, icon, label }) => (
                      <DropdownMenuItem
                        className="gap-2 font-normal"
                        key={action}
                        onSelect={() => void requestRewrite(action)}
                      >
                        <HugeiconsIcon
                          aria-hidden="true"
                          icon={icon}
                          size={16}
                          strokeWidth={1.8}
                        />
                        {label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      ) : null}
    </>
  );
}

function ComposerAiAssistantAvatar({
  gazeRef,
  size,
  thinking: isThinking = false,
}: {
  gazeRef?: ReturnType<typeof useGaze>["ref"];
  size: number;
  thinking?: boolean;
}) {
  return (
    <Blobatar
      ref={gazeRef}
      animate="always"
      data-assistant-id={COMPOSER_AI_ASSISTANT_ID}
      data-testid="composer-ai-assistant-avatar"
      expression={isThinking ? thinking : undefined}
      name={COMPOSER_AI_ASSISTANT_ID}
      size={size}
      traits={{ shape: 0.11, "body.r": 0.999, hue: 0.815, tone: 0.36 }}
    />
  );
}

function isQuotaUnavailableError(error: unknown) {
  return (
    error instanceof RequestNormalizedError &&
    error.code === "COMPOSER_AI_EDIT_QUOTA_UNAVAILABLE"
  );
}

function getRewriteErrorMessage(error: unknown) {
  if (!(error instanceof RequestNormalizedError)) {
    return "操作失败，请稍后重试";
  }

  if (error.code === "COMPOSER_AI_EDIT_RESPONSE_TOO_LONG") {
    return "内容超过字数限制，请缩短后重试";
  }

  if (error.code === "COMPOSER_AI_EDIT_QUOTA_EXCEEDED") {
    return "今日 AI 助写次数已用完";
  }

  return "操作失败，请稍后重试";
}
