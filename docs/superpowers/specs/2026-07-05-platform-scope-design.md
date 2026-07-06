# Platform Scope Design

## Context

Issue #385 originally proposed adding `platform` to the JWT so backend business paths would no longer query `xy_wap_embed_sub_user` for `uid/platform`. That fixes the repeated lookup cost, but keeps the wrong domain model: `platform` is not a sub-account identity property.

The current workbench only supports the WeCom provider backed by platform `5`. There is no UI affordance for choosing provider or platform, and mixing other platform rows into current settings/workbench pages would be incorrect.

## Decision

- JWT and authenticated user context remain limited to account identity: `subUserId`, `uid`, session fields, and roles.
- Backend services must not derive `platform` from `xy_wap_embed_sub_user`.
- Entrypoints without a platform selector use the current workbench default platform scope: `platform = 5`.
- Code must not scatter magic `5` literals through services. It should go through a shared resolver/constant so a future provider selector can replace the source.
- Operations already anchored to a concrete resource, such as a conversation, seat, or message, continue to use that resource's stored platform.

## Current Platform Scope

The current product scope is:

```ts
type WorkbenchPlatformScope = {
  platform: 5;
};
```

The scope represents the current WeCom Provider A workbench. It is not a tenant identity claim and must not be read from `sub_user`.

## Affected Paths

### Settings Managed Accounts

Managed account list, relation updates, and group sync operate in `uid + platform=5` scope. Java sync calls use the same resolved workbench scope for now because the route has no platform selector and the target managed account must be in the same scope.

### Settings Sub Accounts

Sub-account identity is tenant-scoped by `uid`. Seat binding remains constrained to current workbench platform `5`, and relation table writes keep the current `platform` column for compatibility.

### AI Hosting Settings

Hosting settings list and update operate on seats in `uid + platform=5`. Agent and KB ownership remain `uid`-scoped.

### Workbench Seats And All-Customer Views

List seats and all-customer views operate in the current workbench platform `5`. Seat access cache must not rely on `sub_user.platform`; it can store the current workbench scope explicitly.

### Sidebar Items

Sidebar item settings currently have no platform selector and are used by the current workbench. They remain scoped to `uid + platform=5`. Future provider support should add a selector or route-level integration context before changing this behavior.

## Future Evolution

When the product supports provider B or other IM channels, the shared resolver becomes the extension point. It can read a route parameter, user selection, or integration instance instead of returning the default platform. Services should continue to consume a scope object and should not need broad rewrites.

## Acceptance Criteria

- No business path in issue #385 queries `xy_wap_embed_sub_user` solely to resolve `platform`.
- JWT payload and contract do not gain `platform`.
- Current no-selector pages filter platform-scoped resources by the shared default platform scope.
- Regression tests cover same-`uid` data on another platform not leaking into current pages.
- Existing resource-anchored operations continue to use the resource platform rather than the default scope when a resource row already supplies platform.
