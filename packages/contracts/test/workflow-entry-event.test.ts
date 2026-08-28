import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createWorkflowEntryPartitionKey,
  WORKFLOW_DIRECT_ENTRY_EVENT_TYPE,
  WORKFLOW_ENTRY_EVENT_MAX_BYTES,
  WorkflowDirectEntryPayloadSchema,
  validateWorkflowEntryEvent,
  type WorkflowEntryEnvelopeValidationCode,
  type WorkflowEntryEvent,
} from "../src/workflow/entry-event.js";
import {
  WorkflowEntryEventTypeSchema,
  WorkflowTriggerBindingFilterSchema,
} from "../src/workflow/trigger.js";
import { Value } from "@sinclair/typebox/value";

type FixtureManifest = {
  fixtures: Array<{
    expected: { accepted: boolean; resultCode: string };
    fixtureId: string;
    idempotencyGroup?: string;
    kind:
      | "capability-command"
      | "capability-error"
      | "capability-result"
      | "entry"
      | "trigger-projection";
    minimumBytes?: number;
    path: string;
    stage: "capability" | "catalog" | "envelope" | "projection";
  }>;
  schemaVersion: 1;
};

const fixtureRoot = new URL("./fixtures/workflow/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", fixtureRoot), "utf8")) as FixtureManifest;

