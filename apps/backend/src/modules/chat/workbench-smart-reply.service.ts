import {
  CHAT_TYPE,
  type WorkbenchSmartHeartbeatRequest,
  type WorkbenchSmartReplyAttachmentsRequest,
  type WorkbenchSmartReplyAutoGeneralAnswerRequest,
  type WorkbenchSmartReplyGeneralAnswerRequest,
  type WorkbenchSmartReplyMakeShorterRequest,
  type WorkbenchSmartReplyPollRequest,
  type WorkbenchSmartReplyReferenceMessagesRequest,
  type WorkbenchSmartReplySendAnswerRequest,
  type WorkbenchSmartReplyTextModerationRequest,
} from "@chatai/contracts";
import { BadGatewayError, BadRequestError } from "../../shared/errors.js";
import { SMART_REPLY_MAKE_SHORTER_TEMPLATE_ID } from "./ai-helper-mappers.js";
import { normalizeAttachmentIds } from "./attachment-mappers.js";
import type { WorkbenchAccess } from "./workbench-access.js";
import {
  WORKBENCH_INTERNAL_API_FAILED_CODE,
  type WorkbenchJavaClient,
} from "./workbench-java-client.js";
import {
  assertSmartReplySupportedConversation,
  getSmartReplyJavaScope,
} from "./workbench-smart-reply-scope.js";
import { normalizeSmartReplyMsgIds } from "./smart-reply-mappers.js";
import type { WorkbenchRepository } from "./workbench-repository.js";

export class WorkbenchSmartReplyService {
  constructor(
    private readonly javaClient: WorkbenchJavaClient,
    private readonly access: WorkbenchAccess,
    private readonly repository: WorkbenchRepository,
  ) {}

  async pollSmartReplies(
    subUserId: string,
    request: WorkbenchSmartReplyPollRequest,
  ) {
    const scope = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.access.getAccessibleConversation(
      subUserId,
      request.conversationId,
      scope,
    );
    const javaScope = getSmartReplyJavaScope(conversation);

    const javaMsgIds = normalizeSmartReplyMsgIds(request.msgIds);

    if (javaMsgIds.length === 0) {
      return { suggestions: [] };
    }

    return this.javaClient.listUserHistoryAnswers({
      chatType: javaScope.chatType,
      msgIds: javaMsgIds,
      thirdExternalId: javaScope.thirdExternalId,
      thirdGroupId: javaScope.thirdGroupId,
      thirdUserId: javaScope.thirdUserId,
      uid: javaScope.uid,
    });
  }

  async requestSmartReplyGeneralAnswer(
    subUserId: string,
    request: WorkbenchSmartReplyGeneralAnswerRequest,
  ) {
    const scope = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.access.getAccessibleConversation(
      subUserId,
      request.conversationId,
      scope,
    );

    if (!Number.isSafeInteger(request.msgId) || request.msgId <= 0) {
      throw new BadRequestError("SMART_REPLY_MSG_INVALID", "消息序号无效");
    }

    const javaScope = getSmartReplyJavaScope(conversation);

    return this.javaClient.requestGeneralAnswer({
      chatType: javaScope.chatType,
      msgId: request.msgId,
      questionImgs: request.questionImgs ?? [],
      thirdExternalId: javaScope.thirdExternalId,
      thirdGroupId: javaScope.thirdGroupId,
      thirdUserId: javaScope.thirdUserId,
      uid: javaScope.uid,
    });
  }

  async requestSmartReplyAutoGeneralAnswer(
    subUserId: string,
    request: WorkbenchSmartReplyAutoGeneralAnswerRequest,
  ) {
    const scope = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.access.getAccessibleConversation(
      subUserId,
      request.conversationId,
      scope,
    );

    if (conversation.chatType === CHAT_TYPE.GROUP) {
      throw new BadRequestError(
        "SMART_REPLY_AUTO_GENERAL_ANSWER_UNSUPPORTED",
        "群聊不支持自动生成智能回复",
      );
    }

    if (!Number.isSafeInteger(request.msgId) || request.msgId <= 0) {
      throw new BadRequestError("SMART_REPLY_MSG_INVALID", "消息序号无效");
    }

    const javaScope = getSmartReplyJavaScope(conversation);

    return this.javaClient.requestAutoGeneralAnswer({
      chatType: javaScope.chatType,
      msgId: request.msgId,
      thirdExternalId: javaScope.thirdExternalId,
      thirdGroupId: javaScope.thirdGroupId,
      thirdUserId: javaScope.thirdUserId,
      uid: javaScope.uid,
    });
  }

