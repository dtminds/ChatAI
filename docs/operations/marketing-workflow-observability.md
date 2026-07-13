# Marketing Workflow Observability

## Scope

The Workflow runtime uses JSON logs, Worker health endpoints, and read-only MySQL queries. 1.0 includes bounded history retention but does not add Prometheus, OpenTelemetry, or alert thresholds. Capacity targets and alert thresholds remain later production-readiness inputs.

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
| `workflow.worker.role.warning` | `warn` | `role`, `durationMs`, retry, terminal-failure, and recovery counters |
| `workflow.worker.role.failed` | `error` | `role`, `err` |
| `workflow.worker.readiness.changed` | `info` or `warn` | `status`, `broker`, `database`, `roles` |
| `workflow.worker.readiness.failed` | `error` | `role`, `err` |
| `workflow.action.retry.scheduled` | `warn` | `uid`, `taskId`, `failureKind`, `errorCode`, `retryAt` |
| `workflow.action.failed` | `warn` | `uid`, `taskId`, `failureKind`, `errorCode` |

Role results are flattened into the log event. Do not put counters under a nested `result` object. Internal pagination cursors are not logged. CLS should index at least `event`, `role`, `status`, `durationMs`, `dispatched`, `deferred`, `claimed`, `sent`, `failed`, `dead`, `cancelled`, `taskLeasesRecovered`, `taskLeasesDead`, `outboxLeasesRecovered`, `stalledTasksRepublished`, `inconsistentRunsFailed`, `staleTasksCancelled`, `terminalRunTasksCancelled`, `inboxDeleted`, `historyCleanupHasMore`, `runsDeleted`, `nodeExecutionsDeleted`, `tasksDeleted`, `outboxDeleted`, and `err`.

## History Retention

1.0 applies one global policy to every tenant:

- `queued`, `running`, and `waiting` Runs are retained without a time limit.
- `completed`, `failed`, and `cancelled` Runs and their Node Execution ledgers are retained for 180 days from `completed_at`.
- Task and task Outbox rows are removed 30 days after their owning Run terminates.
- Entry Guard lifetime counters and cumulative node metrics are retained long-term.
- No archive or product restore path exists; the run-record panel explicitly covers the latest 180 days.

The Reconciler starts cleanup hourly in bounded batches. If a batch reports more work, it catches up at the normal Reconciler interval until the backlog is drained. Cleanup counters are expected `info`-level work, not recovery warnings. A terminal Run is deleted only after its Tasks are gone, and its Node Execution rows are deleted in the same transaction.

Before rollout, apply the history-cleanup indexes in `docs/db/change-log.md`. A future real Entry Source must keep its approved replay window shorter than Run retention, with the initial integration capped at 30 days. Replaying an Entry after its Run deduplication row has expired is unsupported.

## Action Failure Recovery

Action adapters must classify known downstream failures with `WorkflowActionExecutionError`. Retryable, unknown-outcome, and terminal failures are persisted before the broker message is acknowledged.

An unclassified exception is treated as an infrastructure or programming failure. After a Task has been claimed, its `task_version` has already advanced, so a NACKed copy of the original broker message becomes stale and is acknowledged on redelivery. Recovery therefore depends on the Task lease expiring: Reconciler returns the Task to `pending`, and Scheduler publishes a new message with the current Task version. Do not describe this path as direct Pulsar redelivery recovery.

## DLQ Boundary

Phase 3 configures Pulsar dead-letter routing, but the current Smoke Producer stage does not build a product page or a manual replay tool for DLQ messages.

- An Entry DLQ message may represent a customer who never received a Run. When a real Entry Source is integrated, Entry and Task must use distinguishable DLQ topics, and operations must add TDMQ-native backlog alerts plus an internal Entry redelivery tool. Redelivery preserves the original `eventId`, so existing entry idempotency prevents duplicate Runs.
- A Task DLQ message is not the execution source of truth. Run and Task state remains in MySQL, and recovery publishes a message for the current `task_version` through Reconciler, Scheduler, and Outbox. Do not replay the old Task DLQ payload directly.
- Business Action retries and final failures are database state and appear in Workflow run records; they are not operated as MQ dead-letter replay.

These DLQ operations are required before a real Entry Source enters production gray release, but they do not block Phase 4 node development against Smoke Producer events.

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

This query measures whether stopped or deleted Workflows are converging internally. It is an operations signal for the Reconciler, not a product-facing stop-progress API: users see the Workflow as stopped as soon as the control-plane status change succeeds.

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
- Reconciler history cleanup counters from `workflow.worker.role.completed`.
- Internal cancellation backlog after Workflow stop or deletion.

`Dead Task` and `Dead Outbox` above are database terminal states, not Pulsar DLQ depth. Pulsar DLQ backlog monitoring is added with the real Entry Source integration because it depends on the final Entry topic, alert channel, and operations ownership.

Do not assign warning or critical thresholds until target traffic, peak distribution, maximum Wait concentration, and acceptable recovery time are approved.
