import { decodeJavaInternalApiEnvelope } from "@chatai/contracts";
import {
  BadGatewayError,
  ServiceUnavailableError,
  UpstreamHttpError,
} from "../../shared/errors.js";
import {
  noopLogger,
  type AppLogger,
  type RequestAwareLogger,
} from "../../shared/logger.js";
import { postJavaInternalApi } from "./java-internal-api-client.js";

const JAVA_CONTACT_LIST_PATH = "/third-internal/work-external-contact/get-contact-list";

export const WECOM_CONTACT_INTERNAL_API_FAILED_CODE = "WECOM_CONTACT_INTERNAL_API_FAILED";
export const WECOM_CONTACT_INTERNAL_API_NOT_CONFIGURED_CODE =
  "WECOM_CONTACT_INTERNAL_API_NOT_CONFIGURED";
export const WECOM_CONTACT_INTERNAL_API_USER_MESSAGE = "操作失败，请稍后重试";

export type WecomContactProfile = {
  avatar: string | null;
  name: string;
};

export type WecomContactDirectory = {
  listByExternalUserIds(input: {
    externalUserIds: number[];
    uid: number;
  }): Promise<Map<number, WecomContactProfile>>;
};

export function createWecomContactJavaClient(
  logger: AppLogger | RequestAwareLogger = noopLogger,
): WecomContactDirectory {
  const baseUrl = process.env.JAVA_INTERNAL_API_BASE_URL?.replace(/\/$/, "");
  const token = process.env.JAVA_INTERNAL_API_TOKEN;

  return {
    async listByExternalUserIds(input) {
      const externalUserIds = uniquePositiveIntegers(input.externalUserIds);
      if (externalUserIds.length === 0) {
        return new Map();
      }

      const response = await postJavaRequest<unknown>({
        baseUrl,
        body: JSON.stringify({
          externalUserIds,
          uid: input.uid,
        }),
        logContext: {
          externalUserIdCount: externalUserIds.length,
          uid: input.uid,
        },
        logger,
        operation: "wecom-contact-list",
        path: JAVA_CONTACT_LIST_PATH,
        token,
      });

      const payload = decodeJavaResponse(response, "wecom-contact-list", logger);
      if (!Array.isArray(payload.data)) {
        throw invalidJavaData("wecom-contact-list", "data must be an array");
      }

      return extractContacts(payload.data);
    },
  };
}

function extractContacts(value: unknown[]): Map<number, WecomContactProfile> {
  const contacts = new Map<number, WecomContactProfile>();

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as { avatar?: unknown; id?: unknown; name?: unknown };
    const id = parseExternalUserId(record.id);
    if (id === null) continue;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const avatar = typeof record.avatar === "string" ? record.avatar.trim() : "";
    contacts.set(id, {
      avatar: avatar || null,
      name: name || "未知客户",
    });
  }

  return contacts;
}

function parseExternalUserId(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function uniquePositiveIntegers(values: number[]) {
  return [...new Set(values.filter((value) => Number.isSafeInteger(value) && value > 0))];
}

function decodeJavaResponse(
  response: unknown,
  operation: string,
  logger: AppLogger | RequestAwareLogger,
): Record<string, unknown> {
  const envelope = decodeJavaInternalApiEnvelope(response);
  if (envelope.kind === "success") {
    return envelope.payload;
  }

  const details = envelope.kind === "rejected"
    ? { error: envelope.error, errorMsg: envelope.errorMsg, operation }
    : { operation, reason: envelope.reason };
  logger.error(details, "内部接口业务失败");

  throw new BadGatewayError(
    WECOM_CONTACT_INTERNAL_API_FAILED_CODE,
    WECOM_CONTACT_INTERNAL_API_USER_MESSAGE,
    details,
  );
}

function invalidJavaData(operation: string, reason: string) {
  return new BadGatewayError(
    WECOM_CONTACT_INTERNAL_API_FAILED_CODE,
    WECOM_CONTACT_INTERNAL_API_USER_MESSAGE,
    { operation, reason },
  );
}

type PostJavaRequestOptions = {
  baseUrl: string | undefined;
  body: string;
  logContext: Record<string, unknown>;
  logger: AppLogger | RequestAwareLogger;
  operation: string;
  path: string;
  token: string | undefined;
};

async function postJavaRequest<T>({
  baseUrl,
  body,
  logContext,
  logger,
  operation,
  path,
  token,
}: PostJavaRequestOptions): Promise<T> {
  return postJavaInternalApi<T>({
    baseUrl,
    body,
    createFailureError: () => new BadGatewayError(
      WECOM_CONTACT_INTERNAL_API_FAILED_CODE,
      WECOM_CONTACT_INTERNAL_API_USER_MESSAGE,
    ),
    createHttpFailureError: status => new UpstreamHttpError(
      WECOM_CONTACT_INTERNAL_API_FAILED_CODE,
      WECOM_CONTACT_INTERNAL_API_USER_MESSAGE,
      mapJavaHttpFailureStatus(status),
    ),
    createNotConfiguredError: () => new ServiceUnavailableError(
      WECOM_CONTACT_INTERNAL_API_NOT_CONFIGURED_CODE,
      WECOM_CONTACT_INTERNAL_API_USER_MESSAGE,
    ),
    logContext,
    logger,
    operation,
    path,
    token,
  });
}

function mapJavaHttpFailureStatus(status: number) {
  if (status === 429 || status === 503 || status === 504) {
    return status;
  }

  return 502;
}
