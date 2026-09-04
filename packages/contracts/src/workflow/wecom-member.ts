import { Type, type Static } from "@sinclair/typebox";

/** Java 部门树一次返回全量。Node 映射后的稳定上限，防止异常大树进入编辑器。 */
export const WORKFLOW_WECOM_MEMBER_MAX_NODES = 2000;
export const WORKFLOW_WECOM_MEMBER_MAX_CHILDREN = 500;
export const WORKFLOW_WECOM_MEMBER_MAX_SELECTED = 100;
export const WORKFLOW_WECOM_MEMBER_KEY_MAX_LENGTH = 128;
export const WORKFLOW_WECOM_MEMBER_TITLE_MAX_LENGTH = 128;
export const WORKFLOW_WECOM_MEMBER_AVATAR_MAX_LENGTH = 1024;

export const WorkflowWeComMemberKindSchema = Type.Union([
  Type.Literal("department"),
  Type.Literal("member"),
]);

export const WorkflowWeComMemberNodeSchema: ReturnType<typeof Type.Recursive> = Type.Recursive(
  This => Type.Object(
    {
      avatarUrl: Type.Optional(Type.String({
        maxLength: WORKFLOW_WECOM_MEMBER_AVATAR_MAX_LENGTH,
        minLength: 1,
      })),
      children: Type.Array(This, {
        maxItems: WORKFLOW_WECOM_MEMBER_MAX_CHILDREN,
      }),
      id: Type.String({
        maxLength: WORKFLOW_WECOM_MEMBER_KEY_MAX_LENGTH,
        minLength: 1,
      }),
      kind: WorkflowWeComMemberKindSchema,
      selectable: Type.Optional(Type.Boolean()),
      title: Type.String({
        maxLength: WORKFLOW_WECOM_MEMBER_TITLE_MAX_LENGTH,
        minLength: 1,
      }),
      workUserId: Type.Optional(Type.Integer({
        maximum: Number.MAX_SAFE_INTEGER,
        minimum: 1,
      })),
    },
    { additionalProperties: false },
  ),
);

export const WorkflowWeComMemberListResponseSchema = Type.Object(
  {
    memberLimit: Type.Integer({
      maximum: WORKFLOW_WECOM_MEMBER_MAX_SELECTED,
      minimum: 1,
    }),
    roots: Type.Array(WorkflowWeComMemberNodeSchema, {
      maxItems: WORKFLOW_WECOM_MEMBER_MAX_NODES,
    }),
  },
  { additionalProperties: false },
);

export type WorkflowWeComMemberKind = Static<typeof WorkflowWeComMemberKindSchema>;

export type WorkflowWeComMemberNode = {
  avatarUrl?: string;
  children: WorkflowWeComMemberNode[];
  id: string;
  kind: WorkflowWeComMemberKind;
  selectable?: boolean;
  title: string;
  workUserId?: number;
};

export type WorkflowWeComMemberListResponse = {
  memberLimit: number;
  roots: WorkflowWeComMemberNode[];
};
