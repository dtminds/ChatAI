import {
  BadGatewayError,
  ServiceUnavailableError,
} from "../../shared/errors.js";
import {
  noopLogger,
  type AppLogger,
  type RequestAwareLogger,
} from "../../shared/logger.js";
import { postJavaInternalApi } from "./java-internal-api-client.js";

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
      const response = await postJavaInternalApi<JavaEncryptResponse>({
        baseUrl,
        body: JSON.stringify({ content: input.workflowId }),
        createFailureError: internalApiFailedError,
        createNotConfiguredError: () => new ServiceUnavailableError(
          WORKFLOW_DIRECT_ENTRY_INTERNAL_API_NOT_CONFIGURED_CODE,
          WORKFLOW_DIRECT_ENTRY_INTERNAL_API_USER_MESSAGE,
        ),
        logContext: { uid: input.uid, workflowId: input.workflowId },
        logger,
        operation: "workflow-direct-entry-encrypt",
        path: WORKFLOW_DIRECT_ENTRY_ENCRYPT_PATH,
        token,
      });

      if (!isRecord(response)) throw internalApiFailedError();

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

function internalApiFailedError() {
  return new BadGatewayError(
    WORKFLOW_DIRECT_ENTRY_INTERNAL_API_FAILED_CODE,
    WORKFLOW_DIRECT_ENTRY_INTERNAL_API_USER_MESSAGE,
  );
}

function isRecord(value: unknown): value is JavaEncryptResponse {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
