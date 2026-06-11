# Redis 缓存 P0 设计方案

- 日期：2026-06-11
- 状态：Draft
- 适用范围：`apps/backend` 鉴权与工作台席位权限
- 前置背景：项目当前未引入 Redis；`REDIS_ENABLED=false` 为各环境默认配置，Redis 不是强依赖

## 1. 背景

当前后端存在两类全站高频、低变更风险的重复读：

1. **鉴权 Session 校验**：每个受保护请求经 `authPlugin.authenticate` → `verifyAccessSession`，查询 `xy_wap_embed_sub_user_session`。
2. **席位权限校验**：工作台几乎每个业务接口调用 `assertSeatAccess` → `canAccessSeat`（`xy_wap_embed_user_seat_sub_relation` JOIN `xy_wap_embed_user_seat`）；Poll 额外每次调用 `getSeatEventScope`（同一 relation 表全量查 seatIds）。

前端工作台默认 **2.5s** 轮询一次，单用户在线时上述查询被放大。P0 目标是用最小改动覆盖这两类热点，并为后续 P1（Poll 辅助数据、Hydration 缓存）提供可开关、可降级的 Redis 基础设施。缓存只作为 DB 查询加速器，任何无法确定安全性的缓存状态都必须回源 DB。

## 2. 目标与非目标

### 2.1 目标（P0 范围）

| 编号 | 场景 | 改造入口 | 预期收益 |
|------|------|----------|----------|
| **P0-A** | Redis 基础设施 | `redisPlugin` + `CachePort` | 可开关、可降级、可测 |
| **P0-B** | Session 校验缓存 | `verifyAccessSession` | 每个鉴权请求少 1 次 DB 读 |
| **P0-C** | 席位权限矩阵缓存 | `canAccessSeat` + `getSeatEventScope` | 工作台每个业务请求少 1–2 次 JOIN |

### 2.2 非目标（明确不在 P0）

- Poll 增量路径优化（`listChangedConversations`、`listMessageUpdateEvents`、`listSeatUpdateEvents` 等）
- Contact / Group / GroupMember / Message hydration 缓存
- Seat 聚合缓存（`listSeats`、`getSeatConversationAggregateRows`、`refreshSeatSummaries`）
- `getConversationLookup`、`getSeatRecord` 等会话元数据缓存
- Insights 配置与看板聚合缓存
- Altcha 分布式防重放、Insight Worker 分布式锁
- 前端改动、`packages/contracts` 变更、新公开 API
- 将 Redis 提升为启动强依赖
- 为 Redis 不可用场景提供强一致失效保证；P0 只保证 Redis 正常时主动失效、Redis 失败时按短 TTL 有界陈旧

## 3. P0-A：Redis 基础设施

### 3.1 环境变量

在现有 `REDIS_ENABLED` 基础上扩展（`apps/backend/src/config/env.ts`、根目录 `.env.example`）：

```bash
REDIS_ENABLED=false          # 默认 false，与当前部署一致
REDIS_URL=redis://127.0.0.1:6379/0
REDIS_KEY_PREFIX=chatai:     # 多环境隔离
REDIS_CONNECT_TIMEOUT_MS=3000
REDIS_COMMAND_TIMEOUT_MS=500
```

**开关语义：**

- `REDIS_ENABLED=false`：使用 `NoopCache`，行为与今天完全一致（每次打 DB）
- `REDIS_ENABLED=true` 但连接失败：启动时 `warn`；运行时 miss 回退 DB，不阻断服务

`validateBackendEnv` 不把 Redis 列为必填；仅当 `REDIS_ENABLED=true` 且缺少 `REDIS_URL` 时在启动时报错。

### 3.2 Redis 客户端选型

P0 选用 `ioredis`：

- Node 24 / ESM / TypeScript 生态成熟，支持连接事件、超时、pipeline 和 Set 操作。
- 后续 P1 若需要分布式锁或更复杂 key 失效，也能复用同一客户端。
- 不使用 `redis` 官方客户端的主要原因是 P0 更需要显式重连/离线队列控制，避免 Redis 异常时拖慢业务请求。

