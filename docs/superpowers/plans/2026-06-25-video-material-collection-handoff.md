# Video Material Collection Handoff

This document is the handoff source of truth. Do not assume access to prior chat context.

## Goal

Finish video material collection and sending on top of the current branch.

The feature extends material collection from file, mini-program, H5, sphfeed, expression, and image to normal video messages.

Video material rules:

- Material biz type is `MATERIAL_COLLECTION_BIZ_TYPE.VIDEO = 7`.
- Material content type is `"video"`.
- Videos are collected into normal material groups, same as file/image/H5/etc. Expression is still the only `groupId: 0` case.
- Video collection must only allow videos sent by the seat/agent in single chat or group chat.
- Video cover is required. If there is no `coverUrl`, reject collection because the library cannot show what the video is.
- Local video upload is not part of this phase.
- Quick reply video selection is not part of this phase.

## Fixed Data Schema

Do not add compatibility for guessed fields. The message audit content schema for video is fixed.

Source message content from `xy_wap_embed_msg_audit_info.content`:

```json
{
  "coverUrl": "s5/msg/20260514/272/601469bcc4a948139737817e51552c29.jpg",
  "optSerNo": "20260520161942296211617558032",
  "fileUrlExpireTime": 1778846696045,
  "fileSerialNo": "6981fbe0f69444d99f8620d8ae5e1dff",
  "fileUrl": "http://kfpt-file.oss-cn-hangzhou.aliyuncs.com/7-days-expired/wecom-ios-protocol/sm/msg-file/merchant/20260513/a5b0c805957f4b17b08c76da9148edcf.mp4",
  "downloadStatus": "ing"
}
```

Only these keys should be used for backend collection:

- `fileUrl`: original video URL or our transferred URL.
- `coverUrl`: required cover image URL.
- `downloadStatus`: must currently be `"finished"` before collection.
- `fileUrlExpireTime`: expiry timestamp for external video URLs.
- `fileSerialNo` and `optSerNo`: metadata to preserve when present.

Do not read backend collection source from `url`, `imageUrl`, `videoUrl`, or `coverImageUrl`. Those are frontend/display/composer names in some places, not the persisted audit content schema.

Collected material content should keep the canonical persisted shape:

```json
{
  "coverUrl": "s5/msg/20260514/272/601469bcc4a948139737817e51552c29.jpg",
  "fileUrl": "https://b5.bokr.com.cn/s5/msg/20260514/272/video.mp4",
  "downloadStatus": "finished",
  "fileSerialNo": "6981fbe0f69444d99f8620d8ae5e1dff",
  "optSerNo": "20260520161942296211617558032"
}
```

## URL Rules

Before collecting a video, inspect `fileUrl`.

Internal resource, collect directly:

- Absolute URL starts with `https://b5.bokr.com.cn`.
- Relative URL starts with `s5/msg/`.

External resource, transfer first:

- Any non-empty `fileUrl` that is not one of the internal resource forms above.
- Before transfer, validate `fileUrlExpireTime`.
- If `Date.now() > fileUrlExpireTime`, reject collection.
- If `fileUrlExpireTime` is missing for an external URL, treat it as expired and reject collection.

Suggested rejection message:

```text
视频下载地址已过期，无法收录
```

After successful transfer, use the returned content JSON from Java as the source for the existing `resolveMaterialVideoCollectFields` and `buildMaterialVideoContentJson` path.

## Java Transfer API

Use this sync Java API to transfer an external message video file into our COS resource:

```http
POST /third-internal/wap-embed/conversation/trans-msg-file
Content-Type: application/json
```

Request body:

```ts
type DownloadMsgFileReqTO = {
  // xy_wap_embed_msg_audit_info.id
  msgInfoId: number;
  // conversation platform
  platform: number;
  // xy_user.id
  uid: number;
};
```

Example request:

```json
{
  "msgInfoId": 2197,
  "platform": 1,
  "uid": 9001
}
```

Response envelope:

```ts
type ApiResponseTO<T> = {
  data: T;
  error: number;
  errorMsg: string;
  success: boolean;
};
```

For this endpoint, `data` is a string. The string is the transferred video `content` JSON object.

Example response:

```json
{
  "data": "{\"coverUrl\":\"s5/msg/20260514/272/601469bcc4a948139737817e51552c29.jpg\",\"fileUrl\":\"https://b5.bokr.com.cn/s5/msg/20260514/272/video.mp4\",\"downloadStatus\":\"finished\",\"fileSerialNo\":\"6981fbe0f69444d99f8620d8ae5e1dff\",\"optSerNo\":\"20260520161942296211617558032\"}",
  "error": 0,
  "errorMsg": "",
  "success": true
}
```

Expected parsed `data` shape:

