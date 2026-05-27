import type {
  WorkbenchSendMessageResponse,
  WorkbenchSmartReplyAttachmentsResponse,
  WorkbenchSmartReplyGeneralAnswerResponse,
  WorkbenchSmartReplyPollResponse,
  WorkbenchKnowledgePageResponse,
  WorkbenchKnowledgeDocPageResponse,
  WorkbenchKnowledgeFaqAddResponse,
  WorkbenchKnowledgeConfigResponse,
  WorkbenchSmartReplyTextModerationResponse,
  WorkbenchUploadCredentialResponse,
} from "@chatai/contracts";
import { mapJavaAttachmentList } from "./attachment-mappers.js";
import {
  buildAiHelperAskRequestBody,
  collectAiHelperAskStreamText,
  extractAiHelperTemplateConfigParamId,
  mapJavaAiHelperGenerateId,
} from "./ai-helper-mappers.js";
import { mapJavaKnowledgePage } from "./knowledge-mappers.js";
import { mapJavaKnowledgeDocPage } from "./knowledge-doc-mappers.js";
import { mapJavaKnowledgeFaqAdd } from "./knowledge-faq-mappers.js";
import { mapJavaKnowledgeConfig } from "./knowledge-config-mappers.js";
import { mapJavaTextModerationPlus } from "./text-moderation-mappers.js";
import {
  BadGatewayError,
  ServiceUnavailableError,
} from "../../shared/errors.js";
import {
  mapJavaGeneralAnswer,
  mapJavaUserHistoryAnswerList,
} from "./smart-reply-mappers.js";
import {
  getLoggerRequestId,
  noopLogger,
  type AppLogger,
  type RequestAwareLogger,
} from "../../shared/logger.js";

const DEFAULT_JAVA_INTERNAL_API_TIMEOUT_MS = 8000;
export const JAVA_INTERNAL_API_USER_MESSAGE = "工作台服务繁忙，请稍后重试";
export const WORKBENCH_INTERNAL_API_NOT_CONFIGURED_CODE =
  "WORKBENCH_INTERNAL_API_NOT_CONFIGURED";
export const WORKBENCH_INTERNAL_API_FAILED_CODE = "WORKBENCH_INTERNAL_API_FAILED";

export const JAVA_SEND_TYPE = {
  GROUP: 2,
  SINGLE: 1,
} as const;

export const JAVA_MESSAGE_SOURCE = {
  WORKBENCH: 1,
  WX_SIDEBAR: 2,
} as const;

export const JAVA_MENTION_LOCATION = {
  END: 1,
  START: 0,
} as const;

export const JAVA_MENTION_HIT_TYPE = {
  MEMBER: 2,
} as const;

type JavaApiResponse<T> = {
  data?: T;
  error?: number;
  errorMsg?: string;
  success?: boolean;
};

type JavaMentionFields = {
  atLocation?: number;
  atWxSerialNos?: string[];
  isHit?: number;
};

export type JavaSendMessageData =
  | ({
      msgtype: "text";
      text: string;
    } & JavaMentionFields)
  | {
      fileUrl: string;
      msgtype: "image";
    }
  | {
      fileName: string;
      fileUrl: string;
      msgtype: "file";
    }
  | ({
      msgtype: "quote";
      quoteMsgId: number;
      text: string;
    } & JavaMentionFields);

export type JavaSendMessageInput = {
  clientMessageId: string;
  failMsgId?: number;
  msgData: JavaSendMessageData;
  platform: number;
  sendType: (typeof JAVA_SEND_TYPE)[keyof typeof JAVA_SEND_TYPE];
  source: (typeof JAVA_MESSAGE_SOURCE)[keyof typeof JAVA_MESSAGE_SOURCE];
  thirdExternalUserid?: string;
  thirdGroupId?: string;
  thirdUserId: string;
  uid: number;
};

type JavaSendMessageResponse = {
  optNo?: string;
};

