# History Message Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the independent `/chat` history message panel backed by a dedicated backend query API for one conversation.

**Architecture:** Add a shared history-message contract, expose a protected Fastify endpoint, query MySQL with conversation, scope, day, sender, and cursor filters, then adapt results through the existing message mapper. On the web side, keep the current right-side profile panel mounted and show the history panel as a sibling overlay controlled by Zustand state; reuse the existing composer history button by wiring its click handler.

**Tech Stack:** pnpm workspace, TypeScript, TypeBox, Fastify 5, Kysely, React 19, Zustand, shadcn/ui, Hugeicons, Vitest, Testing Library

---

## File Structure

- `packages/contracts/src/chat/dto.ts`: add `WorkbenchHistoryMessageScope`, request query type, cursor response type, and page DTO.
- `apps/backend/src/modules/chat/chat.routes.ts`: add query schema and `GET /api/server/conversations/:conversationId/history-messages`.
- `apps/backend/src/modules/chat/workbench.service.ts`: add service interface and permission-checked service method.
- `apps/backend/src/modules/chat/workbench-repository.ts`: add cursor encode/decode helpers and `listHistoryMessages`.
- `apps/backend/test/fixtures/workbench-memory.service.ts`: support the new service method for route tests.
- `apps/backend/test/modules/chat/workbench.service.test.ts`: cover permission and parameter forwarding.
- `apps/backend/test/modules/chat/workbench-repository.test.ts`: cover scope, day, sender, and cursor behavior.
- `apps/backend/test/app.test.ts`: cover the public route, authentication, and query validation.
- `apps/web/src/pages/chat/api/workbench-service.ts`: add HTTP and mock service method.
- `apps/web/src/pages/chat/api/workbench-gateway.ts`: adapt DTO messages into web `Message[]`.
- `apps/web/src/store/workbench-store.ts`: add history panel state, filter actions, load actions, and clear-on-conversation-change.
- `apps/web/src/pages/chat/components/chat-composer.tsx`: wire the existing history button with `onOpenHistory`.
- `apps/web/src/pages/chat/components/chat-panel.tsx`: render the stable right-side shell with profile and history layers.
- `apps/web/src/pages/chat/components/message-history-side-panel.tsx`: create the history panel UI and per-scope result layouts.
- `apps/web/test/pages/chat/workbench-gateway.test.ts`: cover frontend gateway adaptation.
- `apps/web/test/store/workbench-store.test.ts`: cover state transitions and fetch calls.
- `apps/web/test/pages/chat/chat-workbench-page.test.tsx`: cover user-visible right-panel behavior.

## Task 1: Shared Contract

**Files:**
- Modify: `packages/contracts/src/chat/dto.ts`
- Test: `packages/contracts/test`

- [ ] **Step 1: Add history message DTO types**

Add these types after `WorkbenchMessagePageDto` in `packages/contracts/src/chat/dto.ts`:

```ts
export type WorkbenchHistoryMessageScope =
  | "all"
  | "file"
  | "media"
  | "h5"
  | "mini-program";

export type WorkbenchHistoryMessageQuery = {
  cursor?: string;
  day?: string;
  limit?: number;
  scope?: WorkbenchHistoryMessageScope;
  senderId?: string;
};

export type WorkbenchHistoryMessagePageDto = {
  messages: WorkbenchMessageDto[];
  nextCursor?: string;
  prevCursor?: string;
  hasNext: boolean;
  hasPrev: boolean;
};
```

- [ ] **Step 2: Verify contract build**

Run:

```bash
pnpm --filter @chatai/contracts build
```

Expected: TypeScript build completes with no errors.

- [ ] **Step 3: Commit contract**

```bash
git add packages/contracts/src/chat/dto.ts
git commit -m "feat: add history message contract"
```

## Task 2: Backend Route and Service Boundary

**Files:**
- Modify: `apps/backend/src/modules/chat/chat.routes.ts`
- Modify: `apps/backend/src/modules/chat/workbench.service.ts`
- Modify: `apps/backend/test/fixtures/workbench-memory.service.ts`
- Test: `apps/backend/test/app.test.ts`
- Test: `apps/backend/test/modules/chat/workbench.service.test.ts`

- [ ] **Step 1: Write route tests first**

Add route coverage in `apps/backend/test/app.test.ts` near existing conversation message route tests:

```ts
it("returns history messages for the active user conversation", async () => {
  const response = await app.inject({
    headers: authHeaders,
    method: "GET",
    url: "/api/server/conversations/conv-001/history-messages?scope=file&day=2026-05-19&sender_id=member-1&limit=20",
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    hasNext: false,
    hasPrev: false,
    messages: expect.any(Array),
  });
});

it("rejects invalid history message scope", async () => {
  const response = await app.inject({
    headers: authHeaders,
    method: "GET",
    url: "/api/server/conversations/conv-001/history-messages?scope=voice",
  });

  expect(response.statusCode).toBe(400);
});
```

Add service forwarding coverage in `apps/backend/test/modules/chat/workbench.service.test.ts`:

```ts
it("checks seat access before listing history messages", async () => {
  const repository = createRepositoryMock({
    getConversationLookup: vi.fn().mockResolvedValue({
      id: "88",
      platform: 5,
      seatId: "12",
      seatUnreadCount: 0,
      thirdExternalUserId: "external-1",
      thirdGroupId: undefined,
      thirdUserId: "seat-third-user-1",
      uid: 272,
      unreadCount: 0,
    }),
    listHistoryMessages: vi.fn().mockResolvedValue({
      hasNext: false,
      hasPrev: false,
      messages: [],
    }),
  });
  const service = new MysqlWorkbenchService(repository, javaClient);

  await expect(
    service.getHistoryMessages("sub-user-1", "88", {
      day: "2026-05-19",
      limit: 20,
      scope: "file",
      senderId: "external-1",
    }),
  ).resolves.toEqual({
    hasNext: false,
    hasPrev: false,
    messages: [],
  });

  expect(repository.listHistoryMessages).toHaveBeenCalledWith("88", {
    day: "2026-05-19",
    limit: 20,
    scope: "file",
    senderId: "external-1",
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @chatai/backend test apps/backend/test/app.test.ts apps/backend/test/modules/chat/workbench.service.test.ts
```