客户端配置必须符合“Redis 不阻断服务”：

```ts
new Redis(redisUrl, {
  commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
  connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
  enableOfflineQueue: false,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
});
```

每个 `RedisCache` 方法再包一层超时与异常吞吐：超时或异常只记 `warn/debug` 并按 miss 处理，不向业务抛出。

### 3.3 目录与插件

```
apps/backend/src/
  cache/
    cache-port.ts          # 接口定义
    redis-cache.ts         # ioredis 实现
    noop-cache.ts          # 降级实现
    keys.ts                # Key 构建（统一前缀）
    invalidation.ts        # 失效辅助函数
  plugins/
    redis.ts               # fastify-plugin，decorate app.cache
```

**`CachePort` 最小接口（P0 够用）：**

```ts
type CachePort = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  sadd(key: string, members: string[], ttlSeconds: number): Promise<void>;
  smembers(key: string): Promise<string[] | null>; // null = cache miss 或 Redis 不可用
};
```

**注册顺序**（`app.ts`）：

```
redisPlugin → dbPlugin → authPlugin → routes
```

原因：当前 `dbPlugin` 会创建 `WorkbenchRepository` / `workbenchService`，而 `WorkbenchRepository` 需要在构造时接收 `app.cache`。`authPlugin.authenticate` 和业务 service 只依赖 `CachePort`，不直接依赖 ioredis。

### 3.4 观测与降级

| 项 | 约定 |
|----|------|
| 日志 | Redis 连接失败、命令超时、JSON 解析失败记 `warn`；hit/miss 如需记录只能 `debug`，避免高频日志 |
| 指标（可选） | `cache_hit_total{layer}` / `cache_miss_total{layer}` |
| 超时 | 单次 Redis 操作超过 `REDIS_COMMAND_TIMEOUT_MS` 视为 miss，回退 DB |
| 健康检查 | `/readyz` 可选增加 `redis: { ok, enabled }`；Redis 不可用不影响 ready（与 DB 不同） |

### 3.5 测试策略

- 单元测试：`NoopCache` + mock `CachePort` 验证 cache-aside 逻辑
- 集成测试：现有 route test 默认 `REDIS_ENABLED=false`，行为不变
- Redis 实现测试：优先用 mock Redis client 验证超时、异常降级和 Set 索引逻辑；不把本地 Redis / testcontainers 作为 P0 必跑前置

## 4. P0-B：Session 校验缓存

### 4.1 现状

每个受保护请求：`authPlugin.authenticate` → `verifyAccessSession` → 查询 `xy_wap_embed_sub_user_session`。

相关常量与逻辑见 `apps/backend/src/modules/auth/auth.service.ts`：

- Access Token 有效期：20 分钟
- `session_version` 在重新登录（`createOrReplaceSession`）、改密（`revokeActiveSessions`）、改角色（`expireAccessTokens`）时递增
- 登出（`revokeSession`）设置 `revoked_at`

### 4.2 缓存 Key 与 Value

```
Key:   {prefix}auth:session:{sessionId}
Value: JSON { valid: true, subUserId, sessionVersion, expiresAtMs }
TTL:   min(JWT 剩余有效期, 300s)   # 上限 5 分钟
```

TTL 上限 5 分钟而非 20 分钟的原因：`revokeSession` / `expireAccessTokens` 必须能及时生效；短 TTL + 写时失效是双保险。

**必需辅助索引（批量失效）：**

```
{prefix}auth:session-index:{subUserId}  →  Set<sessionId>
```

登录或 DB 回源确认 session 有效时 `SADD`；同时对 index key 执行 `EXPIRE`，TTL 与 refresh token 有效期同量级（建议 14 天），防止失效流程遇到 Redis 故障后 index 长期残留。失效时 `SMEMBERS` 后批量 `DEL`。P0 不能只做单 key `DEL`，因为改密、改角色、禁用/删除子账号只掌握 `subUserId`，必须能按子账号清理所有 session cache。

负数缓存：

```
Value: JSON { valid: false }
TTL:   60s
```

