import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AiMagicIcon,
  AiContentGenerator02Icon,
  AiAutoRotateIcon,
  NerdIcon,
  MuteIcon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  ExpandParagraphIcon,
  MagicWand01Icon,
  Minimize01Icon,
  Sad01Icon,
  SmileIcon,
  TongueWinkRightIcon,
  XIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type {
  ComposerAiEditAction,
  ComposerAiEditResponse,
} from "@chatai/contracts";
import { Button } from "@/components/ui/button";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";
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

function isSameSelection(
  left: SelectionState,
  right: ComposerTextSelectionSnapshot,
) {
  return (
    left.anchorKey === right.anchorKey &&
    left.anchorOffset === right.anchorOffset &&
    left.anchorType === right.anchorType &&
    left.focusKey === right.focusKey &&
    left.focusOffset === right.focusOffset &&
    left.focusType === right.focusType &&
    left.text === right.text
  );
}

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
  const selectionRef = useRef<SelectionState | null>(null);
  const isMouseSelectingRef = useRef(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [surfaceHeight, setSurfaceHeight] = useState(28);

  const readSelection = useCallback(() => {
    if (
      isMouseSelectingRef.current ||
      editState === "preview" ||
      editState === "loading" ||
      menuOpen
    ) {
      return;
    }

    let nextSnapshot: ComposerTextSelectionSnapshot | null = null;

    editor.getEditorState().read(() => {
      nextSnapshot = $getComposerTextSelectionSnapshot();
    });

    const snapshot = nextSnapshot as ComposerTextSelectionSnapshot | null;

    if (!snapshot || !canEdit) {
      if (surfaceRef.current?.contains(document.activeElement)) {
        return;
      }

      selectionRef.current = null;
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

      selectionRef.current = null;
      setSelection(null);
      setEditState("menu");
      return;
    }

    const rect = range?.getBoundingClientRect?.() ?? (range ? new DOMRect() : null);

    if (!rect) {
      return;
    }

    if (
      selectionRef.current &&
      !isSameSelection(selectionRef.current, snapshot)
    ) {
      setMenuOpen(false);
      setToneMenuOpen(false);
    }

    const nextSelection = { ...snapshot, rect };
    selectionRef.current = nextSelection;
    setSelection(nextSelection);
    setEditState((current) => (current === "preview" || current === "loading" ? current : "menu"));
  }, [canEdit, editState, editor, menuOpen]);

  useEffect(() => {
    const unregister = editor.registerUpdateListener(() => {
      readSelection();
    });
    const handleSelectionChange = () => readSelection();
    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) {
        return;
      }

      const rootElement = editor.getRootElement();
      const target = event.target;

      if (!rootElement || !target || !rootElement.contains(target as Node)) {
        return;
      }

      isMouseSelectingRef.current = true;

      if (editState === "menu") {
        selectionRef.current = null;
        setSelection(null);
        setMenuOpen(false);
        setToneMenuOpen(false);
      }
    };
    const handleMouseUp = () => {
      if (!isMouseSelectingRef.current) {
        return;
      }

      isMouseSelectingRef.current = false;
      window.setTimeout(readSelection, 0);
    };
    const handleViewportChange = () => {
      if (selection) {
        readSelection();
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("blur", handleMouseUp);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      unregister();
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("blur", handleMouseUp);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [editor, readSelection, selection]);

  const close = useCallback(() => {
    requestIdRef.current += 1;
    requestAbortControllerRef.current?.abort();
    requestAbortControllerRef.current = null;
    selectionRef.current = null;
    setSelection(null);
    setEditState("menu");
    setMenuOpen(false);
    setToneMenuOpen(false);
    setActiveAction(null);
    setResult("");
  }, []);

  useEffect(() => () => {
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
      if (!selection || !conversationId) {
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
            conversationId,
          },
          { signal: abortController.signal },
        );

        if (requestId !== requestIdRef.current) {
          return;
        }

        setResult(response.content);
        setEditState("preview");
      } catch (error) {
        if (requestId === requestIdRef.current) {
          setEditState("menu");
          toast.error(
            error instanceof RequestNormalizedError
              && error.code === "COMPOSER_AI_EDIT_RESPONSE_TOO_LONG"
              ? "内容超过字数限制，请缩短后重试"
              : "操作失败，请稍后重试",
          );
        }
      } finally {
        if (requestAbortControllerRef.current === abortController) {
          requestAbortControllerRef.current = null;
        }
      }
    },
    [conversationId, selection],
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
      setSurfaceHeight(28);
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

  if (!selection || !canEdit || !conversationId) {
    return null;
  }

  const left = Math.max(
    8,
    Math.min(selection.rect.left, window.innerWidth - (isExpanded ? 360 : 40)),
  );

  return (
    <div
      ref={surfaceRef}
      className={cn(
        "fixed z-50 overflow-visible text-[13px] text-popover-foreground transition-[width,height] duration-200 ease-out",
        isExpanded
          ? "w-[min(22rem,calc(100vw-1rem))] overflow-hidden rounded-[10px] border border-border bg-popover shadow-[0_12px_32px_var(--shadow-soft)]"
          : "h-7 w-7",
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
            <DotMatrixLoader
              ariaLabel="正在生成"
              className="text-muted-foreground"
              dotSize={2}
              size={16}
            />
            <ShinyText duration={1.15} shimmerWidth={48}>
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
                    className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-border bg-popover p-0 text-foreground shadow-[0_4px_12px_var(--shadow-soft)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/20"
                    onMouseDown={(event) => event.preventDefault()}
                    type="button"
                  >
                    <HugeiconsIcon
                      aria-hidden="true"
                      icon={MagicWand01Icon}
                      size={16}
                      strokeWidth={1.8}
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
  );
}
