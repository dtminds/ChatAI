# Browser OCR Runtime Assets

本文档说明浏览器 OCR 依赖的 PaddleOCR 模型和 ONNX Runtime Web 资源如何发布到 COS / CDN。

## 当前配置

图片 OCR 使用 `@paddleocr/paddleocr-js` 和 `onnxruntime-web`。当前 web 依赖锁定：

```text
@paddleocr/paddleocr-js 0.4.2
onnxruntime-web 1.26.0
```

OCR 初始化时默认从以下 CDN 目录加载 PaddleOCR 模型：

```text
https://cdn.com.cn/dist/ocr/paddleocr-js/0.4.2/
```

可通过构建时环境变量覆盖：

```text
VITE_OCR_PADDLE_MODEL_BASE_URL=https://cdn.com.cn/dist/ocr/paddleocr-js/0.4.2/
```

OCR 初始化时默认从以下 CDN 目录加载 ORT WASM 运行时：

```text
https://cdn.com.cn/dist/ocr/onnxruntime-web/1.26.0/
```

可通过构建时环境变量覆盖：

```text
VITE_OCR_ORT_WASM_BASE_URL=https://cdn.com.cn/dist/ocr/onnxruntime-web/1.26.0/
```

目录 URL 必须以版本号隔离，不要使用无版本目录覆盖发布。

## 需要上传的文件

当前 `@paddleocr/paddleocr-js` 版本需要上传以下两个模型文件，并保持文件名不变：

```text
PP-OCRv6_tiny_det_onnx_infer.tar
PP-OCRv6_tiny_rec_onnx_infer.tar
```

当前版本的完整 CDN URL 是：

```text
https://cdn.com.cn/dist/ocr/paddleocr-js/0.4.2/PP-OCRv6_tiny_det_onnx_infer.tar
https://cdn.com.cn/dist/ocr/paddleocr-js/0.4.2/PP-OCRv6_tiny_rec_onnx_infer.tar
```

每次发布一个新的 `onnxruntime-web` 版本时，从对应依赖包上传以下两个文件，并保持文件名不变：

```text
apps/web/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs
apps/web/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm
```

当前版本的完整 CDN URL 是：

```text
https://cdn.com.cn/dist/ocr/onnxruntime-web/1.26.0/ort-wasm-simd-threaded.jsep.mjs
https://cdn.com.cn/dist/ocr/onnxruntime-web/1.26.0/ort-wasm-simd-threaded.jsep.wasm
```

## CDN 要求

CDN / COS 必须满足：

```text
.tar  -> Content-Type: application/x-tar 或 application/octet-stream
.mjs  -> Content-Type: text/javascript
.wasm -> Content-Type: application/wasm
Access-Control-Allow-Origin: *
```

建议开启长期缓存。文件位于版本化目录下，升级时发布到新目录，不覆盖旧目录。

## Web 镜像清理

`deploy/web.Dockerfile` 在 `pnpm build` 后会删除 Vite 静态分析产生的本地 ORT JSEP WASM 产物：

```bash
find apps/web/dist/assets -type f -name 'ort-wasm-simd-threaded.jsep-*.wasm' -delete
```

这个文件运行时应从 CDN 加载，不应由 web 容器同源提供。清理步骤用于减小 web 镜像体积。删除后如果 CDN 文件不可访问，OCR 初始化会失败，因此发布前必须完成 CDN 验证。

## 升级规则

`onnxruntime-web` 版本和 CDN 目录必须配套。升级流程：

1. 修改 `apps/web/package.json` 中的 `onnxruntime-web` 精确版本。
2. 安装依赖，确认 `pnpm-lock.yaml` 更新到同一版本。
3. 如果 `@paddleocr/paddleocr-js` 或模型名升级，上传对应的模型 `.tar` 文件到新版本 CDN 目录。
4. 从新版本依赖包上传对应的 `.mjs` 和 `.wasm` 文件到新版本 CDN 目录。
5. 更新 `VITE_OCR_PADDLE_MODEL_BASE_URL`、`VITE_OCR_ORT_WASM_BASE_URL` 或代码默认 CDN 目录。
6. 运行 OCR 相关测试和 web build。

不要只升级 npm 依赖而继续使用旧版本 CDN 目录。版本不匹配可能导致 OCR 初始化失败或 WASM 运行时异常。

## 验证

发布后先检查 CDN 响应头：

```bash
curl -I https://cdn.com.cn/dist/ocr/paddleocr-js/0.4.2/PP-OCRv6_tiny_det_onnx_infer.tar
curl -I https://cdn.com.cn/dist/ocr/paddleocr-js/0.4.2/PP-OCRv6_tiny_rec_onnx_infer.tar
curl -I https://cdn.com.cn/dist/ocr/onnxruntime-web/1.26.0/ort-wasm-simd-threaded.jsep.mjs
curl -I https://cdn.com.cn/dist/ocr/onnxruntime-web/1.26.0/ort-wasm-simd-threaded.jsep.wasm
```

再运行相关测试：

```bash
pnpm --filter @chatai/web test pages/chat/image-ocr.test.ts
pnpm --filter @chatai/web build
```

本地直接运行 `pnpm --filter @chatai/web build` 时，`dist/assets` 中可能仍有 Vite 静态分析产生的 ORT WASM 文件；web 容器构建会删除该文件。只要 OCR 初始化传入的 `wasmPaths` 指向 CDN 目录，运行时不会请求同源 WASM。
