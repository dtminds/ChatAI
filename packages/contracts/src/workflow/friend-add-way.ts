import { Type, type Static } from "@sinclair/typebox";

/** Java 添加方式目录是固定枚举级规模，一次返回全量。 */
export const WORKFLOW_FRIEND_ADD_WAY_MAX_GROUPS = 200;
export const WORKFLOW_FRIEND_ADD_WAY_MAX_CHILDREN = 200;
export const WORKFLOW_FRIEND_ADD_WAY_KEY_MAX_LENGTH = 128;
export const WORKFLOW_FRIEND_ADD_WAY_TITLE_MAX_LENGTH = 128;

export const WorkflowFriendAddWayItemSchema = Type.Object(
  {
    key: Type.String({
      maxLength: WORKFLOW_FRIEND_ADD_WAY_KEY_MAX_LENGTH,
      minLength: 1,
    }),
    title: Type.String({
      maxLength: WORKFLOW_FRIEND_ADD_WAY_TITLE_MAX_LENGTH,
      minLength: 1,
    }),
  },
  { additionalProperties: false },
);

export const WorkflowFriendAddWayGroupSchema = Type.Object(
  {
    children: Type.Array(WorkflowFriendAddWayItemSchema, {
      maxItems: WORKFLOW_FRIEND_ADD_WAY_MAX_CHILDREN,
    }),
    key: Type.String({
      maxLength: WORKFLOW_FRIEND_ADD_WAY_KEY_MAX_LENGTH,
      minLength: 1,
    }),
    title: Type.String({
      maxLength: WORKFLOW_FRIEND_ADD_WAY_TITLE_MAX_LENGTH,
      minLength: 1,
    }),
  },
  { additionalProperties: false },
);

export const WorkflowFriendAddWayListResponseSchema = Type.Object(
  {
    groups: Type.Array(WorkflowFriendAddWayGroupSchema, {
      maxItems: WORKFLOW_FRIEND_ADD_WAY_MAX_GROUPS,
    }),
  },
  { additionalProperties: false },
);

export type WorkflowFriendAddWayGroup = Static<typeof WorkflowFriendAddWayGroupSchema>;
export type WorkflowFriendAddWayItem = Static<typeof WorkflowFriendAddWayItemSchema>;
export type WorkflowFriendAddWayListResponse = Static<
  typeof WorkflowFriendAddWayListResponseSchema
>;
