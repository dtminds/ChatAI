# Smart Reply Message Load And Poll Refactor Design

## Context

Smart reply currently depends on a frontend poll after a conversation page is
loaded. This causes existing recommendations to appear late and makes the
pending lifecycle too fragile. In particular, when Java has accepted an
asynchronous generation task but `user-history-answer-list` does not yet return
a record for that message, the frontend must not treat the missing item as a
terminal state.

This design keeps the feature limited to one-on-one conversations. Group
conversation support and recommendation card motion are out of scope.

Tracking issue: https://github.com/dtminds/ChatAI/issues/218

## Goals

- Return existing smart replies with the latest conversation message page.
- Trigger asynchronous generation only for the latest customer message when it
  is missing a recommendation.
- Keep smart reply pending state scoped to the currently opened conversation.
- Poll every second while the current conversation has pending smart replies.
- Stop pending only when Java returns a terminal state or the local 30 second
  timeout expires.

## Non-goals

- Do not enable smart reply for group conversations.
- Do not add micro-interactions or animation in this change.
- Do not implement the future Lite display for recommendations that have been
  covered by an agent reply.
- Do not rely on frontend state to preserve pending smart reply tasks across
  conversation switches.

## Contracts

`WorkbenchMessagePageDto` will gain an optional sibling field:

```ts
export type WorkbenchMessagePageDto = {
  messages: WorkbenchMessageDto[];
  smartReplies?: WorkbenchSmartReplySuggestionDto[];
  filteredCount: number;
  hasMore: boolean;
  nextBeforeSeq?: number;
  scannedCount: number;
};
```

`smartReplies` is separate from `messages` because the current frontend state
already stores recommendations in `smartReplyByMessageIdByConversationId`. This
keeps message DTO semantics unchanged and leaves room for display rules that are
more flexible than direct message embedding.

A new public backend endpoint will be added:

```http
POST /api/server/smart-reply/auto-general-answer
```

Request:

```ts
{
  conversationId: string;
  msgId: number;
}
```

Response:

```ts
{
  id: number;
}
```

The returned `id` is only used to confirm that Java created a task. The frontend
continues to poll by the original customer message id
(`xy_wap_embed_msg_audit_info.id`, represented as `seq` in the frontend).

## Backend Message Page Flow

`GET /api/server/conversations/:conversationId/messages` keeps its route and
message pagination behavior.

After the normal message page is loaded, the backend queries Java history
answers only when all conditions are true:

- `beforeSeq == null`, which means the latest message page in the current
  repository query.
- The conversation is one-on-one.
- The message page query has loaded `xy_wap_embed_user_seat.assistant_id > 0`.
- The current latest page contains eligible customer messages.

The backend must not expand `getConversationLookup` for this. The
`assistant_id` should be selected in the message page query path where it is
needed.

Candidate selection in the backend is fixed and intentionally simple:

- Inspect the current latest message page.
- Take the last at most five customer messages.
- Use each message row id as the Java `msgIds` value.

The backend does not check whether those customer messages were later covered by
an agent reply. Display filtering remains a frontend responsibility. Java items
that are missing from `user-history-answer-list` are ignored in the message page
response, not converted into failures, and do not trigger generation.

## Auto Generation Flow

The new Node endpoint proxies Java
`/third-internal/wap-embed-msg-audit-recommend-answer/auto-general-answer`.

The frontend sends only `conversationId` and `msgId`. The backend:

- Looks up the conversation for auth and context.
- Verifies seat access.
- Keeps the scope limited to one-on-one conversations.
- Validates `msgId` as a positive integer.
- Builds the Java request with `chatType`, `msgId`, `thirdExternalId`,
  `thirdUserId`, and `uid`.
- Treats `data.id > 0` as successful task creation.
- Exposes Java business `errorMsg` for this operation so the frontend can show
  the failure reason inside the optimistic card.

The Java API does not accept `questionImgs`, so the new frontend request does
not include it.

Repeated calls for the same `msgId` are considered Java's responsibility and are
treated as idempotent by this design.

## Frontend Message Load Flow

When a latest conversation message page is loaded, the frontend will:

1. Merge `page.messages` into `messagesByConversationId`.
2. Merge `page.smartReplies` into
   `smartReplyByMessageIdByConversationId[conversationId]`.
3. Add Java non-terminal smart reply records to the current conversation pending
   set.
4. Inspect the latest non-system message after merge.
5. If that message is an eligible customer message with no existing suggestion
   and no pending entry, call `auto-general-answer`.

Before calling `auto-general-answer`, the frontend shows the smart reply loading
card and adds the message to the current conversation pending set. If task
creation succeeds, the message remains pending and the 1 second poll starts. If
task creation fails, the optimistic card becomes a terminal failure card using
the returned API error message.

For this change, display behavior remains conservative: recommendations are
shown only for messages that have not been covered by an agent reply. Historical
recommendations for covered messages may be merged into state but do not need a
new Lite UI yet.

## Poll Flow

`/api/server/smart-reply/poll` continues to call Java
`user-history-answer-list`.

The frontend poll interval changes from 5 seconds to 1 second. A poll should
schedule the next poll while all of these are true:

- The conversation is still the active conversation.
- There are pending smart reply message ids.
- At least one pending item has not reached the local timeout.

Pending merge behavior changes:

- If Java returns a non-terminal item, update the card and keep it pending.
- If Java returns a terminal item, update the card and remove it from pending.
- If Java does not return an item for a requested msgId, keep it pending.
- If the local 30 second timeout expires, remove it from pending and show
  `生成失败：智能回复生成超时，请稍后重试`.

This replaces the current behavior that removes requested msgIds from pending
when Java does not include them in the response.

## Conversation Switching

Smart reply pending and loading state is a short-lived state for the active
conversation. Switching conversations clears the local pending/loading runtime
state for the previous conversation.

When the user opens a conversation again, the latest message page is reloaded.
The backend-provided `smartReplies` becomes the source of truth. If Java returns
a non-terminal recommendation record, the frontend adds it back to pending and
continues polling. If Java temporarily has no record, the frontend may trigger
`auto-general-answer` again for the latest eligible customer message; Java is
expected to handle idempotency for duplicate task creation.

## Error Handling

- Java history lookup missing a msgId is not an error.
- Java auto-generation business failure becomes an optimistic card failure with
  the Java-approved message.
- Network or backend failures during auto-generation also become optimistic card
  failures with the existing fallback message.
- Poll request failures do not immediately fail the card. Pending continues
  until terminal Java state or local timeout.

## Testing

Backend tests should cover:

- Latest message page includes `smartReplies` only for one-on-one conversations
  with `assistant_id > 0`.
- Message page smart reply lookup uses the last at most five customer message
  row ids, regardless of agent replies.
- Historical pages with `beforeSeq` do not fetch smart replies.
- `auto-general-answer` proxies Java context correctly and requires `data.id >
  0`.
- Java business errors from `auto-general-answer` expose the approved error
  message.

Frontend tests should cover:

- Loading a latest message page merges `smartReplies`.
- Non-terminal smart replies from the message page are added to pending.
- Missing recommendation on the latest eligible customer message triggers
  `auto-general-answer`.
- Java poll responses that omit a pending msgId do not remove it from pending.
- Terminal poll responses remove pending and update the card.
- 30 second timeout produces the expected failure card.
- Switching conversations clears local smart reply pending/loading runtime
  state, and reopening derives pending from the reloaded message page.

Verification before completion should include the affected backend tests, web
tests, contracts build if DTOs change, backend build, web build, and
`git diff --check`.