Expected: FAIL because `getHistoryMessages` and the route do not exist.

- [ ] **Step 3: Add route schema**

In `apps/backend/src/modules/chat/chat.routes.ts`, add:

```ts
const HistoryMessagesQuerySchema = Type.Object({
  cursor: Type.Optional(Type.String()),
  day: Type.Optional(Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
  limit: Type.Optional(NumericStringSchema),
  scope: Type.Optional(
    Type.Union([
      Type.Literal("all"),
      Type.Literal("file"),
      Type.Literal("media"),
      Type.Literal("h5"),
      Type.Literal("mini-program"),
    ]),
  ),
  sender_id: Type.Optional(Type.String()),
});

type HistoryMessagesQuery = Static<typeof HistoryMessagesQuerySchema>;
```

- [ ] **Step 4: Add protected route**

In `registerChatRoutes`, add after the existing `/messages` route:

```ts
  app.get<{
    Params: ConversationParams;
    Querystring: HistoryMessagesQuery;
  }>(
    "/api/server/conversations/:conversationId/history-messages",
    {
      preHandler: app.authenticate,
      schema: {
        params: ConversationParamsSchema,
        querystring: HistoryMessagesQuerySchema,
      },
    },
    async (request) => {
      return getWorkbenchService(app, request).getHistoryMessages(
        getSubUserId(request),
        request.params.conversationId,
        {
          cursor: request.query.cursor,
          day: request.query.day,
          limit: parseOptionalInteger(request.query.limit),
          scope: request.query.scope,
          senderId: request.query.sender_id,
        },
      );
    },
  );
```

- [ ] **Step 5: Add service method**

In `apps/backend/src/modules/chat/workbench.service.ts`, import the contract query type and add to `WorkbenchService`:

```ts
  getHistoryMessages(
    subUserId: string,
    conversationId: string,
    options?: WorkbenchHistoryMessageQuery,
  ): Promise<WorkbenchHistoryMessagePageDto> | WorkbenchHistoryMessagePageDto;
```

Add implementation to `MysqlWorkbenchService`:

```ts
  async getHistoryMessages(
    subUserId: string,
    conversationId: string,
    options: WorkbenchHistoryMessageQuery = {},
  ) {
    const conversation = await this.repository.getConversationLookup(conversationId);

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId);

    return this.repository.listHistoryMessages(conversationId, {
      cursor: options.cursor,
      day: options.day,
      limit: options.limit,
      scope: options.scope,
      senderId: options.senderId,
    });
  }
```

- [ ] **Step 6: Add memory fixture method**

In `apps/backend/test/fixtures/workbench-memory.service.ts`, add:

```ts
    getHistoryMessages(_subUserId, conversationId, options) {
      return this.getMessages(_subUserId, conversationId, {
        beforeSeq: undefined,
        limit: options?.limit ?? 30,
      }).then((page) => ({
        hasNext: false,
        hasPrev: false,
        messages: page.messages,
      }));
    },
```

- [ ] **Step 7: Run backend route/service tests**

Run:

```bash
pnpm --filter @chatai/backend test apps/backend/test/app.test.ts apps/backend/test/modules/chat/workbench.service.test.ts
```

Expected: route schema and service forwarding tests pass once Task 3 supplies repository implementation.

- [ ] **Step 8: Commit route and service boundary**

```bash
git add apps/backend/src/modules/chat/chat.routes.ts apps/backend/src/modules/chat/workbench.service.ts apps/backend/test/fixtures/workbench-memory.service.ts apps/backend/test/app.test.ts apps/backend/test/modules/chat/workbench.service.test.ts
git commit -m "feat: expose history message route"
```

## Task 3: Backend Repository Query and Cursor

**Files:**
- Modify: `apps/backend/src/modules/chat/workbench-repository.ts`
- Test: `apps/backend/test/modules/chat/workbench-repository.test.ts`

- [ ] **Step 1: Write repository tests first**

Add tests in `apps/backend/test/modules/chat/workbench-repository.test.ts`:

```ts
it("lists recent history messages in ascending response order", async () => {
  const repository = new WorkbenchRepository(db);

  await expect(
    repository.listHistoryMessages("88", {
      limit: 2,
      scope: "all",
    }),
  ).resolves.toMatchObject({
    hasNext: false,
    hasPrev: true,
    messages: [
      { messageId: "msg-older" },
      { messageId: "msg-newer" },
    ],
  });
});

it("filters history messages by media scope, day, and sender", async () => {
  const repository = new WorkbenchRepository(db);

  await expect(
    repository.listHistoryMessages("88", {
      day: "2026-05-19",
      limit: 30,
      scope: "media",
      senderId: "external-1",
    }),
  ).resolves.toMatchObject({
    messages: [
      { contentType: "image", thirdFromId: "external-1" },
      { contentType: "video", thirdFromId: "external-1" },
    ],
  });
});

it("rejects a history cursor whose filters do not match the request", async () => {
  const repository = new WorkbenchRepository(db);
  const firstPage = await repository.listHistoryMessages("88", {
    day: "2026-05-19",
    limit: 1,
    scope: "file",
  });

  await expect(
    repository.listHistoryMessages("88", {
      cursor: firstPage.nextCursor,
      day: "2026-05-20",
      limit: 1,
      scope: "file",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_HISTORY_CURSOR",
  });
});
```

- [ ] **Step 2: Run repository tests to verify they fail**

Run:

