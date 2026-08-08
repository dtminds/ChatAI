import { useEffect, useRef, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import {
  SKIP_CONTROLLED_EDITOR_SYNC_TAG,
  updateEditorWithoutHistory,
} from "@/pages/chat/components/lexical-history";
import {
  COMMAND_PRIORITY_LOW,
  SKIP_DOM_SELECTION_TAG,
  SKIP_SCROLL_INTO_VIEW_TAG,
  SKIP_SELECTION_FOCUS_TAG,
  type LexicalEditor,
} from "lexical";
import type { ConditionalLogicSegment } from "./agent-settings.constants";
import {
  INSERT_CONDITIONAL_LOGIC_KNOWLEDGE_BASE_COMMAND,
  INSERT_CONDITIONAL_LOGIC_SKILL_COMMAND,
  RESTORE_CONDITIONAL_LOGIC_SEGMENTS_COMMAND,
} from "./agent-conditional-logic-lexical-commands";
import {
  $exportConditionalLogicSegments,
  $insertKnowledgeBaseChip,
  $insertSkillChip,
  $restoreConditionalLogicFromSegments,
  segmentsEqual,
  trimConditionalLogicSegmentsToMaxLength,
} from "./agent-conditional-logic-lexical-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type ConditionalLogicRuntimePluginProps = {
  disabled?: boolean;
  historyKey: string;
  maxLength: number;
  onChange: (segments: ConditionalLogicSegment[]) => void;
  registerEditor: (editor: LexicalEditor | null) => void;
  segments: ConditionalLogicSegment[];
};