export type WorkbenchJavaClient = {
  listUserHistoryAnswers(input: {
    chatType: number;
    msgIds: number[];
    thirdExternalId: string;
    thirdUserId: string;
    uid: number;
  }): Promise<WorkbenchSmartReplyPollResponse>;
  requestGeneralAnswer(input: {
    chatType: number;
    msgId: number;
    questionImgs: string[];
    thirdExternalId: string;
    thirdUserId: string;
    uid: number;
  }): Promise<WorkbenchSmartReplyGeneralAnswerResponse>;
  listAttachments(input: {
    ids: number[];
    uid: number;
  }): Promise<WorkbenchSmartReplyAttachmentsResponse>;
  checkTextModerationPlus(input: {
    content: string;
    uid: number;
  }): Promise<WorkbenchSmartReplyTextModerationResponse>;
  getAiHelperTemplate(input: {
    templateId: number;
    uid: number;
  }): Promise<number | undefined>;
  submitAiHelperGenerateAsk(input: {
    params: Array<{
      id: number;
      value: string[];
    }>;
    templateId: number;
    uid: number;
  }): Promise<{ generateId: string }>;
  streamAiHelperAsk(input: {
    generateId: string;
    uid: number;
  }): Promise<string>;
  sendRecommendAnswer(input: {
    realAnswer: string;
    realAttachIds: string[];
    recordId: string;
    uid: number;
  }): Promise<void>;
  listKnowledgePage(input: {
    page: number;
    pageSize: number;
    uid: number;
  }): Promise<WorkbenchKnowledgePageResponse>;
  getKnowledgeConfig(input: {
    uid: number;
  }): Promise<WorkbenchKnowledgeConfigResponse>;
  listKnowledgeDocPage(input: {
    knowledgeId: string;
    page: number;
    pageSize: number;
    uid: number;
  }): Promise<WorkbenchKnowledgeDocPageResponse>;
  addKnowledgeFaq(input: {
    docId: string;
    list: Array<{
      answer: string;
      attachIds: string;
      question: string;
      similarQuestion: string;
    }>;
    source: number;
    uid: number;
  }): Promise<WorkbenchKnowledgeFaqAddResponse>;
  sendSmartHeartbeat(input: {
    platform: number;
    thirdExternalUserId: string;
    thirdUserId: string;
    uid: number;
  }): Promise<void>;
  createConversation(input: {
    chatType: number;
    platform: number;
    thirdExternalUserId?: string;
    thirdGroupId?: string;
    thirdUserId: string;
    uid: number;
  }): Promise<{ conversationId: string } | undefined>;
  deleteConversation(input: {
    conversationId: string;
    platform: number;
    uid: number;
  }): Promise<void>;
  downloadMsgFile(input: {
    msgid: string;
    platform: number;
    uid: number;
  }): Promise<void>;
  getUploadCredential(input: {
    uid: number;
  }): Promise<WorkbenchUploadCredentialResponse>;
  markConversationRead(input: {
    conversationId: string;
    platform: number;
    uid: number;
  }): Promise<void>;
  markConversationUnread(input: {
    conversationId: string;
    platform: number;
    uid: number;
  }): Promise<void>;
  pinConversation(input: {
    conversationId: string;
    platform: number;
    uid: number;
  }): Promise<void>;
  sendMessage(input: JavaSendMessageInput): Promise<WorkbenchSendMessageResponse>;
  takeOverSeat(input: {
    platform: number;
    subId: number;
    thirdUserId: string;
    uid: number;
  }): Promise<void>;
  updateMessageContent(input: {
    content: string;
    platform: number;
    uid: number;
    updateId: number;
  }): Promise<void>;
  unpinConversation(input: {
    conversationId: string;
    platform: number;
    uid: number;
  }): Promise<void>;
};

