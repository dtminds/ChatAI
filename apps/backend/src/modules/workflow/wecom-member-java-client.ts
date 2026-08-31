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

const JAVA_DEPARTMENT_USER_PATH = "/third-internal/work-party/get-all-department-user";

export const WECOM_MEMBER_INTERNAL_API_FAILED_CODE = "WECOM_MEMBER_INTERNAL_API_FAILED";
export const WECOM_MEMBER_INTERNAL_API_NOT_CONFIGURED_CODE =
  "WECOM_MEMBER_INTERNAL_API_NOT_CONFIGURED";
export const WECOM_MEMBER_INTERNAL_API_USER_MESSAGE = "操作失败，请稍后重试";

export const JAVA_WECOM_MEMBER_SELECT_TYPE_DEPARTMENT_AND_USER = 2;
export const JAVA_WECOM_MEMBER_STATUS_ACTIVE = 1;
export const JAVA_WECOM_MEMBER_EXTERNAL_CONTACT_ONLY = 1;
export const JAVA_WECOM_MEMBER_LICENSE_UNRESTRICTED = 0;

export type WecomMemberJavaNode = {
  avatar?: string | null;
  children?: WecomMemberJavaNode[] | null;
  key?: string | null;
  title?: string | null;
  type?: number | null;
  userKey?: string | null;
  visible?: boolean | null;
  notLicense?: boolean | null;
};

export type WecomMemberJavaTree = {
  roots?: WecomMemberJavaNode[] | null;
  userLimit?: number | null;
};

export type WecomMemberJavaClient = {
  listDepartmentUsers: (input: { uid: number }) => Promise<WecomMemberJavaTree>;
};

export function createWecomMemberJavaClient(
  logger: AppLogger | RequestAwareLogger = noopLogger,
): WecomMemberJavaClient {
  const baseUrl = process.env.JAVA_INTERNAL_API_BASE_URL?.replace(/\/$/, "");
  const token = process.env.JAVA_INTERNAL_API_TOKEN;

  return {
    async listDepartmentUsers(input) {
      const response = await postJavaRequest<unknown>({
        baseUrl,
        body: JSON.stringify({
          isExternal: JAVA_WECOM_MEMBER_EXTERNAL_CONTACT_ONLY,
          isLicense: JAVA_WECOM_MEMBER_LICENSE_UNRESTRICTED,
          selectType: JAVA_WECOM_MEMBER_SELECT_TYPE_DEPARTMENT_AND_USER,
          status: JAVA_WECOM_MEMBER_STATUS_ACTIVE,
          uid: input.uid,
          withDefaultRootDepart: true,
        }),
        logContext: { uid: input.uid },
        logger,
        operation: "wecom-member-tree",
        path: JAVA_DEPARTMENT_USER_PATH,
        token,
      });

      const payload = decodeJavaResponse(response, "wecom-member-tree", logger);

      return extractJavaTree(payload);
    },
  };
}

function extractJavaTree(payload: Record<string, unknown>): WecomMemberJavaTree {
  const data = payload.data;

  if (data && typeof data === "object" && !Array.isArray(data)) {
    const tree = data as Partial<WecomMemberJavaTree>;
    return {
      roots: Array.isArray(tree.roots) ? tree.roots : [],
      userLimit: tree.userLimit,
    };
  }

  return { roots: [] };
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
    WECOM_MEMBER_INTERNAL_API_FAILED_CODE,
    WECOM_MEMBER_INTERNAL_API_USER_MESSAGE,
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
      WECOM_MEMBER_INTERNAL_API_FAILED_CODE,
      WECOM_MEMBER_INTERNAL_API_USER_MESSAGE,
    ),
    createHttpFailureError: status => new UpstreamHttpError(
      WECOM_MEMBER_INTERNAL_API_FAILED_CODE,
      WECOM_MEMBER_INTERNAL_API_USER_MESSAGE,
      mapJavaHttpFailureStatus(status),
    ),
    createNotConfiguredError: () => new ServiceUnavailableError(
      WECOM_MEMBER_INTERNAL_API_NOT_CONFIGURED_CODE,
      WECOM_MEMBER_INTERNAL_API_USER_MESSAGE,
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
