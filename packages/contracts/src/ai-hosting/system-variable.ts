import { Type, type Static } from "@sinclair/typebox";

/** 技能可用系统变量项（对齐 Java AvailableSystemVariableTO） */
export const SystemVariableItemSchema = Type.Object(
  {
    /** 变量 key，写入技能变量 select_key */
    key: Type.String(),
    /** 变量名称 */
    name: Type.String(),
  },
  { additionalProperties: false },
);

export const SystemVariableListResponseSchema = Type.Object(
  {
    variables: Type.Array(SystemVariableItemSchema),
  },
  { additionalProperties: false },
);

export type SystemVariableItem = Static<typeof SystemVariableItemSchema>;
export type SystemVariableListResponse = Static<typeof SystemVariableListResponseSchema>;
