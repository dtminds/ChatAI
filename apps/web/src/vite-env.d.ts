/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DEV_API_PROXY_SECURE?: string;
  readonly VITE_DEV_API_PROXY_TARGET?: string;
  readonly VITE_DEV_SERVER_HOST?: string;
  readonly VITE_DEV_SERVER_PORT?: string;
  readonly VITE_OCR_PADDLE_MODULE_URL?: string;
  readonly VITE_OCR_PADDLE_MODEL_BASE_URL?: string;
  readonly VITE_OCR_PADDLE_WORKER_URL?: string;
  readonly VITE_OCR_ORT_WASM_BASE_URL?: string;
  readonly VITE_PLAYABLE_MEDIA_HOST?: string;
  readonly VITE_WECHAT_EMOJI_BASE_URL?: string;
  readonly VITE_WORKFLOW_FIXTURES_ENABLED?: string;
}
