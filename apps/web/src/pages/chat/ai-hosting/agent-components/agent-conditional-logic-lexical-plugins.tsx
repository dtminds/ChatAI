import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
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
  RESTORE_CONDITIONAL_LOGIC_SEGMENTS_COMMAND,
} from "./agent-conditional-logic-lexical-commands";
import {
  $exportConditionalLogicSegments,
  $insertKnowledgeBaseChip,
  $restoreConditionalLogicFromSegments,
  segmentsEqual,
} from "./agent-conditional-logic-lexical-utils";

type ConditionalLogicRuntimePluginProps = {
  disabled?: boolean;
  onChange: (segments: ConditionalLogicSegment[]) => void;
  registerEditor: (editor: LexicalEditor | null) => void;
  segments: ConditionalLogicSegment[];
};

export function ConditionalLogicRuntimePlugin({
  disabled = false,
  onChange,
  registerEditor,
  segments,
}: ConditionalLogicRuntimePluginProps) {
  const [editor] = useLexicalComposerContext();

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
        editor.update(() => {
          $insertKnowledgeBaseChip(knowledgeBase);
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand(
      RESTORE_CONDITIONAL_LOGIC_SEGMENTS_COMMAND,
      (nextSegments) => {
        editor.update(
          () => {
            $restoreConditionalLogicFromSegments(nextSegments);
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
  }, [editor]);

  useEffect(() => {
    editor.update(
      () => {
        const currentSegments = $exportConditionalLogicSegments();

        if (segmentsEqual(currentSegments, segments)) {
          return;
        }

        $restoreConditionalLogicFromSegments(segments);
      },
      {
        tag: [
          SKIP_DOM_SELECTION_TAG,
          SKIP_SELECTION_FOCUS_TAG,
          SKIP_SCROLL_INTO_VIEW_TAG,
        ],
      },
    );
  }, [editor, segments]);

  return (
    <OnChangePlugin
      onChange={() => {
        editor.getEditorState().read(() => {
          onChange($exportConditionalLogicSegments());
        });
      }}
    />
  );
}
