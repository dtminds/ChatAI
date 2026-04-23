/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WECHAT_EMOJI_BASE_URL?: string;
  readonly VITE_WORKBENCH_SERVICE_MODE?: "mock" | "http";
}