```bash
pnpm --filter @chatai/backend test apps/backend/test/modules/chat/workbench-repository.test.ts
```

Expected: FAIL because `listHistoryMessages` does not exist.

- [ ] **Step 3: Add helper types and constants**

In `apps/backend/src/modules/chat/workbench-repository.ts`, add near existing pagination types:

```ts
const DEFAULT_HISTORY_MESSAGE_LIMIT = 30;
const MAX_HISTORY_MESSAGE_LIMIT = 100;

type HistoryMessageCursor = {
  anchorId: number;
  direction: "next" | "prev";
  filters: {
    conversationId: string;
    day?: string;
    scope: WorkbenchHistoryMessageScope;
    senderId?: string;
  };
};

type HistoryMessageListOptions = {
  cursor?: string;
  day?: string;
  limit?: number;
  scope?: WorkbenchHistoryMessageScope;
  senderId?: string;
};
```

- [ ] **Step 4: Add cursor helpers**

Add these functions near existing cursor helpers:

```ts
function encodeHistoryMessageCursor(cursor: HistoryMessageCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeHistoryMessageCursor(value: string): HistoryMessageCursor | undefined {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));

    if (
      parsed &&
      typeof parsed === "object" &&
      Number.isInteger(parsed.anchorId) &&
      (parsed.direction === "next" || parsed.direction === "prev") &&
      parsed.filters &&
      typeof parsed.filters === "object"
    ) {
      return parsed as HistoryMessageCursor;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function normalizeHistoryMessageLimit(limit?: number) {
  if (!Number.isInteger(limit) || limit == null || limit <= 0) {
    return DEFAULT_HISTORY_MESSAGE_LIMIT;
  }

  return Math.min(limit, MAX_HISTORY_MESSAGE_LIMIT);
}

function getHistoryScopeMsgTypes(scope: WorkbenchHistoryMessageScope) {
  switch (scope) {
    case "file":
      return ["file"];
    case "media":
      return ["image", "video"];
    case "h5":
      return ["link"];
    case "mini-program":
      return ["weapp"];
    case "all":
    default:
      return undefined;
  }
}

function getDayBounds(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  const start = new Date(year, month - 1, date).getTime();
  const end = new Date(year, month - 1, date + 1).getTime() - 1;

  return { end, start };
}
```

- [ ] **Step 5: Implement repository method**

Add `listHistoryMessages` after `listMessages`:

```ts
  async listHistoryMessages(
    conversationId: string,
    options: HistoryMessageListOptions = {},
  ): Promise<WorkbenchHistoryMessagePageDto> {
    const conversationNumericId = parseMySqlId(conversationId);

    if (conversationNumericId == null) {
      return {
        hasNext: false,
        hasPrev: false,
        messages: [],
      };
    }

    const limit = normalizeHistoryMessageLimit(options.limit);
    const scope = options.scope ?? "all";
    const cursor = options.cursor
      ? decodeHistoryMessageCursor(options.cursor)
      : undefined;

    if (options.cursor && !cursor) {
      throw new BadRequestError("INVALID_HISTORY_CURSOR", "历史消息分页游标无效");
    }

    const filters = {
      conversationId,
      day: options.day,
      scope,
      senderId: options.senderId,
    };

    if (cursor && JSON.stringify(cursor.filters) !== JSON.stringify(filters)) {
      throw new BadRequestError("INVALID_HISTORY_CURSOR", "历史消息分页游标已失效");
    }

    const conversation = await this.getHistoryConversationContext(conversationNumericId);

    if (!conversation) {
      return {
        hasNext: false,
        hasPrev: false,
        messages: [],
      };
    }

    let query = this.createHistoryMessageBaseQuery(conversation, scope, options);
    const isInitialRecentPage = !options.day && !cursor;
    const direction = cursor?.direction ?? (isInitialRecentPage ? "prev" : "next");

    if (cursor) {
      query = direction === "next"
        ? query.where("message.id", ">", cursor.anchorId)
        : query.where("message.id", "<", cursor.anchorId);
    }

    const rows = await query
      .orderBy("message.id", direction === "prev" ? "desc" : "asc")
      .limit(limit + 1)
      .execute();

    const pageRows = rows.slice(0, limit) as MessageRow[];
    const messageRows = direction === "prev" ? pageRows.reverse() : pageRows;
    const hasExtra = rows.length > limit;
    const hydrationSources = await this.getMessageHydrationSources(
      messageRows,
      conversation.uid,
      conversation.platform,
    );
    const hydratedRows = hydrateMessageRows(messageRows, hydrationSources);
    const firstRowId = toNumber(messageRows[0]?.id);
    const lastRowId = toNumber(messageRows.at(-1)?.id);

    return {
      hasNext: direction === "prev" ? Boolean(cursor) : hasExtra,
      hasPrev: direction === "prev" ? hasExtra : Boolean(cursor),
      messages: hydratedRows.map((row) => mapMessageRow(row)),
      nextCursor:
        lastRowId != null
          ? encodeHistoryMessageCursor({
              anchorId: lastRowId,
              direction: "next",
              filters,
            })
          : undefined,
      prevCursor:
        firstRowId != null
          ? encodeHistoryMessageCursor({
              anchorId: firstRowId,
              direction: "prev",
              filters,
            })
          : undefined,
    };
  }
```

- [ ] **Step 6: Add query helpers**

Add these private methods in `WorkbenchRepository`:

