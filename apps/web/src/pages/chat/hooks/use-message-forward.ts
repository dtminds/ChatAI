import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import type { ChatMessage } from "@/pages/chat/chat-types";
import {
  canForwardMessage,
  MESSAGE_FORWARD_MAX_MESSAGES,
  type MessageForwardMode,
} from "@/pages/chat/lib/message-forward";
import { getMessageFeedItemKey } from "@/pages/chat/components/message-feed";

export function useMessageForward() {
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedMessageKeys, setSelectedMessageKeys] = useState<string[]>([]);
  const [forwardDialogOpen, setForwardDialogOpen] = useState(false);
  const [forwardMode, setForwardMode] = useState<MessageForwardMode>("single");
  const [pendingMessages, setPendingMessages] = useState<ChatMessage[]>([]);
  const [selectedMessagesDialogOpen, setSelectedMessagesDialogOpen] = useState(false);

  const selectedMessageKeySet = useMemo(
    () => new Set(selectedMessageKeys),
    [selectedMessageKeys],
  );

  const resetForwardState = useCallback(() => {
    setForwardDialogOpen(false);
    setSelectedMessagesDialogOpen(false);
    setPendingMessages([]);
    setForwardMode("single");
  }, []);

  const exitMultiSelectMode = useCallback(() => {
    setMultiSelectMode(false);
    setSelectedMessageKeys([]);
    resetForwardState();
  }, [resetForwardState]);

  const enterMultiSelectMode = useCallback(() => {
    setMultiSelectMode(true);
    setSelectedMessageKeys([]);
    resetForwardState();
  }, [resetForwardState]);

  const openForwardDialog = useCallback(
    (messages: ChatMessage[], mode: MessageForwardMode) => {
      const forwardableMessages = messages.filter(canForwardMessage);

      if (forwardableMessages.length === 0) {
        toast.warning("所选消息暂不支持转发");
        return;
      }

      if (forwardableMessages.length > MESSAGE_FORWARD_MAX_MESSAGES) {
        toast.warning(`最多选择 ${MESSAGE_FORWARD_MAX_MESSAGES} 条消息`);
        return;
      }

      setPendingMessages(forwardableMessages);
      setForwardMode(mode);
      setForwardDialogOpen(true);
    },
    [],
  );

  const handleForwardMessage = useCallback(
    (message: ChatMessage) => {
      openForwardDialog([message], "single");
    },
    [openForwardDialog],
  );

  const handleOpenBatchForwardDialog = useCallback(
    (messages: ChatMessage[]) => {
      openForwardDialog(messages, "batch");
    },
    [openForwardDialog],
  );

  const toggleMessageSelection = useCallback((message: ChatMessage) => {
    if (!canForwardMessage(message)) {
      return;
    }

    const messageKey = getMessageFeedItemKey(message);

    setSelectedMessageKeys((currentKeys) => {
      if (currentKeys.includes(messageKey)) {
        return currentKeys.filter((key) => key !== messageKey);
      }

      if (currentKeys.length >= MESSAGE_FORWARD_MAX_MESSAGES) {
        toast.warning(`最多选择 ${MESSAGE_FORWARD_MAX_MESSAGES} 条消息`);
        return currentKeys;
      }

      return [...currentKeys, messageKey];
    });
  }, []);

  return {
    enterMultiSelectMode,
    exitMultiSelectMode,
    forwardDialogOpen,
    forwardMode,
    handleForwardMessage,
    handleOpenBatchForwardDialog,
    multiSelectMode,
    pendingMessages,
    resetForwardState,
    selectedMessageKeySet,
    selectedMessagesDialogOpen,
    setForwardDialogOpen,
    setSelectedMessagesDialogOpen,
    toggleMessageSelection,
  };
}
