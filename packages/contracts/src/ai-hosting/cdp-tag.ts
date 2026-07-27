import { Type, type Static } from "@sinclair/typebox";

/** CDP 自动化标签项 */
export const CdpTagItemSchema = Type.Object(
  {
    name: Type.String(),
    /** 标签标识（字符串） */
    tag: Type.String(),
  },
  { additionalProperties: false },
);

/** CDP 自动化标签分组 */
export const CdpTagGroupItemSchema = Type.Object(
  {
    groupName: Type.String(),
    /** 分组标识（字符串）；技能变量用 select_key 保存 */
    groupTag: Type.String(),
    tags: Type.Array(CdpTagItemSchema),
  },
  { additionalProperties: false },
);

export const CdpTagGroupListResponseSchema = Type.Object(
  {
    groups: Type.Array(CdpTagGroupItemSchema),
  },
  { additionalProperties: false },
);

export type CdpTagGroupItem = Static<typeof CdpTagGroupItemSchema>;
export type CdpTagGroupListResponse = Static<typeof CdpTagGroupListResponseSchema>;
export type CdpTagItem = Static<typeof CdpTagItemSchema>;