```ts
  private async getHistoryConversationContext(conversationNumericId: number) {
    return this.db
      .selectFrom("xy_wap_embed_conversation as conversation")
      .innerJoin("xy_wap_embed_user_seat as seat", (join) =>
        join
          .onRef("seat.third_userid", "=", "conversation.third_userid")
          .onRef("seat.uid", "=", "conversation.uid")
          .onRef("seat.platform", "=", "conversation.platform"),
      )
      .select([
        "conversation.id as conversation_id",
        "conversation.uid as uid",
        "conversation.platform as platform",
        "conversation.chat_type as chat_type",
        "conversation.third_external_userid as conversation_external_id",
        "conversation.third_group_id as conversation_group_id",
        "conversation.third_userid as third_userid",
        "seat.id as seat_id",
      ])
      .where("conversation.id", "=", conversationNumericId)
      .where("conversation.biz_status", "=", BIZ_STATUS_ACTIVE)
      .where("seat.biz_status", "=", BIZ_STATUS_ACTIVE)
      .executeTakeFirst();
  }

  private createHistoryMessageBaseQuery(
    conversation: NonNullable<Awaited<ReturnType<WorkbenchRepository["getHistoryConversationContext"]>>>,
    scope: WorkbenchHistoryMessageScope,
    options: HistoryMessageListOptions,
  ) {
    let query = this.db
      .selectFrom("xy_wap_embed_msg_audit_info as message")
      .select([
        "message.id as id",
        "message.msgid as msgid",
        "message.chat_type as chat_type",
        "message.from_type as from_type",
        "message.third_user_id as third_user_id",
        "message.third_external_id as third_external_id",
        "message.third_from_id as third_from_id",
        "message.third_group_id as third_group_id",
        "message.content as content",
        "message.msgtype as msgtype",
        "message.msgtime as msgtime",
        "message.opt_no as opt_no",
        "message.revoke_status as revoke_status",
      ])
      .select((expressionBuilder) => [
        expressionBuilder.val(conversation.conversation_id).as("conversation_id"),
        expressionBuilder.val(conversation.seat_id).as("seat_id"),
        expressionBuilder
          .val(conversation.conversation_external_id)
          .as("conversation_external_id"),
        expressionBuilder.val(conversation.conversation_group_id).as("conversation_group_id"),
      ])
      .where("message.uid", "=", conversation.uid)
      .where("message.platform", "=", conversation.platform)
      .where("message.third_user_id", "=", conversation.third_userid);

    if (conversation.chat_type === CHAT_TYPE_GROUP) {
      query = query.where("message.third_group_id", "=", conversation.conversation_group_id);
    } else {
      query = query.where("message.third_external_id", "=", conversation.conversation_external_id);
    }

    const msgTypes = getHistoryScopeMsgTypes(scope);

    if (msgTypes) {
      query = query.where("message.msgtype", "in", msgTypes);
    }

    if (options.senderId) {
      query = query.where("message.third_from_id", "=", options.senderId);
    }

    if (options.day) {
      const { end, start } = getDayBounds(options.day);
      query = query.where("message.msgtime", ">=", start).where("message.msgtime", "<=", end);
    }

    return query;
  }
```

- [ ] **Step 7: Run repository tests**

Run:

```bash
pnpm --filter @chatai/backend test apps/backend/test/modules/chat/workbench-repository.test.ts
```

Expected: repository tests pass.

- [ ] **Step 8: Run backend build and related tests**

Run:

```bash
pnpm --filter @chatai/backend build
pnpm --filter @chatai/backend test apps/backend/test/app.test.ts apps/backend/test/modules/chat/workbench.service.test.ts apps/backend/test/modules/chat/workbench-repository.test.ts
```

Expected: backend build and related tests pass.

- [ ] **Step 9: Commit repository query**

```bash
git add apps/backend/src/modules/chat/workbench-repository.ts apps/backend/test/modules/chat/workbench-repository.test.ts
git commit -m "feat: query history messages"
```

## Task 4: Web Service and Store State

**Files:**
- Modify: `apps/web/src/pages/chat/api/workbench-service.ts`
- Modify: `apps/web/src/pages/chat/api/workbench-gateway.ts`
- Modify: `apps/web/src/store/workbench-store.ts`
- Test: `apps/web/test/pages/chat/workbench-gateway.test.ts`
- Test: `apps/web/test/store/workbench-store.test.ts`

- [ ] **Step 1: Write gateway and store tests first**

Add gateway test in `apps/web/test/pages/chat/workbench-gateway.test.ts`:

```ts
it("loads history messages through the workbench service", async () => {
  const service = createMockWorkbenchService();
  vi.spyOn(service, "getHistoryMessages").mockResolvedValue({
    hasNext: false,
    hasPrev: true,
    messages: [createTextMessageDto({ messageId: "history-1", seq: 10 })],
    prevCursor: "older",
  });
  setWorkbenchService(service);

  await expect(
    loadConversationHistoryMessagesPage(
      {
        accounts: seedAccounts.map((account) => adaptAccount(account, account.unreadCount)),
        customerProfilesById: seedCustomerProfiles,
        me: { displayName: "客服", id: "sub-user-001" },
      },
      "conv-001",
      {
        limit: 30,
        scope: "all",
      },
    ),
  ).resolves.toMatchObject({
    hasPrev: true,
    messages: [{ id: "history-1" }],
    prevCursor: "older",
  });
});
```

Add store test in `apps/web/test/store/workbench-store.test.ts`:

```ts
it("opens history panel and loads the active conversation history page", async () => {
  await useWorkbenchStore.getState().initializeWorkbench();

  await useWorkbenchStore.getState().openHistoryPanel();

  const state = useWorkbenchStore.getState();
  expect(state.historyPanel.isOpen).toBe(true);
  expect(state.historyPanel.status).toBe("ready");
  expect(state.historyPanel.conversationId).toBe("conv-001");
  expect(state.historyPanel.page.messages).toHaveLength(1);
});

it("clears history panel when switching conversations", async () => {
  await useWorkbenchStore.getState().initializeWorkbench();
  await useWorkbenchStore.getState().openHistoryPanel();

  await useWorkbenchStore.getState().setActiveConversation("conv-002");

  const state = useWorkbenchStore.getState();
  expect(state.historyPanel.isOpen).toBe(false);
  expect(state.historyPanel.conversationId).toBe("");
  expect(state.historyPanel.page.messages).toEqual([]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @chatai/web test apps/web/test/pages/chat/workbench-gateway.test.ts apps/web/test/store/workbench-store.test.ts
```

