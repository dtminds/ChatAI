# 知识库文档导入设计（kb-docs）

## 目标

在 AI 托管知识库详情页，支持通过两步向导创建文档类知识（`docType = 2`）：

1. 选择并上传文档文件至 TOS
2. 配置解析模式与切片策略后提交

前端只传语义化配置（解析模式、切片策略、切片参数）及文件元信息，不在浏览器侧暴露或维护火山策略 ID。Node backend 负责映射 `volcStrategyResourceId`，再调用 Java `wap-embed-agent-kb-doc/create` 创建知识条目。

首期覆盖 PDF、Word、PPT、Markdown、TXT。FAQ（`docType = 1`）、图片（`docType = 3`）可复用同一 Java 创建接口，但交互与参数校验另开 spec；本文仅定义文档导入。

## 命名约定

全链路统一使用以下术语，**不再使用** `knowledgeBaseId`、`knowledge-documents`、`WorkbenchKnowledge*` 等旧命名：

| 统一术语 | 说明 | 避免使用 |
| --- | --- | --- |
| `kb` | 知识库 | knowledge base, knowledgeSet |
| `kbId` | 知识库 ID | knowledgeBaseId, knowledgeId |
| `kb-doc` / `kb-docs` | 知识库内单条知识（文档/FAQ/图片） | knowledge document, knowledge record |
| `docType` | 知识类型：`1` FAQ、`2` 文档、`3` 图片 | source |

路由与 API 路径示例：

- 页面：`/chat/ai-hosting/kb/:kbId`
- Node：`/api/server/ai-hosting/kb-docs/*`
- Java：`/third-internal/wap-embed-agent-kb-doc/*`

共享契约建议放在 `packages/contracts/src/ai-hosting/kb-doc.ts`，类型前缀 `KbDoc*`。

## 架构边界（与智能回复旧知识库隔离）

智能回复早期遗留的简版知识库逻辑（`knowledge/page`、`knowledge-doc/page`、`knowledge-faq/add` 及对应 `workbench-java-client`、`knowledge-*-mappers`）**与本 spec 无关**。

实现时必须遵守：

- **不参考、不依赖、不扩展**上述旧代码路径
- **不把新 kb-docs 逻辑写入** `workbench-java-client.ts`、`workbench.service.ts` 中已有的 knowledge 方法，或 `chat.routes.ts` 中 `/smart-reply/knowledge-*` 路由
- 新能力独立落在 `apps/backend/src/modules/ai-hosting/`（路由、service、mapper、Java client）
- 前端请求独立落在 `apps/web/src/pages/chat/ai-hosting/api/kb-doc-service.ts`，经 `request.ts` 出口访问 `/api/server/ai-hosting/kb-docs/*`

旧代码保留给智能回复场景，待后续单独下线；本次不改动其行为。

## 背景与现状

- 知识库页面位于 `/chat/ai-hosting/kb/:kbId`（路由 param 实现期可从 `knowledgeBaseId` 重命名为 `kbId`），列表仍使用 `kb-mock-data.ts` mock，创建成功后临时插入 `queued` 记录。
- `ImportDocumentDialog` 已实现两步向导，并通过 `kb-doc-service.ts` 打通前端 → Node API。
- **P0 联调阶段（当前）**：文件上传与 Java 创建均未接入，仅验证前后端契约与策略映射；见下文「P0 实现范围」。

## P0 实现范围（当前已落地）

Java 接口 `POST /third-internal/wap-embed-agent-kb-doc/create` 与 TOS 直传**尚未提供**。当前仅实现前端到 Node 的 API 交互，上传与创建均在 mock 层完成。

| 环节 | P0 行为 | 后续（Java/TOS 就绪后） |
| --- | --- | --- |
| 上传凭证 | `POST kb-docs/upload-credential` 返回 `{ mocked: true, requestId }` | 返回真实 TOS 临时凭证 |
| 文件上传 | 前端 `uploadKbDocFile` 不调 TOS，本地生成 `mock://kb-docs/{kbId}/...` 作为 `docUrl` | 凭证 + TOS SDK 直传 |
| 创建 kb-doc | Node 校验 + 映射 `volcStrategyResourceId`，返回 mock `docId`（UUID），**不调用 Java** | `agent-kb-java-client` 调 `wap-embed-agent-kb-doc/create` |
| 列表刷新 | mock store 插入 `status: "queued"` 记录 | 接真实 kb 列表 API |

