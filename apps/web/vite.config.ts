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

type ViteDevEnv = Record<string, string | undefined>;

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

export function buildDevProxyConfig(env: ViteDevEnv = {}) {
  const target = env.VITE_DEV_API_PROXY_TARGET ?? "http://127.0.0.1:3001";
  const secure = env.VITE_DEV_API_PROXY_SECURE !== "false";

  return {
    "/api": {
      changeOrigin: true,
      secure,
      target,
    } satisfies ProxyOptions,
    /**
     * 未登录页面（例如登录页）无法带 JWT 调 /api/server/media/proxy，
     * 开发环境经由 Vite 直连 OSS，避免 CORS + 鉴权阻拦。
     * 语音 SILK 播放请走 /api/server/public/oss-media/play（需后端运行以转 WAV）。
     */
    "/__chatai-dev-media": {
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/__chatai-dev-media/, "") || "/",
      secure: true,
      target: "https://oss.bilinl.com",
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
    host: env.VITE_DEV_SERVER_HOST ?? "127.0.0.1",
    port: parsePort(env.VITE_DEV_SERVER_PORT, 8086),
    proxy: buildDevProxyConfig(env),
  };
}

export function createViteConfig(mode = "development"): UserConfig {
  const repoRoot = getRepoRoot();
  const envForPreview = readEnv({}, mode, repoRoot);

  return {
    envDir: repoRoot,
    plugins: [react(), tailwindcss()],
    preview: {
      host: envForPreview.VITE_DEV_SERVER_HOST ?? "127.0.0.1",
      proxy: buildDevProxyConfig(envForPreview),
    },
    server: getViteDevServerConfig({}, mode, repoRoot),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@chatai/contracts": path.resolve(
          __dirname,
          "../../packages/contracts/src/index.ts",
        ),
      },
    },
  };
}

export default defineConfig(({ mode }) => createViteConfig(mode));
