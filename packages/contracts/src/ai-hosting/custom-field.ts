import { Type, type Static } from "@sinclair/typebox";

/** Java 自定义属性类型枚举；未知正整数仍需透传给消费方显示为暂不支持。 */
export const CustomFieldTypeSchema = Type.Integer({ minimum: 1 });

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
