import { Type, type Static } from "@sinclair/typebox";

const TicketIdSchema = Type.String({ minLength: 1 });
const NullableStringSchema = Type.Union([Type.String(), Type.Null()]);
const NullableTimestampSchema = Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]);

export const TicketStatusSchema = Type.Union([
  Type.Literal("open"),
  Type.Literal("in_progress"),
  Type.Literal("done"),
  Type.Literal("canceled"),
]);

export const TicketPrioritySchema = Type.Union([
  Type.Literal("low"),
  Type.Literal("medium"),
  Type.Literal("high"),
]);

export const TicketSourceTypeSchema = Type.Union([
  Type.Literal("manual"),
  Type.Literal("ai"),
]);

export const TicketViewSchema = Type.Union([
  Type.Literal("assigned_to_me"),
  Type.Literal("reception"),
  Type.Literal("unassigned"),
  Type.Literal("created_by_me"),
  Type.Literal("all"),
]);

export const TicketConversationScopeSchema = Type.Union([
  Type.Literal("conversation"),
  Type.Literal("customer"),
]);

export const TicketDueScopeSchema = Type.Union([
  Type.Literal("overdue"),
  Type.Literal("today"),
  Type.Literal("next_7_days"),
  Type.Literal("none"),
]);

export const TicketActivityTypeSchema = Type.Union([
  Type.Literal("created"),
  Type.Literal("comment_added"),
  Type.Literal("status_changed"),
  Type.Literal("assignee_changed"),
  Type.Literal("priority_changed"),
  Type.Literal("due_at_changed"),
  Type.Literal("content_updated"),
]);

export const TicketOperatorTypeSchema = Type.Union([
  Type.Literal("sub_user"),
  Type.Literal("ai"),
  Type.Literal("system"),
]);

export const TicketContextAccessSchema = Type.Union([
  Type.Literal("allowed"),
  Type.Literal("forbidden"),
  Type.Literal("error"),
]);

export const TicketUserSchema = Type.Object({
  avatarUrl: Type.Optional(NullableStringSchema),
  displayName: Type.String(),
  subUserId: TicketIdSchema,
}, { additionalProperties: false });

export const TicketSchema = Type.Object({
  anchorMessageId: Type.Union([TicketIdSchema, Type.Null()]),
  assignee: Type.Union([TicketUserSchema, Type.Null()]),
  canClaim: Type.Boolean(),
  canEdit: Type.Boolean(),
  canceledAt: NullableTimestampSchema,
  completedAt: NullableTimestampSchema,
  conversationId: TicketIdSchema,
  createdAt: Type.Integer({ minimum: 0 }),
  createdBy: Type.Union([TicketUserSchema, Type.Null()]),
  customerAvatarUrl: NullableStringSchema,
  customerName: Type.String(),
  description: NullableStringSchema,
  dueAt: NullableTimestampSchema,
  dueHint: NullableStringSchema,
  overdue: Type.Boolean(),
  ownerAccountAvatarUrl: NullableStringSchema,
  ownerAccountId: TicketIdSchema,
  ownerAccountName: Type.String(),
  priority: TicketPrioritySchema,
  sessionId: Type.Union([TicketIdSchema, Type.Null()]),
  snapshotId: Type.Union([TicketIdSchema, Type.Null()]),
  sourceType: TicketSourceTypeSchema,
  status: TicketStatusSchema,
  ticketId: TicketIdSchema,
  title: Type.String({ maxLength: 255, minLength: 1 }),
  updatedAt: Type.Integer({ minimum: 0 }),
}, { additionalProperties: false });

export const TicketListQuerySchema = Type.Object({
  assigneeSubUserId: Type.Optional(TicketIdSchema),
  createdFrom: Type.Optional(Type.Integer({ minimum: 0 })),
  createdTo: Type.Optional(Type.Integer({ minimum: 0 })),
  dueScope: Type.Optional(TicketDueScopeSchema),
  ownerAccountId: Type.Optional(TicketIdSchema),
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  pageSize: Type.Optional(Type.Integer({ maximum: 100, minimum: 1 })),
  priority: Type.Optional(TicketPrioritySchema),
  search: Type.Optional(Type.String({ maxLength: 255 })),
  sourceType: Type.Optional(TicketSourceTypeSchema),
  status: Type.Optional(TicketStatusSchema),
  view: Type.Optional(TicketViewSchema),
}, { additionalProperties: false });

