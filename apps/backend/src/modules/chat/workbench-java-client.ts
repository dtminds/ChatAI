import type {
  WorkbenchSendMessageResponse,
  WorkbenchUploadCredentialResponse,
} from "@chatai/contracts";
import {
  BadGatewayError,
  ServiceUnavailableError,
} from "../../shared/errors.js";
import { noopLogger, type AppLogger } from "../../shared/logger.js";

const DEFAULT_JAVA_INTERNAL_API_TIMEOUT_MS = 8000;

export const JAVA_MSG_TYPE = {
  FILE: 2010,
  IMAGE: 2002,
  QUOTE_TEXT: 2033,
  TEXT: 2001,
} as const;

export const JAVA_SEND_TYPE = {
  GROUP: 2,
  SINGLE: 1,
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

export type JavaSendMessageData = {
  atLocation?: number;
  atWxSerialNos?: string[];
  isHit?: number;
  msgContent: string;
  msgNum: number;
  msgType: (typeof JAVA_MSG_TYPE)[keyof typeof JAVA_MSG_TYPE];
  quoteContentBase64?: string;
  vcHref?: string;
  vcTitle?: string;
};

export type JavaSendMessageInput = {
  clientMessageId: string;
  message: JavaSendMessageData;
  platform: number;
  sendType: (typeof JAVA_SEND_TYPE)[keyof typeof JAVA_SEND_TYPE];
  thirdExternalUserid?: string;
  thirdGroupId?: string;
  thirdUserId: string;
  uid: number;
};

type JavaSendMessageResponse = {
  optNo?: string;
};

export type WorkbenchJavaClient = {
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
  unpinConversation(input: {
    conversationId: string;
    platform: number;
    uid: number;
  }): Promise<void>;
};

export function createWorkbenchJavaClient(logger: AppLogger = noopLogger): WorkbenchJavaClient {
  const baseUrl = process.env.JAVA_INTERNAL_API_BASE_URL?.replace(/\/+$/, "");
  const token = process.env.JAVA_INTERNAL_API_TOKEN;

  return {
    deleteConversation(input) {
      return postConversationOperate(
        baseUrl,
        token,
        "/third-internal/wap-embed/conversation/delete",
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
    msgDatas: [input.message],
    platform: input.platform,
    sendType: input.sendType,
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
      "JAVA_INTERNAL_API_NOT_CONFIGURED",
      "Java 内部工作台接口尚未配置",
      { path },
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), readJavaApiTimeoutMs());
  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      method: "POST",
      signal: controller.signal,
    });
  } catch (error) {
    logger.error(
      {
        ...buildJavaLogContext(body),
        operation,
        path,
        reason: error instanceof Error ? error.name : "unknown",
      },
      "Java 内部工作台接口调用失败",
    );
    throw new BadGatewayError(
      "JAVA_INTERNAL_API_FAILED",
      "Java 内部工作台接口调用失败",
      {
        path,
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
        operation,
        path,
        status: response.status,
      },
      "Java 内部工作台接口返回异常状态",
    );
    throw new BadGatewayError("JAVA_INTERNAL_API_FAILED", "Java 内部工作台接口调用失败", {
      path,
      status: response.status,
    });
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
        operation,
        path,
      },
      "Java 内部工作台接口业务失败",
    );
    throw new BadGatewayError("JAVA_INTERNAL_API_FAILED", "Java 内部工作台接口调用失败", {
      error: response.error,
      path,
    });
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
    "sendType",
    "subId",
    "thirdExternalUserid",
    "thirdGroupId",
    "thirdUserId",
    "uid",
  ]) {
    if (body[key] != null) {
      context[key] = body[key];
    }
  }

  const msgDatas = body.msgDatas;
  if (Array.isArray(msgDatas)) {
    context.messageCount = msgDatas.length;
    context.messageTypes = msgDatas
      .map((item) => (isRecord(item) ? item.msgType : undefined))
      .filter((value) => value != null);
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
