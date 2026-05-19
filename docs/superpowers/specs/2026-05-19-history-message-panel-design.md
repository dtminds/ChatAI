# 独立历史消息面板设计

- 日期：2026-05-19
- 状态：Draft
- 适用范围：`/chat` 工作台右侧栏、消息历史查询 API
- 目标：在不污染主聊天流的前提下，支持单个会话内按类型、自然日和发送人查看历史消息

## 1. 背景

当前主聊天窗口通过“加载更早的对话”逐页补齐历史消息。该方式适合上下文连续阅读，不适合在明确时间、消息类型或发送人条件下快速查找历史内容。

本需求需要在 composer 工具栏提供历史记录入口。点击后在现有右侧客户/群成员侧栏位置展示独立历史记录面板，历史数据全部从 backend 查询，不依赖当前本地 store 已加载的消息。

## 2. 目标

本期支持以下能力：

1. 复用 composer 工具栏已有历史记录按钮，并接入打开历史记录面板行为。
2. 点击按钮后，在当前右侧栏区域展示历史记录面板。
3. 历史记录数据通过独立 backend 接口查询。
4. 支持按消息类型分组查看：全部、文件、图片与视频、链接、小程序。
5. 支持按一个自然日筛选。
6. 支持按发送人筛选，单聊和群聊都使用同一个 `sender_id` 语义。
7. 支持分页查看。
8. 关闭历史记录后回到原右侧栏，不重新加载客户/群成员侧栏内容。

## 3. 非目标

本期不做以下能力：

- 不做关键词搜索。
- 不在主会话窗口中定位到某条历史消息。
- 不通过主聊天流反复加载更早消息来满足历史查看。
- 不做跨会话历史搜索。
- 不做图片、视频内容识别。
- 不调整现有主聊天消息分页、轮询和已读逻辑。

## 4. 方案选择

采用方案 A：新增独立历史消息查询接口，并在前端右侧栏增加独立历史记录层。

不采用的方案：

- 扩展现有 `/messages` 接口：主聊天流分页和历史检索分页语义不同，混用会让 `before_seq`、自然日正序和最近页正序规则互相污染。
- 前端基于已加载消息筛选：历史数据不完整，不能满足需求。

## 5. 后端接口设计

新增公开业务接口：

```text
GET /api/server/conversations/:conversationId/history-messages
```

查询参数：

- `scope`: `all | file | media | h5 | mini-program`
- `day`: 可选，格式 `YYYY-MM-DD`
- `sender_id`: 可选，统一匹配消息表 `third_from_id`
- `cursor`: 可选，由 backend 签发
- `limit`: 可选，默认 30，最大 100

响应结构：

```ts
type WorkbenchHistoryMessagePageDto = {
  messages: WorkbenchMessageDto[];
  nextCursor?: string;
  prevCursor?: string;
  hasNext: boolean;
  hasPrev: boolean;
};
```

契约类型放在 `packages/contracts/src/chat/dto.ts`，web 和 backend 共同消费。

## 6. 查询规则

backend 先通过 `conversationId` 查询会话，再校验当前登录子账号是否有会话所属席位访问权。

基础会话约束：

- 单聊：按 `uid`、`platform`、`third_user_id`、`third_external_id` 查询。
- 群聊：按 `uid`、`platform`、`third_user_id`、`third_group_id` 查询。
- 发送人筛选：如果有 `sender_id`，统一追加 `message.third_from_id = sender_id`。
- 日期筛选：如果有 `day`，按该自然日的开始和结束毫秒时间过滤 `message.msgtime`。

类型映射：

- `all`: 不限制消息类型。
- `file`: 文件消息。
- `media`: 图片和视频消息。
- `h5`: H5 链接消息。
- `mini-program`: 小程序消息。

## 7. 分页规则

接口返回给前端的 `messages` 始终按时间正序排列。

未选择 `day` 时：

- 首次请求默认取最近一页历史消息。
- backend 内部可按 `id desc` 取 `limit` 条，再反转为正序返回。
- `prevCursor` 表示继续查看更早消息。
- `nextCursor` 表示从当前页向更新消息翻回。

选择 `day` 时：

- 首次请求从当天最早一页开始。
- `nextCursor` 表示查看当天更晚消息。
- `prevCursor` 表示回到当天更早消息。

cursor 由 backend 签发，包含锚点、方向、筛选摘要和时间边界。请求 cursor 时，backend 必须校验 cursor 中的筛选摘要与当前查询参数一致；不一致时返回 `400 INVALID_HISTORY_CURSOR`。

## 8. 前端面板设计

右侧栏保持稳定 shell：