Expected: FAIL because history gateway and store actions do not exist.

- [ ] **Step 3: Add service method**

In `apps/web/src/pages/chat/api/workbench-service.ts`, add imports for `WorkbenchHistoryMessagePageDto`, `WorkbenchHistoryMessageQuery`, and `WorkbenchHistoryMessageScope`.

Add service type:

```ts
  getHistoryMessages: (
    conversationId: string,
    options?: WorkbenchHistoryMessageQuery,
  ) => Promise<WorkbenchHistoryMessagePageDto>;
```

Add mock implementation:

```ts
    async getHistoryMessages(conversationId, options) {
      const page = await this.getMessages(conversationId, {
        beforeSeq: options?.cursor ? Number(options.cursor) : undefined,
        limit: options?.limit ?? 30,
      });

      return {
        hasNext: page.hasMore,
        hasPrev: false,
        messages: page.messages,
        nextCursor: page.nextBeforeSeq ? String(page.nextBeforeSeq) : undefined,
      };
    },
```

Add HTTP implementation:

```ts
    async getHistoryMessages(conversationId, options) {
      const response = await http.get<WorkbenchHistoryMessagePageDto>(
        `/server/conversations/${conversationId}/history-messages`,
        {
          params: {
            cursor: options?.cursor,
            day: options?.day,
            limit: options?.limit,
            scope: options?.scope,
            sender_id: options?.senderId,
          },
        },
      );

      return response.data;
    },
```

- [ ] **Step 4: Add gateway adapter**

In `apps/web/src/pages/chat/api/workbench-gateway.ts`, add:

```ts
export type WorkbenchHistoryMessagePage = {
  conversationId: string;
  hasNext: boolean;
  hasPrev: boolean;
  messages: Message[];
  nextCursor?: string;
  prevCursor?: string;
};

export async function loadConversationHistoryMessagesPage(
  context: GatewayContext,
  conversationId: string,
  options?: WorkbenchHistoryMessageQuery,
): Promise<WorkbenchHistoryMessagePage> {
  const page = await getWorkbenchService().getHistoryMessages(conversationId, options);

  return {
    conversationId,
    hasNext: page.hasNext,
    hasPrev: page.hasPrev,
    messages: adaptMessages(page.messages, context),
    nextCursor: page.nextCursor,
    prevCursor: page.prevCursor,
  };
}
```

- [ ] **Step 5: Add store state and actions**

In `apps/web/src/store/workbench-store.ts`, add:

```ts
type HistoryPanelStatus = "idle" | "loading" | "ready" | "error";
type HistoryPanelScope = WorkbenchHistoryMessageScope;

type HistoryPanelState = {
  conversationId: string;
  day?: string;
  errorMessage?: string;
  isOpen: boolean;
  page: {
    hasNext: boolean;
    hasPrev: boolean;
    messages: Message[];
    nextCursor?: string;
    prevCursor?: string;
  };
  scope: HistoryPanelScope;
  senderId?: string;
  status: HistoryPanelStatus;
};
```

Add to `WorkbenchState`:

```ts
  historyPanel: HistoryPanelState;
  closeHistoryPanel: () => void;
  loadHistoryPanelPage: (direction?: "initial" | "next" | "prev") => Promise<void>;
  openHistoryPanel: () => Promise<void>;
  setHistoryPanelDay: (day?: string) => Promise<void>;
  setHistoryPanelScope: (scope: HistoryPanelScope) => Promise<void>;
  setHistoryPanelSender: (senderId?: string) => Promise<void>;
```

Initial state:

```ts
    historyPanel: {
      conversationId: "",
      isOpen: false,
      page: {
        hasNext: false,
        hasPrev: false,
        messages: [],
      },
      scope: "all",
      status: "idle",
    },
```

Add helper:

```ts
function createClosedHistoryPanelState(): HistoryPanelState {
  return {
    conversationId: "",
    isOpen: false,
    page: {
      hasNext: false,
      hasPrev: false,
      messages: [],
    },
    scope: "all",
    status: "idle",
  };
}
```

Add actions:

```ts
  closeHistoryPanel: () => {
    set((state) => ({
      historyPanel: {
        ...state.historyPanel,
        isOpen: false,
      },
    }));
  },

  openHistoryPanel: async () => {
    set((state) => ({
      historyPanel: {
        ...state.historyPanel,
        conversationId: state.activeConversationId,
        isOpen: true,
      },
    }));
    await get().loadHistoryPanelPage("initial");
  },

  loadHistoryPanelPage: async (direction = "initial") => {
    const state = get();
    const conversationId = state.activeConversationId;

    if (!conversationId) {
      set({ historyPanel: createClosedHistoryPanelState() });
      return;
    }

    const cursor =
      direction === "next"
        ? state.historyPanel.page.nextCursor
        : direction === "prev"
          ? state.historyPanel.page.prevCursor
          : undefined;

    set((current) => ({
      historyPanel: {
        ...current.historyPanel,
        conversationId,
        errorMessage: undefined,
        status: "loading",
      },
    }));

    try {
      const page = await loadConversationHistoryMessagesPage(
        {
          accounts: state.accounts,
          customerProfilesById: state.customerProfilesById,
          me: state.me,
        },
        conversationId,
        {
          cursor,
          day: state.historyPanel.day,
          limit: 30,
          scope: state.historyPanel.scope,
          senderId: state.historyPanel.senderId,
        },
      );

      if (get().activeConversationId !== conversationId) {
        return;
      }

      set((current) => ({
        historyPanel: {
          ...current.historyPanel,
          conversationId,
          page,
          status: "ready",
        },
      }));
    } catch {
      set((current) => ({
        historyPanel: {
          ...current.historyPanel,
          errorMessage: "历史记录加载失败",
          status: "error",
        },
      }));
    }
  },
```

