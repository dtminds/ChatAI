# Workflow 开始节点：添加好友来源目录

- 日期：2026-08-24
- 状态：Ready
- 目标：开始节点「添加好友」触发条件改用来源目录选择，不再手填来源 ID；有二级来源时可再筛活动

## 结论

1. Java 目录接口：`POST /third-internal/work-external-contact/add-way-list`，请求体只传当前租户 `uid`。
2. Node 公开接口：`GET /api/server/workflow/friend-add-ways`。浏览器不直连 Java，也不在 URL 暴露 `third-internal`。
3. 目录是两级：父级 `key/title` + 可选 `children[]`。这是固定枚举级规模，一次返回全量；Node 最多保留 200 个父级、每个父级最多 200 个子级。
4. 编辑器用来源级联选择，必填，空态文案是「请选择」。有 `children` 时点父级展开右侧子级，回显为「父级 / 子级」。匹配方式与来源在同一行，默认「满足全部」；切换为「满足任意一个」后第二行出现活动输入框。整块最多两行。
5. 活动列表走 Java `POST /third-internal/work-external-contact/get-add-way-activity`。Swagger 参数名是 `reqTO`，实际 JSON 与现有 third-internal 一样是 flat 字段：`key`、`uid` 必填，`title`、`page`、`pageSize`、`addWayIds` 可选。
6. Node 公开接口：`GET /api/server/workflow/friend-add-way-activities`。分页在上游完成，默认 `pageSize=20`，上限 50；编辑器按页替换当前页，不拉全量，也不用「加载更多」。活动行展示标题和创建时间。
7. 开始节点仍保存 `triggers[].sourceIds: string[]`，并增加可选 `addWayKey`、`sourceMatchMode`。
   - 草稿未选：不写 `addWayKey`，`sourceIds=[]`，发布时拦截
   - 无二级，或二级且满足全部：`addWayKey` 为叶子 key（有子级时存子级），`sourceIds=[该 key]`
   - 二级且满足任意一个：`sourceMatchMode="any"`，`sourceIds` 为所选活动 `addWayId`，最多 5 个
8. 事件匹配仍按已有契约：`sourceIds` 非空则精确命中 `payload.sourceId`。发布后不应再出现空 `sourceIds`。

## Java 目录响应

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

`success`、`error`、`errorMsg` 是标准信封字段；目录数组只从 `data` 读取。

## Java 活动响应

```json
{
  "success": true,
  "error": 0,
  "errorMsg": "",
  "data": {
    "count": 21,
    "hasNext": true,
    "page": 1,
    "pageSize": 20,
    "list": [
      { "addWayId": "live-1", "title": "门店活码", "createTime": 1710000000 }
    ]
  }
}
```

活动分页字段只从 `data` 读取；顶层业务字段不兼容读取。`success === true` 表示成功，`error` / `errorMsg` 只在 `success === false` 时用于失败诊断。

失败时 Node 返回「操作失败，请稍后重试」，不把上游错误码暴露给编辑器。
