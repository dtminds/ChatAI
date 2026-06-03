# 01 - listCurrentSessions Fix Report

## Review Validity

Valid. The original query joined `risk`, `action_item`, `insight_evidence`, and `msg_audit_info` into the current-session core query. Because risks, actions, and evidences are one-to-many by snapshot, the query could multiply rows before `mapCurrentSessionRows` deduplicated them in application code.

## Fix Applied

- Removed one-to-many joins from the core current-session query.
- Kept the core query to current snapshot, logical session, summary, and problem-resolution data.
- Added scoped follow-up aggregation by `snapshot_id` for:
  - risk totals, high-risk totals, and deterministic highest risk severity
  - open action-item counts
  - problem-resolution evidence message IDs and latest customer-message timestamp
- Kept actor and topic hydration behavior unchanged.

## Notes

- The report's proposed split was accepted.
- `riskSeverity` is now derived deterministically from aggregate risk levels instead of whichever joined risk row happened to seed the mapper.
- The evidence query uses a left join to `msg_audit_info` so evidence IDs are preserved even if message hydration is missing.

## Verification

- Covered by `loads current sessions without joining one-to-many insight tables in the core query`.
- Verified with `pnpm --filter @chatai/backend test test/modules/insights/insights-repository.test.ts`.
- Verified with `pnpm --filter @chatai/backend build`.