Add filter actions:

```ts
  setHistoryPanelDay: async (day) => {
    set((state) => ({
      historyPanel: {
        ...state.historyPanel,
        day,
        page: createClosedHistoryPanelState().page,
      },
    }));
    await get().loadHistoryPanelPage("initial");
  },
  setHistoryPanelScope: async (scope) => {
    set((state) => ({
      historyPanel: {
        ...state.historyPanel,
        page: createClosedHistoryPanelState().page,
        scope,
      },
    }));
    await get().loadHistoryPanelPage("initial");
  },
  setHistoryPanelSender: async (senderId) => {
    set((state) => ({
      historyPanel: {
        ...state.historyPanel,
        page: createClosedHistoryPanelState().page,
        senderId,
      },
    }));
    await get().loadHistoryPanelPage("initial");
  },
```

In `setActiveConversation` and `setActiveMode`, reset:

```ts
historyPanel: createClosedHistoryPanelState(),
```

- [ ] **Step 6: Run web service/store tests**

Run:

```bash
pnpm --filter @chatai/web test apps/web/test/pages/chat/workbench-gateway.test.ts apps/web/test/store/workbench-store.test.ts
```

Expected: tests pass.

- [ ] **Step 7: Commit web data flow**

```bash
git add apps/web/src/pages/chat/api/workbench-service.ts apps/web/src/pages/chat/api/workbench-gateway.ts apps/web/src/store/workbench-store.ts apps/web/test/pages/chat/workbench-gateway.test.ts apps/web/test/store/workbench-store.test.ts
git commit -m "feat: add history panel data flow"
```

## Task 5: Web Right Panel UI

**Files:**
- Modify: `apps/web/src/pages/chat/components/chat-composer.tsx`
- Modify: `apps/web/src/pages/chat/components/chat-panel.tsx`
- Modify: `apps/web/src/pages/chat/chat-workbench-page.tsx`
- Create: `apps/web/src/pages/chat/components/message-history-side-panel.tsx`
- Test: `apps/web/test/pages/chat/chat-workbench-page.test.tsx`

- [ ] **Step 1: Write UI tests first**

Add tests in `apps/web/test/pages/chat/chat-workbench-page.test.tsx`:

```tsx
it("opens the history panel from the existing composer history button", async () => {
  render(<ChatWorkbenchPage />);
  await screen.findByText("正在加载工作台数据", {}, { timeout: 1000 }).catch(() => undefined);

  await userEvent.click(await screen.findByRole("button", { name: "历史记录" }));

  expect(await screen.findByRole("complementary", { name: "历史记录" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "全部" })).toBeInTheDocument();
});

it("closes the history panel without removing the profile side panel", async () => {
  render(<ChatWorkbenchPage />);

  await userEvent.click(await screen.findByRole("button", { name: "历史记录" }));
  await userEvent.click(await screen.findByRole("button", { name: "关闭历史记录" }));

  expect(screen.queryByRole("complementary", { name: "历史记录" })).not.toBeInTheDocument();
  expect(screen.getByLabelText(/客户信息栏|群成员信息栏/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @chatai/web test apps/web/test/pages/chat/chat-workbench-page.test.tsx
```

Expected: FAIL because the history button has no click behavior and the panel does not exist.

- [ ] **Step 3: Wire existing composer button**

In `apps/web/src/pages/chat/components/chat-composer.tsx`, add prop:

```ts
  onOpenHistory: () => void;
```

Destructure it and update the existing history button:

```tsx
          <Button
            aria-label="历史记录"
            className={composerActionButtonClass}
            onClick={onOpenHistory}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={ChatDelayIcon} size={18} strokeWidth={1.8} />
          </Button>
```

- [ ] **Step 4: Add history side panel component**

Create `apps/web/src/pages/chat/components/message-history-side-panel.tsx`:

