import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";

export type RequestError = {
  message: string;
  status?: number;
  code?: string;
};

export const requestInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api",
  timeout: 15000,
});

requestInstance.interceptors.request.use((config) => {
  const headers = AxiosHeaders.from(config.headers);

  headers.set("X-Workbench-Client", "chat-ai-ui");
  headers.set("Accept", "application/json");

  config.headers = headers;

  return config;
});

function normalizeError(error: unknown): RequestError {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ message?: string }>;

    return {
      message:
        axiosError.response?.data?.message ??
        axiosError.message ??
        "Request failed",
      status: axiosError.response?.status,
      code: axiosError.code,
    };
  }

  if (error instanceof Error) {
    return { message: error.message };
  }

  return { message: "Unknown request error" };
}

export async function request<TResponse = unknown, TPayload = unknown>(
  config: AxiosRequestConfig<TPayload>,
) {
  try {
    const response = await requestInstance.request<
      TResponse,
      AxiosResponse<TResponse>,
      TPayload
    >(config);

    return response.data;
  } catch (error) {
    return Promise.reject(normalizeError(error));
  }
}

export const http = {
  get: <TResponse = unknown>(
    url: string,
    config?: AxiosRequestConfig,
  ) => request<TResponse>({ ...config, method: "GET", url }),
  post: <TResponse = unknown, TPayload = unknown>(
    url: string,
    data?: TPayload,
    config?: AxiosRequestConfig<TPayload>,
  ) => request<TResponse, TPayload>({ ...config, method: "POST", url, data }),
  put: <TResponse = unknown, TPayload = unknown>(
    url: string,
    data?: TPayload,
    config?: AxiosRequestConfig<TPayload>,
  ) => request<TResponse, TPayload>({ ...config, method: "PUT", url, data }),
  patch: <TResponse = unknown, TPayload = unknown>(
    url: string,
    data?: TPayload,
    config?: AxiosRequestConfig<TPayload>,
  ) => request<TResponse, TPayload>({ ...config, method: "PATCH", url, data }),
  delete: <TResponse = unknown>(
    url: string,
    config?: AxiosRequestConfig,
  ) => request<TResponse>({ ...config, method: "DELETE", url }),
};
