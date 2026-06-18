# Browser OCR Runtime Assets

本文档说明浏览器 OCR 依赖的 PaddleOCR 模型和 ONNX Runtime Web 资源如何发布到 COS / CDN。

## 当前配置

图片 OCR 使用 `@paddleocr/paddleocr-js` 和 `onnxruntime-web`。当前 web 依赖锁定：

```text
@paddleocr/paddleocr-js 0.4.2
onnxruntime-web 1.26.0
```

OCR 模块默认从以下 CDN 文件加载 PaddleOCR 浏览器运行时：

```text
https://b5.bokr.com.cn/dist/ocr/paddleocr-js/0.4.2/index.mjs
```

可通过构建时环境变量覆盖：

```text
VITE_OCR_PADDLE_MODULE_URL=https://b5.bokr.com.cn/dist/ocr/paddleocr-js/0.4.2/index.mjs
```

PaddleOCR worker 默认从运行时模块同目录下的 `assets/worker-entry-C9UNuyOJ.js` 加载：

```text
https://b5.bokr.com.cn/dist/ocr/paddleocr-js/0.4.2/assets/worker-entry-C9UNuyOJ.js
```

可通过构建时环境变量覆盖：

```text
VITE_OCR_PADDLE_WORKER_URL=https://b5.bokr.com.cn/dist/ocr/paddleocr-js/0.4.2/assets/worker-entry-C9UNuyOJ.js
```

OCR 初始化时默认从以下 CDN 目录加载 PaddleOCR 模型：

```text
https://b5.bokr.com.cn/dist/ocr/paddleocr-js/0.4.2/
```

可通过构建时环境变量覆盖：

```text
VITE_OCR_PADDLE_MODEL_BASE_URL=https://b5.bokr.com.cn/dist/ocr/paddleocr-js/0.4.2/
```

OCR 初始化时默认从以下 CDN 目录加载 ORT WASM 运行时：

```text
https://b5.bokr.com.cn/dist/ocr/onnxruntime-web/1.26.0/
```

可通过构建时环境变量覆盖：

```text
VITE_OCR_ORT_WASM_BASE_URL=https://b5.bokr.com.cn/dist/ocr/onnxruntime-web/1.26.0/
```

目录 URL 必须以版本号隔离，不要使用无版本目录覆盖发布。

## 需要上传的文件

先构建 PaddleOCR 浏览器运行时：

```bash
pnpm --filter @chatai/web build:ocr-runtime
```

上传以下文件，并保持相对路径不变：

```text
apps/web/dist-ocr-runtime/index.mjs
apps/web/dist-ocr-runtime/assets/worker-entry-C9UNuyOJ.js
apps/web/dist-ocr-runtime/ort.bundle.min-*.js
```

当前版本的完整 CDN URL 是：

```text
https://b5.bokr.com.cn/dist/ocr/paddleocr-js/0.4.2/index.mjs
https://b5.bokr.com.cn/dist/ocr/paddleocr-js/0.4.2/assets/worker-entry-C9UNuyOJ.js
https://b5.bokr.com.cn/dist/ocr/paddleocr-js/0.4.2/ort.bundle.min-*.js
```

`build:ocr-runtime` 也可能输出 `assets/ort-wasm-simd-threaded.jsep.wasm`。当前应用会通过 `VITE_OCR_ORT_WASM_BASE_URL` 指向独立的 `onnxruntime-web` CDN 目录加载 ORT `.mjs` / `.wasm`，因此这个重复产物不需要上传到 PaddleOCR runtime 目录。

当前 `@paddleocr/paddleocr-js` 版本还需要上传以下两个模型文件，并保持文件名不变：

```text
PP-OCRv6_tiny_det_onnx_infer.tar
PP-OCRv6_tiny_rec_onnx_infer.tar
```

当前版本的完整 CDN URL 是：

```text
https://b5.bokr.com.cn/dist/ocr/paddleocr-js/0.4.2/PP-OCRv6_tiny_det_onnx_infer.tar
https://b5.bokr.com.cn/dist/ocr/paddleocr-js/0.4.2/PP-OCRv6_tiny_rec_onnx_infer.tar
```

每次发布一个新的 `onnxruntime-web` 版本时，从对应依赖包上传以下两个文件，并保持文件名不变：

```text
apps/web/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs
apps/web/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm
```

当前版本的完整 CDN URL 是：

```text
https://b5.bokr.com.cn/dist/ocr/onnxruntime-web/1.26.0/ort-wasm-simd-threaded.jsep.mjs
https://b5.bokr.com.cn/dist/ocr/onnxruntime-web/1.26.0/ort-wasm-simd-threaded.jsep.wasm
```

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

`@paddleocr/paddleocr-js` 已在 Vite build 中外置到 CDN module URL，正常情况下 web 构建产物不会再包含 PaddleOCR runtime、worker 或 ORT WASM 大文件。

`deploy/web.Dockerfile` 不再清理 OCR WASM 产物。如果构建产物中重新出现 OCR runtime、worker 或 ORT WASM 大文件，应先修复 Vite 外置或动态加载配置，不要在镜像构建阶段兜底删除。

OCR runtime、worker、模型和 ORT 资源都应从 CDN 加载；如果 CDN 文件不可访问，OCR 初始化会失败，因此发布前必须完成 CDN 验证。

## 升级规则

`onnxruntime-web` 版本和 CDN 目录必须配套。升级流程：

1. 修改 `apps/web/package.json` 中的 `onnxruntime-web` 精确版本。
2. 安装依赖，确认 `pnpm-lock.yaml` 更新到同一版本。
3. 如果 `@paddleocr/paddleocr-js` 升级，重新运行 `pnpm --filter @chatai/web build:ocr-runtime`，上传新的 `index.mjs` 和 worker 文件到新版本 CDN 目录。
4. 如果 `@paddleocr/paddleocr-js` 或模型名升级，上传对应的模型 `.tar` 文件到新版本 CDN 目录。
5. 从新版本 `onnxruntime-web` 依赖包上传对应的 `.mjs` 和 `.wasm` 文件到新版本 CDN 目录。
6. 更新 `VITE_OCR_PADDLE_MODULE_URL`、`VITE_OCR_PADDLE_WORKER_URL`、`VITE_OCR_PADDLE_MODEL_BASE_URL`、`VITE_OCR_ORT_WASM_BASE_URL` 或代码默认 CDN 目录。
7. 运行 OCR 相关测试和 web build。

不要只升级 npm 依赖而继续使用旧版本 CDN 目录。版本不匹配可能导致 OCR 初始化失败或 WASM 运行时异常。

## 验证

发布后先检查 CDN 响应头：

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
pnpm --filter @chatai/web test test/pages/chat/image-ocr.test.ts
pnpm --filter @chatai/web build
```

构建后可以检查 web 产物不再包含 OCR 大文件：

```bash
find apps/web/dist/assets -type f \( -name '*worker-entry*' -o -name 'ort-wasm-*' -o -name 'ort.bundle*' \)
```
