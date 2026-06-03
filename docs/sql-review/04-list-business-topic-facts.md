# 04 - listBusinessTagFacts / listBusinessEntityFacts / listBusinessIntentFacts

**Risk**: MEDIUM
**Status**: Pending
**File**: `apps/backend/src/modules/insights/insights.repository.ts` L942-1072

## Current SQL (three similar queries)

### listBusinessTagFacts

```sql
SELECT
  tag.tag_code    AS code,
  tag.tag_name    AS name,
  session.id      AS session_id,
  session.started_at AS started_at,
  tag.snapshot_id AS snapshot_id,
  COUNT(tag.id)   AS mention_count
FROM xy_wap_embed_session_tag AS tag
  INNER JOIN xy_wap_embed_session_insight_current AS current
    ON current.current_snapshot_id = tag.snapshot_id
  INNER JOIN xy_wap_embed_logical_session AS session
    ON session.id = current.session_id
WHERE session.uid = ?
  AND session.started_at >= ?
  AND session.started_at <= ?
GROUP BY tag.tag_code, tag.tag_name, session.id, session.started_at, tag.snapshot_id
ORDER BY COUNT(tag.id) DESC
LIMIT 5000
```

`listBusinessEntityFacts` and `listBusinessIntentFacts` follow the same pattern with `session_entity` and `session_intent` tables respectively.

## Problem

- **LIMIT 5000 hardcoded**: Returns up to 5000 rows per query, all fetched into application memory.
- **GROUP BY 5 fields + ORDER BY COUNT DESC**: Requires a temporary table + filesort for each query. Three queries run concurrently via `Promise.all`, tripling peak temp-table memory.
- **No session-level limit**: If a tenant has 1000 sessions, each with 10 tags, the query returns 10,000 tag-facts — far more than the downstream code needs (top 12 per dimension).
- The `session → current → tag` JOIN path is efficient (indexed), but the GROUP BY overhead grows linearly with data volume.

## Proposed Fix

### Option A: Reduce LIMIT + application-side dedup (quick win)

Change `LIMIT 5000` to `LIMIT 500`. The downstream `buildBusinessTopicCollections` only keeps the top 12 per dimension; 500 rows is more than sufficient to get accurate top-12 results even after cross-session aggregation.

### Option B: Two-phase approach (more thorough)

**Phase 1**: Get relevant session IDs (reuse `listCurrentSessions` result if already called)

```sql
SELECT session.id, session.started_at
FROM xy_wap_embed_session_insight_current AS current
  INNER JOIN xy_wap_embed_logical_session AS session
    ON session.id = current.session_id
WHERE session.uid = ?
  AND session.started_at >= ?
  AND session.started_at <= ?
```

**Phase 2**: For each session, fetch tags/entities/intents without GROUP BY:

```sql
SELECT tag_code, tag_name, snapshot_id
FROM xy_wap_embed_session_tag
WHERE snapshot_id IN (?, ?, ?, ...)
```

Aggregate in code: build a `Map<code, {count, sessions}>` in memory. This avoids the MySQL temp-table + filesort entirely.

### Option C: Add a materialized summary table (long-term)

If the insights overview page becomes a hot path, consider a periodic aggregation table:

```sql
CREATE TABLE xy_wap_embed_topic_summary (
  uid BIGINT UNSIGNED NOT NULL,
  dimension VARCHAR(32) NOT NULL,   -- 'tag' | 'entity' | 'intent'
  code VARCHAR(128) NOT NULL,
  name VARCHAR(128) NOT NULL,
  mention_count INT UNSIGNED NOT NULL,
  session_count INT UNSIGNED NOT NULL,
  snapshot_date DATE NOT NULL,
  ...
  PRIMARY KEY (uid, dimension, code, snapshot_date)
);
```

Refreshed by a background job after each analysis run.

## Expected Impact

- **Option A**: 10x reduction in rows returned (500 vs 5000), minimal code change.
- **Option B**: Eliminates MySQL GROUP BY + ORDER BY entirely; code-side aggregation is O(N) with small N.
- **Option C**: Best long-term performance for high-traffic tenants, but adds operational complexity.
