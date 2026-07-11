# 腾讯云容器部署指南

本文档面向测试环境和生产环境部署。当前项目建议拆成四个独立容器：

- `chatai-web`：Vite 构建后的静态前端，由 Nginx 或等价静态服务承载。
- `chatai-backend`：Fastify Node 服务，暴露 `/api/*` 和健康检查接口。
- `chatai-backend-worker`：会话洞察等后端异步任务。
- `chatai-workflow-worker`：营销 Workflow 的 Entry/Task Consumer、Scheduler、Outbox Publisher 和 Reconciler。

浏览器只访问同一个 HTTPS 域名。前端请求同源 `/api`，由 TKE Ingress 或网关把 `/api/*` 转发到 backend。

```text
client
  -> https://chat-test.example.com 或 https://chat.example.com
  -> Ingress / CLB
      /      -> chatai-web:80
      /api/* -> chatai-backend:3001
```

## 推荐云资源

- TCR：保存 web、backend 和两个 worker 镜像。
- TKE：运行测试环境和生产环境工作负载。
- CLB / Ingress：统一暴露 HTTPS 域名，并按路径路由。
- TencentDB for MySQL 或已有 MySQL：提供 `DATABASE_URL` 指向的数据库。
- TDMQ Pulsar：承载标准化 Workflow Entry 和 Task 消息。
- Secret Manager 或 TKE Secret：保存数据库连接串、JWT key、Java 内部接口 token。

腾讯云相关文档：

