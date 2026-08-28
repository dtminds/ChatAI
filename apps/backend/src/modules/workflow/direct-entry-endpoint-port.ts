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

export const WORKFLOW_DIRECT_ENTRY_ENCRYPT_PATH = "/third-internal/smp-encrypt/aes-encrypt";
export const WORKFLOW_DIRECT_ENTRY_INTERNAL_API_FAILED_CODE =
  "WORKFLOW_DIRECT_ENTRY_INTERNAL_API_FAILED";
export const WORKFLOW_DIRECT_ENTRY_INTERNAL_API_NOT_CONFIGURED_CODE =
  "WORKFLOW_DIRECT_ENTRY_INTERNAL_API_NOT_CONFIGURED";
export const WORKFLOW_DIRECT_ENTRY_INTERNAL_API_USER_MESSAGE = "操作失败，请稍后重试";

type JavaEncryptResponse = {
  data?: unknown;
  error?: unknown;
  errorMsg?: unknown;
  success?: unknown;
};

export type WorkflowDirectEntryEndpointPort = {
  getEndpointKey(input: { uid: number; workflowId: string }): Promise<string>;
};

export function createJavaWorkflowDirectEntryEndpointPort(
  logger: AppLogger | RequestAwareLogger = noopLogger,
): WorkflowDirectEntryEndpointPort {
  const baseUrl = process.env.JAVA_INTERNAL_API_BASE_URL?.replace(/\/$/, "");
  const token = process.env.JAVA_INTERNAL_API_TOKEN;

  return {
    async getEndpointKey(input) {
      const response = await postJavaRequest({
        baseUrl,
        body: JSON.stringify({ content: input.workflowId }),
        logger,
        token,
        uid: input.uid,
        workflowId: input.workflowId,
      });

      if (response.success !== true) {
        logger.error(
          {
            error: response.error,
            hasErrorMessage: typeof response.errorMsg === "string" && Boolean(response.errorMsg),
            operation: "workflow-direct-entry-encrypt",
            uid: input.uid,
            workflowId: input.workflowId,
          },
          "内部接口业务失败",
        );
        throw internalApiFailedError();
      }

      if (typeof response.data !== "string" || response.data.trim().length === 0) {
        logger.error(
          {
            operation: "workflow-direct-entry-encrypt",
            uid: input.uid,
            workflowId: input.workflowId,
          },
          "内部接口返回无效数据",
        );
        throw internalApiFailedError();
      }

      return response.data;
    },
  };
}

export class UnavailableWorkflowDirectEntryEndpointPort
implements WorkflowDirectEntryEndpointPort {
  async getEndpointKey(): Promise<string> {
    throw new ServiceUnavailableError(
      WORKFLOW_DIRECT_ENTRY_INTERNAL_API_NOT_CONFIGURED_CODE,
      WORKFLOW_DIRECT_ENTRY_INTERNAL_API_USER_MESSAGE,
    );
  }
}

async function postJavaRequest(input: {
  baseUrl: string | undefined;
  body: string;
  logger: AppLogger | RequestAwareLogger;
  token: string | undefined;
  uid: number;
  workflowId: string;
}): Promise<JavaEncryptResponse> {
  const operation = "workflow-direct-entry-encrypt";
  const requestId = getLoggerRequestId(input.logger);

  if (!input.baseUrl) {
    input.logger.error(
      {
        operation,
        path: WORKFLOW_DIRECT_ENTRY_ENCRYPT_PATH,
        requestId,
      },
      "内部接口未配置",
    );
    throw new ServiceUnavailableError(
      WORKFLOW_DIRECT_ENTRY_INTERNAL_API_NOT_CONFIGURED_CODE,
      WORKFLOW_DIRECT_ENTRY_INTERNAL_API_USER_MESSAGE,
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), readJavaApiTimeoutMs());

  try {
    const response = await fetch(`${input.baseUrl}${WORKFLOW_DIRECT_ENTRY_ENCRYPT_PATH}`, {
      body: input.body,
      headers: {
        "content-type": "application/json",
        ...(input.token ? { authorization: `Bearer ${input.token}` } : {}),
        ...(requestId ? { "x-request-id": requestId } : {}),
      },
      method: "POST",
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: unknown;

    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      input.logger.error(
        {
          operation,
          path: WORKFLOW_DIRECT_ENTRY_ENCRYPT_PATH,
          requestId,
          status: response.status,
          uid: input.uid,
          workflowId: input.workflowId,
        },
        "内部接口返回非 JSON",
      );
      throw internalApiFailedError();
    }

    if (!response.ok) {
      input.logger.error(
        {
          operation,
          path: WORKFLOW_DIRECT_ENTRY_ENCRYPT_PATH,
          requestId,
          status: response.status,
          uid: input.uid,
          workflowId: input.workflowId,
        },
        "内部接口 HTTP 失败",
      );
      throw internalApiFailedError();
    }

    if (!isRecord(parsed)) throw internalApiFailedError();
    return parsed;
  } catch (error) {
    if (error instanceof BadGatewayError || error instanceof ServiceUnavailableError) {
      throw error;
    }

    input.logger.error(
      {
        err: error,
        operation,
        path: WORKFLOW_DIRECT_ENTRY_ENCRYPT_PATH,
        requestId,
        uid: input.uid,
        workflowId: input.workflowId,
      },
      "内部接口请求异常",
    );
    throw internalApiFailedError();
  } finally {
    clearTimeout(timeoutId);
  }
}

function internalApiFailedError() {
  return new BadGatewayError(
    WORKFLOW_DIRECT_ENTRY_INTERNAL_API_FAILED_CODE,
    WORKFLOW_DIRECT_ENTRY_INTERNAL_API_USER_MESSAGE,
  );
}

function isRecord(value: unknown): value is JavaEncryptResponse {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJavaApiTimeoutMs() {
  const raw = Number(process.env.JAVA_INTERNAL_API_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_JAVA_INTERNAL_API_TIMEOUT_MS;
}
