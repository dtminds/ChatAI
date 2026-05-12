# 腾讯云容器部署指南

本文档面向测试环境和生产环境部署。当前项目建议拆成两个容器：

- `chatai-web`：Vite 构建后的静态前端，由 Nginx 或等价静态服务承载。
- `chatai-backend`：Fastify Node 服务，暴露 `/api/*` 和健康检查接口。

浏览器只访问同一个 HTTPS 域名。前端请求同源 `/api`，由 TKE Ingress 或网关把 `/api/*` 转发到 backend。

```text
client
  -> https://chat-test.example.com 或 https://chat.example.com
  -> Ingress / CLB
      /      -> chatai-web:80
      /api/* -> chatai-backend:3001
```

## 推荐云资源

- TCR：保存 `chatai-web` 和 `chatai-backend` 镜像。
- TKE：运行测试环境和生产环境工作负载。
- CLB / Ingress：统一暴露 HTTPS 域名，并按路径路由。
- TencentDB for MySQL 或已有 MySQL：提供 `DATABASE_URL` 指向的数据库。
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

测试环境和生产环境应使用相同镜像构建流程，通过不同 ConfigMap / Secret 区分配置。云上测试环境也建议使用 `NODE_ENV=production`，避免走本地测试 mock 或开发兜底逻辑。

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

仓库当前没有内置 Dockerfile。落地容器部署时建议新增：

```text
deploy/web.Dockerfile
deploy/backend.Dockerfile
deploy/nginx.conf
```

镜像构建命令示例：

```bash
docker build -f deploy/web.Dockerfile -t ccr.ccs.tencentyun.com/<tcr-namespace>/chatai-web:<tag> .
docker build -f deploy/backend.Dockerfile -t ccr.ccs.tencentyun.com/<tcr-namespace>/chatai-backend:<tag> .
```

推送到 TCR：

```bash
docker push ccr.ccs.tencentyun.com/<tcr-namespace>/chatai-web:<tag>
docker push ccr.ccs.tencentyun.com/<tcr-namespace>/chatai-backend:<tag>
```

`<tag>` 建议使用 Git commit SHA，例如 `20260512-abcdef0`，不要只使用 `latest` 发布生产。

## Web 容器要求

Web 构建时需要：

```text
VITE_API_BASE_URL=/api
VITE_WORKBENCH_SERVICE_MODE=http
VITE_WECHAT_EMOJI_BASE_URL=
```

`VITE_*` 是构建时变量。只要测试和生产都使用同源 `/api`，同一个 web 镜像可以在两个环境复用。

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

`/healthz` 只表示进程存活。`/readyz` 会检查数据库 schema，适合作为就绪检查。

## Backend 环境变量

非敏感配置建议放 ConfigMap：

```text
NODE_ENV=production
PORT=3001
JWT_AUDIENCE=chatai-web
JWT_ISSUER=chatai-server
LOG_LEVEL=info
REDIS_ENABLED=false
JAVA_INTERNAL_API_TIMEOUT_MS=8000
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
```

注意事项：

- `NODE_ENV=production` 时必须配置 `JWT_PRIVATE_KEY` 和 `JWT_PUBLIC_KEY`，否则 backend 会拒绝启动。
- 云上真实环境必须配置 `DATABASE_URL`。未配置数据库时 backend 会退到内存服务，只适合本地开发。
- `JAVA_INTERNAL_API_BASE_URL` 和 `JAVA_INTERNAL_API_TOKEN` 用于转发发送消息、会话已读、席位接管等写操作。
- `JAVA_INTERNAL_API_BASE_URL` 只应配置在 backend 所在环境，不要放进 web 的 `VITE_*` 构建变量。
- 开发环境默认值写在根目录 `.env.development`，测试和生产环境分别通过部署配置覆盖。
- `REDIS_ENABLED=false` 是当前阶段可接受配置，Redis 不是必需依赖。

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

1. 构建并推送 `chatai-web:<tag>` 和 `chatai-backend:<tag>`。
2. 更新 `chatai-test` namespace 下的 Deployment 镜像。
3. 配置测试库 `DATABASE_URL` 和测试 Java 内部接口。
4. 等待 backend `/readyz` 返回 `status=ready`。
5. 访问测试域名：

```text
https://chat-test.example.com/chat
```

6. 验证登录、席位列表、会话列表、消息加载、轮询、发送消息、会话已读、席位接管。

## 生产环境发布

生产发布建议使用已在测试环境验证过的同一个镜像 tag：

1. 将测试通过的镜像 tag 提升为生产发布 tag，或直接在生产 Deployment 使用同一个 immutable tag。
2. 更新 `chatai-prod` namespace 的 ConfigMap / Secret。
3. 滚动更新 backend，确认 `/healthz` 和 `/readyz`。
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
- 镜像 tag 使用不可变版本号或 commit SHA。
- Web 构建变量为 `VITE_API_BASE_URL=/api`、`VITE_WORKBENCH_SERVICE_MODE=http`。
- Backend `NODE_ENV=production`。
- Backend 已配置 `DATABASE_URL`、`JWT_PRIVATE_KEY`、`JWT_PUBLIC_KEY`、`ALTCHA_HMAC_SECRET`。
- Ingress 已配置 `/api` 到 backend，`/` 到 web。
- `/healthz` 和 `/readyz` 正常。
- `/chat` 刷新不 404。
- 登录、刷新 token、退出登录可用。
- `/api/server/me`、`/api/server/seats`、`/api/server/conversations` 可用。
- Java 内部写接口可用：发送消息、会话已读、席位接管。