export function createWorkbenchJavaClient(
  logger: AppLogger | RequestAwareLogger = noopLogger,
): WorkbenchJavaClient {
  const baseUrl = process.env.JAVA_INTERNAL_API_BASE_URL?.replace(/\/+$/, "");
  const token = process.env.JAVA_INTERNAL_API_TOKEN;

  return {
    listUserHistoryAnswers(input) {
      return postJavaEnvelope<unknown>(
        baseUrl,
        token,
        "/third-internal/wap-embed-msg-audit-recommend-answer/user-history-answer-list",
        {
          chatType: input.chatType,
          msgIds: input.msgIds,
          thirdExternalId: input.thirdExternalId,
          thirdUserId: input.thirdUserId,
          uid: input.uid,
        },
        logger,
        "list-user-history-answers",
      ).then((data) => {
        return mapJavaUserHistoryAnswerList(data);
      });
    },
    requestGeneralAnswer(input) {
      return postJavaEnvelope<unknown>(
        baseUrl,
        token,
        "/third-internal/wap-embed-msg-audit-recommend-answer/general-answer",
        {
          chatType: input.chatType,
          msgId: input.msgId,
          questionImgs: input.questionImgs,
          thirdExternalId: input.thirdExternalId,
          thirdUserId: input.thirdUserId,
          uid: input.uid,
        },
        logger,
        "request-general-answer",
      ).then((data) => {
        return {
          suggestion: mapJavaGeneralAnswer(data),
        };
      });
    },
    listAttachments(input) {
      return postJavaEnvelope<unknown>(
        baseUrl,
        token,
        "/third-internal/attachment/list",
        {
          ids: input.ids,
          uid: input.uid,
        },
        logger,
        "list-attachments",
      ).then((data) => mapJavaAttachmentList(data));
    },
    checkTextModerationPlus(input) {
      return postJavaEnvelope<unknown>(
        baseUrl,
        token,
        `/third-internal/ai-helper/text-moderation-plus?uid=${input.uid}`,
        {
          content: input.content,
          type: "plus",
        },
        logger,
        "text-moderation-plus",
      ).then((data) => mapJavaTextModerationPlus(data));
    },
    getAiHelperTemplate(input) {
      return postJavaEnvelope<unknown>(
        baseUrl,
        token,
        "/third-internal/ai-helper/get-template",
        {
          templateId: input.templateId,
          uid: input.uid,
        },
        logger,
        "get-ai-helper-template",
      ).then((data) => {
        return extractAiHelperTemplateConfigParamId(data);
      });
    },
    submitAiHelperGenerateAsk(input) {
      return postJavaEnvelope<unknown>(
        baseUrl,
        token,
        `/third-internal/ai-helper/generate-ask?uid=${input.uid}`,
        {
          params: input.params,
          templateId: input.templateId,
        },
        logger,
        "submit-ai-helper-generate-ask",
      ).then((data) => {
        const generateId = mapJavaAiHelperGenerateId(data);

        if (!generateId) {
          throw new BadGatewayError(
            WORKBENCH_INTERNAL_API_FAILED_CODE,
            JAVA_INTERNAL_API_USER_MESSAGE,
          );
        }

        return { generateId };
      });
    },
    streamAiHelperAsk(input) {
      return streamJavaPostText(
        baseUrl,
        token,
        `/third-internal/ai-helper/ask?uid=${input.uid}`,
        buildAiHelperAskRequestBody(input.generateId),
        logger,
        "stream-ai-helper-ask",
      ).then((raw) => {
        const content = collectAiHelperAskStreamText(raw);

        if (!content) {
          throw new BadGatewayError(
            WORKBENCH_INTERNAL_API_FAILED_CODE,
            JAVA_INTERNAL_API_USER_MESSAGE,
          );
        }

        return content;
      });
    },
    sendRecommendAnswer(input) {
      const numericRecordId = readJavaRecommendAnswerRecordId(input.recordId);

      return postJavaEnvelope<boolean>(
        baseUrl,
        token,
        "/third-internal/wap-embed-msg-audit-recommend-answer/send-answer",
        {
          realAnswer: input.realAnswer,
          realAttachIds: input.realAttachIds,
          recordId: numericRecordId ?? input.recordId,
          uid: input.uid,
        },
        logger,
        "send-recommend-answer",
      ).then(() => undefined);
    },
    listKnowledgePage(input) {
      return postJavaPageEnvelope(
        baseUrl,
        token,
        "/third-internal/wap-embed-knowledge/page",
        {
          page: input.page,
          pageSize: input.pageSize,
          uid: input.uid,
        },
        logger,
        "list-knowledge-page",
      ).then((response) => mapJavaKnowledgePage(response));
    },
    getKnowledgeConfig(input) {
      return postJavaEnvelope<unknown>(
        baseUrl,
        token,
        `/third-internal/msg-audit-knowledge/get-knowledge-config?uid=${input.uid}`,
        {},
        logger,
        "get-knowledge-config",
      ).then((data) => mapJavaKnowledgeConfig(data));
    },
    listKnowledgeDocPage(input) {
      return postJavaPageEnvelope(
        baseUrl,
        token,
        "/third-internal/wap-embed-knowledge-doc/page",
        {
          knowledgeId: input.knowledgeId,
          page: input.page,
          pageSize: input.pageSize,
          uid: input.uid,
        },
        logger,
        "list-knowledge-doc-page",
      ).then((response) => mapJavaKnowledgeDocPage(response));
    },
    addKnowledgeFaq(input) {
      return postJavaEnvelope<unknown>(
        baseUrl,
        token,
        "/third-internal/wap-embed-knowledge-faq/add",
        {
          docId: input.docId,
          list: input.list,
          source: input.source,
          uid: input.uid,
        },
        logger,
        "add-knowledge-faq",
      ).then((data) => mapJavaKnowledgeFaqAdd(data));
    },
    sendSmartHeartbeat(input) {
      return postJavaEnvelope<boolean>(
        baseUrl,
        token,
        "/third-internal/wap-embed-customer-bind-relation/smart-heartbeat",
        {
          platform: input.platform,
          thirdExternalUserId: input.thirdExternalUserId,
          thirdUserId: input.thirdUserId,
          uid: input.uid,
        },
        logger,
        "smart-heartbeat",
      ).then(() => undefined);
    },
    createConversation(input) {
      return postJavaEnvelope<number | string>(
        baseUrl,
        token,
        "/third-internal/wap-embed/conversation/manual-new",
        {
          chatType: input.chatType,
          platform: input.platform,
          thirdExternalUserid: input.thirdExternalUserId,
          thirdGroupId: input.thirdGroupId,
          thirdUserid: input.thirdUserId,
          uid: input.uid,
        },
        logger,
        "create-conversation",
      )
        .then((conversationId) => ({ conversationId: String(conversationId) }))
        .catch((error) => {
          logger.warn(
            { error, input },
            "调用 Java 创建会话接口失败",
          );
          return undefined;
        });
    },
    deleteConversation(input) {
      return postConversationOperate(
        baseUrl,
        token,
        "/third-internal/wap-embed/conversation/hide",
        input,
        logger,
        "delete-conversation",
      );
    },
    downloadMsgFile(input) {
      return postJavaEnvelope<boolean>(
        baseUrl,
        token,
        "/third-internal/wap-embed/conversation/download-msg-file",
        input,
        logger,
        "download-message-file",
      ).then(() => undefined);
    },
    getUploadCredential(input) {
      return postJavaEnvelope<WorkbenchUploadCredentialResponse>(
        baseUrl,
        token,
        "/third-internal/file/get-upload-credential",
        input,
        logger,
        "get-upload-credential",
      );
    },
    markConversationRead(input) {
      return postConversationOperate(
        baseUrl,
        token,
        "/third-internal/wap-embed/conversation/mark-read",
        input,
        logger,
        "mark-conversation-read",
      );
    },
    markConversationUnread(input) {
      return postConversationOperate(
        baseUrl,
        token,
        "/third-internal/wap-embed/conversation/mark-unread",
        input,
        logger,
        "mark-conversation-unread",
      );
    },
    pinConversation(input) {
      return postConversationOperate(
        baseUrl,
        token,
        "/third-internal/wap-embed/conversation/pin",
        input,
        logger,
        "pin-conversation",
      );
    },
    async sendMessage(input) {
      const response = await postJavaEnvelope<JavaSendMessageResponse>(
        baseUrl,
        token,
        "/third-internal/wap-embed/conversation/send-message",
        buildJavaSendMessageBody(input),
        logger,
        "send-message",
      );
      const optNo = response.optNo ?? input.clientMessageId;

      return {
        clientMessageId: input.clientMessageId,
        messageId: optNo,
        optNo,
        status: "accepted",
      };
    },
    takeOverSeat(input) {
      return postJavaEnvelope<boolean>(
        baseUrl,
        token,
        "/third-internal/wap-embed/user-seat/host",
        input,
        logger,
        "take-over-seat",
      ).then(() => undefined);
    },
    updateMessageContent(input) {
      return postJavaEnvelope<string>(
        baseUrl,
        token,
        "/third-internal/wap-embed/conversation/update-message-content",
        input,
        logger,
        "update-message-content",
      ).then(() => undefined);
    },
    unpinConversation(input) {
      return postConversationOperate(
        baseUrl,
        token,
        "/third-internal/wap-embed/conversation/unpin",
        input,
        logger,
        "unpin-conversation",
      );
    },
  };
}

