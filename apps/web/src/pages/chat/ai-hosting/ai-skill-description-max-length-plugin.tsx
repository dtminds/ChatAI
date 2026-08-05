import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  PASTE_COMMAND,
  RootNode,
} from "lexical";
import { INSERT_SKILL_CONTENT_RESOURCE_COMMAND } from "./ai-skill-description-lexical-commands";
import { $trimSkillContentToMaxLength } from "./ai-skill-description-lexical-utils";

export function SkillDescriptionMaxLengthPlugin({
  maxLength,
}: {
  maxLength: number;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerNodeTransform(RootNode, () => {
      if ($getRoot().getTextContentSize() > maxLength) {
        $trimSkillContentToMaxLength(maxLength);
      }
    });
  }, [editor, maxLength]);

  useEffect(() => {
    return editor.registerCommand(
      CONTROLLED_TEXT_INSERTION_COMMAND,
      (eventOrText) => {
        const text = getControlledInsertionText(eventOrText);
        if (text === null) {
          return false;
        }

        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return false;
        }

        selection.insertRawText(
          text.slice(0, getRemainingCharacterCount(maxLength)),
        );
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, maxLength]);

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        const clipboardData = "clipboardData" in event ? event.clipboardData : null;
        const text = clipboardData?.getData("text/plain");
        if (text === undefined) {
          return false;
        }

        event.preventDefault();
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            selection.insertRawText(
              text.slice(0, getRemainingCharacterCount(maxLength)),
            );
          }
        });
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, maxLength]);

  useEffect(() => {
    return editor.registerCommand(
      INSERT_SKILL_CONTENT_RESOURCE_COMMAND,
      (resource) =>
        resource.name.length + 1 > getRemainingCharacterCount(maxLength),
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, maxLength]);

  return null;
}

function getRemainingCharacterCount(maxLength: number) {
  const selection = $getSelection();
  const selectedTextLength = $isRangeSelection(selection)
    ? selection.getTextContent().length
    : 0;

  return Math.max(
    0,
    maxLength - ($getRoot().getTextContentSize() - selectedTextLength),
  );
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
