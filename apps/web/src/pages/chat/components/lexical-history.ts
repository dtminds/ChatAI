import { useEffect, useRef } from "react";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { EditorUpdateOptions, LexicalEditor } from "lexical";
import { CLEAR_HISTORY_COMMAND } from "lexical";

export { HistoryPlugin };

export const SKIP_CONTROLLED_EDITOR_SYNC_TAG = "skip-controlled-editor-sync";

export function updateEditorWithoutHistory(
  editor: LexicalEditor,
  update: () => boolean | void,
  options: EditorUpdateOptions = {},
) {
  let shouldClearHistory = true;
  const tags = Array.isArray(options.tag)
    ? [...options.tag, SKIP_CONTROLLED_EDITOR_SYNC_TAG]
    : options.tag
      ? [options.tag, SKIP_CONTROLLED_EDITOR_SYNC_TAG]
      : SKIP_CONTROLLED_EDITOR_SYNC_TAG;

  editor.update(() => {
    shouldClearHistory = update() !== false;
  }, {
    ...options,
    discrete: true,
    tag: tags,
    onUpdate: () => {
      options.onUpdate?.();
      if (shouldClearHistory) {
        editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
      }
    },
  });
}

export function HistoryResetPlugin({ resetKey }: { resetKey: string }) {
  const [editor] = useLexicalComposerContext();
  const previousResetKeyRef = useRef(resetKey);

  useEffect(() => {
    if (previousResetKeyRef.current === resetKey) {
      return;
    }

    previousResetKeyRef.current = resetKey;
    editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
  }, [editor, resetKey]);

  return null;
}
