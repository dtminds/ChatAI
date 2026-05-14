import type {
  WorkbenchSendMessageResponse,
  WorkbenchUploadCredentialResponse,
} from "@chatai/contracts";
import {
  BadGatewayError,
  ServiceUnavailableError,
} from "../../shared/errors.js";

const DEFAULT_JAVA_INTERNAL_API_TIMEOUT_MS = 8000;

export const JAVA_MSG_TYPE = {
  IMAGE: 2002,
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

export function createWorkbenchJavaClient(): WorkbenchJavaClient {
  const baseUrl = process.env.JAVA_INTERNAL_API_BASE_URL?.replace(/\/+$/, "");
  const token = process.env.JAVA_INTERNAL_API_TOKEN;

  return {
    deleteConversation(input) {
      return postConversationOperate(
        baseUrl,
        token,
        "/third-internal/wap-embed/conversation/delete",
        input,
      );
    },
    getUploadCredential(input) {
      return postJavaEnvelope<WorkbenchUploadCredentialResponse>(
        baseUrl,
        token,
        "/third-internal/file/get-upload-credential",
        input,
      );
    },
    markConversationRead(input) {
      return postConversationOperate(
        baseUrl,
        token,
        "/third-internal/wap-embed/conversation/mark-read",
        input,
      );
    },
    markConversationUnread(input) {
      return postConversationOperate(
        baseUrl,
        token,
        "/third-internal/wap-embed/conversation/mark-unread",
        input,
      );
    },
    pinConversation(input) {
      return postConversationOperate(
        baseUrl,
        token,
        "/third-internal/wap-embed/conversation/pin",
        input,
      );
    },
    async sendMessage(input) {
      const response = await postJavaEnvelope<JavaSendMessageResponse>(
        baseUrl,
        token,
        "/third-internal/wap-embed/conversation/send-message",
        buildJavaSendMessageBody(input),
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
      ).then(() => undefined);
    },
    unpinConversation(input) {
      return postConversationOperate(
        baseUrl,
        token,
        "/third-internal/wap-embed/conversation/unpin",
        input,
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
) {
  await postJavaEnvelope<boolean>(baseUrl, token, path, {
    conversationId: Number(input.conversationId),
    platform: input.platform,
    uid: input.uid,
  });
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
): Promise<T> {
  if (!baseUrl) {
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
): Promise<T> {
  const response = await postJava<JavaApiResponse<T>>(baseUrl, token, path, body);

  if (!response.success) {
    throw new BadGatewayError("JAVA_INTERNAL_API_FAILED", "Java 内部工作台接口调用失败", {
      error: response.error,
      errorMsg: response.errorMsg,
      path,
    });
  }

  return response.data as T;
}

function readJavaApiTimeoutMs() {
  const value = Number.parseInt(process.env.JAVA_INTERNAL_API_TIMEOUT_MS ?? "", 10);

  return Number.isSafeInteger(value) && value > 0
    ? value
    : DEFAULT_JAVA_INTERNAL_API_TIMEOUT_MS;
}
