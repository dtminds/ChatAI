import { Type, type Static } from "@sinclair/typebox";

/** 1 普通标签，2 互斥标签 */
export const WorkTagAttrSchema = Type.Union([Type.Literal(1), Type.Literal(2)]);

/**
 * tag-component-list type：
 * 0 外部联系人，1 企业成员，10 自动化，11 客户群，12 星云客户标签
 */
export const WorkTagComponentTypeSchema = Type.Union([
  Type.Literal(0),
  Type.Literal(1),
  Type.Literal(10),
  Type.Literal(11),
  Type.Literal(12),
]);

export const WorkTagGroupItemSchema = Type.Object(
  {
    attr: WorkTagAttrSchema,
    id: Type.Number(),
    name: Type.String(),
    tagCount: Type.Number(),
  },
  { additionalProperties: false },
);

export const WorkTagGroupListQuerySchema = Type.Object(
  {
    /** 1 普通标签，2 互斥标签；默认 1 */
    attr: Type.Optional(
      Type.Union([Type.Literal("1"), Type.Literal("2")]),
    ),
    /** 企微客户标签固定 0；默认 0 */
    type: Type.Optional(
      Type.Union([
        Type.Literal("0"),
        Type.Literal("1"),
        Type.Literal("10"),
        Type.Literal("11"),
        Type.Literal("12"),
      ]),
    ),
  },
  { additionalProperties: false },
);

export const WorkTagGroupListResponseSchema = Type.Object(
  {
    groups: Type.Array(WorkTagGroupItemSchema),
  },
  { additionalProperties: false },
);

export const WorkTagItemSchema = Type.Object(
  {
    groupAttr: WorkTagAttrSchema,
    groupId: Type.Number(),
    groupName: Type.String(),
    groupSort: Type.Number(),
    id: Type.Number(),
    name: Type.String(),
    type: WorkTagComponentTypeSchema,
  },
  { additionalProperties: false },
);

export const WorkTagListQuerySchema = Type.Object(
  {
    /** 1 普通标签，2 互斥标签；企微场景默认 1 */
    attr: Type.Optional(
      Type.Union([Type.Literal("1"), Type.Literal("2")]),
    ),
    groupId: Type.Optional(Type.String({ pattern: "^[0-9]+$" })),
    keyword: Type.Optional(Type.String({ maxLength: 100 })),
    page: Type.Optional(Type.String({ pattern: "^[0-9]+$" })),
    pageSize: Type.Optional(Type.String({ pattern: "^[0-9]+$" })),
    type: Type.Optional(
      Type.Union([
        Type.Literal("0"),
        Type.Literal("1"),
        Type.Literal("10"),
        Type.Literal("11"),
        Type.Literal("12"),
      ]),
    ),
  },
  { additionalProperties: false },
);

export const WorkTagListResponseSchema = Type.Object(
  {
    pagination: Type.Object(
      {
        hasNext: Type.Boolean(),
        page: Type.Number(),
        pageSize: Type.Number(),
        total: Type.Number(),
      },
      { additionalProperties: false },
    ),
    tags: Type.Array(WorkTagItemSchema),
  },
  { additionalProperties: false },
);

export type WorkTagAttr = Static<typeof WorkTagAttrSchema>;
export type WorkTagComponentType = Static<typeof WorkTagComponentTypeSchema>;
export type WorkTagGroupItem = Static<typeof WorkTagGroupItemSchema>;
export type WorkTagGroupListQuery = Static<typeof WorkTagGroupListQuerySchema>;
export type WorkTagGroupListResponse = Static<typeof WorkTagGroupListResponseSchema>;
export type WorkTagItem = Static<typeof WorkTagItemSchema>;
export type WorkTagListQuery = Static<typeof WorkTagListQuerySchema>;
export type WorkTagListResponse = Static<typeof WorkTagListResponseSchema>;