describe("workflow entry event envelope", () => {
  it("derives the transport partition key from the source event identity", () => {
    expect(createWorkflowEntryPartitionKey(event())).toBe("9:wecom_contact:3267");
    expect(createWorkflowEntryPartitionKey(event({
      eventType: "message.received",
      payload: {
        messageId: 938271,
        seatId: 101,
        thirdExternalUserId: "chatai-contact-1",
        workUserId: 201,
      },
      source: "chatai",
    }))).toBe("9:chatai_contact:chatai-contact-1");
    expect(createWorkflowEntryPartitionKey(event({
      eventType: WORKFLOW_DIRECT_ENTRY_EVENT_TYPE,
      payload: {
        externalUserId: 3267,
        seatId: 101,
        thirdExternalUserId: "chatai-contact-1",
        workUserId: 201,
        workflowId: "31",
      },
      source: "chatai",
    }))).toBe("9:chatai_contact:chatai-contact-1");
    expect(createWorkflowEntryPartitionKey(event({
      eventType: WORKFLOW_DIRECT_ENTRY_EVENT_TYPE,
      payload: { externalUserId: 3267, workUserId: 201, workflowId: "31" },
    }))).toBe("9:wecom_contact:3267");
  });

  it("validates direct-entry payloads with concrete ChatAI or WeCom identity", () => {
    expect(Value.Check(WorkflowDirectEntryPayloadSchema, {
      externalUserId: 3267,
      seatId: 101,
      thirdExternalUserId: "chatai-contact-1",
      workUserId: 201,
      workflowId: "31",
    })).toBe(true);
    expect(Value.Check(WorkflowDirectEntryPayloadSchema, {
      externalUserId: 3267,
      workUserId: 201,
      workflowId: "31",
    })).toBe(true);
    expect(Value.Check(WorkflowDirectEntryPayloadSchema, {
      seatId: 101,
      thirdExternalUserId: "chatai-contact-1",
      workUserId: 201,
    })).toBe(false);
    expect(Value.Check(WorkflowDirectEntryPayloadSchema, {
      subjectId: "chatai-contact-1",
      workflowId: "31",
    })).toBe(false);
  });

  it("accepts the direct-entry event and its work-user binding filter", () => {
    expect(Value.Check(WorkflowEntryEventTypeSchema, "workflow.direct_entry")).toBe(true);
    expect(Value.Check(WorkflowTriggerBindingFilterSchema, {
      entryPolicy: { mode: "never" },
      eventType: "workflow.direct_entry",
      workUserIds: [201, 202],
    })).toBe(true);
  });

  it.each(manifest.fixtures.filter(fixture => fixture.stage === "envelope"))(
    "$fixtureId follows the shared fixture result",
    (fixture) => {
      const raw = readFileSync(new URL(fixture.path, fixtureRoot), "utf8");
      let resultCode: "accepted" | "invalid_json" | WorkflowEntryEnvelopeValidationCode;
      try {
        const result = validateWorkflowEntryEvent(JSON.parse(raw), {
          encodedByteLength: Buffer.byteLength(raw),
        });
        resultCode = result.kind === "accepted" ? "accepted" : result.code;
      } catch {
        resultCode = "invalid_json";
      }

      expect(resultCode).toBe(fixture.expected.resultCode);
    },
  );

  it("rejects payload and envelope byte limits independently", () => {
    expect(validateWorkflowEntryEvent(event({
      payload: { value: "x".repeat(33 * 1024) },
    }))).toMatchObject({ code: "payload_too_large", kind: "rejected" });

    expect(validateWorkflowEntryEvent(event(), {
      encodedByteLength: WORKFLOW_ENTRY_EVENT_MAX_BYTES + 1,
    })).toMatchObject({ code: "envelope_too_large", kind: "rejected" });
  });

  it("accepts the Java v1 message identity without embedded content", () => {
    expect(validateWorkflowEntryEvent(event({
      eventType: "message.received",
      payload: {
        messageId: 938271,
        seatId: 101,
        thirdExternalUserId: "chatai-contact-1",
        workUserId: 201,
      },
      source: "chatai",
    }))).toMatchObject({
      event: { payload: { messageId: 938271 } },
      kind: "accepted",
    });
  });

  it.each([
    {
      eventType: "message.received",
      payload: {
        externalUserId: 0,
        messageId: 938271,
        seatId: 101,
        thirdExternalUserId: "chatai-contact-1",
        workUserId: 201,
      },
      source: "chatai",
    },
    {
      eventType: "contact.friend_added",
      payload: { externalUserId: 0, workUserId: 201 },
      source: "wecom",
    },
    {
      eventType: WORKFLOW_DIRECT_ENTRY_EVENT_TYPE,
      payload: {
        externalUserId: 0,
        seatId: 101,
        thirdExternalUserId: "chatai-contact-1",
        workUserId: 201,
        workflowId: "31",
      },
      source: "chatai",
    },
  ] as const)("normalizes Java's zero externalUserId before $eventType validation", (input) => {
    const rawEvent = event({
      eventType: input.eventType,
      payload: structuredClone(input.payload),
      source: input.source,
    });

    expect(validateWorkflowEntryEvent(rawEvent)).toMatchObject({
      event: { payload: expect.not.objectContaining({ externalUserId: expect.anything() }) },
      kind: "accepted",
    });
    expect(rawEvent.payload).toHaveProperty("externalUserId", 0);
  });

  it("keeps shared idempotent event pairs byte-for-byte equivalent", () => {
    const groups = new Map<string, typeof manifest.fixtures>();
    for (const fixture of manifest.fixtures) {
      if (!fixture.idempotencyGroup) continue;
      const fixtures = groups.get(fixture.idempotencyGroup) ?? [];
      fixtures.push(fixture);
      groups.set(fixture.idempotencyGroup, fixtures);
    }

    for (const fixtures of groups.values()) {
      expect(fixtures.length).toBeGreaterThan(1);
      const rawEvents = fixtures.map(fixture =>
        readFileSync(new URL(fixture.path, fixtureRoot), "utf8"));
      expect(new Set(rawEvents).size).toBe(1);
      expect(new Set(rawEvents.map(raw => JSON.parse(raw).eventId)).size).toBe(1);
    }
  });

  it("rejects JSON deeper than the public envelope limit", () => {
    let nested: unknown = "value";
    for (let index = 0; index < 16; index += 1) nested = { nested };

    expect(validateWorkflowEntryEvent(event({ payload: { nested } }))).toMatchObject({
      code: "json_too_deep",
      kind: "rejected",
    });
  });

  it("rejects impossible UTC timestamps without weakening the closed envelope", () => {
    expect(validateWorkflowEntryEvent(event({
      occurredAt: "2026-02-30T10:30:15.123Z",
    }))).toMatchObject({ code: "envelope_invalid", kind: "rejected" });
    expect(validateWorkflowEntryEvent({
      ...event(),
      workflowId: "31",
    })).toMatchObject({ code: "envelope_invalid", kind: "rejected" });
  });

  it.each([
    ["2026-08-09T10:30:15Z", "2026-08-09T10:30:15.000Z"],
    ["2026-08-09T10:30:15.123456789Z", "2026-08-09T10:30:15.123Z"],
  ])("normalizes accepted UTC instant %s before admission", (occurredAt, expected) => {
    expect(validateWorkflowEntryEvent(event({ occurredAt }))).toMatchObject({
      event: { occurredAt: expected },
      kind: "accepted",
    });
  });

  it("rejects Entry Event sources outside the frozen producer set", () => {
    expect(validateWorkflowEntryEvent({
      ...event(),
      source: "workflow-test",
    })).toMatchObject({ code: "envelope_invalid", kind: "rejected" });
  });
});

function event(overrides: Partial<WorkflowEntryEvent> = {}): WorkflowEntryEvent {
  return {
    eventId: "event-1",
    eventType: "contact.friend_added",
    occurredAt: "2026-08-09T10:30:15.123Z",
    payload: { externalUserId: 3267, workUserId: 201 },
    payloadVersion: 1,
    schemaVersion: 1,
    source: "wecom",
    uid: 9,
    ...overrides,
  };
}
