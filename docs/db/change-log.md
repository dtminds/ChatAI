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

- Replaced `xy_wap_embed_session_summary.customer_intent/process_summary/result_summary/follow_up` with `session_title/summary_text`. Runtime code now reads and writes the new summary shape only.

Manual migration for existing databases:

```sql
ALTER TABLE xy_wap_embed_session_summary
  ADD COLUMN session_title VARCHAR(255) NULL COMMENT '会话短标题' AFTER snapshot_id,
  ADD COLUMN summary_text VARCHAR(2048) NULL COMMENT '会话摘要正文' AFTER session_title;

UPDATE xy_wap_embed_session_summary
SET
  session_title = COALESCE(LEFT(NULLIF(TRIM(customer_intent), ''), 255), ''),
  summary_text = COALESCE(
    LEFT(
      NULLIF(
        CONCAT_WS(
          '；',
          NULLIF(TRIM(customer_intent), ''),
          NULLIF(TRIM(process_summary), ''),
          NULLIF(TRIM(result_summary), '')
        ),
        ''
      ),
      2048
    ),
    ''
  );

ALTER TABLE xy_wap_embed_session_summary
  MODIFY COLUMN session_title VARCHAR(255) NOT NULL COMMENT '会话短标题',
  MODIFY COLUMN summary_text VARCHAR(2048) NOT NULL COMMENT '会话摘要正文',
  DROP COLUMN customer_intent,
  DROP COLUMN process_summary,
  DROP COLUMN result_summary,
  DROP COLUMN follow_up;
```

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

- Expanded `xy_wap_embed_session_action_item` so manual todos and AI todos share one session-scoped table. Todos now store the platform conversation, logical session, source type, operator audit fields, and terminal timestamps directly; `session_id` is required because manual todo creation must be anchored to an existing logical session.

Manual migration for existing databases:

```sql
ALTER TABLE xy_wap_embed_session_action_item
  ADD COLUMN conversation_id BIGINT UNSIGNED NULL COMMENT '平台会话ID' AFTER uid,
  MODIFY COLUMN snapshot_id BIGINT UNSIGNED NULL COMMENT 'AI来源洞察快照ID',
  ADD COLUMN session_id BIGINT UNSIGNED NULL COMMENT '逻辑会话ID' AFTER conversation_id,
  ADD COLUMN source_type VARCHAR(32) NOT NULL DEFAULT 'ai' COMMENT '来源，ai：AI生成，manual：人工创建' AFTER snapshot_id,
  ADD COLUMN created_by_sub_user_id BIGINT UNSIGNED NULL COMMENT '创建子账号ID' AFTER source_type,
  ADD COLUMN updated_by_sub_user_id BIGINT UNSIGNED NULL COMMENT '最后更新子账号ID' AFTER created_by_sub_user_id,
  ADD COLUMN completed_by_sub_user_id BIGINT UNSIGNED NULL COMMENT '完成人子账号ID' AFTER updated_by_sub_user_id,
  ADD COLUMN completed_at DATETIME NULL COMMENT '完成时间' AFTER completed_by_sub_user_id,
  ADD COLUMN dismissed_at DATETIME NULL COMMENT '忽略时间' AFTER completed_at;

UPDATE xy_wap_embed_session_action_item AS action
INNER JOIN xy_wap_embed_session_insight_snapshot AS snapshot
  ON snapshot.id = action.snapshot_id
INNER JOIN xy_wap_embed_logical_session AS session
  ON session.id = snapshot.session_id
SET
  action.conversation_id = session.conversation_id,
  action.session_id = session.id,
  action.source_type = 'ai'
WHERE action.session_id IS NULL;

ALTER TABLE xy_wap_embed_session_action_item
  MODIFY COLUMN conversation_id BIGINT UNSIGNED NOT NULL COMMENT '平台会话ID',
  MODIFY COLUMN session_id BIGINT UNSIGNED NOT NULL COMMENT '逻辑会话ID',
  ADD KEY idx_action_uid_conversation_status (uid, conversation_id, status, id),
  ADD KEY idx_action_uid_session_status (uid, session_id, status);
```