### P0 调用链

```mermaid
flowchart LR
  A[步骤1 选择文件] --> B[步骤2 配置并提交]
  B --> C[POST upload-credential mock]
  C --> D[前端生成本地 mock docUrl]
  D --> E[POST kb-docs/create]
  E --> F[Node 映射 volcStrategyResourceId]
  F --> G[返回 mock docId]
  G --> H[关闭弹窗 + mock 列表刷新]
```

### P0 代码落点

| 层 | 路径 |
| --- | --- |
| Contracts | `packages/contracts/src/ai-hosting/kb-doc.ts` |
| Backend 路由 | `apps/backend/src/modules/ai-hosting/kb-doc.routes.ts` |
| Backend 服务 | `apps/backend/src/modules/ai-hosting/kb-doc.service.ts` |
| 策略映射 | `apps/backend/src/modules/ai-hosting/kb-doc-strategy-mappers.ts` |
| 前端适配 | `apps/web/src/pages/chat/ai-hosting/api/kb-doc-service.ts` |
| UI | `apps/web/src/pages/chat/ai-hosting/kb-components/import-document-dialog.tsx` |

**刻意未实现（待 Java/TOS）：** `agent-kb-java-client.ts`、真实 TOS 上传、Java Form 提交。

## 产品边界

### 支持范围

| 维度 | 首期支持 |
| --- | --- |
| `docType` | `2`（文档） |
| 文件类型 | PDF、DOC、DOCX、PPT、PPTX、MD、TXT |
| 单文件大小 | 10 MB（与产品约定一致，可在实现时配置） |
| 单次创建 | 1 个文件 |
| 解析模式 | 通用解析、增强解析 |
| 切片策略 | 按固定长度切分、按分隔符切分 |
| 切片参数 | 固定长度：500 / 1000 / 2000；分隔符：换行符 |

### 不支持范围

- 多文件批量创建
- 自定义分隔符输入
- 前端直接传 `volcStrategyResourceId`
- 切片进度轮询与预览（创建后 Java 置 `QUEUING`，由 XXL-Job 异步切片）
- 文档编辑、重切片、删除（另开 spec）

### 解析模式规则

| 模式 | 前端值 | 说明 | 适用文件 |
| --- | --- | --- | --- |
| 通用解析 | `standard` | 仅解析文本，速度优先 | 全部支持类型 |
| 增强解析 | `enhanced` | 含图片解析，速度略慢 | PDF、Word、PPT；MD/TXT 禁用 |

MD、TXT 强制 `parseMode = standard`，增强解析卡片置灰。

## 交互流程

弹窗两步标题均为「导入文档」。

```mermaid
flowchart LR
  A[步骤1 选择文件] --> B[步骤2 配置并提交]
  B --> C[直传 TOS]
  C --> D[POST kb-docs/create]
  D --> E[Node 映射 volcStrategyResourceId]
  E --> F[Java wap-embed-agent-kb-doc/create]
  F --> G[关闭弹窗并刷新列表]
```

> **P0：** 步骤 C、F 为 mock，见「P0 实现范围」。

### 步骤 1：选择文件

- 拖拽/点击上传，类型与现有 `DOCUMENT_KNOWLEDGE_ACCEPT` 一致
- 校验通过后「下一步」；未选文件时禁用

### 步骤 2：配置并提交

1. **解析模式**（卡片单选）：通用解析 / 增强解析
2. **切片策略**（单选）：按固定长度切分 / 按分隔符切分
3. **切片参数**：2000 / 1000 / 500 或换行符

底部：「上一步」「取消」「确认提交」（提交中 loading，阻止关闭弹窗）。

## 前端契约

```ts
export type KbDocParseMode = "standard" | "enhanced";

export type KbDocChunkStrategy = "length" | "separator";

export type KbDocChunkParams =
  | { strategy: "length"; maxLength: 500 | 1000 | 2000 }
  | { strategy: "separator"; separator: "newline" };

export type KbDocCreateRequest = {
  kbId: string;
  name: string;
  docUrl: string;
  docSuffix: string;
  description?: string;
  parseMode: KbDocParseMode;
  chunkStrategy: KbDocChunkStrategy;
  chunkParams: KbDocChunkParams;
};

export type KbDocCreateResponse = {
  docId: string;
};
```

### 字段说明

