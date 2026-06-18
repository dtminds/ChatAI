# Browser OCR Runtime Assets

本文档说明浏览器 OCR 依赖的 PaddleOCR 模型和 ONNX Runtime Web 资源如何发布到 COS / CDN。

## 配置来源

OCR CDN 默认地址的唯一真相在：

```text
apps/web/src/pages/chat/lib/ocr-runtime-manifest.ts
```

该 manifest 定义 CDN origin、PaddleOCR / ORT 版本、worker 文件名和模型 tar 文件名。运行时与 Vite build 都通过 `getDefaultOcrCdnUrls()` / `resolveOcrRuntimeUrls()` 读取默认值。

构建时环境变量仅作 override，正常发 web 不必配置：

```text
VITE_OCR_PADDLE_MODULE_URL
VITE_OCR_PADDLE_WORKER_URL
VITE_OCR_PADDLE_MODEL_BASE_URL
VITE_OCR_ORT_WASM_BASE_URL
```

目录 URL 必须以版本号隔离，不要使用无版本目录覆盖发布。

## 日常发 web

只改业务代码、不发 OCR 栈时：

1. 确认 CDN 上 manifest 指向的版本目录仍完整可用
2. 运行 web build 和相关 OCR 测试
3. 发布 web 镜像

此流程不需要改 manifest、`.env` 或重新上传 OCR 资源。

## 升级 OCR 栈

升级 `@paddleocr/paddleocr-js`、`onnxruntime-web` 或模型时：

1. 修改 `apps/web/package.json` 中的精确版本，安装依赖并更新 lockfile
2. 更新 `apps/web/src/pages/chat/lib/ocr-runtime-manifest.ts` 中的版本号、worker 文件名或模型文件名
3. 重新运行 `pnpm --filter @chatai/web build:ocr-runtime`
4. 上传新资源到新版本 CDN 目录（见下文），不覆盖旧目录
5. 运行 OCR 相关测试和 web build
6. 仅在预发或临时切换 CDN 时，才通过 `VITE_OCR_*` 覆盖 manifest 默认值

不要只升级 npm 依赖而继续使用旧版本 CDN 目录。版本不匹配可能导致 OCR 初始化失败或 WASM 运行时异常。

## 需要上传的文件

先构建 PaddleOCR 浏览器运行时：

```bash
pnpm --filter @chatai/web build:ocr-runtime
```

上传以下文件，并保持相对路径不变。目标目录由 manifest 推导，例如当前版本对应：

```text
{paddleBase}/index.mjs
{paddleBase}/assets/worker-entry-*.js
{paddleBase}/ort.bundle.min-*.js
```

其中 `{paddleBase}` 形如 `https://b5.bokr.com.cn/dist/ocr/paddleocr-js/0.4.2`。

`build:ocr-runtime` 也可能输出 `assets/ort-wasm-simd-threaded.jsep.wasm`。当前应用会通过 manifest 中的 ORT WASM 目录加载 `.mjs` / `.wasm`，因此这个重复产物不需要上传到 PaddleOCR runtime 目录。

当前 manifest 还要求上传以下两个模型文件，并保持文件名不变：

```text
PP-OCRv6_tiny_det_onnx_infer.tar
PP-OCRv6_tiny_rec_onnx_infer.tar
```

每次发布一个新的 `onnxruntime-web` 版本时，从对应依赖包上传以下两个文件，并保持文件名不变：

```text
apps/web/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs
apps/web/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm
```

目标目录形如 `https://b5.bokr.com.cn/dist/ocr/onnxruntime-web/1.26.0/`。

## CDN 要求

CDN / COS 必须满足：

```text
.tar  -> Content-Type: application/x-tar 或 application/octet-stream
.mjs  -> Content-Type: text/javascript
.js   -> Content-Type: text/javascript
.wasm -> Content-Type: application/wasm
Access-Control-Allow-Origin: *
```

建议开启长期缓存。文件位于版本化目录下，升级时发布到新目录，不覆盖旧目录。PaddleOCR module 和 worker 都是跨域 ESM 加载，必须具备 CORS 响应头。

## Web 镜像验证

`@paddleocr/paddleocr-js` 已在 Vite build 中外置到 manifest 中的 CDN module URL，正常情况下 web 构建产物不会再包含 PaddleOCR runtime、worker 或 ORT WASM 大文件。

`deploy/web.Dockerfile` 不再清理 OCR WASM 产物。如果构建产物中重新出现 OCR runtime、worker 或 ORT WASM 大文件，应先修复 Vite 外置或动态加载配置，不要在镜像构建阶段兜底删除。

OCR runtime、worker、模型和 ORT 资源都应从 CDN 加载；如果 CDN 文件不可访问，OCR 初始化会失败，因此发布前必须完成 CDN 验证。

## 验证

发布后先检查 manifest 指向的 CDN 响应头。以当前 manifest 为例：

```bash
curl -I https://b5.bokr.com.cn/dist/ocr/paddleocr-js/0.4.2/index.mjs
curl -I https://b5.bokr.com.cn/dist/ocr/paddleocr-js/0.4.2/assets/worker-entry-C9UNuyOJ.js
curl -I https://b5.bokr.com.cn/dist/ocr/paddleocr-js/0.4.2/ort.bundle.min-<hash>.js
curl -I https://b5.bokr.com.cn/dist/ocr/paddleocr-js/0.4.2/PP-OCRv6_tiny_det_onnx_infer.tar
curl -I https://b5.bokr.com.cn/dist/ocr/paddleocr-js/0.4.2/PP-OCRv6_tiny_rec_onnx_infer.tar
curl -I https://b5.bokr.com.cn/dist/ocr/onnxruntime-web/1.26.0/ort-wasm-simd-threaded.jsep.mjs
curl -I https://b5.bokr.com.cn/dist/ocr/onnxruntime-web/1.26.0/ort-wasm-simd-threaded.jsep.wasm
```

再运行相关测试：

```bash
pnpm --filter @chatai/web test test/pages/chat/image-ocr.test.ts test/vite-config.test.ts
pnpm --filter @chatai/web build
```

构建后可以检查 web 产物不再包含 OCR 大文件：

```bash
find apps/web/dist/assets -type f \( -name '*worker-entry*' -o -name 'ort-wasm-*' -o -name 'ort.bundle*' \)
```
