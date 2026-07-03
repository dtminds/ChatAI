import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import {
  defineConfig,
  loadEnv,
  type ProxyOptions,
  type ServerOptions,
  type UserConfig,
} from "vite";
import { resolveOcrRuntimeUrls } from "./src/pages/chat/lib/ocr-runtime-manifest";
import {
  cosDevProxyPlugin,
  parseCosDevProxyRequest,
  resolveCosDevProxyTarget,
  rewriteCosDevProxyPath,
} from "./vite.cos-dev-proxy";

type ViteDevEnv = Record<string, string | undefined>;

const paddleOcrPackageName = "@paddleocr/paddleocr-js";

export function getRepoRoot() {
  return path.resolve(__dirname, "../..");
}

function parsePort(rawPort: string | undefined, fallback: number) {
  if (!rawPort) {
    return fallback;
  }

  const port = Number(rawPort);

  if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid VITE_DEV_SERVER_PORT: ${rawPort}`);
  }

  return port;
}

function readEnv(input: ViteDevEnv, mode: string, envDir: string) {
  return {
    ...loadEnv(mode, envDir, ""),
    ...input,
  };
}

export { parseCosDevProxyRequest, resolveCosDevProxyTarget, rewriteCosDevProxyPath };

export function buildDevProxyConfig(env: ViteDevEnv = {}) {
  const target = env.VITE_DEV_API_PROXY_TARGET ?? "http://127.0.0.1:3001";
  const secure = env.VITE_DEV_API_PROXY_SECURE !== "false";

  return {
    "/api": {
      changeOrigin: true,
      secure,
      target,
    } satisfies ProxyOptions,
  };
}

export function getViteDevServerConfig(
  input: ViteDevEnv = {},
  mode = "development",
  envDir = process.cwd(),
): ServerOptions {
  const env = readEnv(input, mode, envDir);

  return {
    allowedHosts: ["chat-dev.bokr.com.cn"],
    host: env.VITE_DEV_SERVER_HOST ?? "127.0.0.1",
    port: parsePort(env.VITE_DEV_SERVER_PORT, 8086),
    proxy: buildDevProxyConfig(env),
  };
}

export function createViteConfig(mode = "development"): UserConfig {
  const repoRoot = getRepoRoot();
  const env = readEnv({}, mode, repoRoot);
  const paddleOcrModuleUrl = resolveOcrRuntimeUrls({
    paddleModuleUrl: env.VITE_OCR_PADDLE_MODULE_URL,
    paddleWorkerUrl: env.VITE_OCR_PADDLE_WORKER_URL,
    paddleModelBaseUrl: env.VITE_OCR_PADDLE_MODEL_BASE_URL,
    ortWasmBaseUrl: env.VITE_OCR_ORT_WASM_BASE_URL,
  }).paddleModuleUrl;

  return {
    build: {
      rollupOptions: {
        external: [paddleOcrPackageName],
        output: {
          paths: {
            [paddleOcrPackageName]: paddleOcrModuleUrl,
          },
        },
      },
    },
    envDir: repoRoot,
    plugins: [react(), tailwindcss(), cosDevProxyPlugin()],
    server: getViteDevServerConfig({}, mode, repoRoot),
    resolve: {
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@chatai/contracts": path.resolve(
          repoRoot,
          "packages/contracts/src/index.ts",
        ),
      },
    },
  };
}

export default defineConfig(({ mode }) => createViteConfig(mode));
