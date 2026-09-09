# Workflow Canvas Header Design

## Goal

Make Workflow editing feel like an in-app workspace: opening an existing Workflow stays in the current browser tab, and the canvas uses a dedicated header matching the supplied reference structure.

## Navigation

- The list row's `编辑` link navigates to `/chat/workflows/:workflowId` in the current tab.
- The canvas back button navigates to `/chat/workflows` through React Router.
- Creating a Workflow remains unchanged because the request only changes the existing-item edit path.

## Header Structure

The editor uses a full-width white header above the canvas instead of controls floating over the canvas.

- Left: back button, Workflow name, rename icon, and autosave status on a second line.
- Right: version-history icon button, primary publish button, and an overflow menu.
- The publish-check action moves into the overflow menu and continues to show its ready/total count.
- Existing version preview actions remain available. Preview mode identifies the selected version and retains restore and exit controls.

The implementation uses existing ChatAI `Button`, `DropdownMenu`, and Hugeicons components. Dimensions and responsive behavior follow project tokens rather than screenshot pixels.

## Rename Interaction

- Selecting the edit icon replaces the name with a compact inline input.
- `Enter` submits a non-empty trimmed name; `Escape` cancels; blur cancels without changing the name.
- While the repository request is pending, duplicate submissions are blocked.
- A successful rename updates the active document name without reloading the editor.
- A failed rename keeps the editor usable and shows a user-facing error toast.
- Rename is unavailable while previewing a historical version or when the current account cannot edit.

The rename request uses the existing `WorkflowDraftRepository.renameDocument` operation.

## Existing State Preservation

- Autosave states remain distinguishable: saved, saving, and failed with retry.
- Publish availability, publish checks, conflict reload, published state, and version history keep their current behavior.
- The canvas, inspector, checks panel, and version panel keep their existing ownership boundaries.
- The header must not overlap the canvas or resize when status labels change.

## Responsive Behavior

The name region can shrink and truncate while the action region remains usable. On narrow screens, secondary actions stay in the overflow menu and the header may wrap internally without covering the canvas.

## Verification

- Update the workflow page test to prove that `编辑` has no new-tab target and routes to the editor.
- Add behavior coverage for inline rename success, cancellation, failure, and permission/preview restrictions where those paths are not already protected.
- Update top-bar lifecycle tests to cover the relocated publish-check and version-history actions without asserting visual classes or ordinary copy.
- Run the affected Workflow Vitest files, `corepack pnpm --filter @chatai/web build`, and `git diff --check`.
