# 快捷话术设计

## 目标

在聊天工作台新增快捷话术能力，让客服可以按场景维护和使用常用回复。快捷话术用于组织一组待发送内容，首期支持：

- 企业话术和个人话术
- 一级、二级分类
- 话术徽标：标题文字 + 颜色
- 主文本
- 最多 5 个附件
- 点击话术后回填 composer
- 入口固定放在聊天工作台侧边栏，对私聊和群聊同时生效

快捷话术不是素材收录的替代品。素材收录负责管理可复用的原子素材，例如文件、H5、小程序、视频号；快捷话术负责把文本和附件组织成可直接发送的回复草稿。

## 产品边界

一条快捷话术由主文本和附件组成：

- 主文本可以为空。
- 附件可以为空数组。
- 保存时必须满足：主文本非空，或至少有一个附件。
- 附件最多 5 个。
- 点击话术回填 composer 时，初始草稿按“主文本在前，附件按 `attachments` 数组顺序追加”生成。不存在图片优先于其他附件的特殊规则。
- 用户在 composer 中继续编辑后，发送以 composer 当前最终草稿为准。话术的“主文本在前、附件按配置顺序”只用于回填初始草稿，发送阶段不再按话术配置重新排序。

话术不单独维护标题和摘要。列表里展示的主要识别信息来自：

- 主文本首行或内容摘要
- 徽标文字和颜色
- 附件类型图标
- 所属分类

这样可以避免运营人员同时维护“标题、摘要、正文”三套重复信息。

话术徽标不是独立标签体系。首期只作为话术条目上的展示标记，不支持多标签、不支持标签独立管理、不建标签表。

## 数据模型

新增两张表：

- `xy_wap_embed_quick_reply_category`
- `xy_wap_embed_quick_reply`

不复用 `xy_wap_embed_material_collection` 作为快捷话术主表。素材表仍表示原子素材；快捷话术是场景化回复模板，两者领域模型不同。

### 分类表

`xy_wap_embed_quick_reply_category` 存一级和二级分类。

建议字段：

- `id BIGINT UNSIGNED PRIMARY KEY`
- `uid BIGINT UNSIGNED NOT NULL`
- `scope_type TINYINT NOT NULL`：`1` 企业话术，`2` 个人话术
- `sub_uid BIGINT UNSIGNED NOT NULL DEFAULT 0`：企业话术为 `0`，个人话术为当前子账号 ID
- `parent_id BIGINT UNSIGNED NOT NULL DEFAULT 0`：一级分类为 `0`，二级分类指向一级分类
- `title VARCHAR(20) NOT NULL`
- `sort BIGINT NOT NULL DEFAULT 0`
- `biz_status TINYINT NOT NULL DEFAULT 1`
- `op_sub_uid BIGINT UNSIGNED NOT NULL DEFAULT 0`
- `create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`

查询范围：

- 企业话术：`uid + scope_type = 1 + sub_uid = 0`
- 个人话术：`uid + scope_type = 2 + sub_uid = 当前子账号 ID`

分类删除规则：

- 有子分类时不允许删除一级分类。
- 分类下存在话术时不允许删除。
- 删除使用 `biz_status = 0` 软删除。

### 话术表

`xy_wap_embed_quick_reply` 存话术主体和附件 JSON。

建议字段：

- `id BIGINT UNSIGNED PRIMARY KEY`
- `uid BIGINT UNSIGNED NOT NULL`
- `scope_type TINYINT NOT NULL`：`1` 企业话术，`2` 个人话术
- `sub_uid BIGINT UNSIGNED NOT NULL DEFAULT 0`：企业话术为 `0`，个人话术为当前子账号 ID
- `category_id BIGINT UNSIGNED NOT NULL DEFAULT 0`
- `content_text TEXT NULL`
- `attachments JSON NULL`
- `label_text VARCHAR(10) NOT NULL DEFAULT ''`
- `label_color VARCHAR(20) NOT NULL DEFAULT ''`
- `sort BIGINT NOT NULL DEFAULT 0`
- `biz_status TINYINT NOT NULL DEFAULT 1`
- `op_sub_uid BIGINT UNSIGNED NOT NULL DEFAULT 0`
- `create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`

