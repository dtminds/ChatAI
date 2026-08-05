import { useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import {
  COMMAND_PRIORITY_LOW,
  SKIP_DOM_SELECTION_TAG,
  SKIP_SCROLL_INTO_VIEW_TAG,
  SKIP_SELECTION_FOCUS_TAG,
  type LexicalEditor,
} from "lexical";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SkillContentSegment } from "./ai-skill-resource";
import {
  skillContentSegmentsEqual,
  trimSkillContentSegmentsToMaxLength,
} from "./ai-skill-resource";
import {
  INSERT_SKILL_CONTENT_RESOURCE_COMMAND,
  RESTORE_SKILL_CONTENT_SEGMENTS_COMMAND,
} from "./ai-skill-description-lexical-commands";
import {
  $exportSkillContentSegments,
  $insertSkillContentResource,
  $restoreSkillContentFromSegments,
} from "./ai-skill-description-lexical-utils";

type SkillDescriptionRuntimePluginProps = {
  disabled?: boolean;
  maxLength: number;
  onChange: (segments: SkillContentSegment[]) => void;
  registerEditor: (editor: LexicalEditor | null) => void;
  segments: SkillContentSegment[];
};

export function SkillDescriptionRuntimePlugin({
  disabled = false,
  maxLength,
  onChange,
  registerEditor,
  segments,
}: SkillDescriptionRuntimePluginProps) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    registerEditor(editor);

    return () => registerEditor(null);
  }, [editor, registerEditor]);

  useEffect(() => {
    return editor.registerCommand(
      INSERT_SKILL_CONTENT_RESOURCE_COMMAND,
      (resource) => {
        editor.update(() => {
          $insertSkillContentResource(resource);
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand(
      RESTORE_SKILL_CONTENT_SEGMENTS_COMMAND,
      (nextSegments) => {
        editor.update(
          () => {
            $restoreSkillContentFromSegments(
              trimSkillContentSegmentsToMaxLength(nextSegments, maxLength),
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
    editor.update(
      () => {
        const currentSegments = $exportSkillContentSegments();

        const nextSegments = trimSkillContentSegmentsToMaxLength(
          segments,
          maxLength,
        );

        if (skillContentSegmentsEqual(currentSegments, nextSegments)) {
          return;
        }

        $restoreSkillContentFromSegments(nextSegments);
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
      onChange={() => {
        editor.getEditorState().read(() => {
          onChange($exportSkillContentSegments());
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

export function SkillDescriptionResourceTooltipPlugin() {
  const [editor] = useLexicalComposerContext();
  const [tooltip, setTooltip] = useState<ResourceTooltipState | null>(null);

  useEffect(() => {
    let activeRoot: HTMLElement | null = null;

    function findInvalidResourceChip(target: EventTarget | null) {
      if (!(target instanceof Element)) {
        return null;
      }

      const chip = target.closest<HTMLElement>('[data-resource-invalid="true"]');
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