async function postConversationOperate(
  baseUrl: string | undefined,
  token: string | undefined,
  path: string,
  input: {
    conversationId: string;
    platform: number;
    uid: number;
  },
  logger: AppLogger,
  operation: string,
) {
  await postJavaEnvelope<boolean>(baseUrl, token, path, {
    conversationId: Number(input.conversationId),
    platform: input.platform,
    uid: input.uid,
  }, logger, operation);
}

function buildJavaSendMessageBody(input: JavaSendMessageInput) {
  return {
    ...(input.failMsgId != null ? { failMsgId: input.failMsgId } : {}),
    msgData: input.msgData,
    platform: input.platform,
    sendType: input.sendType,
    source: input.source,
    ...(input.thirdExternalUserid
      ? { thirdExternalUserid: input.thirdExternalUserid }
      : {}),
    ...(input.thirdGroupId ? { thirdGroupId: input.thirdGroupId } : {}),
    thirdUserId: input.thirdUserId,
    uid: input.uid,
  };
}

async function postJava<T>(
  baseUrl: string | undefined,
  token: string | undefined,
  path: string,
  body: unknown,
  logger: AppLogger,
  operation: string,
): Promise<T> {
  if (!baseUrl) {
    logger.error(
      {
        operation,
        path,
      },
      "Java 内部工作台接口未配置",
    );
    throw new ServiceUnavailableError(
      WORKBENCH_INTERNAL_API_NOT_CONFIGURED_CODE,
      JAVA_INTERNAL_API_USER_MESSAGE,
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), readJavaApiTimeoutMs());
  let response: Response;
  const requestId = getLoggerRequestId(logger);

  try {
    response = await fetch(`${baseUrl}${path}`, {
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(requestId ? { "x-request-id": requestId } : {}),
      },
      method: "POST",
      signal: controller.signal,
    });
  } catch (error) {
    logger.error(
      {
        ...buildJavaLogContext(body),
        requestId,
        operation,
        path,
        reason: error instanceof Error ? error.name : "unknown",
      },
      "Java 内部工作台接口调用失败",
    );
    throw new BadGatewayError(
      WORKBENCH_INTERNAL_API_FAILED_CODE,
      JAVA_INTERNAL_API_USER_MESSAGE,
      {
        reason: error instanceof Error ? error.name : "unknown",
      },
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    logger.error(
      {
        ...buildJavaLogContext(body),
        requestId,
        operation,
        path,
        status: response.status,
      },
      "Java 内部工作台接口返回异常状态",
    );
    throw new BadGatewayError(
      WORKBENCH_INTERNAL_API_FAILED_CODE,
      JAVA_INTERNAL_API_USER_MESSAGE,
      {
        status: response.status,
      },
    );
  }

  return (await response.json()) as T;
}