`label_color` 建议存预设颜色 key，例如 `orange`、`green`、`blue`，不直接开放任意颜色。

`category_id = 0` 表示未分类。首期允许未分类话术，前端在分类列表中提供“未分类”视图。

### 附件 JSON

附件存在 `xy_wap_embed_quick_reply.attachments` 中，结构为数组：

```json
[
  {
    "type": "h5",
    "materialCollectionId": "123",
    "msgid": "1025657",
    "content": {
      "title": "红包来啦",
      "desc": "恭喜发财，大吉大利",
      "href": "https://example.com",
      "coverUrl": "https://example.com/cover.png"
    }
  }
]
```

字段说明：

- `type`：附件类型，只保留这一个类型字段，不再额外存 `bizType`
- `materialCollectionId`：可选，来源于素材库时写入
- `msgid`：可选，来源于素材库时写入，对应 `xy_wap_embed_msg_audit_info.msgid`
- `content`：发送和展示所需内容快照

首期允许的 `type`：

- `image`
- `file`
- `h5`
- `weapp`
- `sphfeed`

附件内容使用快照，不强依赖素材表实时数据。这样素材被删除、移动分组或修改后，不会破坏已经配置好的快捷话术。

来源规则：

- `image` 可以直接上传或使用快照，只要求 `content.fileUrl` 可发送。
- `file`、`h5`、`weapp`、`sphfeed` 首期只能从素材库选择。
- 从素材库选择时，保存 `materialCollectionId`、`msgid` 和 `content` 快照。
- 发送时使用快捷话术附件自身冗余的 `content` 和 `msgid`，不再通过 `materialCollectionId` 反查素材库。`materialCollectionId` 仅用于来源追溯。

## 内容校验

保存快捷话术时，后端统一校验：

- `content_text.trim()` 非空，或 `attachments.length > 0`
- `attachments.length <= 5`
- 每个附件 `type` 必须在允许枚举内
- 每个附件 `content` 必须满足对应发送接口的最低字段要求

附件字段校验：

- `image`：`fileUrl` 非空
- `file`：必须有 `materialCollectionId` 和 `msgid`，且 `fileName`、`fileUrl` 非空
- `h5`：必须有 `materialCollectionId` 和 `msgid`，且 `href`、`title` 非空；`coverUrl` 为空时发送侧使用默认封面
- `weapp`：必须有 `materialCollectionId` 和 `msgid`
- `sphfeed`：必须有 `materialCollectionId` 和 `msgid`；首期可以保存和展示，发送能力未开放时，发送前拦截并提示“视频号发送功能暂未开放”

这里的 `content.fileUrl` 是快捷话术附件 JSON 快照字段，来自素材 content。回填到 composer 和发送 DTO 时，文件段继续使用现有 `url` 字段，不新增 `fileUrl` 发送字段。

主文本长度、分类名称长度、徽标文字长度需要在接口层和前端表单同时限制。建议：

- 分类名称：20 字以内
- 徽标文字：10 字以内
- 主文本：1000 字以内
- 徽标颜色：仅允许预设 key，例如 `orange`、`green`、`blue`

## 前端交互

快捷话术入口固定放在聊天工作台侧边栏，作为独立板块，不混入素材库入口。该入口对私聊和群聊同时生效。

基础结构：

- 顶部切换：企业话术 / 个人话术
- 分类区：一级分类、二级分类
- 话术列表：展示主文本摘要、徽标、附件图标
- 搜索：按主文本和徽标文字搜索

点击话术后统一回填 composer：

- 主文本回填为可编辑文本
- 图片沿用 composer 现有图片能力
- 文件、H5、小程序、视频号以 Lite 附件卡片展示
- Lite 附件卡片支持删除
- 发送仍从 composer 发起

composer 不需要变成完整富文本编辑器。它只需要让现有编辑器内容和 Lite 附件卡片共同组成可编辑草稿：

- 文本和图片继续使用现有 composer 编辑能力
- 文件、H5、小程序、视频号以 Lite 卡片展示
- 话术回填时按主文本在前、附件按 `attachments` 顺序生成初始草稿
- 用户编辑后，发送时按 composer 当前最终草稿转换成现有发送接口参数；如果用户移动、删除或调整内容，发送顺序以编辑后的结果为准

视频号发送暂未开放时：

