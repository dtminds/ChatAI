# Workflow Header Metadata Design

## Goal

Make the Workflow canvas header a compact status bar and support a persisted Workflow description that is available from the header.

## Metadata Contract

Workflow metadata contains:

- `name`: required, trimmed, 1-100 characters.
- `description`: optional text represented as an empty string when absent, trimmed, 0-1000 characters.

`description` is definition metadata, not part of the canvas draft DSL. Editing metadata does not create a draft revision or mark the graph as changed.

## Persistence And API

- Add `description VARCHAR(1000) NOT NULL DEFAULT ''` to `xy_wap_embed_workflow_definition` in the documented schema and workflow runtime database type.
- Add the matching `ALTER TABLE` deployment statement to `docs/db/change-log.md`.
- Existing records read as an empty description through the column default.
- Add `description` to Workflow definition and summary response contracts.
- Add `PATCH /api/server/workflows/:workflowId/metadata` with `{ name, description }`.
- Keep the existing `/name` endpoint for compatibility, implemented through the same repository metadata update path.
- Rename the repository operation from name-only semantics to metadata update semantics across backend and web boundaries.

## Header Layout

The left header uses two compact rows.

First row:

- Runtime status badge.
- Vertical separator.
- Workflow title.
- Information icon when the description is non-empty; hover and keyboard focus show the full description in a tooltip.
- Edit icon for accounts with edit permission.

Status labels:

- `inactive`: `草稿`
- `active`: `执行中`
- `paused`: `已暂停`
- `stopped`: `已停止`

Second row:

- Cloud status icon and autosave state.
- Saved state shows only the formatted time (`已自动保存 HH:mm:ss`); saving and failed states retain their current behavior.
- Show `有尚未发布的修改` only when a published revision exists and the active draft differs from that revision.
- Do not repeat published timestamps in the left header.

The right-side history, publish, and overflow actions remain unchanged.

## Editing Interaction

- Replace inline title editing with a compact metadata dialog.
- The dialog edits both title and description.
- The title uses an Input and the description uses the existing Textarea component.
- Character counts are shown for both fields.
- Save is disabled for an empty title, an over-limit value, or while the request is pending.
- A successful update closes the dialog and updates the active document without reloading the canvas.
- A failed update keeps the dialog open and shows a user-facing error.
- Metadata editing is unavailable in historical-version preview or without edit permission.

## Error Handling

- Backend validates and trims both fields at the service boundary.
- Contracts enforce the same maximum lengths used by the UI.
- Repository conflicts and missing records use existing Workflow mutation error handling.
- The description tooltip is omitted for an empty description rather than showing an empty control.

## Verification

- Contract tests cover description fields and the 1000-character metadata request limit.
- Backend route, service, memory repository, and MySQL repository tests cover metadata persistence and compatibility of the existing name route.
- Web repository and document-hook tests cover metadata mapping and local state updates.
- Header behavior tests cover status labels, description tooltip, metadata editing, and unpublished-change visibility.
- Run contracts build/tests, backend build/tests, affected web tests, web build, and `git diff --check`.