- resize 分隔条、宽度和侧栏容器继续沿用现有逻辑。
- 现有 `CustomerSidePanel` 保持挂载，不因打开历史记录而卸载。
- 历史记录面板作为同一右侧栏内的覆盖层或兄弟层显示。
- 关闭历史记录只隐藏历史层并回到原侧栏，避免 iframe、tab 状态或已加载群成员状态重置。

交互规则：

- composer 工具栏已有历史记录 icon 按钮点击后显示历史记录面板。
- 点击后显示历史记录面板。
- 历史记录面板顶部提供关闭按钮。
- 切换会话时关闭历史记录面板并清空该面板的查询结果。
- 刷新页面不持久化历史面板状态。

## 9. 历史面板内容

面板结构：

- 顶部：标题“历史记录”和关闭按钮。
- tabs：`全部 / 文件 / 图片与视频 / 链接 / 小程序`。
- 筛选栏：发送人、日期。
- 内容区：按当前 tab 展示结果。
- 底部：分页按钮。

展示规则：

- `全部`：沿用主会话消息样式，但每条消息直接展示完整时间戳，不插入时间分组。
- `文件`：使用列表展示文件名、扩展名、大小和发送时间。
- `图片与视频`：使用媒体墙展示图片和视频缩略图。
- `链接`：使用列表展示 H5 标题、摘要、来源和发送时间。
- `小程序`：使用列表展示小程序标题、应用名称和发送时间。

分页文案：

- 未选择日期时：使用“更早”和“更新”。
- 选择日期时：使用“上一页”和“下一页”。

## 10. 发送人筛选

单聊和群聊都展示发送人筛选。

单聊选项来自当前会话双方：

- 企微账号：`activeConversation.thirdUserId`
- 客户：`activeConversation.thirdExternalUserId`

群聊选项来自现有群成员接口。

前端传给 backend 的筛选值统一为 `sender_id`，backend 统一匹配 `xy_wap_embed_msg_audit_info.third_from_id`。

## 11. 前端状态归属

历史记录状态收敛到 `apps/web/src/store/workbench-store.ts`：

- 面板是否打开。
- 当前会话的历史筛选条件。
- 当前历史页结果。
- loading、error、cursor 和分页状态。

面板关闭时可以保留当前筛选和结果；切换会话时清空历史状态，避免跨会话误读。

## 12. 影响范围

contracts：

- 新增历史消息查询 DTO 和 scope 类型。

backend：

- `apps/backend/src/modules/chat/chat.routes.ts`
- `apps/backend/src/modules/chat/workbench.service.ts`
- `apps/backend/src/modules/chat/workbench-repository.ts`
- 必要的 memory service test fixture。

web：

- `apps/web/src/pages/chat/components/chat-composer.tsx`
- `apps/web/src/pages/chat/components/chat-panel.tsx`
- 新增历史记录面板相关组件。
- `apps/web/src/pages/chat/api/workbench-service.ts`
- `apps/web/src/pages/chat/api/workbench-gateway.ts`
- `apps/web/src/store/workbench-store.ts`

## 13. 风险与约束

- 历史面板不能卸载现有右侧栏，否则会造成 iframe 或侧栏 tab 状态重置。
- 历史查询分页与主聊天流分页不同，不能复用主聊天 `before_seq` 状态。
- `all` 可能包含多种消息类型，历史面板必须能容忍现有消息渲染器不支持的类型并显示 fallback。
- 日期筛选按服务端本地自然日解释，必须在接口和测试中固定边界。
- 发送人筛选依赖 `third_from_id` 的完整性；如果历史数据缺失该字段，结果可能少于实际发送人消息。

## 14. 验证方式

contracts：

1. 历史消息 scope 类型和响应结构可被 web/backend 正确引用。

backend：

1. 未登录请求被拒绝。
2. 无席位权限的会话请求被拒绝。
3. `scope=file` 只返回文件消息。
4. `scope=media` 返回图片和视频消息。
5. `day` 只返回该自然日内消息。
6. `sender_id` 只返回对应发送人消息。
7. 未选日期首次请求返回最近一页且响应正序。
8. 已选日期首次请求返回当天最早一页且响应正序。
9. cursor 筛选摘要不匹配时返回 `INVALID_HISTORY_CURSOR`。

web：

1. 点击 composer 历史按钮显示历史记录面板。
2. 关闭历史记录面板后原右侧栏状态不重置。
3. 切换会话关闭历史记录并清空历史结果。
4. tab、日期和发送人变化触发重新查询。
5. `全部` 不插入时间分组，并在每条消息上展示时间戳。
6. 文件、图片与视频、链接和小程序使用各自展示形态。
7. 查询失败显示错误态并支持重试。

## 15. 结论

本期以“独立历史消息面板 + 独立 backend 查询接口”为边界，优先完成结构化历史查看能力。搜索能力暂不进入本期，以避免对 `TEXT` 内容做低效模糊匹配或提前引入搜索基础设施。