### 4.3 读路径（cache-aside）

```ts
async function verifyAccessSession(db, user, cache): Promise<boolean> {
  // 1. JWT 字段校验（保持现有逻辑）
  // 2. cache.get(sessionKey)
  //    - 命中 valid=false → return false
  //    - 命中 valid=true 且 subUserId + sessionVersion + expiresAtMs 匹配 → return true
  //    - 命中但字段不匹配、过期或 JSON 异常 → 当作 miss 回源 DB
  //    - miss → 3. 查 DB（现有 SQL 不变）
  //    - DB 有效 → cache.set + SADD index + EXPIRE index + return true
  //    - DB 无效 → set 负数缓存 + return false
}
```

缓存命中但字段不匹配不能直接拒绝合法 token。典型场景是同一 `sessionId` 的 `session_version` 已递增、旧正向缓存尚未失效，新 token 携带新 version；此时应回源 DB 后刷新缓存。

正向 session cache 写入与 index 维护不要求 Lua 原子性；P0 使用 pipeline 执行 `SET auth:session:*`、`SADD auth:session-index:*`、`EXPIRE auth:session-index:*`，减少半写窗口即可。若 pipeline 失败，当前请求仍按 DB 结果返回，后续请求最多回源 DB。

### 4.4 失效触发点

| 事件 | 文件 / 函数 | 动作 |
|------|-------------|------|
| 登出 | `auth.service.ts` → `revokeSession` | `DEL auth:session:{sessionId}` |
| 重新登录 | `createOrReplaceSession`（`session_version++`） | 写 DB 成功后删除该 `subUserId` 相关 session key，再按当前 session 写 index |
| 改密 | `sub-accounts.service.ts` → `revokeActiveSessions` | 删除该 `subUserId` 下所有 session key |
| 改角色 | `expireAccessTokens`（`session_version++`） | 同上 |
| 禁用/删除子账号 | `revokeActiveSessions` | 同上 |

封装函数（`cache/invalidation.ts`）：

```ts
invalidateSession(cache, sessionId: string): Promise<void>
invalidateSubUserSessions(cache, subUserId: string): Promise<void>
```

Settings 服务在 DB 写成功后同步调失效；Redis 失败只 log，不影响主流程。失效函数要删除 session key 和 session-index key，避免 index 无限增长。

`invalidateSubUserSessions` 依赖 `auth:session-index:{subUserId}` 枚举正向 session key。若 `SMEMBERS` 失败、index 提前过期，或 Redis 在写入 session key 后写 index 失败，批量失效可能无法定位全部正向 key；P0 接受该风险，依赖正向 session cache ≤5min TTL 自动收敛。若后续要把这类场景收紧到即时失效，可在 P0.5/P1 增加 `auth:session-epoch:{subUserId}` 并把 epoch 纳入正向缓存校验。

`createOrReplaceSession` 当前通过 `onDuplicateKeyUpdate` 复用 `sub_user_id` 唯一 session 行，通常是同一个 `sessionId` 的 `session_version` 递增；实现失效时必须删除已有正向 session key，不能假设登录一定产生新的 `sessionId`。

### 4.5 不在 P0-B 缓存的范围

- `getCurrentSession`（读 `xy_wap_embed_sub_user`）
- `findActiveSessionByRefreshToken`
- `touchSession`

## 5. P0-C：席位权限矩阵缓存

### 5.1 现状

工作台几乎每个接口调用 `assertSeatAccess` → `canAccessSeat`（`relation` JOIN `seat`）。

Poll 每次额外调用 `getSeatEventScope`（同一 `xy_wap_embed_user_seat_sub_relation` 表按 `sub_id` 查全部 seatIds）。

相关实现见 `apps/backend/src/modules/chat/workbench-repository.ts`：

- `canAccessSeat(subUserId, seatId)`
- `getSeatEventScope(subUserId)`

### 5.2 缓存结构

**方案：一个 subUser 一份权限快照（推荐）**