- 可以在快捷话术中展示视频号附件
- 回填 composer 后保留视频号 Lite 卡片
- 点击发送时拦截，提示“视频号发送功能暂未开放”

## 后端接口

接口路径继续使用公开业务前缀 `/api/server/*`，不暴露内部实现命名。

建议接口：

- `GET /api/server/quick-replies/categories?scope_type=1`
- `POST /api/server/quick-replies/categories`
- `PATCH /api/server/quick-replies/categories/:id`
- `DELETE /api/server/quick-replies/categories/:id`
- `GET /api/server/quick-replies?scope_type=1&category_id=123&page=1&page_size=50`
- `POST /api/server/quick-replies`
- `PATCH /api/server/quick-replies/:id`
- `DELETE /api/server/quick-replies/:id`
- `POST /api/server/quick-replies/:id/top`

列表接口必须分页。默认 `page_size` 建议 50，最大 100。

权限规则：

- 企业话术对同租户可见。
- 个人话术只对当前子账号可见。
- 企业话术的新建、编辑、删除首期允许所有非 viewer 子账号操作。
- 个人话术由当前子账号管理。

## 与素材收录的关系

快捷话术附件里的图片可以直接上传或使用快照；文件、H5、小程序、视频号首期只能来自素材库。

来自素材库时：

- 写入 `materialCollectionId`
- 写入 `msgid`
- 同时写入 `content` 快照

发送时不依赖素材库实时查询。文件、H5 发送使用 `content` 快照；小程序转发使用快捷话术附件冗余的 `msgid`。视频号首期保存、展示和回填 composer，但发送能力暂未开放，发送前统一拦截并提示“视频号发送功能暂未开放”。素材 ID 只用于来源追溯、后续可能的跳转查看或批量治理。

发送分支必须遵循一条硬规则：composer segment 带 `msgid` 时，按快捷话术快照发送路径处理；只有 segment 不带 `msgid` 且带 `materialCollectionId` 时，才按素材库转发路径处理。这样来自快捷话术的文件和 H5 即使同时保留了 `materialCollectionId`，也不会误走素材库反查。

这条规则必须在前端 `toWorkbenchSendSegment` 和后端发送构造两侧同时成立，并通过测试覆盖：

- 前端：带 `msgid` 的 file/H5/weapp/sphfeed segment 必须原样保留快照字段传给 backend。
- 后端：带 `msgid` 的 file/H5 必须使用 segment 内联字段发送；带 `msgid` 的 weapp 必须使用 segment.msgid 转发；带 `msgid` 的 sphfeed 仍按暂未开放规则拦截；不得再反查素材表。
- 只有不带 `msgid` 的素材库发送，才允许通过 `materialCollectionId` 查素材表。

不建议用 `xy_wap_embed_material_collection` 表直接存快捷话术，因为：

- 快捷话术没有素材分组语义
- 快捷话术需要主文本和多个附件
- 快捷话术有企业/个人话术、分类、徽标等独立组织方式
- 复用素材表会导致 `biz_type` 和 `content` JSON 承载过多非素材语义

## 测试

contracts：

- 分类 DTO 和话术 DTO。
- 附件 `type` 枚举。
- 附件数量上限。

backend：

- 企业话术和个人话术可见范围。
- 分类树查询、排序、软删除。
- 有子分类或有话术时不允许删除分类。
- 空话术不允许保存。
- 附件超过 5 个不允许保存。
- 附件字段缺失时返回业务错误。
- 话术列表分页。

web：

- 企业/个人话术切换。
- 分类切换和空状态。
- 一级分类可新建子分类。
- 点击话术回填 composer。
- 主文本可编辑。
- 附件 Lite 卡片展示和删除。
- 视频号附件发送拦截提示。
- 搜索输入建议 300ms debounce 后请求。
- 首期话术列表只加载第一页 50 条，不做加载更多。

## 后续扩展

以下能力不进入首期：

- 独立标签表和多标签筛选
- 附件明细表
- 附件独立分页、独立排序管理
- 话术列表加载更多
- 话术使用次数统计
- 推荐话术
- 批量替换素材
- 按附件类型筛选话术

当出现附件级统计、批量治理、跨话术反查素材等明确需求时，再考虑把附件 JSON 迁移为独立明细表。
