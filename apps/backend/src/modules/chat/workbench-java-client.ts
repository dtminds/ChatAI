import type {
  WorkbenchSendMessageResponse,
  WorkbenchUploadCredentialResponse,
} from "@chatai/contracts";
import {
  BadGatewayError,
  ServiceUnavailableError,
} from "../../shared/errors.js";
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

type JavaRevokeMessageResponse = {
  optNo?: string;
};

export type WorkbenchJavaClient = {
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
  recognizeSentence(input: {
    voiceUrl: string;
  }): Promise<string>;
  revokeMessage(input: {
    platform: number;
    revokeMsgId: number;
    uid: number;
  }): Promise<JavaRevokeMessageResponse | undefined>;
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
    recognizeSentence(input) {
      if (process.env.JAVA_INTERNAL_API_MOCK_VOICE_TRANSCRIPTION === "true") {
        return Promise.resolve(
          process.env.JAVA_INTERNAL_API_MOCK_VOICE_TRANSCRIPTION_TEXT ??
          "这是一段语音转文字测试文本",
        );
      }

      return postJavaEnvelope<string>(
        baseUrl,
        token,
        "/third-internal/tencent-cloud/sentence-recognition",
        input,
        logger,
        "sentence-recognition",
      );
    },
    revokeMessage(input) {
      return postJavaEnvelope<JavaRevokeMessageResponse>(
        baseUrl,
        token,
        "/third-internal/wap-embed/conversation/revoke-message",
        input,
        logger,
        "revoke-message",
        { exposeErrorMessage: true },
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

async function postJavaEnvelope<T>(
  baseUrl: string | undefined,
  token: string | undefined,
  path: string,
  body: unknown,
  logger: AppLogger,
  operation: string,
  options: { exposeErrorMessage?: boolean } = {},
): Promise<T> {
  const response = await postJava<JavaApiResponse<T>>(
    baseUrl,
    token,
    path,
    body,
    logger,
    operation,
  );

  if (!response.success) {
    logger.error(
      {
        ...buildJavaLogContext(body),
        error: response.error,
        requestId: getLoggerRequestId(logger),
        operation,
        path,
      },
      "Java 内部工作台接口业务失败",
    );
    throw new BadGatewayError(
      WORKBENCH_INTERNAL_API_FAILED_CODE,
      // Only use this for Java business messages that product has approved
      // for direct customer-service operator display.
      options.exposeErrorMessage
        ? response.errorMsg?.trim() || JAVA_INTERNAL_API_USER_MESSAGE
        : JAVA_INTERNAL_API_USER_MESSAGE,
      {
        error: response.error,
      },
    );
  }

  return response.data as T;
}

function buildJavaLogContext(body: unknown) {
  if (!isRecord(body)) {
    return {};
  }

  const context: Record<string, unknown> = {};

  for (const key of [
    "conversationId",
    "msgid",
    "platform",
    "revokeMsgId",
    "sendType",
    "subId",
    "thirdExternalUserid",
    "thirdGroupId",
    "thirdUserId",
    "uid",
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
