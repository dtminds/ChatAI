# 02 - findDetail

**Risk**: HIGH
**Status**: Pending
**File**: `apps/backend/src/modules/insights/insights.repository.ts` L1194-1379

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
  LEFT JOIN xy_wap_embed_session_qa_finding AS qa
    ON qa.snapshot_id = snapshot.id
  LEFT JOIN xy_wap_embed_session_risk AS risk
    ON risk.snapshot_id = snapshot.id
  LEFT JOIN xy_wap_embed_session_action_item AS action
    ON action.snapshot_id = snapshot.id
  LEFT JOIN xy_wap_embed_insight_evidence AS evidence
    ON evidence.snapshot_id = snapshot.id
    AND evidence.dimension_type = 'problem_resolution'
  LEFT JOIN xy_wap_embed_msg_audit_info AS message
    ON message.id = evidence.source_message_id
  LEFT JOIN xy_wap_embed_contact AS contact
    ON contact.uid = session.uid
    AND contact.third_external_userid = message.third_external_id
  LEFT JOIN xy_wap_embed_user_seat AS seat
    ON seat.uid = session.uid
    AND seat.third_userid = message.third_user_id
WHERE session.uid = ?
  AND session.id = ?
```

## Problem

- **11 tables in a single query** — the most complex query in the module.
- **Cartesian product explosion**:
  - `qa_finding` has N rows per snapshot (one per rule).
  - `risk` has M rows per snapshot (one per risk type).
  - `action_item` has K rows per snapshot (one per action).
  - Result = N x M x K rows per session, deduplicated in code via `uniqueBy`.
- **Deep JOIN chain**: `session → snapshot → evidence → message → contact/seat` creates a 6-table join path for contact/seat resolution, which is only used to get `customer_name` and `agent_name`.
- **Redundant queries downstream**: The code already calls separate queries after this:
  - `listDimensionEvidence` (separate query)
  - `listSentiment`, `listTags`, `listEntities`, `listIntents`, `listFaqCandidates` (all separate queries)
  - `listEvidenceMessageRecords`, `listSessionMessageRecords` (separate queries)
  - `hydrateCurrentSessionActors` (separate query for contact/seat)
- This means the main query's qa_finding, risk, action_item, and contact/seat JOINs are **partially redundant** — much of this data is re-fetched or re-processed downstream.

## Proposed Fix

Split into 5 focused queries:

### Query 1: Core session + snapshot + summary + problem (5 tables, 1:1)

```sql
SELECT
  current.current_snapshot_id,
  session.id AS session_id,
  session.conversation_id,
  session.started_at,
  session.ended_at,
  session.uid,
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
  AND session.id = ?
```

### Query 2: QA findings (already exists as `listTags` pattern)

```sql
SELECT id, rule_code, passed, reason, severity
FROM xy_wap_embed_session_qa_finding
WHERE snapshot_id = ?
```

### Query 3: Risks

```sql
SELECT id, risk_level, risk_type, reason
FROM xy_wap_embed_session_risk
WHERE snapshot_id = ?
```

### Query 4: Action items with evidence

```sql
SELECT
  action.id AS action_id,
  action.action_type,
  action.priority,
  action.status AS action_status,
  action.title,
  evidence.reason,
  evidence.source_message_id AS evidence_message_id,
  message.msgtime AS last_customer_message_at
FROM xy_wap_embed_session_action_item AS action
  LEFT JOIN xy_wap_embed_insight_evidence AS evidence
    ON evidence.snapshot_id = action.snapshot_id
    AND evidence.dimension_record_id = action.id
    AND evidence.dimension_type = 'action_item'
  LEFT JOIN xy_wap_embed_msg_audit_info AS message
    ON message.id = evidence.source_message_id
WHERE action.snapshot_id = ?
```

### Query 5: Contact/seat hydration

Already implemented as `hydrateCurrentSessionActors` — reuse it directly instead of JOINing in the main query.

## Expected Impact

- Eliminates 11-table Cartesian product completely.
- Each query is precise and returns bounded results.
- Removes redundant contact/seat JOINs (already handled by `hydrateCurrentSessionActors`).
- QA, risk, and action queries use snapshot_id PK lookup — near-instant.
- Enables independent caching of qa_findings and risks per snapshot.
