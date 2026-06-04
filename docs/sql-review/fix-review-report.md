# SQL Fix Review Report

**Reviewer**: Codex
**Date**: 2026-06-03
**Files reviewed**: `apps/backend/src/modules/insights/insights.repository.ts`, `apps/backend/src/modules/insights/insights.service.ts`

---

## Overall Verdict: PASS (with minor findings)

All 5 optimization items were addressed. The core strategy — removing one-to-many JOINs from list queries and replacing them with scoped aggregate/hydration follow-up queries — was correctly applied. Build passes. No regressions in API contracts.

---

## Per-Item Review

### 01 - listCurrentSessions — PASS

**What changed**:
- Main query reduced from 8 tables → 5 tables (current, snapshot, session, summary, problem_resolution).
- New `hydrateCurrentSessionAggregates` runs 3 parallel sub-queries:
  - Risk aggregation (GROUP BY snapshot_id with CASE expression for severity)
  - Open action count (GROUP BY snapshot_id, status = 'open')
  - Problem evidence messages (evidence LEFT JOIN msg_audit_info, filtered by dimension_type)
- New `hydrateCurrentSessionTopics` runs 4 parallel sub-queries for tags, entities, intents, assets — all scoped by `snapshot_id IN (...)`.

**Finding 1 — Dead code in mapCurrentSessionRows (LOW)**
`mapCurrentSessionRows` still contains logic checking `row.action_id`, `row.action_status`, `row.high_risk_id`, `row.risk_severity`, `row.negative_risk_id`, `row.evidence_message_id` (lines ~2634–2658). The new core query does not SELECT these fields, so these branches are dead code. The initial values set in the mapper (`highRiskCount: 0`, `negativeCount: 0`, `actionOpenCount: 0`, `problemEvidenceMessageIds: []`) are immediately overwritten by `hydrateCurrentSessionAggregates`, so no behavioral bug — but the dead branches are confusing for future readers.

**Recommendation**: Clean up `mapCurrentSessionRows` to remove the one-to-many deduplication logic, or add a comment explaining these fields are hydrated post-mapping.

**Finding 2 — Verify hydration call order (INFO)**
The call sequence is:
```
mapCurrentSessionRows(rows)          // sets riskSeverity: null, highRiskCount: 0, etc.
hydrateCurrentSessionAggregates(...) // overwrites with real values
Promise.all([
  hydrateCurrentSessionActors(...),
  hydrateCurrentSessionTopics(...),
])
```
This is correct — aggregates must run before actors/topics are not order-dependent. Good.

---

### 02 - findDetail — PASS

**What changed**:
- Main query reduced from 11 tables → 5 tables.
- QA findings loaded via `listQaFindings(snapshotId)` — single-table query.
- Risks loaded via `listRisks(snapshotId)` — single-table query.
- Action items loaded via `listSessionActionItems(snapshotId, ...)` — single-table query + `hydrateActionItemEvidence`.
- Contact/seat via `hydrateCurrentSessionActors` — already existed.
- All dimension sub-queries (sentiment, tags, entities, intents, faq) remain unchanged — still separate queries.

**Finding 3 — `listSessionActionItems` hydrates evidence using `rows` instead of `actionItems` (LOW)**
At line ~1564: `await this.hydrateActionItemEvidence(rows, actionItems)`. The `rows` parameter is the raw query rows (with `evidence_message_id: null` placeholders), not the mapped action items. `hydrateActionItemEvidence` extracts `snapshot_id` from `queryRows` to scope the evidence query. This works correctly because `snapshot_id` is populated on the raw rows. But the API is a bit confusing — passing both raw rows and mapped items. Consider having `hydrateActionItemEvidence` accept snapshotId directly.

**Finding 4 — `DetailQueryRow` is now identical to `CurrentSessionCoreQueryRow` (INFO)**
`type DetailQueryRow = CurrentSessionCoreQueryRow` — this is fine, just a type alias. No issue.

---

### 03 - listEntityHotspots — PASS

**What changed**:
- Main hotspot query: removed `LEFT JOIN risk`, so now 3 tables (entity → snapshot → session).
- New `listEntityHotspotRiskCounts` method: 4-table JOIN (entity → snapshot → session → risk with `risk_level = 'high'`), filtered by `concat(entity_id, ':', entity_type) IN (...)` for the top 10 entity keys.

