import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import type { ChatMessage } from "@/pages/chat/chat-types";
import { forwardMessagesToRecipients } from "@/pages/chat/lib/forward-messages";
import {
  canForwardMessage,
  MESSAGE_FORWARD_MAX_MESSAGES,
  MESSAGE_FORWARD_MAX_RECIPIENTS,
  type MessageForwardMode,
  type MessageForwardRecipient,
} from "@/pages/chat/lib/message-forward";
import { getMessageFeedItemKey } from "@/pages/chat/components/message-feed";

type UseMessageForwardOptions = {
  seatId?: string;
};

export function useMessageForward({ seatId }: UseMessageForwardOptions) {
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedMessageKeys, setSelectedMessageKeys] = useState<string[]>([]);
  const [forwardDialogOpen, setForwardDialogOpen] = useState(false);
  const [forwardMode, setForwardMode] = useState<MessageForwardMode>("single");
  const [pendingMessages, setPendingMessages] = useState<ChatMessage[]>([]);
  const [selectedMessagesDialogOpen, setSelectedMessagesDialogOpen] = useState(false);
  const [isSendingForward, setIsSendingForward] = useState(false);

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

  const handleSendForward = useCallback(
    async (input: {
      comment?: string;
      recipients: MessageForwardRecipient[];
    }) => {
      if (!seatId || pendingMessages.length === 0 || input.recipients.length === 0) {
        return;
      }

      if (input.recipients.length > MESSAGE_FORWARD_MAX_RECIPIENTS) {
        toast.warning(`最多选择 ${MESSAGE_FORWARD_MAX_RECIPIENTS} 个聊天`);
        return;
      }

      if (pendingMessages.length > MESSAGE_FORWARD_MAX_MESSAGES) {
        toast.warning(`最多选择 ${MESSAGE_FORWARD_MAX_MESSAGES} 条消息`);
        return;
      }

      setIsSendingForward(true);

      try {
        const result = await forwardMessagesToRecipients({
          comment: input.comment,
          messages: pendingMessages,
          recipients: input.recipients,
          seatId,
        });

        if (result.sentCount === 0 && result.failedCount > 0) {
          toast.warning("转发失败，请稍后重试");
          return;
        }

        if (result.failedCount > 0 || result.skippedCount > 0) {
          toast.warning("部分消息转发失败");
        } else {
          toast.success("转发成功");
        }

        exitMultiSelectMode();
      } catch {
        toast.warning("转发失败，请稍后重试");
      } finally {
        setIsSendingForward(false);
      }
    },
    [exitMultiSelectMode, pendingMessages, seatId],
  );

  return {
    enterMultiSelectMode,
    exitMultiSelectMode,
    forwardDialogOpen,
    forwardMode,
    handleForwardMessage,
    handleOpenBatchForwardDialog,
    handleSendForward,
    isSendingForward,
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
