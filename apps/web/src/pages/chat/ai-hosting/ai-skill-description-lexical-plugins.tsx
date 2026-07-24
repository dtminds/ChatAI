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
import type { SkillContentSegment } from "./ai-skill-resource";
import { skillContentSegmentsEqual } from "./ai-skill-resource";
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
  onChange: (segments: SkillContentSegment[]) => void;
  registerEditor: (editor: LexicalEditor | null) => void;
  segments: SkillContentSegment[];
};

export function SkillDescriptionRuntimePlugin({
  onChange,
  registerEditor,
  segments,
}: SkillDescriptionRuntimePluginProps) {
  const [editor] = useLexicalComposerContext();

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
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  useEffect(() => {
    editor.update(
      () => {
        const currentSegments = $exportSkillContentSegments();

        if (skillContentSegmentsEqual(currentSegments, segments)) {
          return;
        }

        $restoreSkillContentFromSegments(segments);
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
          onChange($exportSkillContentSegments());
        });
      }}
    />
  );
}
