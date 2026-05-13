import type {
  WorkbenchSendMessagePayload,
  WorkbenchSendMessageResponse,
  WorkbenchUploadCredentialResponse,
} from "@chatai/contracts";
import {
  BadGatewayError,
  ServiceUnavailableError,
} from "../../shared/errors.js";

const DEFAULT_JAVA_INTERNAL_API_TIMEOUT_MS = 8000;

type JavaApiResponse<T> = {
  data?: T;
  error?: number;
  errorMsg?: string;
  success?: boolean;
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
  sendMessage(input: {
    payload: WorkbenchSendMessagePayload;
    subUserId: string;
  }): Promise<WorkbenchSendMessageResponse>;
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
    sendMessage(input) {
      return postJava<WorkbenchSendMessageResponse>(
        baseUrl,
        token,
        "/internal/workbench/messages/send",
        input,
      );
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
