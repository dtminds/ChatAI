import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { COMMAND_PRIORITY_LOW, type LexicalEditor } from "lexical";
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
  onChange: (segments: ConditionalLogicSegment[]) => void;
  registerEditor: (editor: LexicalEditor | null) => void;
  segments: ConditionalLogicSegment[];
};

export function ConditionalLogicRuntimePlugin({
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
    return editor.registerCommand(
      INSERT_CONDITIONAL_LOGIC_KNOWLEDGE_BASE_COMMAND,
      (knowledgeBaseId) => {
        editor.update(() => {
          $insertKnowledgeBaseChip(knowledgeBaseId);
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
        editor.update(() => {
          $restoreConditionalLogicFromSegments(nextSegments);
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  useEffect(() => {
    editor.update(() => {
      const currentSegments = $exportConditionalLogicSegments();

      if (segmentsEqual(currentSegments, segments)) {
        return;
      }

      $restoreConditionalLogicFromSegments(segments);
    });
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
