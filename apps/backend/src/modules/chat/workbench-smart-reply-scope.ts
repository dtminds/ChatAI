import { CHAT_TYPE } from "@chatai/contracts";
import { BadRequestError } from "../../shared/errors.js";
import type { ConversationLookup } from "./workbench-repository.js";

type SmartReplyJavaScope = {
  chatType: number;
  thirdExternalId: string;
  thirdGroupId?: string;
  thirdUserId: string;
  uid: number;
};

export function assertSmartReplySupportedConversation(
  conversation: ConversationLookup,
) {
  if (
    conversation.chatType !== CHAT_TYPE.SINGLE &&
    conversation.chatType !== CHAT_TYPE.GROUP
  ) {
    throw new BadRequestError(
      "SMART_REPLY_SCOPE_INVALID",
      "当前会话暂不支持智能回复",
    );
  }
}

export function getSmartReplyJavaScope(
  conversation: ConversationLookup,
): SmartReplyJavaScope {
  assertSmartReplySupportedConversation(conversation);

  const thirdUserId = conversation.thirdUserId?.trim();

  if (!thirdUserId) {
    throw new BadRequestError(
      "SMART_REPLY_SCOPE_INVALID",
      "当前会话缺少智能回复所需的席位标识",
    );
  }

  if (conversation.chatType === CHAT_TYPE.GROUP) {
    const thirdGroupId = conversation.thirdGroupId?.trim();

    if (!thirdGroupId) {
      throw new BadRequestError(
        "SMART_REPLY_SCOPE_INVALID",
        "当前会话缺少智能回复所需的群标识",
      );
    }

    return {
      chatType: CHAT_TYPE.GROUP,
      thirdExternalId: "",
      thirdGroupId,
      thirdUserId,
      uid: conversation.uid,
    };
  }

  const thirdExternalId = conversation.thirdExternalUserId?.trim();

  if (!thirdExternalId) {
    throw new BadRequestError(
      "SMART_REPLY_SCOPE_INVALID",
      "当前会话缺少智能回复所需的外部标识",
    );
  }

  return {
    chatType: CHAT_TYPE.SINGLE,
    thirdExternalId,
    thirdUserId,
    uid: conversation.uid,
  };
}
