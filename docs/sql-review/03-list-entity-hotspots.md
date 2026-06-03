# 03 - listEntityHotspots

**Risk**: MEDIUM
**Status**: Pending
**File**: `apps/backend/src/modules/insights/insights.repository.ts` L1129-1165

## Current SQL (via Kysely)

```sql
SELECT
  entity.entity_id,
  entity.entity_name,
  entity.entity_type,
  COUNT(entity.id)              AS mention_count,
  COUNT(CASE WHEN entity.sentiment = 'negative' THEN 1 END)
                                AS negative_count,
  COUNT(DISTINCT CASE WHEN risk.risk_level = 'high'
                      THEN session.id END)
                                AS risk_session_count,
  COUNT(DISTINCT session.id)    AS session_count
FROM xy_wap_embed_session_entity AS entity
  INNER JOIN xy_wap_embed_session_insight_snapshot AS snapshot
    ON snapshot.id = entity.snapshot_id
  INNER JOIN xy_wap_embed_logical_session AS session
    ON session.id = snapshot.session_id
  LEFT JOIN xy_wap_embed_session_risk AS risk
    ON risk.snapshot_id = snapshot.id
WHERE session.uid = ?
GROUP BY entity.entity_id, entity.entity_name, entity.entity_type
ORDER BY COUNT(entity.id) DESC
LIMIT 10
```

## Problem

- **LEFT JOIN risk causes row inflation**: A snapshot with 3 risk records multiplies every entity row by 3x before GROUP BY. The `COUNT(DISTINCT ...)` compensates but MySQL must still process the inflated intermediate result.
- **Full scan before LIMIT**: MySQL must complete the JOIN + GROUP BY for the entire uid scope before it can ORDER BY and LIMIT 10. With many sessions, this is expensive.
- `session_entity` has no direct `session_id` column; it only has `snapshot_id`, requiring the snapshot → session JOIN.

## Proposed Fix

Split into 2 queries:

### Query 1: Top 10 entity hotspots (without risk)

```sql
SELECT
  entity.entity_id,
  entity.entity_name,
  entity.entity_type,
  COUNT(entity.id)           AS mention_count,
  COUNT(CASE WHEN entity.sentiment = 'negative' THEN 1 END)
                             AS negative_count,
  COUNT(DISTINCT session.id) AS session_count
FROM xy_wap_embed_session_entity AS entity
  INNER JOIN xy_wap_embed_session_insight_snapshot AS snapshot
    ON snapshot.id = entity.snapshot_id
  INNER JOIN xy_wap_embed_logical_session AS session
    ON session.id = snapshot.session_id
WHERE session.uid = ?
GROUP BY entity.entity_id, entity.entity_name, entity.entity_type
ORDER BY COUNT(entity.id) DESC
LIMIT 10
```

### Query 2: Risk session count for those entities

After obtaining the top 10 entity (entity_id, entity_type) pairs:

```sql
SELECT
  entity.entity_id,
  COUNT(DISTINCT session.id) AS risk_session_count
FROM xy_wap_embed_session_entity AS entity
  INNER JOIN xy_wap_embed_session_insight_snapshot AS snapshot
    ON snapshot.id = entity.snapshot_id
  INNER JOIN xy_wap_embed_logical_session AS session
    ON session.id = snapshot.session_id
  INNER JOIN xy_wap_embed_session_risk AS risk
    ON risk.snapshot_id = snapshot.id
    AND risk.risk_level = 'high'
WHERE session.uid = ?
  AND (entity.entity_id, entity.entity_type) IN ((?, ?), (?, ?), ...)
GROUP BY entity.entity_id
```

## Expected Impact

- Query 1 runs without the risk JOIN, processing far fewer intermediate rows.
- Query 2 only scans for risk associations for the 10 specific entities found, not all entities.
- Both queries can run independently; Query 2 is optional (can be skipped if risk count is not critical for the UI).
