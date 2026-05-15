import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  PASTE_COMMAND,
  TextNode,
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
  UPDATE_COMPOSER_IMAGE_COMMAND,
} from "@/pages/chat/components/composer/lexical-commands";
import {
  $clearComposer,
  $replaceWechatEmojiTokens,
  $exportComposerSegments,
  $getComposerPlainText,
  $insertComposerImage,
  $insertComposerMention,
  $insertComposerText,
  $removeComposerTextRange,
  $updateComposerImage,
} from "@/pages/chat/components/composer/lexical-utils";
import { toWechatEmojiToken } from "@/pages/chat/wechat-emoji";

type ComposerRuntimePluginProps = {
  canSendMessage: boolean;
  inputEnterBehavior: InputEnterBehavior;
  isMentionPickerOpen: boolean;
  onDraftTextChange: (draftText: string) => void;
  onEscapeMentionPicker: () => void;
  onMoveMentionPicker: (direction: "down" | "up") => void;
  onPasteImageFiles: (files: File[]) => void | Promise<void>;
  onSendSegments: (segments: ComposerSegment[]) => void;
  onSegmentsChange: (segments: ComposerSegment[]) => void;
  onSelectActiveMention: () => void;
  registerEditor: (editor: LexicalEditor | null) => void;
};

export function ComposerRuntimePlugin({
  canSendMessage,
  inputEnterBehavior,
  isMentionPickerOpen,
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
      INSERT_COMPOSER_MENTION_COMMAND,
      (payload) => {
        editor.update(() => {
          $insertComposerMention(payload);
          $insertComposerText(" ");
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand(
      CLEAR_COMPOSER_COMMAND,
      () => {
        editor.update(() => {
          $clearComposer();
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

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

          return false;
        }

        event.preventDefault();
        void onPasteImageFiles(imageFiles);
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, onPasteImageFiles]);

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

        editor.getEditorState().read(() => {
          onSendSegments($exportComposerSegments());
        });
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
          onDraftTextChange($getComposerPlainText());
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