export const TicketListResponseSchema = Type.Object({
  items: Type.Array(TicketSchema),
  page: Type.Integer({ minimum: 1 }),
  pageSize: Type.Integer({ minimum: 1 }),
  total: Type.Integer({ minimum: 0 }),
  totalPages: Type.Integer({ minimum: 0 }),
}, { additionalProperties: false });

export const TicketCountsResponseSchema = Type.Object({
  assignedToMeActive: Type.Integer({ minimum: 0 }),
  unassignedOpen: Type.Integer({ minimum: 0 }),
}, { additionalProperties: false });

export const TicketCreateContextSchema = Type.Union([
  Type.Object({
    type: Type.Literal("current"),
  }, { additionalProperties: false }),
  Type.Object({
    sessionId: TicketIdSchema,
    type: Type.Literal("session"),
  }, { additionalProperties: false }),
  Type.Object({
    type: Type.Literal("none"),
  }, { additionalProperties: false }),
]);

export const TicketCreateRequestSchema = Type.Object({
  assigneeSubUserId: Type.Optional(Type.Union([TicketIdSchema, Type.Null()])),
  context: TicketCreateContextSchema,
  conversationId: TicketIdSchema,
  description: Type.Optional(Type.Union([
    Type.String({ maxLength: 5000 }),
    Type.Null(),
  ])),
  dueAt: Type.Optional(NullableTimestampSchema),
  priority: TicketPrioritySchema,
  title: Type.String({ maxLength: 255, minLength: 1 }),
}, { additionalProperties: false });

export const TicketCreateResponseSchema = Type.Object({
  ticket: TicketSchema,
}, { additionalProperties: false });

const ticketMutableProperties = {
  assigneeSubUserId: Type.Optional(Type.Union([TicketIdSchema, Type.Null()])),
  description: Type.Optional(Type.Union([
    Type.String({ maxLength: 5000 }),
    Type.Null(),
  ])),
  dueAt: Type.Optional(NullableTimestampSchema),
  priority: Type.Optional(TicketPrioritySchema),
  title: Type.Optional(Type.String({ maxLength: 255, minLength: 1 })),
};

export const TicketUpdateRequestSchema = Type.Union([
  Type.Object({
    ...ticketMutableProperties,
    expectedStatus: TicketStatusSchema,
    status: TicketStatusSchema,
  }, { additionalProperties: false }),
  Type.Object(ticketMutableProperties, {
    additionalProperties: false,
    minProperties: 1,
  }),
]);

export const TicketUpdateResponseSchema = Type.Object({
  ticket: TicketSchema,
}, { additionalProperties: false });

export const TicketClaimResponseSchema = Type.Object({
  ticket: TicketSchema,
}, { additionalProperties: false });

export const TicketCommentRequestSchema = Type.Object({
  content: Type.String({ maxLength: 2000, minLength: 1 }),
}, { additionalProperties: false });

export const TicketActivitySchema = Type.Object({
  activityId: TicketIdSchema,
  activityType: TicketActivityTypeSchema,
  content: NullableStringSchema,
  createdAt: Type.Integer({ minimum: 0 }),
  detail: Type.Union([
    Type.Record(Type.String(), Type.Unknown()),
    Type.Null(),
  ]),
  operator: Type.Union([TicketUserSchema, Type.Null()]),
  operatorType: TicketOperatorTypeSchema,
  ticketId: TicketIdSchema,
}, { additionalProperties: false });

export const TicketCommentResponseSchema = Type.Object({
  activity: TicketActivitySchema,
}, { additionalProperties: false });

export const TicketContextSchema = Type.Union([
  Type.Object({
    kind: Type.Literal("none"),
  }, { additionalProperties: false }),
  Type.Object({
    kind: Type.Literal("session"),
    messages: Type.Array(Type.Any()),
    sessionId: TicketIdSchema,
  }, { additionalProperties: false }),
  Type.Object({
    anchorMessageId: TicketIdSchema,
    kind: Type.Literal("message"),
    messages: Type.Array(Type.Any()),
  }, { additionalProperties: false }),
]);

