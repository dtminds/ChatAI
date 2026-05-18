# 预设角色权限系统设计

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `/chat` 工作台补齐可落库、可校验的预设角色权限，支持把某个子账号提升为管理员，或设为只读客服，同时不开放自定义角色。

**Architecture:** 采用“预设角色 + 固定能力集合 + 后端强校验”的轻量 RBAC。`type=1` 的主账号始终派生为 `owner` 并拥有最高权限，开户数据建议显式写入 `role=admin` 以保持数据语义正确；`type=0` 的子账号通过 `role` 字段绑定 `admin/operator/viewer` 预设角色。前端只负责展示和选择，所有权限判断最终由后端依据角色派生。

**Tech Stack:** TypeScript、TypeBox、Fastify、Kysely、React 19、Zustand、shadcn/ui

---

## 1. 背景

当前设置页中的“权限角色”还是 demo 页面，checkbox 不影响任何后端状态。设置相关接口只做登录态校验，没有区分“能进设置的人”和“只能用工作台的人”。这导致两个问题：

1. 子账号无法被提升为管理员。
2. 前端可以展示权限选项，但实际没有任何约束，容易误导使用者。

本期要解决的是“简单但真实”的权限管理，不做完整可配置 RBAC，也不引入自定义角色。

## 2. 目标

### 2.1 必须做到

- 支持预设角色：`owner`、`admin`、`operator`、`viewer`
- 主账号始终是 `owner`
- 子账号可被分配为 `admin`、`operator` 或 `viewer`
- `admin` 可以进入设置页并管理子账号、托管账号和侧边栏
- `operator` 可以接管账号并发送消息，不能进入设置管理能力
- `viewer` 只能查看会话，不能接管账号、发送消息或修改会话状态
- 前端不再使用 demo 数据冒充权限页
- 后端对 settings 接口做真实权限校验

### 2.2 不做的事情

- 不开放自定义角色
- 不开放角色自定义权限勾选
- 不引入单独的权限表做细粒度授权
- 不做组织级复杂审批流

## 3. 预设角色与能力

### 3.1 角色定义

| 角色 | 来源 | 说明 |
|---|---|---|
| `owner` | `xy_wap_embed_sub_user.type = 1`，通常 `role = admin` | 主账号的派生角色，永远拥有全部权限 |
| `admin` | `xy_wap_embed_sub_user.type = 0` + `role = admin` | 管理员子账号 |
| `operator` | `xy_wap_embed_sub_user.type = 0` + `role = operator` | 客服子账号 |
| `viewer` | `xy_wap_embed_sub_user.type = 0` + `role = viewer` | 只读客服子账号 |

### 3.2 固定能力集合

| 能力 | 含义 |
|---|---|
| `chat.access` | 进入 `/chat` 工作台 |
| `chat.send` | 在接管后发送消息 |
| `chat.takeover` | 接管托管账号 |
| `settings.access` | 进入 `/chat/settings` |
| `settings.subAccounts.manage` | 管理子账号 |
| `settings.managedAccounts.manage` | 管理托管账号与授权关系 |
| `settings.sidebar.manage` | 管理侧边栏配置 |

### 3.3 角色到能力映射

```text
owner:
  - chat.access
  - chat.send
  - chat.takeover
  - settings.access
  - settings.subAccounts.manage
  - settings.managedAccounts.manage
  - settings.sidebar.manage

admin:
  - chat.access
  - chat.send
  - chat.takeover
  - settings.access
  - settings.subAccounts.manage
  - settings.managedAccounts.manage
  - settings.sidebar.manage

operator:
  - chat.access
  - chat.send
  - chat.takeover

viewer:
  - chat.access
```

说明：

- `owner` 不是一个可写入或可选择的 `role` 值，而是 `type=1` 的派生角色。
- 新开通租户时，主账号记录应写为 `type=1` 且 `role=admin`，保证落库语义与主账号管理能力一致。
- `admin`、`operator` 和 `viewer` 只用于子账号。

## 4. 数据模型

### 4.1 账号角色字段

在 `xy_wap_embed_sub_user` 上新增角色字段：

```sql
ALTER TABLE xy_wap_embed_sub_user
ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'operator'
COMMENT '预设角色：admin管理员，operator客服，viewer只读客服；type=1主账号通常存admin并由系统推导为owner';
```

约束：

- `type = 1` 的记录由系统派生为 `owner`，开户和迁移时建议把 `role` 写为 `admin`
- `type = 0` 的记录使用 `role`
- `role` 只允许 `admin/operator/viewer`，`owner` 只由主账号类型推导
- 字段默认值保持 `operator`，避免创建子账号漏传 `role` 时意外获得管理员权限

新开通租户主账号时，应显式写入：

```sql
INSERT INTO xy_wap_embed_sub_user (..., type, role, ...)
VALUES (..., 1, 'admin', ...);
```

### 4.2 兼容策略

- 老数据默认 `operator`
- 新创建子账号默认 `operator`
- 主账号记录不迁移为 `owner` 值；建议把 `type=1` 的历史主账号补正为 `role=admin`，再由系统推导为 `owner`
- 如果已有脏值，后端读取时回退到 `operator`

```sql
UPDATE xy_wap_embed_sub_user
SET role = 'admin'
WHERE type = 1;
```

## 5. 后端设计

### 5.1 当前用户上下文

登录态需要派生出：

- `subUserId`
- `displayName`
- `accountType`
- `role`
- `permissions`

其中 `permissions` 由 `type + role` 统一派生，不允许前端传入。