export function ConditionalLogicRuntimePlugin({
  disabled = false,
  historyKey,
  maxLength,
  onChange,
  registerEditor,
  segments,
}: ConditionalLogicRuntimePluginProps) {
  const [editor] = useLexicalComposerContext();
  const lastEditorChangeRef = useRef<ConditionalLogicSegment[] | null>(null);

  useEffect(() => {
    lastEditorChangeRef.current = null;
  }, [historyKey]);

  useEffect(() => {
    registerEditor(editor);

    return () => registerEditor(null);
  }, [editor, registerEditor]);

  useEffect(() => {
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    return editor.registerCommand(
      INSERT_CONDITIONAL_LOGIC_KNOWLEDGE_BASE_COMMAND,
      (knowledgeBase) => {
        $insertKnowledgeBaseChip(knowledgeBase);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand(
      INSERT_CONDITIONAL_LOGIC_SKILL_COMMAND,
      (skill) => {
        $insertSkillChip(skill);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand(
      RESTORE_CONDITIONAL_LOGIC_SEGMENTS_COMMAND,
      (nextSegments) => {
        updateEditorWithoutHistory(
          editor,
          () => {
            $restoreConditionalLogicFromSegments(
              trimConditionalLogicSegmentsToMaxLength(nextSegments, maxLength),
            );
          },
          {
            tag: [
              SKIP_DOM_SELECTION_TAG,
              SKIP_SELECTION_FOCUS_TAG,
              SKIP_SCROLL_INTO_VIEW_TAG,
            ],
          },
        );
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, maxLength]);

  useEffect(() => {
    const nextSegments = trimConditionalLogicSegmentsToMaxLength(
      segments,
      maxLength,
    );

    if (
      lastEditorChangeRef.current !== null &&
      segmentsEqual(lastEditorChangeRef.current, nextSegments)
    ) {
      return;
    }

    const pendingSegments = editor.read("pending", () =>
      $exportConditionalLogicSegments(),
    );
    if (segmentsEqual(pendingSegments, nextSegments)) {
      return;
    }

    updateEditorWithoutHistory(
      editor,
      () => {
        const currentSegments = $exportConditionalLogicSegments();

        if (segmentsEqual(currentSegments, nextSegments)) {
          return false;
        }

        lastEditorChangeRef.current = null;
        $restoreConditionalLogicFromSegments(nextSegments);
        return true;
      },
      {
        tag: [
          SKIP_DOM_SELECTION_TAG,
          SKIP_SELECTION_FOCUS_TAG,
          SKIP_SCROLL_INTO_VIEW_TAG,
        ],
      },
    );
  }, [editor, maxLength, segments]);

  return (
    <OnChangePlugin
      ignoreHistoryMergeTagChange={false}
      ignoreSelectionChange
      onChange={(editorState, _editor, tags) => {
        if (tags.has(SKIP_CONTROLLED_EDITOR_SYNC_TAG)) {
          return;
        }

        editorState.read(() => {
          const nextSegments = $exportConditionalLogicSegments();
          lastEditorChangeRef.current = nextSegments;
          onChange(nextSegments);
        });
      }}
    />
  );
}

type ResourceTooltipState = {
  height: number;
  label: string;
  left: number;
  top: number;
  width: number;
};

export function ConditionalLogicResourceTooltipPlugin() {
  const [editor] = useLexicalComposerContext();
  const [tooltip, setTooltip] = useState<ResourceTooltipState | null>(null);

  useEffect(() => {
    let activeRoot: HTMLElement | null = null;

    function findInvalidResourceChip(target: EventTarget | null) {
      if (!(target instanceof Element)) {
        return null;
      }

      const chip = target.closest<HTMLElement>(
        '[data-resource-invalid="true"]',
      );

      return chip && activeRoot?.contains(chip) ? chip : null;
    }

    function showTooltip(chip: HTMLElement) {
      const label = chip.dataset.resourceInvalidReason;

      if (!label) {
        return;
      }

      const rect = chip.getBoundingClientRect();
      setTooltip({
        height: Math.max(rect.height, 1),
        label,
        left: rect.left,
        top: rect.top,
        width: Math.max(rect.width, 1),
      });
    }

    function handlePointerOver(event: PointerEvent) {
      const chip = findInvalidResourceChip(event.target);

      if (chip) {
        showTooltip(chip);
      }
    }

    function handlePointerOut(event: PointerEvent) {
      const chip = findInvalidResourceChip(event.target);
      const nextChip = findInvalidResourceChip(event.relatedTarget);

      if (chip && chip !== nextChip) {
        setTooltip(null);
      }
    }

    function handleFocusIn(event: FocusEvent) {
      const chip = findInvalidResourceChip(event.target);

      if (chip) {
        showTooltip(chip);
      }
    }

    function handleFocusOut(event: FocusEvent) {
      const chip = findInvalidResourceChip(event.target);
      const nextChip = findInvalidResourceChip(event.relatedTarget);

      if (chip && chip !== nextChip) {
        setTooltip(null);
      }
    }

    function detachRoot(root: HTMLElement) {
      root.removeEventListener("pointerover", handlePointerOver);
      root.removeEventListener("pointerout", handlePointerOut);
      root.removeEventListener("focusin", handleFocusIn);
      root.removeEventListener("focusout", handleFocusOut);
    }

    const unregisterRootListener = editor.registerRootListener(
      (root, previousRoot) => {
        if (previousRoot) {
          detachRoot(previousRoot);
        }

        activeRoot = root;

        if (!root) {
          setTooltip(null);
          return;
        }

        root.addEventListener("pointerover", handlePointerOver);
        root.addEventListener("pointerout", handlePointerOut);
        root.addEventListener("focusin", handleFocusIn);
        root.addEventListener("focusout", handleFocusOut);
      },
    );

    function hideTooltip() {
      setTooltip(null);
    }

    window.addEventListener("resize", hideTooltip);
    window.addEventListener("scroll", hideTooltip, true);

    return () => {
      unregisterRootListener();
      if (activeRoot) {
        detachRoot(activeRoot);
      }
      window.removeEventListener("resize", hideTooltip);
      window.removeEventListener("scroll", hideTooltip, true);
    };
  }, [editor]);

  if (!tooltip) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip open>
        <TooltipTrigger asChild>
          <span
            aria-hidden="true"
            className="pointer-events-none fixed opacity-0"
            style={{
              height: tooltip.height,
              left: tooltip.left,
              top: tooltip.top,
              width: tooltip.width,
            }}
          />
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          {tooltip.label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