  async requestSmartReplyMakeShorter(
    subUserId: string,
    request: WorkbenchSmartReplyMakeShorterRequest,
  ) {
    const scope = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.access.getAccessibleConversation(
      subUserId,
      request.conversationId,
      scope,
    );
    assertSmartReplySupportedConversation(conversation);

    const content = request.content.trim();

    if (!content) {
      throw new BadRequestError("SMART_REPLY_CONTENT_EMPTY", "智能回复内容不能为空");
    }

    const configParamId = await this.javaClient.getAiHelperTemplate({
      templateId: SMART_REPLY_MAKE_SHORTER_TEMPLATE_ID,
      uid: conversation.uid,
    });

    if (configParamId == null) {
      throw new BadGatewayError(
        WORKBENCH_INTERNAL_API_FAILED_CODE,
        "智能回复模板配置无效",
      );
    }

    const { generateId } = await this.javaClient.submitAiHelperGenerateAsk({
      params: [
        {
          id: configParamId,
          value: [content],
        },
      ],
      templateId: SMART_REPLY_MAKE_SHORTER_TEMPLATE_ID,
      uid: conversation.uid,
    });

    const shortenedContent = await this.javaClient.streamAiHelperAsk({
      generateId,
      uid: conversation.uid,
    });

    return { content: shortenedContent };
  }

  async sendSmartReplyAnswer(
    subUserId: string,
    request: WorkbenchSmartReplySendAnswerRequest,
  ) {
    const scope = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.access.getAccessibleConversation(
      subUserId,
      request.conversationId,
      scope,
    );
    assertSmartReplySupportedConversation(conversation);

    const recordId = request.recordId.trim();

    if (!recordId) {
      throw new BadRequestError("SMART_REPLY_RECORD_INVALID", "智能回复记录无效");
    }

    const optNos = (request.optNos ?? [])
      .map((optNo) => optNo.trim())
      .filter((optNo) => optNo.length > 0);

    if (optNos.length === 0) {
      throw new BadRequestError("SMART_REPLY_OPT_NO_INVALID", "发送消息操作编号无效");
    }

    await this.javaClient.sendRecommendAnswer({
      optNos,
      recordId,
      uid: conversation.uid,
    });

    return { ok: true as const };
  }

  async listSmartReplyAttachments(
    subUserId: string,
    request: WorkbenchSmartReplyAttachmentsRequest,
  ) {
    const scope = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.access.getAccessibleConversation(
      subUserId,
      request.conversationId,
      scope,
    );
    assertSmartReplySupportedConversation(conversation);

    const ids = normalizeAttachmentIds(request.ids);

    if (ids.length === 0) {
      return { attachments: [] };
    }

    return this.javaClient.listAttachments({
      ids,
      uid: conversation.uid,
    });
  }

  async getSmartReplyReferenceMessages(
    subUserId: string,
    request: WorkbenchSmartReplyReferenceMessagesRequest,
  ) {
    const scope = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.access.getAccessibleConversation(
      subUserId,
      request.conversationId,
      scope,
    );

    return this.repository.listSmartReplyReferenceMessages({
      conversation,
      messageSeqs: request.messageSeqs,
      platform: scope.platform,
      uid: scope.uid,
    });
  }

  async checkSmartReplyTextModeration(
    subUserId: string,
    request: WorkbenchSmartReplyTextModerationRequest,
  ) {
    const content = request.content.trim();

    if (!content) {
      throw new BadRequestError("TEXT_MODERATION_CONTENT_EMPTY", "检测内容不能为空");
    }

    const scope = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.access.getAccessibleConversation(
      subUserId,
      request.conversationId,
      scope,
    );
    assertSmartReplySupportedConversation(conversation);

    return this.javaClient.checkTextModerationPlus({
      content,
      uid: conversation.uid,
    });
  }

  async sendSmartHeartbeat(
    subUserId: string,
    request: WorkbenchSmartHeartbeatRequest,
  ) {
    const scope = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.access.getOperableConversation(
      subUserId,
      request.conversationId,
      scope,
    );

    if (conversation.thirdGroupId) {
      throw new BadRequestError(
        "SMART_HEARTBEAT_GROUP_UNSUPPORTED",
        "群聊不支持沟通心跳",
      );
    }

    const thirdExternalUserId = conversation.thirdExternalUserId?.trim();

    if (!thirdExternalUserId) {
      throw new BadRequestError(
        "SMART_HEARTBEAT_CUSTOMER_MISSING",
        "客户信息缺失",
      );
    }

    await this.javaClient.sendSmartHeartbeat({
      platform: conversation.platform,
      thirdExternalUserId,
      thirdUserId: conversation.thirdUserId,
      uid: conversation.uid,
    });

    return { ok: true as const };
  }
}
