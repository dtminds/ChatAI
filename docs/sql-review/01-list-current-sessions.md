# 01 - listCurrentSessions

**Risk**: HIGH
**Status**: Pending
**File**: `apps/backend/src/modules/insights/insights.repository.ts` L840-918

## Current SQL (via Kysely)

```sql
SELECT ...
FROM xy_wap_embed_session_insight_current AS current
  INNER JOIN xy_wap_embed_session_insight_snapshot AS snapshot
    ON snapshot.id = current.current_snapshot_id
  INNER JOIN xy_wap_embed_logical_session AS session
    ON session.id = current.session_id
  LEFT JOIN xy_wap_embed_session_summary AS summary
    ON summary.snapshot_id = snapshot.id
  LEFT JOIN xy_wap_embed_session_problem_resolution AS problem
    ON problem.snapshot_id = snapshot.id
  LEFT JOIN xy_wap_embed_session_risk AS risk
    ON risk.snapshot_id = snapshot.id
  LEFT JOIN xy_wap_embed_session_action_item AS action
    ON action.snapshot_id = snapshot.id
  LEFT JOIN xy_wap_embed_insight_evidence AS evidence
    ON evidence.snapshot_id = snapshot.id
    AND evidence.dimension_type = 'problem_resolution'
  LEFT JOIN xy_wap_embed_msg_audit_info AS message
    ON message.id = evidence.source_message_id
WHERE session.uid = ?
  AND session.started_at >= ?
  AND session.started_at <= ?
```

## Problem

- **Cartesian product**: `risk`, `action_item`, `evidence` each have multiple rows per snapshot.
  - Example: 3 risks x 2 actions x 2 evidences = **12 rows per session**, deduplicated in `mapCurrentSessionRows`.
- **Large table JOIN**: `xy_wap_embed_msg_audit_info` is the largest table in the system.
  - Only `message.msgtime` is used (for `lastCustomerMessageAt`), but the entire row is scanned.
- **No LIMIT**: returns all sessions for the tenant within the date range.
- **Called frequently**: this is the main query for the Overview page, and also used by `getQuality` and `getBusiness`.

## Proposed Fix

Split into 3 independent queries, assemble in code:

### Query 1: Core session data (5 tables, 1:1, no row explosion)

```sql
SELECT
  current.current_snapshot_id,
  session.id AS session_id,
  session.conversation_id,
  session.started_at,
  session.ended_at,
  session.last_message_at,
  session.message_count,
  session.customer_message_count,
  session.agent_message_count,
  snapshot.phase,
  snapshot.status,
  summary.customer_intent,
  summary.process_summary,
  summary.result_summary,
  summary.follow_up,
  problem.problem_detected,
  problem.problem_summary,
  problem.resolution_status,
  problem.unresolved_reason
FROM xy_wap_embed_session_insight_current AS current
  INNER JOIN xy_wap_embed_session_insight_snapshot AS snapshot
    ON snapshot.id = current.current_snapshot_id
  INNER JOIN xy_wap_embed_logical_session AS session
    ON session.id = current.session_id
  LEFT JOIN xy_wap_embed_session_summary AS summary
    ON summary.snapshot_id = snapshot.id
  LEFT JOIN xy_wap_embed_session_problem_resolution AS problem
    ON problem.snapshot_id = snapshot.id
WHERE session.uid = ?
  AND session.started_at >= ?
  AND session.started_at <= ?
```

### Query 2: Risk aggregation per snapshot

```sql
SELECT
  snapshot_id,
  COUNT(*) AS total_risks,
  COUNT(CASE WHEN risk_level = 'high' THEN 1 END) AS high_risk_count
FROM xy_wap_embed_session_risk
WHERE snapshot_id IN (?, ?, ?, ...)
GROUP BY snapshot_id
```

### Query 3: Open action count per snapshot

```sql
SELECT
  snapshot_id,
  COUNT(*) AS open_action_count
FROM xy_wap_embed_session_action_item
WHERE snapshot_id IN (?, ?, ?, ...)
  AND status = 'open'
GROUP BY snapshot_id
```

### Query 4 (optional): Problem evidence messages

```sql
SELECT
  evidence.snapshot_id,
  evidence.source_message_id AS evidence_message_id,
  evidence.evidence_role,
  message.msgtime AS last_customer_message_at
FROM xy_wap_embed_insight_evidence AS evidence
  INNER JOIN xy_wap_embed_msg_audit_info AS message
    ON message.id = evidence.source_message_id
WHERE evidence.snapshot_id IN (?, ?, ?, ...)
  AND evidence.dimension_type = 'problem_resolution'
```

## Expected Impact

- Eliminates Cartesian product: each sub-query returns at most N rows (N = number of sessions).
- Removes unnecessary msg_audit_info JOIN from the main query (saves scanning the largest table).
- Each sub-query uses `snapshot_id IN (...)` which is index-friendly.
- Enables caching: risk/action aggregation can be cached per snapshot_id independently.
