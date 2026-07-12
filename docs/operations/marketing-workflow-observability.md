# Marketing Workflow Observability

## Scope

Phase 3 uses JSON logs, Worker health endpoints, and read-only MySQL queries. It does not add Prometheus, OpenTelemetry, alert thresholds, or product retention rules. Capacity targets and alert thresholds remain Phase 5 inputs.

## Worker Log Policy

The Worker writes JSON to stdout through Pino. Production uses `LOG_LEVEL=info`.

| Level | Meaning |
| --- | --- |
| `debug` | Idle polling and per-iteration diagnostics |
| `info` | Process lifecycle, readiness becoming ready, and iterations that handled work |
| `warn` | Readiness degradation, retries, dead records, lease recovery, and stalled-task republish |
| `error` | A role iteration or readiness check failed |

Scheduler and Outbox run every second by default. An idle iteration must stay at `debug`; it must not emit an `info` heartbeat. Readiness is logged only when its overall `ready` status changes.

## Stable Events

| `event` | Level | Important fields |
| --- | --- | --- |
| `workflow.worker.started` | `info` | `environment`, `roles` |
| `workflow.worker.stopped` | `info` | none |
| `workflow.worker.role.idle` | `debug` | `role`, `durationMs`, role counters |
| `workflow.worker.role.completed` | `info` | `role`, `durationMs`, role counters |
| `workflow.worker.role.warning` | `warn` | `role`, `durationMs`, retry, dead-letter, and recovery counters |
| `workflow.worker.role.failed` | `error` | `role`, `err` |
| `workflow.worker.readiness.changed` | `info` or `warn` | `status`, `broker`, `database`, `roles` |
| `workflow.worker.readiness.failed` | `error` | `role`, `err` |

Role results are flattened into the log event. Do not put counters under a nested `result` object. Internal pagination cursors are not logged. CLS should index at least `event`, `role`, `status`, `durationMs`, `dispatched`, `deferred`, `claimed`, `sent`, `failed`, `dead`, `cancelled`, `taskLeasesRecovered`, `taskLeasesDead`, `outboxLeasesRecovered`, `stalledTasksRepublished`, `inboxDeleted`, and `err`.

## Health Checks

- `GET /healthz` proves that the Worker process and health server are alive.
- `GET /readyz` requires the database, Broker, and every enabled role to be ready.
- TKE liveness uses `/healthz`; readiness uses `/readyz`.
- A readiness transition to `not-ready` is operationally significant even when the process remains live.

## MySQL Operational Queries

These queries are read-only diagnostics. Run them against the Workflow database with the deployment's required UTC+8 session timezone. They must not run in an HTTP request path or as high-frequency dashboard polling; use manual checks or low-frequency collection through an operations-owned read-only connection, preferably against a read replica when one exists.

### Due Task Lag

```sql
SELECT
  COUNT(*) AS due_task_count,
  COALESCE(MAX(TIMESTAMPDIFF(SECOND, due_at, CURRENT_TIMESTAMP)), 0) AS oldest_due_lag_seconds,
  COALESCE(MAX(attempt), 0) AS max_attempt
FROM xy_wap_embed_workflow_task
WHERE status IN ('pending', 'leased', 'dispatched', 'running')
  AND due_at <= CURRENT_TIMESTAMP;
```

### Task Status And Retries

```sql
SELECT status, COUNT(*) AS task_count, COALESCE(MAX(attempt), 0) AS max_attempt
FROM xy_wap_embed_workflow_task
GROUP BY status
ORDER BY status;
```

### Outbox Backlog And Delivery Attempts

```sql
SELECT
  status,
  COUNT(*) AS outbox_count,
  COALESCE(MAX(attempt), 0) AS max_attempt,
  MIN(next_attempt_at) AS oldest_next_attempt_at
FROM xy_wap_embed_workflow_outbox
GROUP BY status
ORDER BY status;
```

### Expired Leases

```sql
SELECT 'task' AS lease_type, COUNT(*) AS expired_count
FROM xy_wap_embed_workflow_task
WHERE status IN ('leased', 'running')
  AND lease_expires_at <= CURRENT_TIMESTAMP
UNION ALL
SELECT 'outbox' AS lease_type, COUNT(*) AS expired_count
FROM xy_wap_embed_workflow_outbox
WHERE status = 'leased'
  AND lease_expires_at <= CURRENT_TIMESTAMP;
```

### Cancellation Backlog

```sql
SELECT COUNT(*) AS cancellation_backlog
FROM xy_wap_embed_workflow_run AS run
LEFT JOIN xy_wap_embed_workflow_definition AS definition
  ON definition.uid = run.uid
  AND definition.id = run.workflow_id
WHERE run.status IN ('queued', 'running', 'waiting')
  AND (
    definition.id IS NULL
    OR definition.biz_status <> 1
    OR definition.runtime_status = 'stopped'
  );
```

## Dashboard Baseline

Before Phase 5 defines thresholds, the Workflow dashboard should expose:

- Worker readiness by Pod and role.
- Due task count and oldest due-task lag.
- Task counts by status and maximum attempt.
- Outbox counts by status and maximum attempt.
- Dead Task and dead Outbox counts.
- Expired Task and Outbox leases.
- Reconciler recovery counters from `workflow.worker.role.warning`.
- Cancellation backlog.

Do not assign warning or critical thresholds until target traffic, peak distribution, maximum Wait concentration, and acceptable recovery time are approved.
