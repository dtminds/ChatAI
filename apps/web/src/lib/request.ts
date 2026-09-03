import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";
import { notifyAuthSessionChanged } from "@/pages/auth/auth-tokens";
import { useAuthStore } from "@/store/auth-store";
import { getEmbedAccessToken } from "@/lib/embed-access-token";
import {
  getAuthRequestAdapter,
  getAuthScopeForHostname,
  type AuthScope,
  type AuthRefreshPayload,
} from "@/lib/auth-request-adapter";
import type { AuthSubUser } from "@chatai/contracts";

export type RequestError = {
  details?: Record<string, unknown>;
  message: string;
  status?: number;
  code?: string;
};

type ApiErrorEnvelope = {
  error?: {
    code?: string;
    details?: Record<string, unknown>;
    message?: string;
  };
  success?: false;
};

class ApiEnvelopeError extends Error {
  readonly code?: string;
  readonly details?: Record<string, unknown>;
  readonly status?: number;

  constructor(envelope: ApiErrorEnvelope, status?: number) {
    super(envelope.error?.message ?? "Request failed");
    this.code = envelope.error?.code;
    this.details = envelope.error?.details;
    this.status = status;
  }
}

export class RequestNormalizedError extends Error {
  readonly code?: string;
  readonly details?: Record<string, unknown>;
  readonly status?: number;

  constructor(error: RequestError, cause?: unknown) {
    super(error.message, cause === undefined ? undefined : { cause });
    this.name = "RequestNormalizedError";
    this.code = error.code;
    this.details = error.details;
    this.status = error.status;

    if (cause instanceof Error && cause.stack) {
      this.stack = cause.stack;
    }
  }
}

export const requestInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api",
  timeout: 15000,
  withCredentials: true,
});

type AuthRetryConfig = AxiosRequestConfig & {
  authScope?: AuthScope;
  _skipAuthRetry?: boolean;
  _authRetry?: boolean;
  _notifyAuthSessionChanged?: boolean;
  supportReadonlyAllowed?: boolean;
};

const refreshRequests: Partial<
  Record<AuthScope, Promise<{ subUser: AuthSubUser }>>
> = {};

requestInstance.interceptors.request.use((config) => {
  const requestConfig = config as typeof config & AuthRetryConfig;

  if (
    isSupportReadOnlySession()
    && isMutatingMethod(requestConfig.method)
    && !requestConfig.supportReadonlyAllowed
  ) {
    return Promise.reject(new RequestNormalizedError({
      code: "SUPPORT_READ_ONLY",
      message: "诊断模式无法执行该操作",
      status: 403,
    }));
  }

  const headers = AxiosHeaders.from(config.headers);

  headers.set("X-Workbench-Client", "chat-ai-ui");
  headers.set("Accept", "application/json");
  const embedAccessToken = getEmbedAccessToken();

  if (embedAccessToken && !headers.get("Authorization")) {
    headers.set("Authorization", `Bearer ${embedAccessToken}`);
  }

  config.headers = headers;

  return config;
});

function normalizeError(error: unknown): RequestError {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiErrorEnvelope & { message?: string }>;
    const apiError = axiosError.response?.data?.error;

    return {
      message:
        apiError?.message ??
        axiosError.response?.data?.message ??
        axiosError.message ??
        "Request failed",
      status: axiosError.response?.status,
      code:
        apiError?.code
        ?? axiosError.code
        ?? (axiosError.response ? undefined : "ERR_NETWORK"),
      details: apiError?.details,
    };
  }

  if (error instanceof ApiEnvelopeError) {
    return {
      message: error.message,
      status: error.status,
      code: error.code,
      details: error.details,
    };
  }

  if (isRequestError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return { message: error.message };
  }

  return { message: "Unknown request error" };
}

function toRequestError(error: RequestError | RequestNormalizedError, cause?: unknown) {
  if (error instanceof RequestNormalizedError) {
    return error;
  }

  return new RequestNormalizedError(error, cause);
}

export function isRequestError(error: unknown): error is RequestError {
  if (!error || typeof error !== "object") {
    return false;
  }

  return typeof (error as RequestError).message === "string";
}

function isApiErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (!value || typeof value !== "object") {
    return false;
  }

  const envelope = value as ApiErrorEnvelope;

  return envelope.success === false && envelope.error !== undefined;
}

