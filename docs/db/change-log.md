# Database Change Log

Manual database changes for the backend should be recorded here.

## 2026-06-01

- Added `xy_wap_embed_*` insight application tables for logical sessions, insight jobs, analysis runs, snapshots, quality/problem resolution, action items, evidence, seed-backed settings, and model provider/profile configuration.
- These tables are owned by the Node backend and are included in the backend writable table whitelist.

## 2026-06-04

- Added `xy_wap_embed_insight_rescan_task` for user-visible historical insight rescan task records and progress counters.
- Added nullable `rescan_task_id` to `xy_wap_embed_insight_job` so scan and reanalysis jobs can be associated with a rescan task.
- Added `xy_wap_embed_session_insight_current.idx_current_session_snapshot` to cover current pointer joins from session id to snapshot id.
- Rebuilt `xy_wap_embed_insight_job.idx_insight_job_runnable` as `(status ASC, run_after ASC, priority DESC, id ASC)` to match worker claim ordering.
- Added `xy_wap_embed_insight_job_archive` as the cold-storage target for succeeded or failed insight jobs before pruning the hot queue table.
- Changed `xy_wap_embed_session_sentiment.snapshot_id` from a non-unique secondary index to `uk_sentiment_snapshot_id` so each insight snapshot has at most one sentiment row.
- Added `xy_wap_embed_logical_session.idx_logical_session_uid_started` for overview and business-topic time-window queries.
- Added `xy_wap_embed_logical_session.next_close_at` and `idx_logical_session_status_next_close` so timeout-close scans can use a direct range condition instead of per-row duration expressions.
- Added `xy_wap_embed_insight_job.idx_insight_job_claim` for scoped worker job claims by target and job type.
- Added `xy_wap_embed_insight_rescan_task.idx_insight_rescan_task_uid_status` for active rescan checks.
- Added `xy_wap_embed_insight_evidence.idx_evidence_uid_session_snapshot` for detail evidence lookups scoped by uid, session, and snapshot.
- Added `xy_wap_embed_logical_session_message.idx_session_message_asset` for current-session asset hydration by session and message type.
- Added `uid` and tenant-first indexes to list/aggregate insight result tables (`xy_wap_embed_session_action_item`, `xy_wap_embed_session_tag`, `xy_wap_embed_session_entity`, `xy_wap_embed_session_intent`, `xy_wap_embed_session_faq_candidate`) so list and business insight queries can filter by tenant directly from result tables.

Manual migration for existing databases:

```sql
ALTER TABLE xy_wap_embed_session_action_item
  ADD COLUMN uid BIGINT UNSIGNED NULL COMMENT '租户UID' AFTER id;
ALTER TABLE xy_wap_embed_session_tag
  ADD COLUMN uid BIGINT UNSIGNED NULL COMMENT '租户UID' AFTER id;
ALTER TABLE xy_wap_embed_session_entity
  ADD COLUMN uid BIGINT UNSIGNED NULL COMMENT '租户UID' AFTER id;
ALTER TABLE xy_wap_embed_session_intent
  ADD COLUMN uid BIGINT UNSIGNED NULL COMMENT '租户UID' AFTER id;
ALTER TABLE xy_wap_embed_session_faq_candidate
  ADD COLUMN uid BIGINT UNSIGNED NULL COMMENT '租户UID' AFTER id;

UPDATE xy_wap_embed_session_action_item AS action
INNER JOIN xy_wap_embed_session_insight_snapshot AS snapshot
  ON snapshot.id = action.snapshot_id
INNER JOIN xy_wap_embed_logical_session AS session
  ON session.id = snapshot.session_id
SET action.uid = session.uid
WHERE action.uid IS NULL;

UPDATE xy_wap_embed_session_tag AS tag
INNER JOIN xy_wap_embed_session_insight_snapshot AS snapshot
  ON snapshot.id = tag.snapshot_id
INNER JOIN xy_wap_embed_logical_session AS session
  ON session.id = snapshot.session_id
SET tag.uid = session.uid
WHERE tag.uid IS NULL;

UPDATE xy_wap_embed_session_entity AS entity
INNER JOIN xy_wap_embed_session_insight_snapshot AS snapshot
  ON snapshot.id = entity.snapshot_id
INNER JOIN xy_wap_embed_logical_session AS session
  ON session.id = snapshot.session_id
SET entity.uid = session.uid
WHERE entity.uid IS NULL;

UPDATE xy_wap_embed_session_intent AS intent
INNER JOIN xy_wap_embed_session_insight_snapshot AS snapshot
  ON snapshot.id = intent.snapshot_id
INNER JOIN xy_wap_embed_logical_session AS session
  ON session.id = snapshot.session_id
SET intent.uid = session.uid
WHERE intent.uid IS NULL;

UPDATE xy_wap_embed_session_faq_candidate AS faq
INNER JOIN xy_wap_embed_session_insight_snapshot AS snapshot
  ON snapshot.id = faq.snapshot_id
INNER JOIN xy_wap_embed_logical_session AS session
  ON session.id = snapshot.session_id
SET faq.uid = session.uid
WHERE faq.uid IS NULL;

ALTER TABLE xy_wap_embed_session_action_item
  MODIFY COLUMN uid BIGINT UNSIGNED NOT NULL COMMENT '租户UID',
  ADD KEY idx_action_uid_status_id (uid, status, id);
ALTER TABLE xy_wap_embed_session_tag
  MODIFY COLUMN uid BIGINT UNSIGNED NOT NULL COMMENT '租户UID',
  ADD KEY idx_tag_uid_code_snapshot (uid, tag_code, snapshot_id);
ALTER TABLE xy_wap_embed_session_entity
  MODIFY COLUMN uid BIGINT UNSIGNED NOT NULL COMMENT '租户UID',
  ADD KEY idx_session_entity_uid_identity (uid, entity_type, entity_id, snapshot_id);
ALTER TABLE xy_wap_embed_session_intent
  MODIFY COLUMN uid BIGINT UNSIGNED NOT NULL COMMENT '租户UID',
  ADD KEY idx_session_intent_uid_code_snapshot (uid, intent_code, snapshot_id);
ALTER TABLE xy_wap_embed_session_faq_candidate
  MODIFY COLUMN uid BIGINT UNSIGNED NOT NULL COMMENT '租户UID',
  ADD KEY idx_faq_uid_status_snapshot (uid, status, snapshot_id);
```

