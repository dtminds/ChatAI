import { Type, type Static } from "@sinclair/typebox";

/** 自定义属性字段类型：1文本 2单选 3多选 4日期 5手机 6邮箱 7地区 8图片 */
export const CustomFieldTypeSchema = Type.Union([
  Type.Literal(1),
  Type.Literal(2),
  Type.Literal(3),
  Type.Literal(4),
  Type.Literal(5),
  Type.Literal(6),
  Type.Literal(7),
  Type.Literal(8),
]);

export const CustomFieldOptionSchema = Type.Object(
  {
    optionMatch: Type.String(),
    optionValue: Type.Number(),
  },
  { additionalProperties: false },
);

export const CustomFieldItemSchema = Type.Object(
  {
    id: Type.Number(),
    key: Type.String(),
    options: Type.Array(CustomFieldOptionSchema),
    sort: Type.Number(),
    title: Type.String(),
    type: CustomFieldTypeSchema,
  },
  { additionalProperties: false },
);

export const CustomFieldListResponseSchema = Type.Object(
  {
    fields: Type.Array(CustomFieldItemSchema),
  },
  { additionalProperties: false },
);

export const CustomFieldListQuerySchema = Type.Object(
  {
    /** 0 关闭，1 开启；不传则返回全部 */
    status: Type.Optional(Type.Union([Type.Literal("0"), Type.Literal("1")])),
  },
  { additionalProperties: false },
);

export type CustomFieldItem = Static<typeof CustomFieldItemSchema>;
export type CustomFieldListQuery = Static<typeof CustomFieldListQuerySchema>;
export type CustomFieldListResponse = Static<typeof CustomFieldListResponseSchema>;
export type CustomFieldOption = Static<typeof CustomFieldOptionSchema>;
export type CustomFieldType = Static<typeof CustomFieldTypeSchema>;
