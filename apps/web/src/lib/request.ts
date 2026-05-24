import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";
import { notifyAuthSessionChanged } from "@/pages/auth/auth-tokens";
import { useAuthStore } from "@/store/auth-store";
import type { AuthRefreshResponse } from "@chatai/contracts";

export type RequestError = {
  message: string;
  status?: number;
  code?: string;
};

type ApiErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
  };
  success?: false;
};

class ApiEnvelopeError extends Error {
  readonly code?: string;
  readonly status?: number;

  constructor(envelope: ApiErrorEnvelope, status?: number) {
    super(envelope.error?.message ?? "Request failed");
    this.code = envelope.error?.code;
    this.status = status;
  }
}

class RequestNormalizedError extends Error {
  readonly code?: string;
  readonly status?: number;

  constructor(error: RequestError) {
    super(error.message);
    this.code = error.code;
    this.status = error.status;
  }
}

export const requestInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api",
  timeout: 15000,
  withCredentials: true,
});

type AuthRetryConfig = AxiosRequestConfig & {
  _skipAuthRetry?: boolean;
  _authRetry?: boolean;
};

let refreshRequest: Promise<AuthRefreshResponse> | null = null;

requestInstance.interceptors.request.use((config) => {
  const headers = AxiosHeaders.from(config.headers);

  headers.set("X-Workbench-Client", "chat-ai-ui");
  headers.set("Accept", "application/json");

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
      code: apiError?.code ?? axiosError.code,
    };
  }

  if (error instanceof ApiEnvelopeError) {
    return {
      message: error.message,
      status: error.status,
      code: error.code,
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

function toRequestError(error: RequestError) {
  return new RequestNormalizedError(error);
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

  return (value as ApiErrorEnvelope).success === false;
}

async function refreshAuth() {
  refreshRequest ??= request<{ data: AuthRefreshResponse }>({
    method: "POST",
    _skipAuthRetry: true,
    url: "/auth/refresh",
  })
    .then((refresh) => refresh.data)
    .then((refresh) => {
      useAuthStore.getState().setSession(refresh.subUser);
      return refresh;
    })
    .finally(() => {
      refreshRequest = null;
    });

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
        await refreshAuth();

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
        notifyAuthSessionChanged();
        return Promise.reject(toRequestError(normalizeError(refreshError)));
      }
    }

    return Promise.reject(toRequestError(normalizeError(error)));
  }
}

function shouldRefreshAuth(error: unknown, config: AuthRetryConfig) {
  if (config._skipAuthRetry || config._authRetry) {
    return false;
  }

  return axios.isAxiosError(error) && error.response?.status === 401;
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
