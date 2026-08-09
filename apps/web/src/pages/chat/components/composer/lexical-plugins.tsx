import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { $restoreEditorState } from "@lexical/utils";
import { updateEditorWithoutHistory } from "@/pages/chat/components/lexical-history";
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  PASTE_COMMAND,
  RootNode,
  TextNode,
  type EditorState,
  type LexicalEditor,
} from "lexical";
import type { InputEnterBehavior } from "@/pages/chat/components/input-enter-behavior";
import {
  normalizeComposerSegments,
  type ComposerSegment,
} from "@/pages/chat/lib/composer-segments";
import {
  isSupportedComposerImageFile,
  isSupportedComposerImageMimeType,
} from "@/pages/chat/lib/composer-image-files";
import {
  CLEAR_COMPOSER_COMMAND,
  INSERT_COMPOSER_EMOJI_COMMAND,
  INSERT_COMPOSER_IMAGE_COMMAND,
  INSERT_COMPOSER_MENTION_COMMAND,
  INSERT_COMPOSER_TEXT_COMMAND,
  RESTORE_COMPOSER_COMMAND,
  UPDATE_COMPOSER_IMAGE_COMMAND,
} from "@/pages/chat/components/composer/lexical-commands";
import {
  $clearComposer,
  $replaceWechatEmojiTokens,
  $exportComposerSegments,
  $getComposerPlainText,
  $getComposerPlainTextCursorOffset,
  $getComposerTextCharacterCount,
  $insertComposerImage,
  $insertComposerMention,
  $insertComposerText,
  $insertComposerTextWithinMaxLength,
  $removeComposerTextRange,
  $restoreComposerFromSegments,
  $trimComposerTextToMaxLength,
  $updateComposerImage,
} from "@/pages/chat/components/composer/lexical-utils";
import { toWechatEmojiToken } from "@/pages/chat/wechat-emoji";

type ComposerRuntimePluginProps = {
  canSendMessage: boolean;
  inputEnterBehavior: InputEnterBehavior;
  isMentionPickerOpen: boolean;
  maxTextLength: number;
  onDraftTextChange: (draftText: string, cursorPosition: number) => void;
  onEscapeMentionPicker: () => void;
  onMoveMentionPicker: (direction: "down" | "up") => void;
  onPasteImageFiles: (files: File[]) => void | Promise<void>;
  onSendSegments: (segments: ComposerSegment[]) => void;
  onSegmentsChange: (segments: ComposerSegment[]) => void;
  onSelectActiveMention: () => void;
  registerEditor: (editor: LexicalEditor | null) => void;
};

export function ComposerMaxLengthPlugin({ maxLength }: { maxLength: number }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    let lastRestoredEditorState: EditorState | null = null;

    return editor.registerNodeTransform(RootNode, () => {
      const selection = $getSelection();

      if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
        return;
      }

      const previousEditorState = editor.getEditorState();
      const characterCount = $getComposerTextCharacterCount();

      if (characterCount <= maxLength) {
        return;
      }

      if (lastRestoredEditorState === previousEditorState) {
        return;
      }

      lastRestoredEditorState = previousEditorState;
      $restoreEditorState(editor, previousEditorState);
    });
  }, [editor, maxLength]);

  return null;
}

