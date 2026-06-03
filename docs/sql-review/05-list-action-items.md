# 05 - listActionItems

**Risk**: MEDIUM
**Status**: Pending
**File**: `apps/backend/src/modules/insights/insights.repository.ts` L1074-1127

## Current SQL (via Kysely)

```sql
SELECT
  action.id           AS action_id,
  action.action_type  AS action_type,
  action.priority     AS priority,
  action.status       AS action_status,
  action.title        AS title,
  evidence.reason     AS reason,
  evidence.source_message_id AS evidence_message_id,
  message.msgtime     AS last_customer_message_at,
  session.conversation_id AS conversation_id,
  session.id          AS session_id
FROM xy_wap_embed_session_action_item AS action
  INNER JOIN xy_wap_embed_session_insight_snapshot AS snapshot
    ON snapshot.id = action.snapshot_id
  INNER JOIN xy_wap_embed_logical_session AS session
    ON session.id = snapshot.session_id
  LEFT JOIN xy_wap_embed_insight_evidence AS evidence
    ON evidence.snapshot_id = snapshot.id
    AND evidence.dimension_record_id = action.id
    AND evidence.dimension_type = 'action_item'
  LEFT JOIN xy_wap_embed_msg_audit_info AS message
    ON message.id = evidence.source_message_id
WHERE session.uid = ?
  [AND action.status = ?]
  [AND action.priority = ?]
  [AND action.action_type = ?]
```

## Problem

- **No LIMIT clause**: Returns all action items for the entire tenant. If a tenant has 1000 sessions × 3 actions each = 3000 rows + evidence inflation.
- **Evidence LEFT JOIN row inflation**: An action item can have multiple evidence records (evidence_role = 'primary', 'supporting', etc.), causing multiple rows per action item. The code deduplicates via `mapActionItemRows`.
- **msg_audit_info LEFT JOIN**: The largest table is joined only to get `message.msgtime` for `lastCustomerMessageAt`. This is a heavy join for a single column.
- **Additional downstream queries**: `hydrateActionItemCustomers` is called after this query, fetching `conversation → contact` data separately — the evidence → message → customer path in the main query is not used for customer info.

## Proposed Fix

Split into 2 queries:

### Query 1: Action items with session info (no evidence/message JOIN)

```sql
SELECT
  action.id           AS action_id,
  action.action_type  AS action_type,
  action.priority     AS priority,
  action.status       AS action_status,
  action.title        AS title,
  action.snapshot_id  AS snapshot_id,
  session.conversation_id AS conversation_id,
  session.id          AS session_id
FROM xy_wap_embed_session_action_item AS action
  INNER JOIN xy_wap_embed_session_insight_snapshot AS snapshot
    ON snapshot.id = action.snapshot_id
  INNER JOIN xy_wap_embed_logical_session AS session
    ON session.id = snapshot.session_id
WHERE session.uid = ?
  [AND action.status = ?]
  [AND action.priority = ?]
  [AND action.action_type = ?]
```

### Query 2: Evidence messages for those action items

```sql
SELECT
  evidence.dimension_record_id AS action_id,
  evidence.reason,
  evidence.source_message_id AS evidence_message_id,
  message.msgtime AS last_customer_message_at
FROM xy_wap_embed_insight_evidence AS evidence
  INNER JOIN xy_wap_embed_msg_audit_info AS message
    ON message.id = evidence.source_message_id
WHERE evidence.snapshot_id IN (?, ?, ?, ...)
  AND evidence.dimension_type = 'action_item'
```

The `snapshot_id IN (...)` list is derived from Query 1 results.

## Index Note

The evidence query benefits from the existing index:
```
idx_evidence_dimension(snapshot_id, dimension_type, dimension_record_id)
```
which covers the `WHERE snapshot_id IN (...) AND dimension_type = 'action_item'` filter perfectly.

## Expected Impact

- Removes the `msg_audit_info` JOIN from the main action-items query (saves scanning the largest table for every action item).
- Evidence query is scoped to only the relevant snapshot_ids, not all sessions.
- Enables adding LIMIT to Query 1 if the API supports pagination.
- Each query is independently cacheable.