**Finding 5 — concat-based IN filter is a pragmatic but non-ideal pattern (LOW)**
```sql
WHERE concat(entity.entity_id, ':', entity.entity_type) IN ('key1', 'key2', ...)
```
This prevents MySQL from using the `idx_session_entity_identity(entity_type, entity_id)` index because the concat wraps the columns. With only 10 keys this is negligible, but if the limit ever increases, a tuple-based `(entity_id, entity_type) IN ((...), (...))` approach would be more index-friendly.

**Recommendation**: Acceptable for current LIMIT 10. Document the limitation for future maintainers.

---

### 04 - listBusinessTopicFacts — PASS

**What changed**:
- `LIMIT 5000` → `LIMIT 500` in all three fact queries (tag, entity, intent).

**Finding 6 — LIMIT 500 is a reasonable quick win but the GROUP BY + ORDER BY pattern remains (INFO)**
The downstream `buildBusinessTopicCollections` keeps only top 12 per dimension. 500 rows is more than sufficient. The GROUP BY on 5 fields + filesort still occurs, but with 500 rows instead of 5000, temp-table memory pressure is ~10x lower. Good enough for now; the full two-phase rewrite can wait until profiling shows this is still a bottleneck.

**Finding 7 — New `listBusinessAssetFacts` not mentioned in original review (INFO)**
A new `listBusinessAssetFacts` method was added (L1131-1188). It joins `logical_session_message → logical_session → session_insight_current → msg_audit_info`, filters by `message_type IN ('link', 'miniapp', 'file')`, with `LIMIT 10_000`. This is a 4-table join with a high LIMIT. It parses content server-side to extract asset topics. The parsing and grouping happen in application code, which is fine, but the `LIMIT 10_000` on a 4-table join across `msg_audit_info` (the largest table) could be expensive for tenants with many sessions.

**Recommendation**: Consider adding `session_message.session_id IN (...)` scoping (pre-filter by known session IDs from `listCurrentSessions`) rather than scanning all session messages for the tenant. Or add a date-range filter matching the `from`/`to` filters.

---

### 05 - listActionItems — PASS

**What changed**:
- Main query: removed `LEFT JOIN evidence` and `LEFT JOIN msg_audit_info`, added `LEFT JOIN problem_resolution` (1:1, no inflation).
- New `hydrateActionItemEvidence`: batch-loads evidence for all action items via `snapshot_id IN (...) AND dimension_type = 'action_item'`, groups by `dimension_record_id` (action ID), merges evidence IDs + reason + timestamp back into action DTOs.

**Finding 8 — Still no LIMIT on listActionItems (LOW)**
The original review noted the absence of a LIMIT clause. The fix did not add one, noting "the current API contract does not expose pagination parameters." This is a valid reason, but for tenants with many sessions, the unbounded result set could still be large. Consider adding a reasonable server-side cap (e.g., 1000) even without client-facing pagination.

---

## Summary Table

| # | Item | Verdict | Findings |
|---|------|---------|----------|
| 1 | listCurrentSessions | **PASS** | Dead code in mapper (LOW), hydration order correct |
| 2 | findDetail | **PASS** | Minor API clarity on evidence hydration (LOW) |
| 3 | listEntityHotspots | **PASS** | concat-based IN filter (LOW, acceptable at LIMIT 10) |
| 4 | listBusinessTopicFacts | **PASS** | LIMIT 500 is good; new asset query has high LIMIT (INFO) |
| 5 | listActionItems | **PASS** | Still no result cap (LOW) |

## Recommendations for Follow-up

| Priority | Item | Action |
|----------|------|--------|
| LOW | Dead code cleanup | Remove one-to-many dedup logic from `mapCurrentSessionRows` |
| LOW | listActionItems LIMIT | Add server-side result cap (e.g., 1000) |
| MEDIUM | listBusinessAssetFacts | Scope by session IDs or date range to avoid full tenant scan |
| INFO | Entity hotspot IN filter | Document concat limitation; consider tuple IN if LIMIT increases |