```ts
type TransferredVideoContent = {
  coverUrl: string;
  fileUrl: string;
  downloadStatus?: "finished" | "ing" | "failed";
  fileSerialNo?: string;
  fileUrlExpireTime?: number;
  optSerNo?: string;
};
```

Implementation notes:

- Add `transMsgFile(input): Promise<string>` to `WorkbenchJavaClient`.
- Use the same Java envelope error handling pattern as `downloadMsgFile`.
- The timeout may need to be longer than the default 8 seconds because video transfer can take longer. Java says this is synchronous and does not require polling.
- The UI should show the collection button spinner plus a separate message like `正在收录视频，请耐心等待`. Do not put this long text inside the button.

## Current Branch State

Already present in this branch:

- `MATERIAL_COLLECTION_BIZ_TYPE.VIDEO = 7` exists in `packages/contracts/src/chat/enums.ts`.
- Video material DTO/content type is present in `packages/contracts/src/chat/dto.ts`.
- Video collect field helpers exist in `packages/contracts/src/chat/material-collection-content.ts`:
  - `resolveMaterialVideoCollectFields`
  - `buildMaterialVideoContentJson`
- Backend message type matching recognizes `bizType = 7` as `msgtype = "video"`.
- Backend `collectMaterial` rejects non-agent video messages.
- Backend video collection currently requires `downloadStatus === "finished"` and validates `coverUrl/fileUrl`.
- Material list mapping normalizes video `coverUrl` for display.
- Material card UI renders video covers at `3:4`, fixed size `210 x 280`, dark background, `object-contain`.
- Composer video icon has been moved after image and uses `PlayListIcon`.
- Video material send path has been partially wired.
- Video optimistic UI has partial test coverage.

Not complete yet:

- `WorkbenchJavaClient` does not yet expose `transMsgFile`.
- Backend video collection does not yet transfer external `fileUrl` before insert.
- Backend video collection does not yet reject missing `fileUrlExpireTime` for external URLs.
- Backend tests currently include intended transfer cases, but the production code is not fully wired.
- Memory fixture/web mock may diverge from real MySQL service unless updated with the same transfer/expiry rules.

Current dirty worktree at handoff time includes video-related edits in backend tests, web store, web material hooks, message video UI, composer, and memory fixture. Review `git status --short` before continuing and do not reset unrelated changes.

## Backend Implementation Plan

Main file: `apps/backend/src/modules/chat/workbench.service.ts`.

Recommended shape:

1. Keep existing group validation and message lookup flow.
2. Keep `isAgentMaterialMessage` for video before any transfer.
3. For video only, prepare a `rawContentForCollect` before calling `normalizeMaterialCollectionPayload`.
4. If `fileUrl` is internal, use `message.content` as-is.
5. If `fileUrl` is external, check expiry first, call `javaClient.transMsgFile`, and use its returned string as `rawContentForCollect`.
6. Pass `rawContentForCollect` to `normalizeMaterialCollectionPayload`.
7. Insert material with the transferred content.

Do not mutate or invent fields on frontend display DTOs to solve backend persistence.

Useful helper functions to add near existing material helpers:

```ts
function isOwnVideoMaterialUrl(fileUrl: string) {
  const url = fileUrl.trim();

  return (
    url.startsWith("https://b5.bokr.com.cn") ||
    url.replace(/^\/+/, "").startsWith("s5/msg/")
  );
}

function isExpiredVideoFileUrl(expireTime: number | undefined) {
  return expireTime === undefined || Date.now() > expireTime;
}
```

The actual helper names can follow local style.

## Frontend Behavior

Collection entry:

- `canCollectMaterial` for normal video currently requires:
  - `message.role === "agent"`
  - `downloadStatus === "finished"`
  - `coverImageUrl` non-empty
  - `videoUrl` non-empty
- This is fine for the current UI, but backend remains authoritative because frontend display fields are adapted from backend data.

Collection progress:

- Existing `isCollectingMaterial` spinner is available.
- Add/keep a non-button text message for video collection: `正在收录视频，请耐心等待`.
- The transfer API is sync, so no progress percentage or polling is needed.

Material library display:

- For video cards, use `coverUrl` from material content.
- Apply image optimization suffix through existing `getOptimizedMessageImageUrl` for cover display only.
- Keep actual send/forward source as the original material ID/message reference, not the optimized cover URL.

Sending:

- Java video sending by material/source message has been enabled in this branch.
- Do not implement local video upload.
- Do not add quick-reply video selection in this phase.

Preview:

- Do not implement in-dialog video playback.
- If a preview/open action exists, open the raw video URL in a new tab.

## Files To Review

Contracts:

