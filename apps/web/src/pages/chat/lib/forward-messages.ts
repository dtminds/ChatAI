import { CHAT_TYPE, type WorkbenchOutgoingMessageSegment } from "@chatai/contracts";
import { adaptConversation } from "@/pages/chat/api/workbench-adapter";
import { sendTextMessage } from "@/pages/chat/api/workbench-gateway";
import { getWorkbenchService } from "@/pages/chat/api/workbench-service";
import {
  buildForwardSegmentFromMessage,
  MESSAGE_FORWARD_MAX_MESSAGES,
  MESSAGE_FORWARD_MAX_RECIPIENTS,
  resolveForwardSendDelayMs,
  type MessageForwardRecipient,
} from "@/pages/chat/lib/message-forward";
import type { ChatMessage } from "@/pages/chat/chat-types";

export type ForwardMessagesResult = {
  failedCount: number;
  sentCount: number;
  skippedCount: number;
};

type ForwardMessagesOptions = {
  getSendDelayMs?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function resolveRecipientConversationId(
  seatId: string,
  recipient: MessageForwardRecipient,
) {
  if (recipient.conversationId?.trim()) {
    return recipient.conversationId.trim();
  }

  const summary = await getWorkbenchService().getOrCreateConversation({
    chatType: recipient.mode === "group" ? CHAT_TYPE.GROUP : CHAT_TYPE.SINGLE,
    seatId,
    thirdExternalUserId:
      recipient.mode === "single" ? recipient.thirdExternalUserId : undefined,
    thirdGroupId: recipient.mode === "group" ? recipient.thirdGroupId : undefined,
  });

  return adaptConversation(summary).id;
}

async function sendForwardSegment(
  seatId: string,
  conversationId: string,
  segment: WorkbenchOutgoingMessageSegment,
) {
  await sendTextMessage({
    conversationId,
    seatId,
    segment,
  });
}

export async function forwardMessagesToRecipients(
  input: {
    comment?: string;
    messages: ChatMessage[];
    recipients: MessageForwardRecipient[];
    seatId: string;
  },
  options: ForwardMessagesOptions = {},
): Promise<ForwardMessagesResult> {
  const comment = input.comment?.trim() ?? "";
  const recipients = input.recipients.slice(0, MESSAGE_FORWARD_MAX_RECIPIENTS);
  const messages = input.messages.slice(0, MESSAGE_FORWARD_MAX_MESSAGES);
  const sleep = options.sleep ?? defaultSleep;
  const getSendDelayMs = options.getSendDelayMs ?? resolveForwardSendDelayMs;
  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let hasSentAnyMessage = false;

  const waitBeforeNextSend = async () => {
    if (!hasSentAnyMessage) {
      return;
    }

    await sleep(getSendDelayMs());
  };

  const sendSegmentWithDelay = async (
    seatId: string,
    conversationId: string,
    segment: WorkbenchOutgoingMessageSegment,
  ) => {
    await waitBeforeNextSend();

    try {
      await sendForwardSegment(seatId, conversationId, segment);
      sentCount += 1;
      hasSentAnyMessage = true;
    } catch {
      failedCount += 1;
      hasSentAnyMessage = true;
    }
  };

  for (const recipient of recipients) {
    let conversationId: string;

    try {
      conversationId = await resolveRecipientConversationId(input.seatId, recipient);
    } catch {
      failedCount += messages.length + (comment ? 1 : 0);
      continue;
    }

    for (const message of messages) {
      const segment = buildForwardSegmentFromMessage(message);

      if (!segment) {
        skippedCount += 1;
        continue;
      }

      await sendSegmentWithDelay(input.seatId, conversationId, segment);
    }

    if (comment) {
      await sendSegmentWithDelay(input.seatId, conversationId, {
        text: comment,
        type: "text",
      });
    }
  }

  return {
    failedCount,
    sentCount,
    skippedCount,
  };
}
