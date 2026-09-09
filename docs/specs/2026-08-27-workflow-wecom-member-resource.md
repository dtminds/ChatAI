# Workflow 开始节点：企微成员部门树

- 日期：2026-08-27
- 状态：Ready
- 目标：WeCom SOP 开始节点「企微成员」改用部门+成员树选择，不再用手填或本地夹具列表

## 结论

1. Java 接口：`POST /third-internal/work-party/get-all-department-user`。Swagger 参数名是 `reqTO`，实际 JSON 与现有 third-internal 一样是 flat 字段。
2. Node 公开接口：`GET /api/server/workflow/wecom-members`。浏览器不直连 Java，也不在 URL 暴露 `third-internal`。`uid` 取当前登录租户。
3. 一次返回整棵部门树。这是选择器资源，不是分页列表；Node 最多保留 2000 个节点，每个部门最多 500 个子节点。
4. 编辑器用「选择成员」弹窗：左侧搜索+部门树，右侧已选和清空；点确定才写入 `workUserIds`。最多 100 个、去重。勾选部门等于勾选该部门下全部可选成员；同一成员出现在多个部门只算一次。未开通许可的成员显示在树上但不能勾选。
5. 成员身份优先从 Java `userKey` 解析为正整数 `workUserId`，否则再从 `key` 解析（含 `1_201` / `user-201` 这类后缀）。不用 `nodeId`，因为它是映射表主键，同一成员在不同部门会重复。
6. 失败时 Node 返回「操作失败，请稍后重试」，不把上游错误码暴露给编辑器。已选但不在当前树里的成员回显为「已失效的企微成员」。

## Java 请求

```json
{
  "uid": 9001,
  "selectType": 2,
  "status": 1,
  "isExternal": 1,
  "isLicense": 0,
  "withDefaultRootDepart": true
}
```

- `selectType=2`：部门+成员，供树选择器勾选部门或成员
- `status=1`：已激活；离职、禁用、未激活、退出企业、不在应用可见范围的不返回
- `isExternal=1`：只要有外部联系人权限的成员，WeCom SOP 的添加好友 / 打标签依赖该权限
- `isLicense=0`：许可账号不限制。未开通许可的成员仍出现在树里，但 `selectable=false`，不能勾选
- `withDefaultRootDepart=true`：带上默认根部门
- Node 丢掉 `visible=false` 的节点。`notLicense=true` 映射为 `selectable=false`，不从树上移除

## Java 响应（节选）

```json
{
  "success": true,
  "error": 0,
  "data": {
    "userLimit": 100,
    "roots": [
      {
        "key": "2_1",
        "title": "销售部",
        "type": 2,
        "children": [
          {
            "avatar": "https://example.com/a.png",
            "key": "1_201",
            "title": "张三",
            "type": 1,
            "userKey": "201"
          }
        ]
      }
    ]
  }
}
```

`type`：1 成员，2 部门。`userKey` 标记同一成员在不同部门的重复出现。

## Node 公开响应

```json
{
  "success": true,
  "data": {
    "memberLimit": 100,
    "roots": [
      {
        "id": "2_1",
        "kind": "department",
        "title": "销售部",
        "children": [
          {
            "avatarUrl": "https://example.com/a.png",
            "children": [],
            "id": "1_201",
            "kind": "member",
            "title": "张三",
            "workUserId": 201
          }
        ]
      }
    ]
  }
}
```

`memberLimit` 取 Java `userLimit`（`>0` 时）与契约上限 100 的较小值；缺省为 100。成员节点缺省可选；未开通许可时带 `selectable: false`。