- Removed the standalone `xy_wap_embed_session_risk` dimension. Risk attention is represented through QA findings, problem resolution, entity sentiment, and action items instead of a separate LLM output/table/API field.

Manual migration for existing databases:

```sql
DROP TABLE IF EXISTS xy_wap_embed_session_risk;
```

- Removed redundant secondary indexes after query-path review:
  - `xy_wap_embed_insight_job.idx_insight_job_runnable`, covered by scoped job claim queries using `idx_insight_job_claim`.
  - `xy_wap_embed_insight_evidence.idx_evidence_session_message`, `idx_evidence_conversation_message`, and `idx_evidence_source_message`, because current evidence reads use snapshot/dimension or uid/session/snapshot lookups.
  - `xy_wap_embed_logical_session.idx_logical_session_status_time`, replaced by `idx_logical_session_status_next_close` for close scans.
  - `xy_wap_embed_session_tag.idx_tag_code`, `xy_wap_embed_session_entity.idx_session_entity_identity`, and `xy_wap_embed_session_intent.idx_session_intent_code`, replaced by uid-prefixed result-table indexes after filter joins were made uid-scoped.

Manual migration for existing databases:

```sql
ALTER TABLE xy_wap_embed_insight_job
  DROP KEY idx_insight_job_runnable;

ALTER TABLE xy_wap_embed_insight_evidence
  DROP KEY idx_evidence_session_message,
  DROP KEY idx_evidence_conversation_message,
  DROP KEY idx_evidence_source_message;

ALTER TABLE xy_wap_embed_logical_session
  DROP KEY idx_logical_session_status_time;

ALTER TABLE xy_wap_embed_session_tag
  DROP KEY idx_tag_code;

ALTER TABLE xy_wap_embed_session_entity
  DROP KEY idx_session_entity_identity;

ALTER TABLE xy_wap_embed_session_intent
  DROP KEY idx_session_intent_code;
```

## 2026-06-07

- Removed `xy_wap_embed_session_summary.confidence`; summary confidence is no longer produced, parsed, or stored.

Manual migration for existing databases:

```sql
ALTER TABLE xy_wap_embed_session_summary
  DROP COLUMN confidence;
```

- Added `xy_wap_embed_insight_analysis_policy.min_analysis_messages` as the tenant-level minimum AI-ready message count before model analysis runs. Live jobs below the threshold skip snapshot creation; final/manual jobs below the threshold write a deterministic insufficient-information final snapshot.

Manual migration for existing databases:

```sql
ALTER TABLE xy_wap_embed_insight_analysis_policy
  ADD COLUMN min_analysis_messages INT UNSIGNED NOT NULL DEFAULT 5 COMMENT '触发模型分析的最少AI有效消息数'
  AFTER low_confidence_threshold;
```

- Added live-analysis scheduling indexes so open-session checks can find recent live runs and count AI-ready session messages by source-message watermark.

Manual migration for existing databases:

```sql
ALTER TABLE xy_wap_embed_analysis_run
  ADD KEY idx_analysis_run_live_watermark (session_id, mode, status, id);

ALTER TABLE xy_wap_embed_logical_session_message
  ADD KEY idx_session_message_ai_count (session_id, included_for_ai, meaningful_for_boundary, source_message_id);
```