| 字段 | 来源 | 说明 |
| --- | --- | --- |
| `kbId` | 路由 `:kbId` | 目标知识库 ID |
| `name` | 默认取文件名（可去后缀），传给 Java `name` | 知识名称 |
| `docUrl` | TOS 直传后的对象路径 | 对应 Java `docUrl` |
| `docSuffix` | 从文件名解析，如 `pdf`、`docx` | 不含点号 |
| `description` | 可选，文档导入首期可不展示输入框 | Java 可选字段 |
| `parseMode` / `chunkStrategy` / `chunkParams` | 步骤 2 | Node 映射为 `volcStrategyResourceId`，不透传 Java 语义字段 |

### 前端校验

- `chunkStrategy` 与 `chunkParams.strategy` 一致
- MD/TXT 禁止 `enhanced`
- `docSuffix` 必须在支持扩展名集合内

### 前端调用链

1. `ImportDocumentDialog` 收集配置
2. `kb-doc-service.ts` 发起请求（组件内不拼 URL）
3. `POST /api/server/ai-hosting/kb-docs/upload-credential`
4. 前端得到 `docUrl`（**P0：** mock 路径，不实际上传；**后续：** TOS 直传）
5. `POST /api/server/ai-hosting/kb-docs/create`

## Node 公开接口

模块：`apps/backend/src/modules/ai-hosting/`。路由注册独立于 `chat.routes.ts`。

### 上传凭证

```
POST /api/server/ai-hosting/kb-docs/upload-credential
```

- 鉴权：Bearer JWT + session
- 无 body；根据登录子账号解析 `uid`
- **P0 响应：** `{ mocked: true, requestId }`（`KbDocUploadCredentialResponse`）
- **后续：** 返回 TOS 上传所需字段（bucket、region、临时密钥等）

### 创建文档知识

```
POST /api/server/ai-hosting/kb-docs/create
```

- 鉴权：Bearer JWT + session
- Body：`KbDocCreateRequest`（JSON）
- 权限：AI 托管知识库写权限（首期权限模型与 AI 托管模块一致）

### Service 流程

1. 校验 `kbId`、`docUrl`、`name`、`docSuffix` 非空
2. 校验 `chunkStrategy` 与 `chunkParams.strategy` 一致
3. 校验 `parseMode` 与 `docSuffix` 组合合法
4. `resolveVolcStrategyResourceId(...)` → `volcStrategyResourceId`
5. 解析登录态 `uid`
6. **P0：** 生成 mock `docId` 并写日志（含映射后的 `volcStrategyResourceId`、`docType = 2`），**不调用 Java**
7. **后续：** 调用 Java `createKbDoc`，固定 `docType = 2`，映射响应为 `{ docId: string }`

## 策略 ID 映射

文件：`apps/backend/src/modules/ai-hosting/kb-doc-strategy-mappers.ts`

| parseMode | chunkStrategy | chunkParams | volcStrategyResourceId |
| --- | --- | --- | --- |
| `standard` | `length` | `maxLength: 2000` | `chat_kd_common_2000` |
| `standard` | `length` | `maxLength: 1000` | `chat_kd_common_1000` |
| `standard` | `length` | `maxLength: 500` | `chat_kd_common_500` |
| `standard` | `separator` | `separator: newline` | `chat_kd_common_n` |
| `enhanced` | `length` | `maxLength: 2000` | `chat_kd_ocr_2000` |
| `enhanced` | `length` | `maxLength: 1000` | `chat_kd_ocr_1000` |
| `enhanced` | `length` | `maxLength: 500` | `chat_kd_ocr_500` |
| `enhanced` | `separator` | `separator: newline` | `chat_kd_ocr_n` |

非法组合抛 `BadRequestError`，错误码 `INVALID_KB_DOC_CHUNK_CONFIG`。

## Java 内部接口

### 创建知识（统一入口）

```
POST /third-internal/wap-embed-agent-kb-doc/create
```

封装于 `apps/backend/src/modules/ai-hosting/agent-kb-java-client.ts`（**P0 未创建**），与 `workbench-java-client` 分离。

**说明：** 支持三种 `docType`：FAQ（1）、文档（2）、图片（3）。统一流程：创建 doc → 调云端 `uploadDoc` → 回填 `volcDocId` → 置 `QUEUING` 状态，由 XXL-Job 异步切片。

本文档导入固定 `docType = 2`。

### 知识类型（`docType`）

