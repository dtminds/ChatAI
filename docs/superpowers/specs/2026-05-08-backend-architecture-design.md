# 聚合聊天工作台 Backend 整体设计

- 日期：2026-05-08
- 状态：Draft
- 适用范围：聚合聊天客服工作台 Node.js 后端初始化与后续实现
- 目标：明确 `apps/backend` 的技术栈、目录结构、数据访问、鉴权、测试和开发流程

## 1. 结论

本项目采用独立 Node.js 后端承载工作台业务接口：

```text
前端：apps/web
后端：apps/backend
共享契约：packages/contracts
```

后端目录命名为 `backend`，不使用 `bff`。原因是本服务不只是传统 Backend For Frontend，它会直接访问 MySQL，并承担账号接管、消息查询、发送受理、未读水位和轮询增量等工作台业务后端职责。

前端已迁入 `apps/web`，根目录作为 pnpm workspace root。

## 2. 技术栈

后端技术栈固定为：

```text
Node.js 24 LTS
Fastify 5
TypeScript strict
Kysely + mysql2
TypeBox
@fastify/jwt
Vitest
pnpm workspace
Docker
```

选择理由：

- `Fastify`：适合生产 API 服务，schema、插件、日志和生命周期能力成熟。
- `Kysely`：保留 SQL 可控性，同时提供 TypeScript 类型约束。
- `mysql2`：成熟 MySQL driver，连接池可控。
- `TypeBox`：后端可直接用于 Fastify schema，前后端可共享静态类型。
- `@fastify/jwt`：支持 Node 后端独立签发和校验 JWT。

不采用：

- `NestJS`：当前阶段会增加模块、DI 和装饰器复杂度。
- `Prisma`：当前业务需要较多 cursor、CAS、幂等和状态推进 SQL，透明 SQL 更重要。
- `Express`：新项目不再选择类型和 schema 支持较弱的基础框架。

## 3. 仓库结构

推荐结构：

```text
ChatAI/
  apps/
    web/
      src/
      test/
      package.json
    backend/
      src/
        app.ts
        server.ts
        config/
          env.ts
        plugins/
          auth.ts
          db.ts
          error-handler.ts
        db/
          mysql.ts
          schema.ts
          schema-check.ts
        modules/
          auth/
            auth.routes.ts
            auth.schemas.ts
            auth.service.ts
          chat/
            chat.routes.ts
            chat.schemas.ts
            chat.service.ts
            account.repository.ts
            conversation.repository.ts
            message.repository.ts
            takeover.repository.ts
        shared/
          errors.ts
          result.ts
      test/
        unit/
        integration/
      package.json
      tsconfig.json
  packages/
    contracts/
      src/
        auth/
          dto.ts
          schemas.ts
        chat/
          dto.ts
          schemas.ts
          enums.ts
        common/
          envelope.ts
          errors.ts
        index.ts
      package.json
      tsconfig.json
  docs/
    db/
      schema.sql
      change-log.md
```

## 4. 共享契约

`packages/contracts` 用于前端和后端共享 API 契约。

允许共享：

- request / response DTO
- API envelope
- 错误码
- 枚举
- TypeBox schema
- JWT payload 类型

不共享：

- DB 表类型
- repository
- service 业务逻辑
- React hooks
- Zustand store
- 后端鉴权实现

前端和后端都通过包名引用：

```text
@chatai/contracts
```

## 5. 数据访问

第一阶段后端直接连接腾讯云测试 MySQL。

```text
DATABASE_URL=mysql://...
```

开发环境也连接测试库，符合当前团队 Java 开发习惯。

第一阶段不强制 migration，但必须维护：

```text
docs/db/schema.sql
docs/db/change-log.md
```

要求：

- 手工改测试库后同步更新 `schema.sql`。
- 依赖表结构变化的 PR 必须更新 `schema.sql` 和 `change-log.md`。
- Backend 启动时执行 schema check。
- schema check 检查关键表、字段、唯一约束和索引是否存在。

## 6. Redis 策略

Redis 第一阶段不是必需依赖。

Backend 必须支持：

```text
REDIS_ENABLED=false
```

第一阶段正确性全部基于 MySQL：

- 唯一约束
- 单表原子更新
- 乐观版本
- 状态机推进
- 补偿扫描

Redis 第二阶段再引入，用于：

- 热 cursor 缓存
- 限流
- 短期幂等缓存
- 发送任务队列
- 分布式锁优化
- 高频摘要缓存

Redis 不能成为唯一事实源。

## 7. 一致性原则

业务链路不依赖跨表事务。

统一原则：

```text
单表原子写
唯一约束幂等
乐观 version
状态机单向推进
派生状态 best-effort 更新
后台补偿修复
```

事实表：

- `message`
- `message_send_task`
- `account_takeover`

派生表：

- `conversation`
- `conversation_employee_state`
- `account_employee_state`
- cursor / version 表

事实表必须通过唯一约束、CAS 和状态机保证正确性。派生表允许短暂不一致，但必须可以从事实表重建。