```tsx
import {
  Cancel01Icon,
  AppStoreIcon,
  File01Icon,
  Image01Icon,
  Link04Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";
import { MessageRow } from "@/pages/chat/components/message-feed";
import type { Conversation, GroupMember, Message } from "@/pages/chat/chat-types";
import type { WorkbenchHistoryMessageScope } from "@chatai/contracts";

type HistorySenderOption = {
  id: string;
  label: string;
};

type MessageHistorySidePanelProps = {
  activeConversation?: Conversation;
  day?: string;
  groupMembers: GroupMember[];
  hasNext: boolean;
  hasPrev: boolean;
  messages: Message[];
  onClose: () => void;
  onDayChange: (day?: string) => void;
  onLoadNext: () => void;
  onLoadPrev: () => void;
  onRetry: () => void;
  onScopeChange: (scope: WorkbenchHistoryMessageScope) => void;
  onSenderChange: (senderId?: string) => void;
  scope: WorkbenchHistoryMessageScope;
  senderId?: string;
  status: "idle" | "loading" | "ready" | "error";
};

export function MessageHistorySidePanel({
  activeConversation,
  day,
  groupMembers,
  hasNext,
  hasPrev,
  messages,
  onClose,
  onDayChange,
  onLoadNext,
  onLoadPrev,
  onRetry,
  onScopeChange,
  onSenderChange,
  scope,
  senderId,
  status,
}: MessageHistorySidePanelProps) {
  const senderOptions = buildHistorySenderOptions(activeConversation, groupMembers);

  return (
    <aside
      aria-label="历史记录"
      className="absolute inset-0 z-20 flex min-h-0 flex-col border-l border-divider bg-surface"
      role="complementary"
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-divider px-4">
        <h2 className="text-sm font-semibold text-foreground">历史记录</h2>
        <Button aria-label="关闭历史记录" className="size-8 p-0" onClick={onClose} size="icon" type="button" variant="ghost">
          <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
        </Button>
      </div>

      <Tabs className="min-h-0 flex-1 gap-0" onValueChange={(value) => onScopeChange(value as WorkbenchHistoryMessageScope)} value={scope}>
        <div className="border-b border-divider px-4 pt-3">
          <TabsList className="grid h-10 grid-cols-5 rounded-none bg-transparent p-0">
            {historyScopes.map((item) => (
              <TabsTrigger className="rounded-none bg-transparent px-0 text-[13px] data-[state=active]:bg-transparent data-[state=active]:shadow-none" key={item.value} value={item.value}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="flex shrink-0 gap-2 border-b border-divider px-4 py-3">
          <Select onValueChange={(value) => onSenderChange(value === "all" ? undefined : value)} value={senderId ?? "all"}>
            <SelectTrigger className="h-9 min-w-0 flex-1">
              <SelectValue placeholder="发送人" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部发送人</SelectItem>
              {senderOptions.map((sender) => (
                <SelectItem key={sender.id} value={sender.id}>{sender.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            aria-label="历史日期"
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
            onChange={(event) => onDayChange(event.currentTarget.value || undefined)}
            type="date"
            value={day ?? ""}
          />
        </div>

        <HistoryResultContent messages={messages} onRetry={onRetry} scope={scope} status={status} />

        <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-t border-divider px-4">
          <Button disabled={!hasPrev || status === "loading"} onClick={onLoadPrev} size="sm" type="button" variant="outline">
            {day ? "上一页" : "更早"}
          </Button>
          <Button disabled={!hasNext || status === "loading"} onClick={onLoadNext} size="sm" type="button" variant="outline">
            {day ? "下一页" : "更新"}
          </Button>
        </div>
      </Tabs>
    </aside>
  );
}

const historyScopes = [
  { label: "全部", value: "all" },
  { label: "文件", value: "file" },
  { label: "图片与视频", value: "media" },
  { label: "链接", value: "h5" },
  { label: "小程序", value: "mini-program" },
] as const;

function HistoryResultContent({
  messages,
  onRetry,
  scope,
  status,
}: {
  messages: Message[];
  onRetry: () => void;
  scope: WorkbenchHistoryMessageScope;
  status: "idle" | "loading" | "ready" | "error";
}) {
  if (status === "loading") {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <DotMatrixLoader ariaLabel="正在加载历史记录" dotSize={3} size={22} />
        正在加载历史记录
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-sm text-muted-foreground">
        历史记录加载失败
        <Button onClick={onRetry} size="sm" type="button" variant="outline">重试</Button>
      </div>
    );
  }

  if (messages.length === 0) {
    return <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">暂无历史记录</div>;
  }

  if (scope === "media") {
    return <MediaHistoryGrid messages={messages} />;
  }

  if (scope === "file" || scope === "h5" || scope === "mini-program") {
    return <CompactHistoryList messages={messages} />;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <div className="space-y-4">
        {messages.map((message) => (
          <div className="space-y-1" key={message.id}>
            <div className="px-1 text-[12px] text-muted-foreground">{message.author} · {message.sentAt}</div>
            {message.role === "system" ? null : <MessageRow message={message} />}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add compact list and media grid helpers**

Append to the same file:

```tsx
function CompactHistoryList({ messages }: { messages: Message[] }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <div className="divide-y divide-divider">
        {messages.map((message) => (
          <div className="flex min-w-0 items-start gap-3 py-3" key={message.id}>
            <HistoryTypeIcon message={message} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{getHistoryTitle(message)}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{message.author} · {message.sentAt}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MediaHistoryGrid({ messages }: { messages: Message[] }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="grid grid-cols-3 gap-2">
        {messages.map((message) => (
          <div className="aspect-square overflow-hidden rounded-md bg-surface-muted" key={message.id}>
            {message.content.type === "image" ? (
              <img alt={message.content.alt} className="h-full w-full object-cover" src={message.content.imageUrl} />
            ) : message.content.type === "video" ? (
              <div className="relative h-full w-full">
                <img alt={message.content.alt} className="h-full w-full object-cover" src={message.content.coverImageUrl} />
                <div className="absolute bottom-1 right-1 rounded bg-black/65 px-1.5 py-0.5 text-[11px] text-white">{message.content.durationLabel}</div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryTypeIcon({ message }: { message: Message }) {
  const icon =
    message.content.type === "file"
      ? File01Icon
      : message.content.type === "h5"
        ? Link04Icon
        : message.content.type === "mini-program"
          ? AppStoreIcon
          : Image01Icon;

  return (
    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-muted text-muted-foreground">
      <HugeiconsIcon icon={icon} size={18} strokeWidth={1.8} />
    </span>
  );
}

function getHistoryTitle(message: Message) {
  switch (message.content.type) {
    case "file":
      return message.content.fileName;
    case "h5":
      return message.content.title;
    case "mini-program":
      return message.content.title;
    default:
      return message.author;
  }
}

function buildHistorySenderOptions(
  activeConversation: Conversation | undefined,
  groupMembers: GroupMember[],
): HistorySenderOption[] {
  if (!activeConversation) {
    return [];
  }

  if (activeConversation.mode === "group") {
    return groupMembers.map((member) => ({
      id: member.id,
      label: member.displayName,
    }));
  }

  return [
    activeConversation.thirdUserId
      ? {
          id: activeConversation.thirdUserId,
          label: activeConversation.accountId,
        }
      : undefined,
    activeConversation.thirdExternalUserId
      ? {
          id: activeConversation.thirdExternalUserId,
          label: activeConversation.customerName,
        }
      : undefined,
  ].filter((option): option is HistorySenderOption => option !== undefined);
}
```

- [ ] **Step 6: Render stable right-side shell**

In `apps/web/src/pages/chat/components/chat-panel.tsx`, import `MessageHistorySidePanel`, add props for history state/actions, and replace the direct `CustomerSidePanel` render with:

```tsx
        <div className="relative flex min-h-0 shrink-0">
          <CustomerSidePanel
            accountName={accountName}
            conversationMode={activeConversation?.mode}
            customer={customer}
            sidebarIframeQd={
              activeConversation?.mode === "group" &&
              activeConversation.thirdGroupId !== undefined &&
              activeConversation.thirdGroupId !== ""
                ? activeConversation.thirdGroupId
                : undefined
            }
            sidebarIframeConversationId={activeConversation?.id}
            sidebarIframeSeatId={activeConversation?.accountId}
            sidebarIframeTos={sidebarIframeTos}
            groupMembers={groupMembers}
            isGroupMembersLoading={isGroupMembersLoading}
            isResizing={isResizingCustomerPanel}
            onRefreshGroupMembers={onRefreshGroupMembers}
            onResizeStart={onCustomerPanelResizeStart}
            panelWidth={customerPanelWidth}
            sidebarItems={sidebarItems}
          />
          {historyPanel.isOpen ? (
            <MessageHistorySidePanel
              activeConversation={activeConversation}
              day={historyPanel.day}
              groupMembers={groupMembers}
              hasNext={historyPanel.page.hasNext}
              hasPrev={historyPanel.page.hasPrev}
              messages={historyPanel.page.messages}
              onClose={onCloseHistoryPanel}
              onDayChange={onHistoryDayChange}
              onLoadNext={() => onLoadHistoryPanelPage("next")}
              onLoadPrev={() => onLoadHistoryPanelPage("prev")}
              onRetry={() => onLoadHistoryPanelPage("initial")}
              onScopeChange={onHistoryScopeChange}
              onSenderChange={onHistorySenderChange}
              scope={historyPanel.scope}
              senderId={historyPanel.senderId}
              status={historyPanel.status}
            />
          ) : null}
        </div>
```

- [ ] **Step 7: Pass state/actions from page**

In `apps/web/src/pages/chat/chat-workbench-page.tsx`, destructure store actions and pass to `ChatPanel`:

```ts
    closeHistoryPanel,
    historyPanel,
    loadHistoryPanelPage,
    openHistoryPanel,
    setHistoryPanelDay,
    setHistoryPanelScope,
    setHistoryPanelSender,
```

Pass props:

```tsx
                historyPanel={historyPanel}
                onCloseHistoryPanel={closeHistoryPanel}
                onHistoryDayChange={setHistoryPanelDay}
                onHistoryScopeChange={setHistoryPanelScope}
                onHistorySenderChange={setHistoryPanelSender}
                onLoadHistoryPanelPage={loadHistoryPanelPage}
                onOpenHistoryPanel={() => {
                  void openHistoryPanel();
                }}
```

Pass `onOpenHistory={onOpenHistoryPanel}` into `ChatComposer`.

- [ ] **Step 8: Run UI tests**

Run:

```bash
pnpm --filter @chatai/web test apps/web/test/pages/chat/chat-workbench-page.test.tsx
```

Expected: history panel opens from the existing button, closes back to the profile panel, and right-side profile panel remains mounted.

- [ ] **Step 9: Commit UI**

```bash
git add apps/web/src/pages/chat/components/chat-composer.tsx apps/web/src/pages/chat/components/chat-panel.tsx apps/web/src/pages/chat/chat-workbench-page.tsx apps/web/src/pages/chat/components/message-history-side-panel.tsx apps/web/test/pages/chat/chat-workbench-page.test.tsx
git commit -m "feat: add history message side panel"
```

## Task 6: Final Verification

**Files:**
- Verify: `packages/contracts/src/chat/dto.ts`
- Verify: `apps/backend/src/modules/chat/*`
- Verify: `apps/web/src/pages/chat/*`

- [ ] **Step 1: Run affected backend and contract checks**

Run:

```bash
pnpm --filter @chatai/contracts build
pnpm --filter @chatai/backend build
pnpm --filter @chatai/backend test apps/backend/test/app.test.ts apps/backend/test/modules/chat/workbench.service.test.ts apps/backend/test/modules/chat/workbench-repository.test.ts
```

Expected: all commands pass.

- [ ] **Step 2: Run affected web checks**

Run:

```bash
pnpm --filter @chatai/web test apps/web/test/pages/chat/workbench-gateway.test.ts apps/web/test/store/workbench-store.test.ts apps/web/test/pages/chat/chat-workbench-page.test.tsx
pnpm --filter @chatai/web build
```

Expected: related web tests pass and the web build passes.

- [ ] **Step 3: Run repository hygiene check**

Run:

```bash
git diff --check
git status --short
```

Expected: `git diff --check` prints nothing. `git status --short` only shows intentional implementation changes before final commit, or prints nothing after final commit.

- [ ] **Step 4: Commit verification fixes**

If the verification steps require code fixes, commit only those fixes:

```bash
git add packages/contracts/src/chat/dto.ts apps/backend/src/modules/chat apps/backend/test apps/web/src/pages/chat apps/web/src/store/workbench-store.ts apps/web/test
git commit -m "test: verify history message panel"
```

Expected: no commit is created when there are no verification fixes.

## Self-Review

- Spec coverage: the plan covers the independent backend interface, structure-only filters, natural day filtering, sender filtering for single and group conversations, cursor pagination, stable right-side shell, existing composer button reuse, no search box, no main-chat positioning, and verification commands.
- Placeholder scan: the plan contains no `TBD`, `TODO`, or unconstrained “handle later” work.
- Type consistency: the scope type is `WorkbenchHistoryMessageScope`, request options use `senderId` in TypeScript and `sender_id` on the HTTP query string, and page state consistently uses `hasNext`, `hasPrev`, `nextCursor`, and `prevCursor`.