### 5.2 权限判断入口

后端新增一个统一权限 helper，路由层按能力判断：

- settings 路由先判断 `settings.access`
- 写接口再判断对应管理能力
- 工作台路由继续沿用现有席位关系校验，并补上 `chat.access` / `chat.send` 的语义

### 5.3 settings 路由保护

以下接口必须校验对应能力：

- `GET /api/server/settings/managed-accounts` -> `settings.access`
- `PUT /api/server/settings/managed-accounts/:id/sub-accounts` -> `settings.managedAccounts.manage`
- `GET /api/server/settings/sub-accounts` -> `settings.subAccounts.manage`
- `POST /api/server/settings/sub-accounts` -> `settings.subAccounts.manage`
- `PUT /api/server/settings/sub-accounts/:id` -> `settings.subAccounts.manage`
- `PATCH /api/server/settings/sub-accounts/:id/status` -> `settings.subAccounts.manage`
- `DELETE /api/server/settings/sub-accounts/:id` -> `settings.subAccounts.manage`
- `GET /api/server/settings/sidebar-items` -> `settings.access`
- `POST /api/server/settings/sidebar-items` -> `settings.sidebar.manage`
- `PUT /api/server/settings/sidebar-items/:id` -> `settings.sidebar.manage`
- `PATCH /api/server/settings/sidebar-items/:id/status` -> `settings.sidebar.manage`
- `PUT /api/server/settings/sidebar-items/sort` -> `settings.sidebar.manage`
- `DELETE /api/server/settings/sidebar-items/:id` -> `settings.sidebar.manage`

### 5.4 登录与会话返回值

`/api/auth/session` 和前端 bootstrap 接口需要返回当前用户角色与权限摘要，便于：

- 前端隐藏不该出现的设置入口
- 页面刷新后快速恢复菜单状态

## 6. 前端设计

### 6.1 设置入口控制

- `operator` 和 `viewer` 登录后不显示设置入口
- 直接访问 `/chat/settings` 时跳转到无权限页或 `/chat`
- `admin` 与 `owner` 保留完整设置菜单

### 6.2 权限角色页

把当前 demo 页改成真实的预设角色说明页：

- 展示 `owner/admin/operator/viewer` 四种角色
- 展示每种角色固定拥有哪些能力
- 不展示可编辑 checkbox
- 不提供创建角色入口

### 6.3 子账号管理页

子账号列表和创建/编辑弹窗增加角色字段：

- 创建子账号默认 `operator`
- 编辑子账号可切换为 `admin`、`operator` 或 `viewer`
- `owner` 不允许在 UI 中选择

### 6.4 交互约束

- 没权限时不让用户“看见可点但最终报错”的入口
- 仍保留后端 403，前端隐藏只是体验优化

## 7. 接口与契约

### 7.1 Auth DTO

扩展会话或当前用户 DTO，返回：

```ts
type AccountRole = "owner" | "admin" | "operator" | "viewer";
type AccountPermission =
  | "chat.access"
  | "chat.send"
  | "settings.access"
  | "settings.subAccounts.manage"
  | "settings.managedAccounts.manage"
  | "settings.sidebar.manage";
```

### 7.2 Settings DTO

子账号对象需要携带角色字段：

```ts
type SettingsSubAccount = {
  id: string;
  account: string;
  name: string;
  type: 0 | 1;
  role: "owner" | "admin" | "operator" | "viewer";
  status: "active" | "disabled";
  seats: SettingsWeComSeat[];
};
```

`owner` 只在主账号记录上表现为推导结果，不作为可编辑值，也不作为 `xy_wap_embed_sub_user.role` 的落库值。主账号落库建议使用 `type=1 + role=admin`。

## 8. 错误处理

建议使用清晰的权限错误码：

- `FORBIDDEN`：无权限访问 settings
- `ROLE_NOT_ALLOWED`：试图写入非法角色
- `OWNER_ROLE_IMMUTABLE`：试图修改主账号角色

前端收到 `403` 后统一提示“无权限访问”。

## 9. 验收标准

- 主账号登录后可进入设置并管理子账号
- 主账号可把某个子账号设置为 `admin`
- `admin` 可以进入设置页并管理子账号/托管账号/侧边栏
- `operator` 和 `viewer` 不可进入设置页
- `operator` 和 `viewer` 直接调用 settings 写接口返回 403
- 权限角色页不再使用 demo 数据
- 不存在自定义角色入口

## 10. 测试建议

### 10.1 contracts

- 校验新增 `role` / `permissions` DTO
- 校验权限枚举与角色枚举合法性

### 10.2 backend

- `admin` 能访问 settings 写接口
- `operator` 和 `viewer` 访问 settings 写接口返回 403
- `owner` 不能被改成其他角色
- 非法角色值被拒绝

### 10.3 web

- `operator` 和 `viewer` 登录后不显示设置入口
- `admin` 登录后显示设置入口
- 权限页展示真实预设角色数据

## 11. 迁移与落地顺序

1. 先加契约与数据模型
2. 再补后端权限派生与路由守卫
3. 再改 settings 页面和子账号管理页
4. 最后补测试和边界文案

## 12. 风险

- 目前没有单独权限表，未来如果需要更细粒度授权，可能要再做一次数据迁移
- `role` 字段与现有 `type` 的双字段模型需要保持约束一致，避免前后端语义漂移
- 如果后续要支持“管理员只能管自己创建的子账号”，还需要再引入创建者归属字段
