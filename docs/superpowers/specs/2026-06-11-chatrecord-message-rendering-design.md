# 转发聊天记录消息渲染设计方案

- 日期：2026-06-11
- 状态：Draft
- 适用范围：`/chat` 聊天工作台、历史消息 Lite 展示、转发聊天记录详情弹窗
- 目标消息类型：`msgtype=chatrecord`

## 1. 背景

`msgtype=chatrecord` 表示一条消息是转发的聊天记录片段。主聊天窗口和历史消息 Lite 展示需要把它渲染为可点击的聊天记录卡片；点击卡片后，工作台从 `xy_wap_embed_msg_audit_chat_record` 读取具体片段并在弹窗内展示。

详情数据使用主消息的 `xy_wap_embed_msg_audit_info.msgid` 查询 `xy_wap_embed_msg_audit_chat_record.msgid`。聊天记录详情表属于平台只读事实数据，Node backend 只读，不写入。

## 2. 目标与非目标

### 2.1 目标

第一版需要支持：

1. 主聊天窗口渲染 `msgtype=chatrecord` 卡片。
2. 历史消息 Lite 展示和其它复用 Lite 消息列表的场景同步支持 `chatrecord` 卡片。
3. 点击卡片打开详情弹窗，按需加载聊天记录片段。
4. 后端按登录态、租户和平台隔离读取 `xy_wap_embed_msg_audit_chat_record`。
5. 嵌套聊天记录行复用现有消息类型解析能力，按 `msgtype` 选择展示组件。
6. 弹窗内对复杂消息做静态展示或摘要降级，避免递归交互扩散。
7. 文件和视频在弹窗内只展示静态卡片，不接下载动作。

### 2.2 非目标

第一版不做：

- 递归展开嵌套 `chatrecord`。
- 在普通消息分页接口中预加载聊天记录详情。
- 对弹窗内文件、视频接下载动作。
- 对弹窗内语音接播放或转写动作。
- 给聊天记录详情新增写入、修复或补偿逻辑。
- 修改平台层消息写入流程。

## 3. 数据契约

主消息 `xy_wap_embed_msg_audit_info.content` 示例：

```json
{
  "msgContent": ["范双飞：123", "缪勇飞：123", "缪勇飞：[图片]"],
  "msgTitle": "缪勇飞和范双飞的聊天记录"
}
```

嵌套 `chatrecord` 行的 `content` 示例：

```json
{
  "msgTitle": "群聊",
  "unsupportedDisplayText": "该消息类型暂不能展示"
}
```

`packages/contracts` 新增 `chatrecord` 内容类型：

```ts
type WorkbenchMessageContentType = ... | "chatrecord";

type WorkbenchChatRecordMessageContent = {
  msgContent?: string[];
  msgTitle: string;
  unsupportedDisplayText?: string;
};
```

主消息列表中的 `contentType="chatrecord"` 只承载卡片摘要，不承载详情消息数组。

详情接口返回结构：

```ts
type WorkbenchChatRecordDetailResponse = {
  messageId: string;
  messages: WorkbenchMessageDto[];
};
```

`messageId` 是主消息的 `xy_wap_embed_msg_audit_info.msgid`。

## 4. 后端设计

新增只读接口：

```text
GET /api/server/messages/:messageId/chat-record
```

路由要求：

- 必须走 `app.authenticate`。
- `:messageId` 使用主消息的 `xy_wap_embed_msg_audit_info.msgid`。
- 先校验主消息属于当前登录用户可访问的租户、平台和会话范围。
- 再用 `msgid + uid + platform` 查询 `xy_wap_embed_msg_audit_chat_record`。
- 查询结果按 `msgtime ASC, id ASC` 排序。

读取策略：

```sql
SELECT *
FROM xy_wap_embed_msg_audit_chat_record
WHERE msgid = :message_msgid
  AND uid = :uid
  AND platform = :platform
ORDER BY msgtime ASC, id ASC;
```

`xy_wap_embed_msg_audit_chat_record` 不加入 `apps/backend/src/db/writable-tables.ts`。

### 4.1 消息映射

后端把 `xy_wap_embed_msg_audit_chat_record` 行映射为详情用 `WorkbenchMessageDto`：

