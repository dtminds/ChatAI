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

export const WORKFLOW_FRIEND_ADD_WAY_ACTIVITY_PAGE_SIZE_DEFAULT = 20;
export const WORKFLOW_FRIEND_ADD_WAY_ACTIVITY_PAGE_SIZE_MAX = 50;
export const WORKFLOW_FRIEND_ADD_WAY_ACTIVITY_TITLE_MAX_LENGTH = 128;

export const WorkflowFriendAddWayActivitySchema = Type.Object(
  {
    addWayId: Type.String({
      maxLength: WORKFLOW_FRIEND_ADD_WAY_KEY_MAX_LENGTH,
      minLength: 1,
    }),
    createTime: Type.Optional(Type.Integer({ minimum: 1 })),
    title: Type.String({
      maxLength: WORKFLOW_FRIEND_ADD_WAY_TITLE_MAX_LENGTH,
      minLength: 1,
    }),
  },
  { additionalProperties: false },
);

export const WorkflowFriendAddWayActivityListQuerySchema = Type.Object(
  {
    addWayIds: Type.Optional(Type.String({ maxLength: 1024 })),
    key: Type.String({
      maxLength: WORKFLOW_FRIEND_ADD_WAY_KEY_MAX_LENGTH,
      minLength: 1,
    }),
    page: Type.Optional(Type.String({ pattern: "^[0-9]+$" })),
    pageSize: Type.Optional(Type.String({ pattern: "^[0-9]+$" })),
    title: Type.Optional(Type.String({
      maxLength: WORKFLOW_FRIEND_ADD_WAY_ACTIVITY_TITLE_MAX_LENGTH,
    })),
  },
  { additionalProperties: false },
);

export const WorkflowFriendAddWayActivityListResponseSchema = Type.Object(
  {
    items: Type.Array(WorkflowFriendAddWayActivitySchema, {
      maxItems: WORKFLOW_FRIEND_ADD_WAY_ACTIVITY_PAGE_SIZE_MAX,
    }),
    pagination: Type.Object(
      {
        hasNext: Type.Boolean(),
        page: Type.Number(),
        pageSize: Type.Number(),
        total: Type.Number(),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export type WorkflowFriendAddWayGroup = Static<typeof WorkflowFriendAddWayGroupSchema>;
export type WorkflowFriendAddWayItem = Static<typeof WorkflowFriendAddWayItemSchema>;
export type WorkflowFriendAddWayListResponse = Static<
  typeof WorkflowFriendAddWayListResponseSchema
>;
export type WorkflowFriendAddWayActivity = Static<typeof WorkflowFriendAddWayActivitySchema>;
export type WorkflowFriendAddWayActivityListQuery = Static<
  typeof WorkflowFriendAddWayActivityListQuerySchema
>;
export type WorkflowFriendAddWayActivityListResponse = Static<
  typeof WorkflowFriendAddWayActivityListResponseSchema
>;