async function refreshAuth(scope: AuthScope) {
  const adapter = getAuthRequestAdapter(scope);
  const existingRequest = refreshRequests[scope];

  if (existingRequest) {
    return existingRequest;
  }

  const refreshRequest = request<{ data: AuthRefreshPayload }>({
    authScope: scope,
    method: "POST",
    _skipAuthRetry: true,
    url: adapter.refreshUrl,
  })
    .then((refresh) => refresh.data)
    .then((refresh) => {
      const subUser = adapter.applyRefresh(refresh);
      useAuthStore.getState().setSession(subUser);
      return { subUser };
    })
    .finally(() => {
      delete refreshRequests[scope];
    });
  refreshRequests[scope] = refreshRequest;

  return refreshRequest;
}

export async function request<TResponse = unknown, TPayload = unknown>(
  config: AuthRetryConfig & AxiosRequestConfig<TPayload>,
) {
  try {
    const response = await requestInstance.request<
      TResponse,
      AxiosResponse<TResponse>,
      TPayload
    >(config);

    if (isApiErrorEnvelope(response.data)) {
      throw new ApiEnvelopeError(response.data, response.status);
    }

    return response.data;
  } catch (error) {
    if (shouldRefreshAuth(error, config)) {
      try {
        await refreshAuth(resolveAuthScope(config.authScope));

        const retryConfig = {
          ...config,
          _authRetry: true,
        };

        const retryResponse = await requestInstance.request<
          TResponse,
          AxiosResponse<TResponse>,
          TPayload
        >(retryConfig);

        if (isApiErrorEnvelope(retryResponse.data)) {
          throw new ApiEnvelopeError(retryResponse.data, retryResponse.status);
        }

        return retryResponse.data;
      } catch (refreshError) {
        if (config._notifyAuthSessionChanged !== false) {
          notifyAuthSessionChanged();
        }
        return Promise.reject(toRequestError(normalizeError(refreshError), refreshError));
      }
    }

    if (shouldEndSupportSession(error, config)) {
      notifyAuthSessionChanged();
    }

    return Promise.reject(toRequestError(normalizeError(error), error));
  }
}

function resolveAuthScope(scope: AuthScope | undefined): AuthScope {
  if (scope) {
    return scope;
  }

  return getAuthScopeForHostname(
    typeof window === "undefined" ? "" : window.location.hostname,
  );
}

function shouldRefreshAuth(error: unknown, config: AuthRetryConfig) {
  if (
    config._skipAuthRetry
    || config._authRetry
    || isSupportReadOnlySession()
  ) {
    return false;
  }

  return axios.isAxiosError(error) && error.response?.status === 401;
}

function shouldEndSupportSession(error: unknown, config: AuthRetryConfig) {
  return !config._skipAuthRetry
    && isSupportReadOnlySession()
    && axios.isAxiosError(error)
    && error.response?.status === 401;
}

function isSupportReadOnlySession() {
  return useAuthStore.getState().subUser?.accessMode === "support_readonly";
}

function isMutatingMethod(method: string | undefined) {
  return !new Set(["GET", "HEAD", "OPTIONS"]).has(
    (method ?? "GET").toUpperCase(),
  );
}

export const http = {
  get: <TResponse = unknown>(
    url: string,
    config?: AuthRetryConfig,
  ) => request<TResponse>({ ...config, method: "GET", url }),
  post: <TResponse = unknown, TPayload = unknown>(
    url: string,
    data?: TPayload,
    config?: AuthRetryConfig & AxiosRequestConfig<TPayload>,
  ) => request<TResponse, TPayload>({ ...config, method: "POST", url, data }),
  put: <TResponse = unknown, TPayload = unknown>(
    url: string,
    data?: TPayload,
    config?: AuthRetryConfig & AxiosRequestConfig<TPayload>,
  ) => request<TResponse, TPayload>({ ...config, method: "PUT", url, data }),
  patch: <TResponse = unknown, TPayload = unknown>(
    url: string,
    data?: TPayload,
    config?: AuthRetryConfig & AxiosRequestConfig<TPayload>,
  ) => request<TResponse, TPayload>({ ...config, method: "PATCH", url, data }),
  delete: <TResponse = unknown>(
    url: string,
    config?: AuthRetryConfig,
  ) => request<TResponse>({ ...config, method: "DELETE", url }),
};
