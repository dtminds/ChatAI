# Workflow Direct Entry

## Boundary

- Workflow Start supports `entryMode: "direct-push"` with an empty `triggers` array.
- Java owns endpoint-key generation, decryption, and validation.
- Backend sends the globally unique plain `workflowId` as `{ "content": workflowId }` to `POST /third-internal/smp-encrypt/aes-encrypt` and accepts `data` only when the Java envelope has `success === true`.
- Node requests only the returned opaque `endpointKey` through `WorkflowDirectEntryEndpointPort`; tenant `uid` remains part of Backend access control and is not included in the encrypted content.
- Web builds the user-facing URL as `/workflow/endpoint/{endpointKey}` on the current origin.
- The public route does not require login. It only renders `请按照协议推送数据`; it does not decrypt the key or start a Workflow.

## Java Entry Event

Java publishes to the existing Workflow Entry topic after resolving the endpoint key. The event uses:

```json
{
  "schemaVersion": 1,
  "payloadVersion": 1,
  "eventId": "producer-unique-event-id",
  "eventType": "workflow.direct_entry.requested",
  "uid": 9,
  "occurredAt": "2026-08-24T08:30:15.123Z",
  "source": "chatai",
  "payload": {
    "workflowId": "31",
    "externalUserId": 3267,
    "workUserId": 201,
    "seatId": 101,
    "thirdExternalUserId": "chatai-contact-1"
  }
}
```

`eventId` is producer-owned and must uniquely identify one logical delivery. Retrying the same delivery reuses the same value. `workflowId` is the Java-decoded plain ID. Payload identity fields use the same concrete identities as existing Entry events; no generic `subjectId` is accepted.

For WeCom contact Workflows, payload requires `workflowId`, `externalUserId`, and `workUserId`. For ChatAI contact Workflows, payload requires `workflowId`, `workUserId`, `seatId`, and `thirdExternalUserId`; `externalUserId` is optional.

## Admission

The Worker recognizes the fixed event type before Event Catalog projection. Direct Entry does not read Trigger Bindings or Wait Event Subscriptions, but it reuses Entry Inbox deduplication, Runtime admission, and atomic Run/Task/Outbox creation.

Runtime reads the current published Revision and requires its Start mode to still be `direct-push`. It derives the subject from the Revision subject type and verifies that `seatId` or `workUserId` remains inside the published Start scope. `workflowId` is routing data and is removed before the trigger projection is stored.

For every entry mode, one tenant/Workflow/subject can have at most one `queued`, `running`, or `waiting` Run. A different event arriving while that Run is active is acknowledged with `active_run_exists`. After the Run becomes terminal, Runtime evaluates the existing `entryPolicy`; no additional configuration controls this single-active rule.
