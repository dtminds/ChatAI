# Workflow 开始节点：添加好友来源目录

- 日期：2026-08-24
- 状态：Ready
- 目标：开始节点「添加好友」触发条件改用来源目录选择，不再手填来源 ID

## 结论

1. Java 目录接口：`POST /third-internal/work-external-contact/add-way-list`，请求体只传当前租户 `uid`。
2. Node 公开接口：`GET /api/server/workflow/friend-add-ways`。浏览器不直连 Java，也不在 URL 暴露 `third-internal`。
3. 目录是两级：父级 `key/title` + 可选 `children[]`。这是固定枚举级规模，一次返回全量；Node 最多保留 200 个父级、每个父级最多 200 个子级。
4. 开始节点仍保存 `triggers[].sourceIds: string[]`。有子级时只存子级 `key`；没有子级时存父级 `key`。空数组表示任意来源，最多选择 5 个。
5. 事件匹配仍按已有契约：`sourceIds` 为空则不过滤；非空则精确命中 `payload.sourceId`。
6. 编辑器只展示已选数量；打开弹窗后只回显目录里仍存在的 `key`。

## Java 响应

```json
{
  "success": true,
  "error": 0,
  "errorMsg": "",
  "data": [
    {
      "key": "scan",
      "title": "扫描二维码",
      "children": [
        { "key": "scan.mini_program", "title": "小程序" }
      ]
    }
  ]
}
```

失败时 Node 返回「操作失败，请稍后重试」，不把上游错误码暴露给编辑器。
