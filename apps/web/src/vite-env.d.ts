/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DEV_API_PROXY_SECURE?: string;
  readonly VITE_DEV_API_PROXY_TARGET?: string;
  readonly VITE_DEV_SERVER_HOST?: string;
  readonly VITE_DEV_SERVER_PORT?: string;
  readonly VITE_WECHAT_EMOJI_BASE_URL?: string;
  readonly VITE_WORKBENCH_SERVICE_MODE?: "mock" | "http";
}