## 8. 鉴权设计

本系统独立登录，JWT 由 Node Backend 自己签发和校验。

认证接口：

```text
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
```

Token 策略：

```text
accessToken: JWT，15-30 分钟
refreshToken: 高熵随机字符串，hash 后入库，7-30 天
```

推荐签名算法：

```text
RS256 或 EdDSA
```

第一阶段可先搭认证骨架：

- `@fastify/jwt`
- auth plugin
- protected route hook
- request.user 类型扩展

完整登录、refresh token rotation、logout revoke 等在用户表 schema 明确后实现。

所有环境都必须走正常登录、JWT 和 session 校验；不再提供开发环境鉴权绕过。

## 9. API 范围

第一阶段目标接口：

```text
GET  /healthz
GET  /readyz

POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout

GET  /api/server/me
GET  /api/server/seats
GET  /api/server/conversations
GET  /api/server/conversations/{conversationId}/messages
POST /api/server/conversations/{conversationId}/read
GET  /api/server/poll
POST /api/server/messages/send
POST /api/server/seats/{seatId}/take-over
```

公开工作台 DTO 使用 `seatId` 表示 `xy_wap_embed_user_seat.id`，使用 `subUserId` 表示 `xy_wap_embed_sub_user.id`。
Node backend 只直接读取会话、消息、席位等 MySQL 表；会话已读、消息发送、席位接管通过 Java owner 内部 API 写入。
真实增量事件/cursor 机制尚未落表，DB 模式的 `/api/server/poll` 当前只补拉当前会话的新消息，席位和会话变更需要后续事件/cursor 表或 Java 增量接口支撑。

## 10. 核心模块职责

### 10.1 auth

- 登录。
- access token 签发。
- refresh token 轮换。
- logout revoke。
- 登录审计。
- protected route hook。

### 10.2 chat

- 工作台初始化。
- 账号列表。
- 账号接管。
- 会话列表。
- 消息列表。
- 增量同步。
- 标记已读。
- 发送消息受理。

### 10.3 db

- MySQL pool。
- Kysely 实例。
- schema check。
- 数据库错误映射。

### 10.4 shared

- 统一错误类型。
- API envelope。
- 错误码映射。
- 通用工具。

## 11. 开发环境

开发环境默认连接腾讯云测试 MySQL。

本地 `.env.local`：

```text
NODE_ENV=development
PORT=3001
DATABASE_URL=mysql://...
REDIS_ENABLED=false
JWT_PRIVATE_KEY=...
JWT_PUBLIC_KEY=...
JWT_ISSUER=chatai-workbench
JWT_AUDIENCE=chatai-workbench-web
```

命令：

```text
pnpm backend:dev
pnpm backend:typecheck
pnpm backend:test
```

前端开发服务器通过 Vite proxy 转发：

```text
/api -> http://localhost:3001
```

## 12. 测试策略

### 12.1 Unit Test

不连接 MySQL。

覆盖：

- DTO mapping
- 状态机
- cursor 计算
- 错误映射
- service 纯逻辑

### 12.2 Integration Test

第一阶段可以分两类：

```text
默认 CI：不连接共享测试库，只跑 unit/typecheck。
手动或 nightly：连接腾讯云测试库跑 integration smoke。
```

后续建议引入 GitHub Actions service container 或 Testcontainers 起临时 MySQL，让 integration test 不依赖共享测试库。

### 12.3 Smoke Test

部署测试环境后至少检查：

```text
GET /healthz
GET /readyz
GET /api/server/seats
GET /api/server/me
```

## 13. 高可用与连接池

Backend 无状态部署，生产至少 2 个实例。

MySQL 连接池初始建议：

```text
每实例 connectionLimit = 10
waitForConnections = true
queueLimit = 200
connectTimeout = 3000ms
```

总连接数计算：

```text
总连接数 = Backend 实例数 * 每实例进程数 * pool size
```

第一阶段不引入 Redis 连接要求。后续 Redis 启用时，每实例保持少量长连接即可。

## 14. 初始化范围

下一步初始化 backend 时只做基础框架，不实现真实业务 API。

交付内容：

- `apps/backend` package。
- `packages/contracts` package。
- Fastify app bootstrap。
- env config。
- logger。
- error handler。
- MySQL client。
- schema check 骨架。
- auth plugin 骨架。
- chat route skeleton。
- healthz / readyz。
- Vitest setup。
- 根目录 pnpm workspace 和 scripts。

不做：

- 真实登录。
- 真实 chat SQL。
- 发送消息链路。
- Redis。
- migration。
- 前端目录迁移。

## 15. 后续实现顺序

1. 引入真实 MySQL schema。
2. 做 schema review，确认索引、唯一约束和状态字段。
3. 实现只读接口：accounts、conversations、messages、bootstrap。
4. 实现账号接管和已读。
5. 实现发送消息受理和幂等。
6. 实现 sync。
7. 实现补偿任务。
8. 再评估 Redis 是否进入第二阶段。
