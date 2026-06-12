# 素材收录设计

## 目标

在聊天工作台支持从历史消息收录素材，并在 composer 上方选择已收录素材。首期覆盖自定义表情、文件、小程序、H5 链接四类消息。

素材收录、分组管理和素材管理走真实后端与数据库；从 composer 点击素材发送时首期只弹出提示，后续再接入真实发送接口。

## 数据模型

使用两张表：

- `xy_wap_embed_material_collection_group`
- `xy_wap_embed_material_collection`

两张表共用 `biz_type` 枚举：

- `1`：表情
- `2`：文件
- `3`：小程序
- `4`：H5

两张表都新增 `sort BIGINT`，用于置顶排序。新建和置顶时写当前时间毫秒。列表统一按 `sort desc, id desc` 排序。

`xy_wap_embed_material_collection.msgid` 存 `xy_wap_embed_msg_audit_info.msgid`。`content` 存 `xy_wap_embed_msg_audit_info.content` 原文，后端列表接口负责把原始 content 映射成工作台已有消息内容 DTO。

表情素材固定：

- `biz_type = 1`
- `group_id = 0`
- `sub_uid = 当前登录子账号 ID`
- `op_sub_uid = 当前登录子账号 ID`
- 表情不展示、不创建、不管理分组

文件、小程序、H5 素材固定：

- `biz_type` 分别为 `2`、`3`、`4`
- `group_id` 必须为用户选择的真实分组 ID
- `sub_uid = 0`，表示企业资产，企业内子账号共享
- `op_sub_uid = 当前登录子账号 ID`

文件、小程序、H5 不允许新增 `group_id = 0` 的素材。历史 `group_id = 0` 数据不做前端兼容展示，由数据侧清理。

重复收录规则：

- 同一 `uid + biz_type + sub_uid + msgid` 已有正常记录时，不新建重复记录。
- 已有记录为删除态时，恢复该记录，并更新 `group_id`、`op_sub_uid`、`sort`、`title`、`content`。

删除统一使用 `biz_status = 0` 软删除。

## 后端接口

新增工作台公开接口，路径使用 `/api/server/material-collections/*`。

接口归属 `apps/backend/src/modules/chat`，共享类型放在 `packages/contracts/src/chat/dto.ts` 或独立 chat 子模块导出，前端通过 `apps/web/src/pages/chat/api/workbench-service.ts` 访问，不在 UI 组件里拼 URL。

核心能力：

- 拉取分组列表：按 `bizType` 返回可见分组。表情不需要分组接口。
- 拉取素材列表：按 `bizType`、`groupId` 返回素材。表情不需要 `groupId`；文件、小程序、H5 按真实分组展示。
- 收录消息：入参包含 `bizType`、`msgId`、`groupId`。表情固定写 `group_id = 0`；文件、小程序、H5 必须传真实分组 ID，后端校验消息类型与 `bizType` 匹配后写入 collection。
- 新建分组：文件、小程序、H5 支持；表情不支持。
- 重命名分组：仅允许正常状态的自定义分组。
- 置顶分组：更新该分组 `sort`。
- 删除分组：仅允许空分组；非空分组返回业务错误。
- 删除素材：软删除单条素材。
- 置顶素材：更新该素材 `sort`。
- 移动素材分组：更新单条素材 `group_id`，并更新 `sort` 让它出现在目标分组前面。

权限规则：

- 需要正常登录、JWT 和 session 校验。
- 有聊天发送权限的子账号可以收录、管理企业素材和分组。
- 表情素材只对当前子账号可见和可管理。

写表边界：

- 新表属于 Node 后端可写业务表，需要加入 `apps/backend/src/db/writable-tables.ts` 白名单。
- 继续禁止直接写平台层消息表。收录时只读 `xy_wap_embed_msg_audit_info`。

## 内容映射

后端收录时从 `xy_wap_embed_msg_audit_info` 读取 `msgid`、`msgtype`、`content`、`uid` 等字段。

素材列表返回给前端的 item 包含：

- `id`
- `bizType`
- `groupId`
- `title`
- `sort`
- `createdAt`
- `updatedAt`
- `messageId`
- `contentType`
- `content`

其中 `contentType/content` 复用工作台消息映射规则：

- 表情映射为 `contentType = "emotion"`，前端适配为 `image` 且 `variant = "emotion"`。
- 文件映射为 `contentType = "file"`。
- 小程序映射为 `contentType = "mini-program"`。
- H5 映射为 `contentType = "h5"`。

前端展示素材时复用已有消息组件：

- `ImageMessageCard`
- `FileMessageCard`
- `MiniAppMessageCard`
- `LinkMessageCard`

## 前端交互

消息头像 hover 菜单中，仅对以下消息类型展示“收录内容”：

- `image` 且 `variant = "emotion"`
- `file`
- `mini-program`
- `h5`

表情点击“收录内容”后直接收录到个人表情收藏。

文件、小程序、H5 点击“收录内容”后打开分组选择弹窗。用户必须选择已有分组或在下拉中先新建分组，未选择分组时不允许保存。

composer 工具入口：

- 自定义表情合并进现有微信表情菜单，新增“收藏的表情”区域。
- 文件新增素材入口。
- 小程序新增素材入口。
- H5 新增素材入口。

文件、小程序、H5 使用统一素材弹窗：

- 左侧只展示真实分组。
- 左下角提供“新建分组”。
- 右侧展示当前分组素材。
- 普通态点击素材触发 `alert`，不调用发送接口。
- 管理态支持素材删除、置顶、移动分组。
- 分组行支持重命名、置顶、删除。非空分组删除时展示错误提示。
- 打开弹窗时默认选中排序第一的真实分组；没有分组时展示空状态和新建分组入口。

表情面板：

- 保留现有微信表情选择能力。
- 新增收藏表情区，只展示已收录表情。
- 首期不支持自定义上传。
- 点击收藏表情先触发 `alert`。

UI 继续使用项目现有 `shadcn/ui` 基础组件和 Hugeicons，不引入新的 UI 或图标体系。

## 状态与错误处理

素材列表和分组列表按 `bizType` 分开加载和缓存。

收录成功后：

- 表情提示“已收录”
- 文件、小程序、H5 关闭分组选择弹窗并刷新对应素材列表

重复收录返回已存在状态时，前端提示“已收录”。

删除非空分组返回业务错误，前端提示“请先移走或删除分组内素材”。

接口失败统一走现有请求错误处理和 toast。

## 测试

contracts：

- 覆盖素材 `bizType`、分组、素材 DTO 和请求响应类型。

backend：

- 收录四类消息的字段写入规则。
- 表情个人可见、企业素材共享。
- 重复收录不重复插入。
- 删除态重复收录会恢复。
- 表情固定写 `group_id=0`。
- 文件、小程序、H5 缺少分组或传 `0` 时不写入素材。
- 非空分组不允许删除。
- 素材移动、素材置顶、分组置顶。

web：

- 消息 hover 菜单只对可收录类型展示“收录内容”。
- 表情点击后直接调用收录。
- 文件、小程序、H5 打开分组选择，支持在下拉中新建分组，选中真实分组后提交收录。
- composer 工具入口展示素材弹窗。
- 管理态支持删除、置顶、移动真实分组和分组管理操作。
- 点击素材只触发 alert。

验证命令：

- `pnpm --filter @chatai/contracts build`
- `pnpm --filter @chatai/backend build`
- `pnpm --filter @chatai/web build`
- 相关 contracts/backend/web Vitest 用例
- `git diff --check`
