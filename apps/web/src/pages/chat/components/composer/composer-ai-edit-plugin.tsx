import { useCallback, useEffect, useRef, useState } from "react";
import { AiChat02Icon, Cancel01Icon, CheckmarkCircle02Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type {
  ComposerAiEditAction,
  ComposerAiEditResponse,
} from "@chatai/contracts";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getWorkbenchService } from "@/pages/chat/api/workbench-service";
import {
  $getComposerTextSelectionSnapshot,
  $replaceComposerTextSelection,
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

const ACTIONS: Array<{
  action: Exclude<ComposerAiEditAction, "custom">;
  label: string;
}> = [
  { action: "polish", label: "润色表达" },
  { action: "shorten", label: "更简洁" },
  { action: "polite", label: "更礼貌" },
  { action: "professional", label: "更专业" },
];

export function ComposerAiEditPlugin({
  canEdit,
  conversationId,
}: ComposerAiEditPluginProps) {
  const [editor] = useLexicalComposerContext();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [editState, setEditState] = useState<EditState>("menu");
  const [activeAction, setActiveAction] = useState<ComposerAiEditAction | null>(null);
  const [customInstruction, setCustomInstruction] = useState("");
  const [result, setResult] = useState("");

  const readSelection = useCallback(() => {
    if (editState === "preview" || editState === "loading") {
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

    const rect = range?.getBoundingClientRect?.() ?? (range ? new DOMRect() : null);

    if (!rect) {
      return;
    }

    setSelection({ ...snapshot, rect });
    setEditState((current) => (current === "preview" || current === "loading" ? current : "menu"));
  }, [canEdit, editState, editor]);

  useEffect(() => {
    const unregister = editor.registerUpdateListener(() => {
      readSelection();
    });
    const handleSelectionChange = () => readSelection();
    const handleViewportChange = () => {
      if (selection) {
        readSelection();
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      unregister();
      document.removeEventListener("selectionchange", handleSelectionChange);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [editor, readSelection, selection]);

  useEffect(() => {
    if (!canEdit) {
      setSelection(null);
      setEditState("menu");
      setActiveAction(null);
      setResult("");
    }
  }, [canEdit]);

  const close = useCallback(() => {
    requestIdRef.current += 1;
    setSelection(null);
    setEditState("menu");
    setActiveAction(null);
    setCustomInstruction("");
    setResult("");
  }, []);

  const requestRewrite = useCallback(
    async (action: ComposerAiEditAction, instruction?: string) => {
      if (!selection || !conversationId) {
        return;
      }

      const requestId = ++requestIdRef.current;
      setActiveAction(action);
      setEditState("loading");

      try {
        const response: ComposerAiEditResponse = await getWorkbenchService().rewriteComposerText({
          action,
          content: selection.text,
          conversationId,
          ...(instruction?.trim() ? { instruction: instruction.trim() } : {}),
        });

        if (requestId !== requestIdRef.current) {
          return;
        }

        setResult(response.content);
        setEditState("preview");
      } catch {
        if (requestId === requestIdRef.current) {
          setEditState("menu");
          toast.error("AI 编辑失败，请稍后重试");
        }
      }
    },
    [conversationId, selection],
  );

  const applyResult = useCallback(() => {
    if (!selection || !result) {
      return;
    }

    let applied = false;
    editor.update(() => {
      applied = $replaceComposerTextSelection(
        selection,
        result,
        COMPOSER_TEXT_MAX_LENGTH,
      );
    });

    if (!applied) {
      toast.error("原文已变化，请重新选择");
      close();
      return;
    }

    close();
    editor.focus();
  }, [close, editor, result, selection]);

  if (!selection || !canEdit || !conversationId) {
    return null;
  }

  const top = Math.max(8, selection.rect.top - 8);
  const left = Math.max(8, Math.min(selection.rect.left, window.innerWidth - 360));

  return (
    <div
      ref={surfaceRef}
      className="fixed z-50 w-[min(22rem,calc(100vw-1rem))] -translate-y-full rounded-[10px] border border-border bg-popover p-1.5 text-[13px] text-popover-foreground shadow-[0_12px_32px_var(--shadow-soft)]"
      data-testid="composer-ai-edit-surface"
      style={{ left, top }}
    >
      {editState === "preview" ? (
        <div className="space-y-2 p-1">
          <div className="flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
            <HugeiconsIcon aria-hidden="true" icon={AiChat02Icon} size={14} />
            AI 建议
          </div>
          <div className="max-h-36 overflow-y-auto whitespace-pre-wrap rounded-[6px] bg-surface-muted px-2.5 py-2 leading-5">
            {result}
          </div>
          <div className="flex justify-end gap-1">
            <Button aria-label="放弃 AI 建议" onClick={close} onMouseDown={(event) => event.preventDefault()} size="sm" type="button" variant="ghost">
              <HugeiconsIcon aria-hidden="true" icon={Cancel01Icon} size={14} />
              放弃
            </Button>
            <Button aria-label="重新生成 AI 建议" onClick={() => void requestRewrite(activeAction ?? "polish", customInstruction)} onMouseDown={(event) => event.preventDefault()} size="sm" type="button" variant="ghost">
              <HugeiconsIcon aria-hidden="true" icon={RefreshIcon} size={14} />
              重新生成
            </Button>
            <Button aria-label="采用 AI 建议" onClick={applyResult} onMouseDown={(event) => event.preventDefault()} size="sm" type="button">
              <HugeiconsIcon aria-hidden="true" icon={CheckmarkCircle02Icon} size={14} />
              采用
            </Button>
          </div>
        </div>
      ) : editState === "loading" ? (
        <div className="flex items-center gap-2 px-2.5 py-2 text-muted-foreground" role="status">
          <HugeiconsIcon aria-hidden="true" className="animate-pulse" icon={AiChat02Icon} size={14} />
          正在生成
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          <span className="px-1.5 text-xs text-muted-foreground">AI 编辑</span>
          {ACTIONS.map(({ action, label }) => (
            <button
              className="rounded-[6px] px-2 py-1.5 text-left outline-none hover:bg-surface-hover focus-visible:ring-1 focus-visible:ring-ring"
              key={action}
              onClick={() => void requestRewrite(action)}
              onMouseDown={(event) => event.preventDefault()}
              type="button"
            >
              {label}
            </button>
          ))}
          <input
            aria-label="自定义 AI 编辑要求"
            className="min-w-28 flex-1 rounded-[6px] border border-input bg-background px-2 py-1.5 text-[13px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
            maxLength={200}
            onChange={(event) => setCustomInstruction(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && customInstruction.trim()) {
                event.preventDefault();
                void requestRewrite("custom", customInstruction);
              }
            }}
            placeholder="自定义要求"
            value={customInstruction}
          />
        </div>
      )}
    </div>
  );
}
