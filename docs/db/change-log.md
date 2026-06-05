# Database Change Log

Manual database changes for the backend should be recorded here.

## 2026-06-01

- Added `xy_wap_embed_*` insight application tables for logical sessions, insight jobs, analysis runs, snapshots, quality/problem resolution, risks, action items, evidence, seed-backed settings, and model provider/profile configuration.
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
