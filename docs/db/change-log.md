# Database Change Log

Manual database changes for the backend should be recorded here.

## 2026-06-01

- Added `xy_wap_embed_*` insight application tables for logical sessions, insight jobs, analysis runs, snapshots, quality/problem resolution, risks, action items, evidence, seed-backed settings, and model provider/profile configuration.
- These tables are owned by the Node backend and are included in the backend writable table whitelist.

## 2026-06-04

- Added `xy_wap_embed_insight_rescan_task` for user-visible historical insight rescan task records and progress counters.
- Added nullable `rescan_task_id` to `xy_wap_embed_insight_job` so scan and reanalysis jobs can be associated with a rescan task.
