# README Fix Report

## Verification Result

- `README.md` is an overview/status index, not an independent SQL hotspot report.
- The five numbered SQL review files referenced by the index all map to current methods in `apps/backend/src/modules/insights/insights.repository.ts`.
- The listed one-to-many join risks were valid for `listCurrentSessions`, `findDetail`, `listEntityHotspots`, and `listActionItems`.
- The business topic item was partially valid: the hardcoded `LIMIT 5000` and temp-table pressure were real, while the full two-phase rewrite is broader than needed for the current downstream top-12 use case.

## Fix Summary

- Kept API contracts and response DTO shape unchanged.
- Split confirmed row-multiplying queries into core queries plus scoped aggregate/evidence follow-up queries.
- Reduced business topic fact limits from 5000 to 500 as the documented quick-win path.
- Added repository tests covering the main query de-joins and bounded evidence/aggregate hydration.

## Verification

- Focused repository test: `pnpm --filter @chatai/backend test test/modules/insights/insights-repository.test.ts`
- Backend build: `pnpm --filter @chatai/backend build`