async function streamJavaPostText(
  baseUrl: string | undefined,
  token: string | undefined,
  path: string,
  body: unknown,
  logger: AppLogger,
  operation: string,
): Promise<string> {
  if (!baseUrl) {
    logger.error(
      {
        operation,
        path,
      },
      "Java 内部工作台接口未配置",
    );
    throw new ServiceUnavailableError(
      WORKBENCH_INTERNAL_API_NOT_CONFIGURED_CODE,
      JAVA_INTERNAL_API_USER_MESSAGE,
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), readJavaApiTimeoutMs());
  let response: Response;
  const requestId = getLoggerRequestId(logger);

  try {
    response = await fetch(`${baseUrl}${path}`, {
      body: JSON.stringify(body),
      headers: {
        accept: "text/event-stream",
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(requestId ? { "x-request-id": requestId } : {}),
      },
      method: "POST",
      signal: controller.signal,
    });
  } catch (error) {
    logger.error(
      {
        ...buildJavaLogContext(body),
        requestId,
        operation,
        path,
        reason: error instanceof Error ? error.name : "unknown",
      },
      "Java 内部工作台接口调用失败",
    );
    throw new BadGatewayError(
      WORKBENCH_INTERNAL_API_FAILED_CODE,
      JAVA_INTERNAL_API_USER_MESSAGE,
      {
        reason: error instanceof Error ? error.name : "unknown",
      },
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    logger.error(
      {
        ...buildJavaLogContext(body),
        requestId,
        operation,
        path,
        status: response.status,
      },
      "Java 内部工作台接口返回异常状态",
    );
    throw new BadGatewayError(
      WORKBENCH_INTERNAL_API_FAILED_CODE,
      JAVA_INTERNAL_API_USER_MESSAGE,
      {
        status: response.status,
      },
    );
  }

  if (!response.body) {
    throw new BadGatewayError(
      WORKBENCH_INTERNAL_API_FAILED_CODE,
      JAVA_INTERNAL_API_USER_MESSAGE,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let raw = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (value) {
        raw += decoder.decode(value, { stream: true });
      }
    }

    raw += decoder.decode();
  } catch (error) {
    logger.error(
      {
        ...buildJavaLogContext(body),
        requestId,
        operation,
        path,
        reason: error instanceof Error ? error.name : "unknown",
      },
      "Java 内部工作台流式接口读取失败",
    );
    throw new BadGatewayError(
      WORKBENCH_INTERNAL_API_FAILED_CODE,
      JAVA_INTERNAL_API_USER_MESSAGE,
      {
        reason: error instanceof Error ? error.name : "unknown",
      },
    );
  } finally {
    reader.releaseLock();
  }

  return raw;
}

async function postJavaEnvelope<T>(
  baseUrl: string | undefined,
  token: string | undefined,
  path: string,
  body: unknown,
  logger: AppLogger,
  operation: string,
): Promise<T> {
  const response = await postJava<JavaApiResponse<T>>(
    baseUrl,
    token,
    path,
    body,
    logger,
    operation,
  );

  if (!isJavaEnvelopeSuccessful(response)) {
    logger.error(
      {
        ...buildJavaLogContext(body),
        error: response.error,
        errorMsg: response.errorMsg,
        requestId: getLoggerRequestId(logger),
        operation,
        path,
        success: response.success,
      },
      "Java 内部工作台接口业务失败",
    );
    throw new BadGatewayError(
      WORKBENCH_INTERNAL_API_FAILED_CODE,
      JAVA_INTERNAL_API_USER_MESSAGE,
      {
        error: response.error,
      },
    );
  }

  return response.data as T;
}

async function postJavaPageEnvelope(
  baseUrl: string | undefined,
  token: string | undefined,
  path: string,
  body: unknown,
  logger: AppLogger,
  operation: string,
) {
  const response = await postJava<JavaApiResponse<unknown> & Record<string, unknown>>(
    baseUrl,
    token,
    path,
    body,
    logger,
    operation,
  );

  if (!isJavaEnvelopeSuccessful(response)) {
    logger.error(
      {
        ...buildJavaLogContext(body),
        error: response.error,
        errorMsg: response.errorMsg,
        requestId: getLoggerRequestId(logger),
        operation,
        path,
        success: response.success,
      },
      "Java 内部工作台接口业务失败",
    );
    throw new BadGatewayError(
      WORKBENCH_INTERNAL_API_FAILED_CODE,
      JAVA_INTERNAL_API_USER_MESSAGE,
      {
        error: response.error,
      },
    );
  }

  logger.info(
    {
      ...buildJavaLogContext(body),
      count: response.count,
      list: response.list,
      listLength: Array.isArray(response.list) ? response.list.length : undefined,
      operation,
      path,
      requestId: getLoggerRequestId(logger),
      response,
    },
    "Java 分页接口原始响应",
  );

  return response;
}

function isJavaEnvelopeSuccessful(response: JavaApiResponse<unknown>) {
  if (response.success === true) {
    return true;
  }

  // SCRM 部分内部接口用 numeric error 表示结果：0 为成功。个别接口在空结果时仍会返回 success:false。
  return response.error === 0;
}

function buildJavaLogContext(body: unknown) {
  if (!isRecord(body)) {
    return {};
  }

  const context: Record<string, unknown> = {};

  for (const key of [
    "chatType",
    "conversationId",
    "msgid",
    "msgId",
    "ids",
    "msgIds",
    "platform",
    "thirdExternalId",
    "sendType",
    "subId",
    "thirdExternalUserid",
    "thirdGroupId",
    "thirdUserId",
    "uid",
    "knowledgeId",
    "updateId",
  ]) {
    if (body[key] != null) {
      context[key] = body[key];
    }
  }

  const msgData = body["msgData"];
  if (isRecord(msgData)) {
    context.messageType = msgData["msgtype"];
  }

  return context;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readJavaApiTimeoutMs() {
  const value = Number.parseInt(process.env.JAVA_INTERNAL_API_TIMEOUT_MS ?? "", 10);

  return Number.isSafeInteger(value) && value > 0
    ? value
    : DEFAULT_JAVA_INTERNAL_API_TIMEOUT_MS;
}

function readJavaRecommendAnswerRecordId(value: string) {
  const trimmed = value.trim();

  if (!/^\d+$/.test(trimmed)) {
    return undefined;
  }

  const parsed = Number.parseInt(trimmed, 10);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