- `packages/contracts/src/chat/enums.ts`
- `packages/contracts/src/chat/dto.ts`
- `packages/contracts/src/chat/material-collection-content.ts`
- `packages/contracts/test/material-collection-content.test.ts`
- `packages/contracts/test/chat-material-collection-dto.test.ts`

Backend:

- `apps/backend/src/modules/chat/workbench.service.ts`
- `apps/backend/src/modules/chat/workbench-java-client.ts`
- `apps/backend/src/modules/chat/material-collection-mappers.ts`
- `apps/backend/src/modules/chat/workbench-repository.ts`
- `apps/backend/test/modules/chat/workbench.service.test.ts`
- `apps/backend/test/modules/chat/workbench-java-client.test.ts`
- `apps/backend/test/modules/chat/workbench-repository.test.ts`
- `apps/backend/test/app.test.ts`
- `apps/backend/test/fixtures/workbench-memory.service.ts`

Web:

- `apps/web/src/pages/chat/hooks/use-material-collection.ts`
- `apps/web/src/pages/chat/components/message-feed.tsx`
- `apps/web/src/pages/chat/components/material-collection/material-card.tsx`
- `apps/web/src/pages/chat/components/material-collection/material-library-dialog.tsx`
- `apps/web/src/pages/chat/components/chat-composer.tsx`
- `apps/web/src/store/workbench-store.ts`
- `apps/web/src/pages/chat/api/workbench-service.ts`
- `apps/web/test/pages/chat/use-material-collection.test.tsx`
- `apps/web/test/pages/chat/message-video.test.tsx`
- `apps/web/test/store/workbench-store.test.ts`

## Tests To Add Or Keep

Backend service tests:

- Collect internal absolute URL:
  - `fileUrl = "https://b5.bokr.com.cn/s5/msg/20260514/272/demo.mp4"`
  - no Java transfer call
  - insert succeeds
- Collect internal relative URL:
  - `fileUrl = "s5/msg/20260514/272/demo.mp4"`
  - no Java transfer call
  - insert succeeds
- Collect external unexpired URL:
  - `fileUrl = "http://kfpt-file.oss-cn-hangzhou.aliyuncs.com/...mp4"`
  - `fileUrlExpireTime > Date.now()`
  - calls `transMsgFile`
  - inserted content equals Java returned content
- Reject external expired URL:
  - `fileUrlExpireTime < Date.now()`
  - no Java transfer call
  - no insert
  - returns `视频下载地址已过期，无法收录`
- Reject external URL with missing expiry:
  - no `fileUrlExpireTime`
  - no Java transfer call
  - no insert
  - returns `视频下载地址已过期，无法收录`
- Reject missing cover:
  - returns `视频缺少封面，无法收录`
- Reject non-agent video:
  - returns `只能收录席位号发送的视频`

Java client tests:

- `transMsgFile` posts to `/third-internal/wap-embed/conversation/trans-msg-file`.
- Request body contains `msgInfoId`, `platform`, `uid`.
- Returns the `data` string.
- Business failure uses the existing Java envelope error handling.

App/memory fixture tests:

- Public route collection for video should match real service behavior as closely as practical.
- Memory fixture should not silently accept invalid video data that real MySQL service rejects.

Web tests:

- Video collection invalid content shows `视频素材数据异常`.
- Video collection long-running state shows `正在收录视频，请耐心等待` outside the button.
- Video optimistic message renders as video, not empty text.
- Video cover uses optimized image URL for display.

## Validation Commands

Run focused tests first:

```bash
pnpm --filter @chatai/contracts test test/material-collection-content.test.ts test/chat-material-collection-dto.test.ts
pnpm --filter @chatai/backend test test/modules/chat/workbench.service.test.ts -t "material:"
pnpm --filter @chatai/backend test test/modules/chat/workbench-java-client.test.ts
pnpm --filter @chatai/backend test test/app.test.ts -t "material:"
pnpm --filter @chatai/web test test/pages/chat/use-material-collection.test.tsx test/pages/chat/message-video.test.tsx test/store/workbench-store.test.ts
```

Then run broader package checks if time allows:

```bash
pnpm --filter @chatai/contracts build
pnpm --filter @chatai/backend test
pnpm --filter @chatai/web test
```

## Known Pitfalls

- Do not confuse audit content fields with frontend message fields. Backend source is `fileUrl` and `coverUrl`, not `videoUrl` and `coverImageUrl`.
- Do not strip the `b5.bokr.com.cn` prefix handling from material list display. Relative `s5/msg/...` paths still need normalization for display.
- Do not use optimized image suffixes for actual sending. Optimization is display-only.
- Do not allow customer-sent or other group member-sent videos to be collected.
- Do not treat missing `fileUrlExpireTime` as safe for external URLs.
- Do not implement COS URL direct upload in frontend. The transfer is done by Java.
- Do not add quick reply video picker support in this phase.
