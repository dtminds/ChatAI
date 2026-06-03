# 05 - listActionItems Fix Report

## Review Validity

Valid. The original action-item query left-joined evidence and `msg_audit_info`, so action items with multiple evidence rows could return multiple rows before `mapActionItemRows` deduplicated them. The message join was only needed for `lastCustomerMessageAt`.

## Fix Applied

- Removed evidence and message joins from the main action-item query.
- Kept the main query scoped to action item, snapshot, logical session, and problem-resolution status.
- Added bounded evidence hydration for the returned action items using `snapshot_id IN (...)` and `dimension_type = 'action_item'`.
- Merged evidence message IDs, the first non-empty reason, and latest evidence timestamp back into action DTO rows.
- Kept existing customer hydration through `hydrateActionItemCustomers`.
- Follow-up review requested a bounded main result set, so the main action-item query now applies a server-side cap of `1000` rows before evidence hydration.

## Notes

- The report's split-query recommendation was accepted.
- The evidence query uses a left join to `msg_audit_info` so evidence IDs are preserved even when a message timestamp cannot be hydrated.
- The API still does not expose pagination parameters; the cap is a defensive server-side guard for the current contract.

## Verification

- Covered by `loads action-item evidence with a bounded follow-up query`.
- Covered by `caps action item rows before evidence hydration`.
- Verified with `pnpm --filter @chatai/backend test test/modules/insights/insights-repository.test.ts`.
- Verified with `pnpm --filter @chatai/backend build`.