| 值 | 含义 | 本 spec |
| --- | --- | --- |
| `1` | FAQ | 否 |
| `2` | 文档 | **是** |
| `3` | 图片 | 否 |

### 请求参数（Query String / Form）

Node 将 JSON body 转为 Form 或 query 提交（与 Java 约定一致）：

| 字段 | 类型 | 必填 | 文档导入取值 |
| --- | --- | --- | --- |
| `uid` | Long | 是 | 登录主账号 uid |
| `kbId` | Long | 是 | 前端 `kbId` |
| `docType` | Integer | 是 | 固定 `2` |
| `docUrl` | String | 是 | TOS 路径（前端直传后传入） |
| `docSuffix` | String | 是 | 如 `pdf`、`docx` |
| `name` | String | 是 | 知识名称 |
| `description` | String | 否 | 可选 |
| `volcStrategyResourceId` | String | 是 | Node mapper 结果 |

**不传** `parseMode`、`chunkStrategy`、`chunkParams` 等前端语义字段。

### 响应

`ApiResponseTO<Long>` — 返回新创建 kb-doc 的 ID。Node mapper 将 `Long` 转为字符串 `docId`。

### Java 侧异步行为

创建成功后文档处于 `QUEUING`，列表展示「排队中」等状态由后续 kb 列表 spec 对接；本 spec 创建接口仅保证返回 `docId`。

## 错误处理

| 场景 | HTTP | 错误码 | 用户提示 |
| --- | --- | --- | --- |
| 切片配置非法 | 400 | `INVALID_KB_DOC_CHUNK_CONFIG` | 切片配置无效 |
| MD/TXT 选增强解析 | 400 | `INVALID_KB_DOC_PARSE_MODE` | 当前文件类型不支持增强解析 |
| kb 不存在 | 404 | `KB_NOT_FOUND` | 知识库不存在 |
| Java 业务失败 | 502 | `AI_HOSTING_INTERNAL_API_FAILED` | 操作失败，请稍后重试 |
| TOS 凭证失败 | 502 | 同上 | 上传失败，请稍后重试 |

## 列表刷新

创建成功后：关闭弹窗 → toast「文档已提交解析」→ 刷新 kb 详情列表。mock 阶段可临时插入 `status: "queued"` 记录；接真实列表 API 后移除。

## 测试要求

### Contracts

- `packages/contracts/src/ai-hosting/kb-doc.ts`：`KbDocCreate*`、`KbDocUploadCredential*`

### Backend（`apps/backend/src/modules/ai-hosting/`）

- `kb-doc-strategy-mappers.test.ts`：8 组映射 + 非法组合
- `kb-doc.routes.test.ts`：upload-credential mock、create 校验、viewer 拒绝
- **后续：** `kb-doc-mappers.test.ts`、`agent-kb-java-client.test.ts`

### Web

- `ai-hosting-pages.test.tsx`：两步流程、MD 禁用增强解析、mock `importKbDoc`
- **后续：** `kb-doc-service` 单测（真实 TOS 上传 + create 串联）

## 实现切片（建议顺序）

### 已完成（P0）

1. **Contracts**：`KbDoc*` 类型
2. **Backend 模块**：`ai-hosting` 路由 + `kb-doc.service`（mock 上传凭证与创建）
3. **Mapper**：`resolveVolcStrategyResourceId`
4. **Node 接口**：`kb-docs/upload-credential`、`kb-docs/create`
5. **Web**：`kb-doc-service.ts`（mock 上传）+ `ImportDocumentDialog` 两步向导

### 待 Java/TOS 就绪

6. **agent-kb-java-client**：`wap-embed-agent-kb-doc/create` Form 提交与响应 mapper
7. **TOS 直传**：真实 upload-credential + 前端上传实现
8. **联调**：替换 mock `docId` 为 Java 返回 ID

## 待确认项

| 项 | 说明 |
| --- | --- |
| TOS 上传凭证 Java 接口 path | kb 专用或复用平台 file 凭证的具体 path（P0 已 mock，不阻塞） |
| kb 列表/详情 API | 展示 `QUEUING` 等状态（另 spec，P0 用 mock store） |
| Java create 联调 | `wap-embed-agent-kb-doc/create` 提供后替换 mock 创建 |

## 非目标

- 改动智能回复旧 `knowledge-*` 代码
- FAQ / 图片创建 UI（共用 Java create，独立 spec）
- kb 列表、切片详情全量读写
- 解析进度推送、失败重试入口
