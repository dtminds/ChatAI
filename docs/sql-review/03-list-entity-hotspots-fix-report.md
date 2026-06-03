# 03 - listEntityHotspots Fix Report

## Review Validity

Valid. The original hotspot query left-joined `xy_wap_embed_session_risk` before grouping entities. Multiple risk rows per snapshot could inflate the intermediate entity result and force MySQL to compensate with `COUNT(DISTINCT ...)`.

## Fix Applied

- Removed the risk join from the top-10 entity hotspot query.
- Kept mention count, negative mention count, and session count in the primary grouped query.
- Added a second query that calculates high-risk session counts only for the returned top entity/type keys.
- Merged the high-risk counts back into the returned hotspot rows in application code.

## Notes

- The report's two-phase direction was accepted.
- The implementation filters the second query by a concatenated `entity_id:entity_type` key for the at-most-10 hotspot keys, which keeps the query bounded while fitting Kysely's typed expression model.

## Verification

- Covered indirectly by backend build and repository query refactor review.
- Verified with `pnpm --filter @chatai/backend build`.