```
Key:   {prefix}seat-access:{subUserId}
Type:  String (JSON)
Value: {
  uid: number,
  platform: number,
  seatIds: string[],
  version: 1
}
TTL:   600s (10 分钟)
```

**读路径：**

```ts
// canAccessSeat(subUserId, seatId)
const snapshot = await cache.get(seatAccessKey(subUserId));
if (snapshot) return snapshot.seatIds.includes(seatId);
// miss → 查 DB → 写全量 snapshot

// getSeatEventScope(subUserId)
const snapshot = await cache.get(seatAccessKey(subUserId));
if (snapshot) return { uid, platform, seatIds: snapshot.seatIds };
// miss → 与 canAccessSeat 共用一次 DB 查询写 snapshot
```

`canAccessSeat` 与 `getSeatEventScope` **共用同一缓存**，避免 poll 一次打两次 DB。

空权限列表（`seatIds: []`）也写入缓存，防止缓存穿透。由于当前 relation 查询在无权限时拿不到 `uid/platform`，构建空权限 snapshot 时必须回退查询 `xy_wap_embed_sub_user`（现有 `getSubUserTenantScope`）取得租户范围；如果子账号不存在或已禁用，则不写缓存并返回无权限。

### 5.3 失效触发点

| 事件 | 文件 / 函数 | 动作 |
|------|-------------|------|
| 创建子账号并分配席位 | `sub-accounts.service.ts` → `replaceSeatRelations` | `DEL seat-access:{subAccountId}` |
| 更新子账号席位 | `replaceSeatRelations` | `DEL seat-access:{subAccountId}` |
| 删除子账号 | `delete`（清 relation） | `DEL seat-access:{subAccountId}` |
| 托管账号分配子账号 | `managed-accounts.service.ts` → `replaceSubAccountRelations` | 删除前先查旧 subAccountIds，DB 写成功后 `DEL` 旧 subAccountIds 与新 subAccountIds 的并集 |

封装函数：

```ts
invalidateSeatAccess(cache, subUserId: string): Promise<void>
invalidateSeatAccessBatch(cache, subUserIds: string[]): Promise<void>
```

### 5.4 不在 P0-C 缓存的范围

- `getSeatRecord(seatId)`
- `listSeats` 及其 `getSeatConversationAggregateRows` 聚合
- `getSubUserTenantScope` 单独缓存层（可随 snapshot 一并写入，不单独加层）
- 平台层绕过 Settings 直接改 relation 的主动失效；这类变更只能依赖 TTL 收敛

## 6. 代码改造边界

### 6.1 新增 / 修改文件

| 操作 | 路径 |
|------|------|
| 新增 | `apps/backend/src/cache/*` |
| 新增 | `apps/backend/src/plugins/redis.ts` |
| 修改 | `apps/backend/src/app.ts` |
| 修改 | `apps/backend/src/config/env.ts` |
| 修改 | `apps/backend/src/plugins/auth.ts` |
| 修改 | `apps/backend/src/modules/auth/auth.service.ts` |
| 修改 | `apps/backend/src/modules/chat/workbench-repository.ts` |
| 修改 | `apps/backend/src/modules/settings/sub-accounts.service.ts` |
| 修改 | `apps/backend/src/modules/settings/managed-accounts.service.ts` |
| 修改 | `.env.example` |
| 修改 | `apps/backend/package.json`、`pnpm-lock.yaml`（新增 `ioredis`） |
| 新增测试 | `apps/backend/test/cache/*`、相关 service/repository 缓存测试 |

### 6.2 依赖注入

P0 采用 Fastify decorate，不做大规模 DI 重构：

```ts
// workbench-repository.ts
constructor(private db: Kysely<Database>, private cache?: CachePort) {}

// dbPlugin 在 redisPlugin 之后注册，创建 repository 时传入 app.cache
```

Settings service 工厂也传入 `app.cache`：

```ts
createSubAccountSettingsService(app.db, app.cache)
createManagedAccountSettingsService(app.db, app.cache)
```

### 6.3 失效调用约定

- DB 写成功后再失效缓存（先 DB 后 cache）
- Redis 失效失败只 log，不回滚 DB
- 不改变鉴权语义：缓存只是 DB 查询加速器，miss 或怀疑时一律回源 DB

