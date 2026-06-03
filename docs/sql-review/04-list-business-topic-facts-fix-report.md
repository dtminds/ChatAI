# 04 - listBusinessTagFacts / listBusinessEntityFacts / listBusinessIntentFacts Fix Report

## Review Validity

Partially valid. The hardcoded `LIMIT 5000` and grouped `ORDER BY count(...)` pressure are real. The full two-phase application aggregation would be a larger behavior and data-flow change than required because downstream code currently keeps only top topic collections.

## Fix Applied

- Applied the quick-win recommendation from the report.
- Reduced each fact query limit from `5000` to `500`:
  - `listBusinessTagFacts`
  - `listBusinessEntityFacts`
  - `listBusinessIntentFacts`
- Follow-up review also identified asset topic scanning as a related hot path. `listBusinessAssetFacts` now first resolves the filtered current-session scope, then scans asset messages by `session_id IN (...)` and `current_snapshot_id IN (...)` instead of tenant-wide message scope.

## Notes

- The deeper two-phase rewrite and materialized summary option were not implemented in this pass.
- This keeps the existing fact row shape and downstream `buildBusinessTopicCollections` behavior stable while reducing row volume by 90%.
- Asset message scanning keeps application-side parsing, but its row limit is now `2000` after pre-scoping to matched sessions.

## Verification

- Covered by `scopes business asset facts to sessions matched by the overview filters`.
- Verified with `pnpm --filter @chatai/backend test test/modules/insights/insights-repository.test.ts`.
- Verified with `pnpm --filter @chatai/backend build`.
