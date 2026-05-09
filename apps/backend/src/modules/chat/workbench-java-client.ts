import type {
  WorkbenchConversationReadResponse,
  WorkbenchSendMessagePayload,
  WorkbenchSendMessageResponse,
  WorkbenchTakeOverSeatResponse,
} from "@chatai/contracts";
import {
  BadGatewayError,
  ServiceUnavailableError,
} from "../../shared/errors.js";

const DEFAULT_JAVA_INTERNAL_API_TIMEOUT_MS = 8000;

export type WorkbenchJavaClient = {
  markConversationRead(input: {
    conversationId: string;
    subUserId: string;
  }): Promise<WorkbenchConversationReadResponse>;
  sendMessage(input: {
    payload: WorkbenchSendMessagePayload;
    subUserId: string;
  }): Promise<WorkbenchSendMessageResponse>;
  takeOverSeat(input: {
    seatId: string;
    subUserId: string;
  }): Promise<WorkbenchTakeOverSeatResponse>;
};

export function createWorkbenchJavaClient(): WorkbenchJavaClient {
  const baseUrl = process.env.JAVA_INTERNAL_API_BASE_URL?.replace(/\/+$/, "");
  const token = process.env.JAVA_INTERNAL_API_TOKEN;

  return {
    markConversationRead(input) {
      return postJava<WorkbenchConversationReadResponse>(
        baseUrl,
        token,
        "/internal/workbench/conversations/read",
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
      return postJava<WorkbenchTakeOverSeatResponse>(
        baseUrl,
        token,
        "/internal/workbench/seats/take-over",
        input,
      );
    },
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

function readJavaApiTimeoutMs() {
  const value = Number.parseInt(process.env.JAVA_INTERNAL_API_TIMEOUT_MS ?? "", 10);

  return Number.isSafeInteger(value) && value > 0
    ? value
    : DEFAULT_JAVA_INTERNAL_API_TIMEOUT_MS;
}
