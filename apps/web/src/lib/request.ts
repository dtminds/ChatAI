import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";
import { notifyAuthSessionChanged } from "@/pages/auth/auth-tokens";
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

  if (isRequestError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return { message: error.message };
  }

  return { message: "Unknown request error" };
}

function isRequestError(error: unknown): error is RequestError {
  if (!error || typeof error !== "object") {
    return false;
  }

  return typeof (error as RequestError).message === "string";
}

async function refreshAuth() {
  refreshRequest ??= request<{ data: AuthRefreshResponse }>({
    method: "POST",
    _skipAuthRetry: true,
    url: "/auth/refresh",
  })
    .then((refresh) => refresh.data)
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

        return retryResponse.data;
      } catch (refreshError) {
        notifyAuthSessionChanged();
        return Promise.reject(normalizeError(refreshError));
      }
    }

    return Promise.reject(normalizeError(error));
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