export function ComposerRuntimePlugin({
  canSendMessage,
  inputEnterBehavior,
  isMentionPickerOpen,
  maxTextLength,
  onDraftTextChange,
  onEscapeMentionPicker,
  onMoveMentionPicker,
  onPasteImageFiles,
  onSelectActiveMention,
  onSendSegments,
  onSegmentsChange,
  registerEditor,
}: ComposerRuntimePluginProps) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    registerEditor(editor);

    return () => registerEditor(null);
  }, [editor, registerEditor]);

  useEffect(() => {
    editor.setEditable(canSendMessage);
  }, [canSendMessage, editor]);

  useEffect(() => {
    return editor.registerNodeTransform(TextNode, (node) => {
      if ($isTextNode(node)) {
        $replaceWechatEmojiTokens(node);
      }
    });
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand(
      INSERT_COMPOSER_EMOJI_COMMAND,
      (emoji) => {
        editor.update(() => {
          $insertComposerText(toWechatEmojiToken(emoji.name));
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand(
      INSERT_COMPOSER_IMAGE_COMMAND,
      (payload) => {
        editor.update(() => {
          $insertComposerImage(payload);
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand(
      UPDATE_COMPOSER_IMAGE_COMMAND,
      (payload) => {
        editor.update(() => {
          $updateComposerImage(payload);
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand(
      INSERT_COMPOSER_TEXT_COMMAND,
      (text) => {
        editor.update(() => {
          $insertComposerTextWithinMaxLength(text, maxTextLength);
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, maxTextLength]);

  useEffect(() => {
    return editor.registerCommand(
      INSERT_COMPOSER_MENTION_COMMAND,
      (payload) => {
        editor.update(() => {
          $insertComposerMention(payload);
          $insertComposerTextWithinMaxLength(" ", maxTextLength);
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, maxTextLength]);

  useEffect(() => {
    return editor.registerCommand(
      CLEAR_COMPOSER_COMMAND,
      () => {
        updateEditorWithoutHistory(editor, () => {
          $clearComposer();
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand(
      RESTORE_COMPOSER_COMMAND,
      (payload) => {
        updateEditorWithoutHistory(editor, () => {
          $restoreComposerFromSegments(payload.segments);
          $trimComposerTextToMaxLength(maxTextLength);
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, maxTextLength]);

  useEffect(() => {
    return editor.registerCommand(
      CONTROLLED_TEXT_INSERTION_COMMAND,
      (eventOrText) => {
        const text = getControlledInsertionText(eventOrText);
        const selection = $getSelection();

        if (text === null || !$isRangeSelection(selection)) {
          return false;
        }

        $insertComposerTextWithinMaxLength(text, maxTextLength);
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, maxTextLength]);

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        const clipboardData = getEventClipboardData(event);
        const imageFiles = getClipboardImageFiles(clipboardData);

        if (imageFiles.length === 0) {
          if (hasClipboardImageFile(clipboardData)) {
            event.preventDefault();
            return true;
          }

          const text = clipboardData?.getData("text/plain");

          if (text === undefined) {
            return false;
          }

          event.preventDefault();
          editor.update(() => {
            $insertComposerTextWithinMaxLength(text, maxTextLength);
          });
          return true;
        }

        event.preventDefault();
        void onPasteImageFiles(imageFiles);
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, maxTextLength, onPasteImageFiles]);

  useEffect(() => {
    return editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (event) => {
        if (!isMentionPickerOpen) {
          return false;
        }

        event.preventDefault();
        onMoveMentionPicker("down");
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, isMentionPickerOpen, onMoveMentionPicker]);

  useEffect(() => {
    return editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      (event) => {
        if (!isMentionPickerOpen) {
          return false;
        }

        event.preventDefault();
        onMoveMentionPicker("up");
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, isMentionPickerOpen, onMoveMentionPicker]);

  useEffect(() => {
    return editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      (event) => {
        if (!isMentionPickerOpen) {
          return false;
        }

        event.preventDefault();
        onEscapeMentionPicker();
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, isMentionPickerOpen, onEscapeMentionPicker]);

  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (isMentionPickerOpen) {
          event?.preventDefault();
          onSelectActiveMention();
          return true;
        }

        const shouldSend =
          inputEnterBehavior === "newline" ? event?.shiftKey : !event?.shiftKey;

        if (!shouldSend) {
          event?.preventDefault();
          const selection = $getSelection();

          if ($isRangeSelection(selection)) {
            selection.insertLineBreak(false);
          }

          return true;
        }

        event?.preventDefault();
        if (!canSendMessage) {
          return true;
        }

        let exportedSegments: ComposerSegment[] = [];
        editor.getEditorState().read(() => {
          exportedSegments = $exportComposerSegments();
        });
        onSendSegments(exportedSegments);
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [
    editor,
    canSendMessage,
    inputEnterBehavior,
    isMentionPickerOpen,
    onSelectActiveMention,
    onSendSegments,
  ]);

  return (
    <OnChangePlugin
      onChange={(editorState) => {
        editorState.read(() => {
          onDraftTextChange(
            $getComposerPlainText(),
            $getComposerPlainTextCursorOffset(),
          );
          onSegmentsChange(normalizeComposerSegments($exportComposerSegments()));
        });
      }}
    />
  );
}

export function MentionTextRemovalPlugin({
  pendingRemoval,
  onRemovalComplete,
}: {
  pendingRemoval: { end: number; start: number } | null;
  onRemovalComplete: () => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!pendingRemoval) {
      return;
    }

    editor.update(() => {
      $removeComposerTextRange(pendingRemoval.start, pendingRemoval.end);
    });
    onRemovalComplete();
  }, [editor, onRemovalComplete, pendingRemoval]);

  return null;
}

function getClipboardImageFiles(clipboardData: DataTransfer | null) {
  if (!clipboardData) {
    return [];
  }

  const files = Array.from(clipboardData.files).filter(isSupportedComposerImageFile);

  if (files.length > 0) {
    return files;
  }

  return Array.from(clipboardData.items ?? [])
    .filter(
      (item) =>
        item.kind === "file" && isSupportedComposerImageMimeType(item.type),
    )
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}

function hasClipboardImageFile(clipboardData: DataTransfer | null) {
  if (!clipboardData) {
    return false;
  }

  const files = Array.from(clipboardData.files ?? []);

  if (files.some((file) => file.type.startsWith("image/"))) {
    return true;
  }

  return Array.from(clipboardData.items ?? []).some(
    (item) => item.kind === "file" && item.type.startsWith("image/"),
  );
}

function getEventClipboardData(event: ClipboardEvent | InputEvent | KeyboardEvent) {
  return "clipboardData" in event ? event.clipboardData : null;
}

function getControlledInsertionText(eventOrText: InputEvent | string) {
  if (typeof eventOrText === "string") {
    return eventOrText;
  }

  if (eventOrText.dataTransfer) {
    return eventOrText.dataTransfer.getData("text/plain");
  }

  return eventOrText.data;
}