## 7. 一致性与风险

| 风险 | 缓解 |
|------|------|
| Session 撤销后 JWT 仍短期有效 | 短 TTL（≤5min）+ logout 主动 `DEL` + `session_version` 校验 |
| 席位权限变更后旧缓存授权 | 写路径失效 + 10min TTL；Settings 变更频率极低 |
| Redis 宕机 | `NoopCache` 降级；不提升为强依赖 |
| 多实例缓存不一致 | 写时失效广播到同一 Redis |
| 缓存穿透 | Session 负数缓存；seat-access 空列表也缓存 |
| Redis 失效失败或 session-index 不完整 | 主流程不回滚；正向 session cache ≤5min TTL 有界陈旧，不承诺即时强一致 |

## 8. 验收标准

### 8.1 功能

- [ ] `REDIS_ENABLED=false`：全量现有测试通过，无行为变化
- [ ] `REDIS_ENABLED=true` 且 Redis 正常：登录 → 调工作台 → 登出 → 旧 token 返回 401，并验证没有继续命中旧正向 session cache
- [ ] `REDIS_ENABLED=true` 但 Redis 命令超时/异常：受保护接口回源 DB，服务不 5xx，不出现长时间挂起
- [ ] 改密、改角色、禁用/删除子账号后，按 `subUserId` 批量清理 session key 和 session-index key
- [ ] 子账号席位变更后，原 token 对新 seat 403/404，对新授权 seat 正常
- [ ] 托管账号重新分配子账号后，被移除的旧子账号与新增子账号权限都在失效后正确生效
- [ ] 子账号无席位时写入 `seatIds: []` 快照；子账号不存在或禁用时不写权限快照

### 8.2 性能（本地压测参考）

| 指标 | 目标 |
|------|------|
| `verifyAccessSession` cache hit | 不再出现 `xy_wap_embed_sub_user_session` 查询 |
| `canAccessSeat` cache hit | 不再出现 relation JOIN 查询 |
| 单用户 poll（2.5s） | DB 查询次数从约 6–8 降至约 4–6（P0 只减 2 次权限类查询） |

### 8.3 构建与检查

```bash
pnpm --filter @chatai/backend build
pnpm --filter @chatai/backend test
git diff --check
```

## 9. 实施顺序

建议分 3 步，每步可独立合并：

```
Step 1  P0-A  cache 抽象 + redisPlugin + env + NoopCache 默认
        ↓
Step 2  P0-B  verifyAccessSession + 登录/登出/子账号 session 失效
        ↓
Step 3  P0-C  seat-access snapshot + Settings 失效 + repository 改造
```

Step 1 合并后生产零行为变化。

## 10. P0 完成后的延伸（P1 预告）

| P0 产物 | P1 直接复用 |
|---------|------------|
| `CachePort` + `redisPlugin` | Poll seat 元数据、`contact:{uid}` hydration |
| `invalidateSeatAccess` | 接管（takeover）若改 host 关系 |
| Session 缓存模式 | 子用户 profile 短缓存 |

P1 完整场景清单见工作台性能优化讨论；Poll 辅助数据、平台层只读实体 hydration、Seat 聚合缓存为 P1 优先项。

## 11. 相关代码索引

| 模块 | 路径 |
|------|------|
| 鉴权插件 | `apps/backend/src/plugins/auth.ts` |
| Session 服务 | `apps/backend/src/modules/auth/auth.service.ts` |
| 席位权限 | `apps/backend/src/modules/chat/workbench-repository.ts` |
| Poll 入口 | `apps/backend/src/modules/chat/workbench.service.ts` → `poll` |
| 子账号 Settings | `apps/backend/src/modules/settings/sub-accounts.service.ts` |
| 托管账号 Settings | `apps/backend/src/modules/settings/managed-accounts.service.ts` |
| 环境配置 | `apps/backend/src/config/env.ts`、`.env.example` |
| 部署说明 | `docs/deployment/tencent-cloud-containers.md` |
