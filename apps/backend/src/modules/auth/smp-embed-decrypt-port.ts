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
import { postJavaInternalApi } from "../workflow/java-internal-api-client.js";

export const SMP_EMBED_AES_DECRYPT_PATH = "/third-internal/smp-encrypt/aes-decrypt";
export const SMP_EMBED_DECRYPT_INTERNAL_API_FAILED_CODE =
  "SMP_EMBED_DECRYPT_INTERNAL_API_FAILED";
export const SMP_EMBED_DECRYPT_INTERNAL_API_NOT_CONFIGURED_CODE =
  "SMP_EMBED_DECRYPT_INTERNAL_API_NOT_CONFIGURED";
export const SMP_EMBED_DECRYPT_USER_MESSAGE = "操作失败，请稍后重试";

export type SmpEmbedDecryptPort = {
  decrypt(content: string): Promise<string>;
};

export function createJavaSmpEmbedDecryptPort(
  logger: AppLogger | RequestAwareLogger = noopLogger,
): SmpEmbedDecryptPort {
  const baseUrl = process.env.JAVA_INTERNAL_API_BASE_URL?.replace(/\/$/, "");
  const token = process.env.JAVA_INTERNAL_API_TOKEN;

  return {
    async decrypt(content) {
      const response = await postJavaInternalApi<unknown>({
        baseUrl,
        body: JSON.stringify({ content }),
        createFailureError: () => internalApiFailedError(),
        createNotConfiguredError: () => new ServiceUnavailableError(
          SMP_EMBED_DECRYPT_INTERNAL_API_NOT_CONFIGURED_CODE,
          SMP_EMBED_DECRYPT_USER_MESSAGE,
        ),
        logger,
        operation: "smp-embed-aes-decrypt",
        path: SMP_EMBED_AES_DECRYPT_PATH,
        token,
      });

      const envelope = decodeJavaInternalApiEnvelope(response);
      if (envelope.kind !== "success") {
        const details = envelope.kind === "rejected"
          ? {
              error: envelope.error,
              errorMsg: envelope.errorMsg,
              operation: "smp-embed-aes-decrypt",
            }
          : {
              operation: "smp-embed-aes-decrypt",
              reason: envelope.reason,
            };

        logger.error(details, "内部接口业务失败");
        throw internalApiFailedError(details);
      }

      if (typeof envelope.payload.data !== "string" || envelope.payload.data.trim().length === 0) {
        const details = {
          operation: "smp-embed-aes-decrypt",
          reason: "data must be a non-empty string",
        };
        logger.error(details, "内部接口返回无效数据");
        throw internalApiFailedError(details);
      }

      return envelope.payload.data;
    },
  };
}

function internalApiFailedError(details?: Record<string, unknown>) {
  return new BadGatewayError(
    SMP_EMBED_DECRYPT_INTERNAL_API_FAILED_CODE,
    SMP_EMBED_DECRYPT_USER_MESSAGE,
    details,
  );
}