- [TCR 容器镜像服务](https://cloud.tencent.com.cn/document/product/1141)
- [TKE 容器服务](https://cloud.tencent.com/document/product/457)
- [使用 TCR 镜像创建 TKE 工作负载](https://cloud.tencent.com/document/product/457/45624)

## 环境规划

建议测试和生产使用独立 namespace：

```text
chatai-test
chatai-prod
```

测试环境和生产环境应使用相同镜像构建流程，通过不同 ConfigMap / Secret 区分配置。云上测试环境也建议使用 `NODE_ENV=production`，并且所有环境都必须配置数据库连接。

三类环境的 Java 内部接口约定如下：

- 开发环境：`JAVA_INTERNAL_API_BASE_URL=https://scrm-api-test01.st.iyouke.com/`
- 测试环境：使用测试 Java 内部地址，由测试 namespace 的 Secret / ConfigMap 提供
- 生产环境：使用生产 Java 内部地址，由生产 namespace 的 Secret / ConfigMap 提供

## 构建前检查

发布镜像前先在 CI 或本地执行：

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm backend:build
```

当前仓库要求 Node.js 24 LTS 和 pnpm 10。

## 镜像构建

仓库已经内置容器部署文件：

```text
deploy/web.Dockerfile
deploy/backend.Dockerfile
deploy/backend-worker.Dockerfile
deploy/workflow-worker.Dockerfile
deploy/nginx.conf
```

两个 Dockerfile 都以仓库根目录作为 build context，并在构建阶段执行 `pnpm install --frozen-lockfile`。因此需要从仓库根目录执行构建命令：

```bash
docker build -f deploy/web.Dockerfile -t ccr.ccs.tencentyun.com/<tcr-namespace>/chatai-web:<tag> .
docker build -f deploy/backend.Dockerfile -t ccr.ccs.tencentyun.com/<tcr-namespace>/chatai-backend:<tag> .
docker build -f deploy/backend-worker.Dockerfile -t ccr.ccs.tencentyun.com/<tcr-namespace>/chatai-backend-worker:<tag> .
docker build -f deploy/workflow-worker.Dockerfile -t ccr.ccs.tencentyun.com/<tcr-namespace>/chatai-workflow-worker:<tag> .
```

推送到 TCR：

```bash
docker push ccr.ccs.tencentyun.com/<tcr-namespace>/chatai-web:<tag>
docker push ccr.ccs.tencentyun.com/<tcr-namespace>/chatai-backend:<tag>
docker push ccr.ccs.tencentyun.com/<tcr-namespace>/chatai-backend-worker:<tag>
docker push ccr.ccs.tencentyun.com/<tcr-namespace>/chatai-workflow-worker:<tag>
```

`<tag>` 建议使用 Git commit SHA，例如 `20260512-abcdef0`，不要只使用 `latest` 发布生产。

当前构建文件的职责：

- `deploy/web.Dockerfile`：使用 `node:24-alpine` 构建 web，执行根脚本 `pnpm build`，再把 `apps/web/dist` 复制到 `nginx:alpine` 镜像。
- `deploy/backend.Dockerfile`：使用 `node:24-alpine` 构建 backend，执行根脚本 `pnpm backend:build`，运行阶段只安装生产依赖并用 `node apps/backend/dist/server.js` 启动。
- `deploy/backend-worker.Dockerfile`：使用同一套 backend 构建产物，运行阶段只安装生产依赖并用 `node apps/backend/dist/worker.js` 启动。worker 不监听 HTTP 端口，不配置 Docker `HEALTHCHECK`。
- `deploy/workflow-worker.Dockerfile`：使用 Debian glibc 镜像构建并运行独立 Workflow Worker，以兼容 `pulsar-client` 原生扩展；镜像暴露 3002 健康检查端口。CI 构建后会在镜像内实际加载一次 `pulsar-client`，防止原生安装脚本被跳过。
- `deploy/nginx.conf`：承载 web 静态资源，非 `/api/*` 请求回退到 `index.html`，`/api/*` 返回 404 作为兜底，实际发布时应由 Ingress 路由到 backend。

注意事项：

- Web 和 backend 镜像都依赖 workspace 根目录下的 `pnpm-workspace.yaml`、`pnpm-lock.yaml`、根 `package.json`、`apps/*` 和 `packages/contracts`，不要在子目录内单独执行上述 `docker build`。
- 当前仓库没有 `.dockerignore`。CI 或本地构建时应避免把无关大文件放进仓库目录；如后续构建上下文过大，应补充 `.dockerignore`。
- `deploy/web.Dockerfile` 不复制根目录 `.env.*` 文件。Workflow 临时账号/标签 fixture 仅通过 `VITE_WORKFLOW_FIXTURES_ENABLED` build arg 控制；其它自定义 `VITE_*` 变量仍需按需增加 `ARG`。测试和生产同源部署时至少保持 `VITE_API_BASE_URL=/api`。

## Web 容器要求

Web 构建时需要：

```text
VITE_API_BASE_URL=/api
VITE_WECHAT_EMOJI_BASE_URL=
VITE_WORKFLOW_FIXTURES_ENABLED=false
```

`VITE_*` 是构建时变量。test01 尚未接入真实托管账号和标签数据源，构建时必须传入 `--build-arg VITE_WORKFLOW_FIXTURES_ENABLED=true`；production 必须保持默认 `false`。因此 Phase 3 的 test01 与 production Web 镜像不能复用同一构建产物。

静态服务需要支持 React Router fallback：

```text
/chat -> /index.html
```

同时不要把 `/api/*` 回退到 `index.html`。`/api/*` 应由 Ingress 或 Nginx 转发到 backend。

## Backend 容器要求

Backend 启动命令：

```bash
pnpm --filter @chatai/backend start
```

或在容器内直接执行构建产物：

```bash
node apps/backend/dist/server.js
```

服务监听：

```text
0.0.0.0:3001
```

健康检查：

```text
GET /healthz
GET /readyz
```

`/healthz` 只表示进程存活。`/readyz` 会检查数据库 schema，适合作为就绪检查。未配置数据库时 backend 会在启动阶段失败，不会进入可服务状态。

## Backend Worker 容器要求

会话洞察 worker 作为独立进程部署，不和 API server 混在同一个容器内启动。第一阶段建议只部署 1 个副本。

worker 不监听 HTTP 端口，不要复用 API 的 `/healthz` 或 `/readyz` 探针。简单上线时可以只配置一个进程级 `exec` liveness：

```yaml
livenessProbe:
  exec:
    command:
      - sh
      - -c
      - "test -r /proc/1/cmdline && grep -q 'worker.js' /proc/1/cmdline"
  initialDelaySeconds: 30
  periodSeconds: 30
  timeoutSeconds: 2
  failureThreshold: 3
```

worker 不接收线上流量，通常不需要配置 readiness probe。后续如需判断 tick 是否持续运行，可以在 worker 内增加 heartbeat 文件后再改成基于 heartbeat 的 liveness。

worker 必要环境变量：

```text
NODE_ENV=production
DATABASE_URL=mysql://<user>:<password>@<host>:3306/<database>
LOG_LEVEL=info
INSIGHTS_WORKER_ENABLED=true
INSIGHTS_WORKER_MODEL_ENABLED=false
INSIGHTS_WORKER_INTERVAL_MS=3000
INSIGHTS_WORKER_BATCH_SIZE=200
INSIGHTS_WORKER_START_LOOKBACK_DAYS=3
```

如需启用模型分析，再配置火山方舟相关变量并将 `INSIGHTS_WORKER_MODEL_ENABLED` 改为 `true`。

## Marketing Workflow Worker 容器要求

Workflow Worker 是独立进程，不复用 API Server 或 Backend Worker。Phase 3 初始可部署一个副本并启用全部角色；后续扩容时可通过角色开关拆分 Consumer、Scheduler、Outbox 和 Reconciler。

启动命令：

```bash
node apps/workflow-worker/dist/index.js
```

健康检查：

```text
GET :3002/healthz
GET :3002/readyz
```

`/healthz` 只表示进程存活。`/readyz` 会周期检查数据库、Broker Topic lookup 和 Consumer 连接状态，并要求所有已启用角色均就绪。TKE 建议使用：

```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 3002
readinessProbe:
  httpGet:
    path: /readyz
    port: 3002
```

非敏感配置放入 ConfigMap：

```text
NODE_ENV=production
LOG_LEVEL=info
WORKFLOW_ENVIRONMENT=dev
WORKFLOW_BROKER=pulsar
WORKFLOW_PULSAR_CLUSTER_ID=<tdmq-cluster-id>
WORKFLOW_PULSAR_NAMESPACE=chatai-workflow
WORKFLOW_ENTRY_TOPIC=topic-workflow-entry-dev
WORKFLOW_TASK_TOPIC=topic-workflow-task-dev
WORKFLOW_SUBSCRIPTION=consumer-chatai-worker-env-dev
WORKFLOW_ENTRY_DLQ_TOPIC=consumer-chatai-worker-env-dev-DLQ
WORKFLOW_TASK_DLQ_TOPIC=consumer-chatai-worker-env-dev-DLQ
WORKFLOW_WORKER_ROLES=entry-consumer,task-consumer,scheduler,outbox,reconciler
WORKFLOW_HEALTH_PORT=3002
WORKFLOW_MAX_REDELIVER_COUNT=5
WORKFLOW_BATCH_SIZE=100
WORKFLOW_LEASE_DURATION_MS=60000
WORKFLOW_MAX_TASK_ATTEMPTS=5
WORKFLOW_MAX_OUTBOX_ATTEMPTS=100
WORKFLOW_MAX_OUTBOX_RETRY_DELAY_MS=300000
WORKFLOW_DISPATCH_TIMEOUT_MS=300000
WORKFLOW_INBOX_CLEANUP_BATCH_SIZE=1000
WORKFLOW_SCHEDULER_INTERVAL_MS=1000
WORKFLOW_OUTBOX_INTERVAL_MS=1000
WORKFLOW_OUTBOX_RETRY_DELAY_MS=5000
WORKFLOW_RECONCILE_INTERVAL_MS=30000
WORKFLOW_READINESS_INTERVAL_MS=30000
WORKFLOW_SHARD_IDS=
```

敏感配置放入 Secret：

```text
DATABASE_URL=mysql://<user>:<password>@<host>:3306/<database>
WORKFLOW_PULSAR_SERVICE_URL=<tdmq-pulsar-http-service-url>
WORKFLOW_PULSAR_TOKEN=<tdmq-pulsar-token>
```

环境映射：

| 环境 | Entry Topic | Task Topic | Subscription |
| --- | --- | --- | --- |
| dev | `topic-workflow-entry-dev` | `topic-workflow-task-dev` | `consumer-chatai-worker-env-dev` |
| test01 | `topic-workflow-entry-test01` | `topic-workflow-task-test01` | `consumer-chatai-worker-env-test01` |

Entry 和 Task 位于不同 Topic，可以复用同一 Subscription 名称。TDMQ 会为每个环境消费组维护系统 `-RETRY` 和 `-DLQ` Topic，不需要在应用中创建额外业务 Topic。测试与开发不得交叉使用 Topic 或 Subscription。

Worker 会使用 `WORKFLOW_PULSAR_CLUSTER_ID` 和 `WORKFLOW_PULSAR_NAMESPACE` 将上述短 Topic 名规范化为 `persistent://<cluster-id>/<namespace>/<topic>`。也可以直接为 Topic 配置完整的 `persistent://` 地址；完整地址不会被重复拼接。真实 Pulsar 模式缺少集群 ID 或 namespace 时 Worker 会拒绝启动，避免消息误投到默认 namespace。

角色说明：

- `entry-consumer`：消费标准化入口事件并执行触发匹配和重复进入控制。
- `task-consumer`：消费已派发 Task，并在数据库事务完成后 ACK。
- `scheduler`：扫描到期 Wait Task。多副本时必须用 `WORKFLOW_SHARD_IDS` 分配互不重叠的逻辑分片。
- `outbox`：认领并发布数据库 Outbox。
- `reconciler`：恢复过期租约并收敛停止或删除的 Run。

进程收到 `SIGTERM` 或 `SIGINT` 后会停止角色循环、关闭 Consumer/Producer、数据库连接和健康检查服务。TKE 应提供足够的 `terminationGracePeriodSeconds`，首发建议 60 秒。

### Entry Smoke

Smoke 只读取已启用 Workflow 的 Trigger Binding 并投递一条标准 Entry 事件，不创建 Run、不修改 Workflow 配置，也不在消息中携带 `workflowId`。先在产品中创建并启用一个只包含 `start -> wait -> end` 的 Workflow，然后执行：

```bash
corepack pnpm --filter @chatai/workflow-worker smoke:entry -- \
  --workflow-id <workflow-id> \
  --subject-id <test-subject-id>
```

命令输出仅包含 `eventId`、`messageId` 和 `workflowId`。`subjectId` 会进入测试消息但不会打印。Smoke 必须由人工在已配置真实 Secret 的受控环境执行，普通 CI 只能使用 Fake Broker。

GitHub Actions 的 Workflow Worker 测试步骤固定设置 `WORKFLOW_BROKER=fake`，且不注入 Pulsar 地址或 Token。CI 会构建 Debian Worker 镜像，但不运行 Worker 进程或 Entry Smoke，因此不会访问 TDMQ。

## Backend 环境变量

非敏感配置建议放 ConfigMap：

```text
NODE_ENV=production
PORT=3001
JWT_AUDIENCE=chatai-web
JWT_ISSUER=chatai-server
AUTH_COOKIE_SECURE=true
LOG_LEVEL=info
REDIS_ENABLED=true
REDIS_KEY_PREFIX=chatai:<env>:
REDIS_CONNECT_TIMEOUT_MS=3000
REDIS_COMMAND_TIMEOUT_MS=500
JAVA_INTERNAL_API_TIMEOUT_MS=8000
JAVA_INTERNAL_API_STREAM_IDLE_TIMEOUT_MS=60000
MEDIA_PROXY_TIMEOUT_MS=8000
```

敏感配置必须放 Secret：

```text
DATABASE_URL=mysql://<user>:<password>@<host>:3306/<database>
JWT_PRIVATE_KEY=<private-key>
JWT_PUBLIC_KEY=<public-key>
ALTCHA_HMAC_SECRET=<random-secret>
JAVA_INTERNAL_API_BASE_URL=<java-internal-api-base-url>
JAVA_INTERNAL_API_TOKEN=<java-internal-api-token>
REDIS_URL=redis://:<redis-password>@<redis-host>:<redis-port>/<redis-database>
```

注意事项：

- `NODE_ENV=production` 时必须配置 `JWT_PRIVATE_KEY` 和 `JWT_PUBLIC_KEY`，否则 backend 会拒绝启动。
- 登录态 access/refresh token 由 backend 写入 HttpOnly Cookie，所有环境都不再把 token 暴露给浏览器 JS。`AUTH_COOKIE_SECURE=true` 会额外写入 `Secure` 属性；生产和 HTTPS 测试环境必须开启，本地 HTTP 开发环境可保持关闭。
- 使用 Cookie 鉴权的写请求会校验前端统一请求头 `X-Workbench-Client: chat-ai-ui`，用于阻断跨站表单类请求；发布网关不要剥离该请求头。
- 本地开发环境没有配置 `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` 也能运行，是因为 backend 会退回到 `JWT_DEV_SECRET`；如果 `JWT_DEV_SECRET` 也没有，会继续使用默认值 `dev-only-change-me`。这个兜底只适合本地开发，不要用于测试或生产环境。
- `JWT_PRIVATE_KEY` 是 backend 签发 JWT 的私钥，必须保密；`JWT_PUBLIC_KEY` 是校验 JWT 的公钥。测试环境和生产环境建议使用不同密钥对。
- 可以用 OpenSSL 生成 RSA 密钥对：

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out jwt-private.pem
openssl rsa -pubout -in jwt-private.pem -out jwt-public.pem
```

- 在 TKE Secret 中写入 key 内容时要保留 PEM 换行，例如 `-----BEGIN PRIVATE KEY-----` 到 `-----END PRIVATE KEY-----` 的完整内容。
- 所有环境都必须配置 `DATABASE_URL`，否则 backend 会拒绝启动；本地开发也不再提供无数据库降级运行模式。
- 生产环境必须配置 `JAVA_INTERNAL_API_BASE_URL`，否则 backend 会拒绝启动；本地开发和测试环境可按需留空并使用 mock 或非生产配置。
- `JAVA_INTERNAL_API_BASE_URL` 用于转发发送消息、会话已读、席位接管等写操作；`JAVA_INTERNAL_API_TOKEN` 目前仍是可选项。
- `JAVA_INTERNAL_API_STREAM_IDLE_TIMEOUT_MS` 用于 Java 流式 AI 接口的读流空闲超时，默认可按 60000ms 配置。
- `JAVA_INTERNAL_API_BASE_URL` 只应配置在 backend 所在环境，不要放进 web 的 `VITE_*` 构建变量。
- 开发环境默认值写在根目录 `.env.development`，测试和生产环境分别通过部署配置覆盖。
- `REDIS_ENABLED=false` 时 backend 使用 `NoopCache`，不连接 Redis；`REDIS_ENABLED=true` 时必须配置 `REDIS_URL`，并且启动阶段会校验 Redis 连接、认证和 `PING`，失败则拒绝启动。
- `REDIS_URL` 示例：无密码 `redis://<host>:6379/0`；密码认证 `redis://:<password>@<host>:6379/0`；ACL 用户名和密码 `redis://<user>:<password>@<host>:6379/0`；若 Redis 端口要求 TLS，使用 `rediss://...`。
- `REDIS_URL` 末尾的路径是 Redis 逻辑库编号，例如 `/4` 等价于连接后执行 `SELECT 4`。测试和生产环境应使用运维分配的 database 编号，不要默认写入 `/0`。
- `REDIS_KEY_PREFIX` 用于多环境 key 隔离，建议测试环境配置 `chatai:test:`，生产环境配置 `chatai:prod:`；多个开发者共享同一个 Redis 时可使用 `chatai:<name>:dev:`。前缀结尾保留冒号，避免 key 混淆。
- `REDIS_CONNECT_TIMEOUT_MS` 是启动/建连超时，`REDIS_COMMAND_TIMEOUT_MS` 是单条命令超时。首发建议使用 `3000/500`；同 VPC 且观察稳定后可收紧到 `2000/200`。不要把 command timeout 配到秒级以上，Redis 运行期命令失败会按 cache miss 回源 DB。

## Backend 日志和 CLS 接入

Backend 使用 Fastify / pino 结构化日志，容器内日志统一输出到 stdout。应用代码不直接接入腾讯云 CLS SDK，也不在业务链路里维护 CLS Secret，避免日志上报故障影响工作台接口。

推荐接入方式：

```text
chatai-backend stdout(JSON)
  -> TKE tke-log-agent
  -> CLS 日志主题
```

TKE / CLS 侧配置建议：

- 为测试和生产 namespace 分别创建 CLS 日志集和日志主题，例如 `chatai-test/backend`、`chatai-prod/backend`。
- 采集源选择容器标准输出，解析模式选择 JSON。
- 采集范围限定 `chatai-backend` 工作负载或对应 Pod label，避免 web / nginx 日志混入 backend 业务日志主题。
- 保留 TKE 自动附带的 `namespace`、`pod_name`、`container_name`、`pod_label_*` 等元数据。
- 为常用排障字段开启索引：`reqId`、`requestId`、`operation`、`subUserId`、`seatId`、`conversationId`、`messageId`、`clientMessageId`、`uid`、`platform`、`path`、`status`、`error`。

应用侧日志字段约定：

- 所有业务日志必须是结构化对象，不拼接自由文本承载排障字段。
- 工作台接口日志使用 Fastify 请求日志上下文；`requestId` 与 pino `reqId` 对齐，用于串联同一入口请求下的 backend 日志和 Java 调用日志。
- Java 内部接口失败记录 `requestId`、`operation`、`path`、`uid`、`platform`、业务 id、Java 错误码或 HTTP 状态；backend 调 Java 时通过 `X-Request-Id` header 透传，不写入业务 payload。
- 上传凭证成功只记录 `bucket`、`region`、`requestId` 等非敏感字段；不得记录 `tmpSecretKey`、`sessionToken`、`token`。
- 媒体代理只记录 `host` 和 `path`，不得记录完整带签名或查询参数的 URL。
- poll cursor 失效记录 `sinceVersion`、`sinceLastMsgTime`、`currentSeatId`、`activeConversationId`，用于判断是否需要前端重新加载基线。

## Ingress 路由

推荐路径规则：

```text
/api -> chatai-backend service:3001
/    -> chatai-web service:80
```

需要确认：

- `/api/server/*` 请求命中 backend。
- `/api/auth/*` 请求命中 backend。
- `/chat`、刷新 `/chat`、直接打开深层前端路由都返回 web 的 `index.html`。
- TLS 证书绑定测试域名和生产域名。

## 测试环境发布

1. 构建并推送 web、backend、backend worker 和 Workflow Worker 镜像。
2. 更新 `chatai-test` namespace 下的 Deployment 镜像。
3. 配置测试库 `DATABASE_URL` 和测试 Java 内部接口。
4. 等待 backend 和 Workflow Worker 的 `/readyz` 返回 `status=ready`。
5. 访问测试域名：

```text
https://chat-test.example.com/chat
```

6. 验证登录、席位列表、会话列表、消息加载、轮询、发送消息、会话已读、席位接管。

## 生产环境发布

生产发布建议使用已在测试环境验证过的同一个镜像 tag：

1. 将测试通过的镜像 tag 提升为生产发布 tag，或直接在生产 Deployment 使用同一个 immutable tag。
2. 更新 `chatai-prod` namespace 的 ConfigMap / Secret。
3. 滚动更新 backend 和两个 worker，确认相关健康检查。
4. 滚动更新 web。
5. 验证生产域名：

```text
https://chat.example.com/chat
```

6. 观察 backend 日志、接口错误率、MySQL 连接情况和 Java 内部接口调用错误。

## 回滚

回滚以镜像 tag 为单位：

```bash
kubectl -n chatai-prod rollout undo deployment/chatai-backend
kubectl -n chatai-prod rollout undo deployment/chatai-workflow-worker
kubectl -n chatai-prod rollout undo deployment/chatai-web
```

也可以显式切回上一个镜像 tag：

```bash
kubectl -n chatai-prod set image deployment/chatai-backend backend=ccr.ccs.tencentyun.com/<tcr-namespace>/chatai-backend:<previous-tag>
kubectl -n chatai-prod set image deployment/chatai-web web=ccr.ccs.tencentyun.com/<tcr-namespace>/chatai-web:<previous-tag>
```

如果变更包含数据库 schema，需要提前准备回滚策略。当前阶段不建议在应用发布中隐式执行破坏性数据库迁移。

## 发布检查清单

- 已执行 `pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm backend:build`。
- 已使用 `deploy/web.Dockerfile` 和 `deploy/backend.Dockerfile` 从仓库根目录构建镜像。
- 已使用 `deploy/workflow-worker.Dockerfile` 构建 Debian/glibc Workflow Worker 镜像。
- 镜像 tag 使用不可变版本号或 commit SHA。
- Web 构建变量为 `VITE_API_BASE_URL=/api`，如需微信表情资源则同步确认 `VITE_WECHAT_EMOJI_BASE_URL`。
- Web 镜像内的 `deploy/nginx.conf` 支持前端路由 fallback，且不会把 `/api/*` 回退到 `index.html`。
- Backend `NODE_ENV=production`。
- Backend 已配置 `DATABASE_URL`、`JWT_PRIVATE_KEY`、`JWT_PUBLIC_KEY`、`JAVA_INTERNAL_API_BASE_URL`、`ALTCHA_HMAC_SECRET`。
- Ingress 已配置 `/api` 到 backend，`/` 到 web。
- `/healthz` 和 `/readyz` 正常。
- Workflow Worker 的数据库、Broker 和已启用角色均通过 `/readyz`。
- dev/test01 使用各自的 Topic 和 Subscription，Pulsar Token 仅存在于 Secret。
- Entry Smoke 仅在受控环境人工执行，CI 未连接真实 TDMQ。
- `/chat` 刷新不 404。
- 登录、刷新 token、退出登录可用。
- `/api/server/me`、`/api/server/seats`、`/api/server/conversations` 可用。
- Java 内部写接口可用：发送消息、会话已读、席位接管。
