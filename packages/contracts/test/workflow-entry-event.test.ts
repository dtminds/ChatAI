import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  WORKFLOW_ENTRY_EVENT_MAX_BYTES,
  validateWorkflowEntryEvent,
  type WorkflowEntryEnvelopeValidationCode,
  type WorkflowEntryEvent,
} from "../src/workflow/entry-event.js";

type FixtureManifest = {
  fixtures: Array<{
    expected: { accepted: boolean; resultCode: string };
    fixtureId: string;
    kind: "entry" | "trigger-projection";
    path: string;
    stage: "catalog" | "envelope" | "projection";
  }>;
  schemaVersion: 1;
};

const fixtureRoot = new URL("./fixtures/workflow/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", fixtureRoot), "utf8")) as FixtureManifest;

describe("workflow entry event envelope", () => {
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
});

function event(overrides: Partial<WorkflowEntryEvent> = {}): WorkflowEntryEvent {
  return {
    eventId: "event-1",
    eventType: "test.contact_updated",
    occurredAt: "2026-08-09T10:30:15.123Z",
    payload: { accountId: "account-a", change: "name" },
    payloadVersion: 1,
    schemaVersion: 1,
    source: "contract-test",
    subjectId: "contact-1",
    subjectType: "chatai_contact",
    uid: 9,
    ...overrides,
  };
}
