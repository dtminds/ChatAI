# Group Members Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a backend group-members API for group conversations and use it to drive both the @ mention picker and the right-side group member sidebar.

**Architecture:** The backend will resolve a conversation's `third_group_id`, find the matching `xy_wap_embed_group_seat`, and return active `xy_wap_embed_group_member` rows with a stable UI shape. The web store will fetch and cache members per conversation when a group conversation becomes active, then reuse the same list for the composer mention dropdown and the sidebar rendering. Single conversations keep the existing customer sidebar behavior.

**Tech Stack:** Fastify, Kysely, TypeBox, TypeScript, React 19, Zustand, Vitest

---

### Task 1: Backend group-member API and contract

**Files:**
- Modify: `packages/contracts/src/chat/dto.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/backend/src/modules/chat/workbench-repository.ts`
- Modify: `apps/backend/src/modules/chat/workbench.service.ts`
- Modify: `apps/backend/src/modules/chat/chat.routes.ts`
- Modify: `apps/backend/src/modules/chat/workbench-mappers.ts` if needed for a shared member shape
- Test: `apps/backend/test/modules/chat/workbench-repository.test.ts`
- Test: `apps/backend/test/app.test.ts`

- [x] **Step 1: Add the contract**

```ts
export type WorkbenchGroupMemberDto = {
  thirdUserId: string;
  displayName: string;
  avatarUrl: string;
  nickname?: string;
  type: 0 | 1 | 2;
};

export type WorkbenchGroupMembersResponse = {
  conversationId: string;
  thirdGroupId: string;
  groupSeatId: string;
  items: WorkbenchGroupMemberDto[];
};
```

- [x] **Step 2: Add a repository method**

```ts
async listGroupMembers(conversationId: string) {
  const conversation = await this.db
    .selectFrom("xy_wap_embed_conversation as conversation")
    .innerJoin("xy_wap_embed_group_seat as group_seat", (join) =>
      join
        .onRef("group_seat.third_group_id", "=", "conversation.third_group_id")
        .onRef("group_seat.uid", "=", "conversation.uid")
        .onRef("group_seat.platform", "=", "conversation.platform"),
    )
    .select([
      "conversation.id as conversation_id",
      "conversation.third_group_id as third_group_id",
      "group_seat.id as group_seat_id",
    ])
    .where("conversation.id", "=", conversationNumericId)
    .where("conversation.chat_type", "=", 2)
    .where("conversation.biz_status", "=", 1)
    .where("group_seat.biz_status", "=", 1)
    .executeTakeFirst();

  const members = await this.db
    .selectFrom("xy_wap_embed_group_member as member")
    .select([
      "member.third_userid as third_user_id",
      "member.avatar as avatar_url",
      "member.name as name",
      "member.nickname as nickname",
      "member.type as type",
    ])
    .where("member.group_seat_id", "=", conversation.groupSeatId)
    .where("member.uid", "=", conversation.uid)
    .where("member.platform", "=", conversation.platform)
    .where("member.biz_status", "=", 1)
    .orderBy("member.type", "desc")
    .orderBy("member.nickname", "asc")
    .orderBy("member.name", "asc")
    .execute();
}
```

- [x] **Step 3: Expose a protected route**

```http
GET /api/server/conversations/:conversationId/group-members
```

- [x] **Step 4: Keep the response shape stable**

```json
{
  "conversationId": "123",
  "thirdGroupId": "xxx",
  "groupSeatId": "456",
  "items": []
}
```

- [x] **Step 5: Add route and repository tests**

Run:

```bash
pnpm --filter @chatai/backend test -- workbench-repository
pnpm --filter @chatai/backend test -- app
```

Expected: new group-member lookup passes and existing chat routes remain green.

### Task 2: Web data flow and sidebar rendering

**Files:**
- Modify: `apps/web/src/pages/chat/api/workbench-service.ts`
- Modify: `apps/web/src/pages/chat/api/workbench-gateway.ts`
- Modify: `apps/web/src/store/workbench-store.ts`
- Modify: `apps/web/src/pages/chat/chat-types.ts`
- Modify: `apps/web/src/pages/chat/components/chat-panel.tsx`
- Modify: `apps/web/src/pages/chat/components/customer-side-panel.tsx`
- Modify: `apps/web/src/pages/chat/components/customer-system-panel.tsx` or add a new group member panel component
- Test: `apps/web/test/pages/chat/workbench-gateway.test.ts`
- Test: `apps/web/test/store/workbench-store.test.ts`

- [x] **Step 1: Add a frontend DTO and service call**

```ts
type GroupMembersResponse = {
  conversationId: string;
  thirdGroupId: string;
  groupSeatId: string;
  items: Array<{
    thirdUserId: string;
    displayName: string;
    avatarUrl: string;
    nickname?: string;
    type: 0 | 1 | 2;
  }>;
};
```

- [x] **Step 2: Cache group members by conversation**

```ts
groupMembersByConversationId: Record<string, GroupMember[]>;
loadGroupMembers: (conversationId: string) => Promise<void>;
```

- [x] **Step 3: Fetch members when a group conversation becomes active**

```ts
if (activeConversation?.mode === "group") {
  await loadGroupMembers(activeConversation.id);
}
```

- [x] **Step 4: Group and sort for the sidebar**

```ts
const leadership = members
  .filter((member) => member.type === 2)
  .sort(sortByName);
const admins = members
  .filter((member) => member.type === 1)
  .sort(sortByName);
const regular = members
  .filter((member) => member.type === 0)
  .sort(sortByName);
```

- [x] **Step 5: Replace the customer system tab for group chats**

```tsx
{activeConversation?.mode === "group" ? (
  <GroupMembersPanel groups={...} />
) : (
  <CustomerSystemPanel ... />
)}
```

- [x] **Step 6: Reuse the same cached list for @ mention filtering**

The composer should continue to receive `groupMembers`, but now from backend data rather than `seedGroupMembersByConversationId`.

- [x] **Step 7: Cover the fetch and rendering flow with tests**

Run:

```bash
pnpm --filter @chatai/web test -- workbench-gateway
pnpm --filter @chatai/web test -- workbench-store
```

Expected: group conversations load members once, single conversations keep existing sidebar content, and mention filtering still works.

### Task 3: Cleanup, docs, and verification

**Files:**
- Modify: `README.md`
- Modify: `apps/backend/src/modules/chat/chat.routes.ts` if a response envelope or naming tweak is needed after tests
- Modify: `docs/db/schema.sql` only if the query plan needs an index note
- Test: `pnpm typecheck`
- Test: `pnpm test`

- [x] **Step 1: Remove frontend seed fallback for group members**

```ts
seedGroupMembersByConversationId -> delete or confine to tests only
```

- [ ] **Step 2: Update README runtime notes**

Replace the stale "dev bypass" and mock wording with the current backend behavior.

- [ ] **Step 3: Run the full workspace checks**

```bash
pnpm typecheck
pnpm test
```

Expected: all workspace tests pass.