export const TicketDetailResponseSchema = Type.Object({
  activities: Type.Array(TicketActivitySchema),
  assigneeOptions: Type.Array(TicketUserSchema),
  context: TicketContextSchema,
  contextAccess: TicketContextAccessSchema,
  evidenceMessages: Type.Array(Type.Any()),
  ticket: TicketSchema,
}, { additionalProperties: false });

export const TicketSessionOptionSchema = Type.Object({
  endedAt: NullableTimestampSchema,
  sessionId: TicketIdSchema,
  startedAt: Type.Integer({ minimum: 0 }),
  status: Type.Union([Type.Literal("open"), Type.Literal("ended")]),
  summary: NullableStringSchema,
  title: NullableStringSchema,
}, { additionalProperties: false });

export const TicketContextOptionsQuerySchema = Type.Object({
  conversationId: TicketIdSchema,
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  pageSize: Type.Optional(Type.Integer({ maximum: 50, minimum: 1 })),
}, { additionalProperties: false });

export const TicketContextOptionsResponseSchema = Type.Object({
  assignees: Type.Array(TicketUserSchema),
  defaultAssigneeSubUserId: Type.Union([TicketIdSchema, Type.Null()]),
  sessions: Type.Object({
    items: Type.Array(TicketSessionOptionSchema),
    page: Type.Integer({ minimum: 1 }),
    pageSize: Type.Integer({ minimum: 1 }),
    total: Type.Integer({ minimum: 0 }),
    totalPages: Type.Integer({ minimum: 0 }),
  }, { additionalProperties: false }),
}, { additionalProperties: false });

export const ConversationTicketsQuerySchema = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  pageSize: Type.Optional(Type.Integer({ maximum: 100, minimum: 1 })),
  scope: Type.Optional(TicketConversationScopeSchema),
  status: Type.Optional(TicketStatusSchema),
}, { additionalProperties: false });

export const ConversationTicketsResponseSchema = Type.Object({
  activeCount: Type.Integer({ minimum: 0 }),
  items: Type.Array(TicketSchema),
  page: Type.Integer({ minimum: 1 }),
  pageSize: Type.Integer({ minimum: 1 }),
  scope: TicketConversationScopeSchema,
  total: Type.Integer({ minimum: 0 }),
  totalPages: Type.Integer({ minimum: 0 }),
}, { additionalProperties: false });

export type TicketStatus = Static<typeof TicketStatusSchema>;
export type TicketPriority = Static<typeof TicketPrioritySchema>;
export type TicketSourceType = Static<typeof TicketSourceTypeSchema>;
export type TicketView = Static<typeof TicketViewSchema>;
export type TicketUser = Static<typeof TicketUserSchema>;
export type Ticket = Static<typeof TicketSchema>;
export type TicketListQuery = Static<typeof TicketListQuerySchema>;
export type TicketListResponse = Static<typeof TicketListResponseSchema>;
export type TicketCountsResponse = Static<typeof TicketCountsResponseSchema>;
export type TicketCreateRequest = Static<typeof TicketCreateRequestSchema>;
export type TicketCreateResponse = Static<typeof TicketCreateResponseSchema>;
export type TicketUpdateRequest = Static<typeof TicketUpdateRequestSchema>;
export type TicketUpdateResponse = Static<typeof TicketUpdateResponseSchema>;
export type TicketClaimResponse = Static<typeof TicketClaimResponseSchema>;
export type TicketCommentRequest = Static<typeof TicketCommentRequestSchema>;
export type TicketCommentResponse = Static<typeof TicketCommentResponseSchema>;
export type TicketActivity = Static<typeof TicketActivitySchema>;
export type TicketDetailResponse = Static<typeof TicketDetailResponseSchema>;
export type TicketContextOptionsQuery = Static<typeof TicketContextOptionsQuerySchema>;
export type TicketContextOptionsResponse = Static<typeof TicketContextOptionsResponseSchema>;
export type ConversationTicketsQuery = Static<typeof ConversationTicketsQuerySchema>;
export type ConversationTicketsResponse = Static<typeof ConversationTicketsResponseSchema>;