- `messageId` 使用 `chatrecord:${parentMsgid}:${recordId}` 这样的稳定派生 ID，避免和主消息冲突。
- `seq` 使用嵌套记录行 `id`。
- `createdAt` 使用 `msgtime`。
- `senderName` 使用 `name`，缺失时用发送方兜底文案。
- `senderAvatar` 使用 `avatar`。
- `contentType` 和 `content` 复用现有 `msgtype/content` 解析逻辑。
- `conversationId` 使用主消息会话 ID 或详情专用占位值，不用于详情内跳转。

`msgtype=chatrecord` 的内容解析规则：

- `msgTitle` 作为标题，缺失时使用 `聊天记录`。
- `msgContent` 是字符串数组，最多在卡片中展示前三行。
- `unsupportedDisplayText` 作为降级正文。
- 以上字段都缺失时显示 `[聊天记录]`。

## 5. 前端设计

新增 `ChatRecordMessageCard`，接入 `MessageContentRenderer`。

主卡片结构：

```text
标题：msgTitle
摘要：msgContent 最多 3 行
分割线
类型：聊天记录
```

视觉规则：

- 使用现有消息卡片的宽度、圆角、边框、字体和色彩 token。
- 不根据截图像素倒推字号、间距、圆角或宽高。
- 摘要文本弱化显示，逐行截断。
- 整张卡片是一个可点击控件，支持键盘激活。
- 在主聊天窗口和 Lite 历史列表中使用同一张卡片。

点击卡片后打开详情弹窗：

- 弹窗标题优先使用 `msgTitle`。
- 打开后按需请求详情接口。
- 加载中展示紧凑 loading。
- 空结果展示 `暂无聊天记录`。
- 失败展示可重试错误态。
- 成功后使用 Lite 型消息列表展示详情。

## 6. 详情弹窗降级规则

弹窗内消息按静态阅读设计，不扩展复杂动作：

```text
text：完整文本
image/emotion：静态图片或表情
file：静态文件卡片，不下载
link/weapp/card/location：静态卡片
video：静态视频卡片，不下载
voice：优先展示 transVoiceText，没有则展示 [语音]
quote：展示引用正文和预览摘要，不跳转定位
chatrecord：不递归展开，展示 msgTitle + unsupportedDisplayText
revoke：展示 [撤回消息]
unknown/其他类型：展示摘要占位
```

嵌套 `chatrecord` 的展示优先级：

1. 标题：`msgTitle`。
2. 正文：`unsupportedDisplayText`。
3. 兜底：`[聊天记录]`。

## 7. 状态与错误处理

卡片本身不预加载详情。详情弹窗以 `messageId` 为缓存 key，可在单次页面生命周期内复用已经加载的详情。

错误处理：

- 主消息不是 `chatrecord`：返回 404 或业务错误。
- 当前用户无权访问主消息：返回 404，避免暴露数据存在性。
- 详情表无记录：返回空数组，前端展示 `暂无聊天记录`。
- 单条详情内容解析失败：该条消息降级为 `[暂不支持显示该消息]`，不影响其它记录。

## 8. 测试

后端测试：

- mapper 能把主消息 `msgtype=chatrecord` 转为 `contentType="chatrecord"`。
- mapper 能解析 `msgTitle`、`msgContent`、`unsupportedDisplayText`。
- 详情 repository 使用 `msgid + uid + platform` 查询详情表。
- 详情接口要求登录态，并校验主消息归属。
- 嵌套 `chatrecord` 不触发递归查询。

前端测试：

- `MessageContentRenderer` 能渲染聊天记录卡片。
- Lite 历史消息列表能渲染聊天记录卡片。
- 卡片展示标题、前三条摘要和 `聊天记录` 类型文案。
- 点击卡片打开详情弹窗并请求详情接口。
- 弹窗内文件和视频不展示下载动作。
- 嵌套 `chatrecord` 展示 `msgTitle` 和 `unsupportedDisplayText`。

提交前验证：

```text
pnpm --filter @chatai/contracts build
pnpm --filter @chatai/backend build
pnpm --filter @chatai/web test <related-test-files>
pnpm --filter @chatai/web build
git diff --check
```
