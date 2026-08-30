import { decodeJavaInternalApiEnvelope } from "@chatai/contracts";
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
      const response = await postJavaInternalApi<unknown>({
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

      const envelope = decodeJavaInternalApiEnvelope(response);
      if (envelope.kind !== "success") {
        logger.error(
          envelope.kind === "rejected"
            ? {
                error: envelope.error,
                hasErrorMessage: Boolean(envelope.errorMsg),
                operation: "workflow-direct-entry-encrypt",
                uid: input.uid,
                workflowId: input.workflowId,
              }
            : {
                operation: "workflow-direct-entry-encrypt",
                reason: envelope.reason,
                uid: input.uid,
                workflowId: input.workflowId,
              },
          "内部接口业务失败",
        );
        throw internalApiFailedError();
      }

      if (typeof envelope.payload.data !== "string" || envelope.payload.data.trim().length === 0) {
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

      return envelope.payload.data;
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
