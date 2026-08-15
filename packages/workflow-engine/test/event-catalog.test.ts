import { readFileSync } from "node:fs";
import {
  getWorkflowJsonDepth,
  getWorkflowJsonEncodedByteLength,
  WORKFLOW_CAPABILITY_PROFILES,
  WORKFLOW_ENTRY_JSON_MAX_DEPTH,
  WORKFLOW_MESSAGE_RECEIVED_TEXT_MAX_LENGTH,
  validateWorkflowEntryEvent,
  type WorkflowEntryEvent,
} from "@chatai/contracts";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import {
  createWorkflowEventCatalog,
  WORKFLOW_EVENT_CATALOG,
  WORKFLOW_TRIGGER_PROJECTION_MAX_BYTES,
  WorkflowTriggerProjectionSchema,
} from "../src/event-catalog.js";

type FixtureManifest = {
  fixtures: Array<{
    expected: { accepted: boolean; resultCode: string };
    fixtureId: string;
    idempotencyGroup?: string;
    kind: "entry" | "trigger-projection";
    minimumBytes?: number;
    path: string;
    stage: "catalog" | "envelope" | "projection";
  }>;
};

const fixtureRoot = new URL("../../contracts/test/fixtures/workflow/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", fixtureRoot), "utf8")) as FixtureManifest;

describe("workflow event catalog", () => {
  it("supports every Entry Event exposed by an enabled Workflow type", () => {
    for (const profile of Object.values(WORKFLOW_CAPABILITY_PROFILES)) {
      if (profile.availability !== "enabled") continue;
      for (const eventType of profile.allowedEntryEventTypes) {
        expect(WORKFLOW_EVENT_CATALOG.supports(eventType, profile.subjectType)).toBe(true);
      }
    }
  });

  it("reports event support by Subject type without exposing payload versions", () => {
    expect(WORKFLOW_EVENT_CATALOG.supports("contact.friend_added", "chatai_contact")).toBe(true);
    expect(WORKFLOW_EVENT_CATALOG.supports("contact.friend_added", "wecom_contact")).toBe(true);
    expect(WORKFLOW_EVENT_CATALOG.supports("message.received", "chatai_contact")).toBe(true);
    expect(WORKFLOW_EVENT_CATALOG.supports("message.received", "wecom_contact")).toBe(false);
    expect(WORKFLOW_EVENT_CATALOG.supports("order.created", "chatai_contact")).toBe(false);
  });

  it("projects a validated shared fixture without retaining the raw payload", () => {
    const event = readEvent("entry/v1/valid/contact-friend-added.json");
    const expectedProjection = JSON.parse(readFileSync(
      new URL("trigger-projection/v1/contact-friend-added.json", fixtureRoot),
      "utf8",
    ));

    expect(WORKFLOW_EVENT_CATALOG.project(event)).toEqual({
      kind: "accepted",
      projection: expectedProjection,
    });
  });

  it("retains optional message text in the controlled Trigger Projection", () => {
    const result = WORKFLOW_EVENT_CATALOG.project(readEvent(
      "entry/v1/valid/message-received.json",
    ));

    expect(result).toMatchObject({
      kind: "accepted",
      projection: {
        variables: {
          messageId: 938271,
          text: "我想了解一下活动详情",
        },
      },
    });
  });

  it("rejects message text beyond the frozen per-message limit", () => {
    expect(WORKFLOW_EVENT_CATALOG.project(event({
      eventType: "message.received",
      payload: {
        messageId: 938271,
        seatId: 101,
        text: "x".repeat(WORKFLOW_MESSAGE_RECEIVED_TEXT_MAX_LENGTH + 1),
        thirdExternalUserId: "chatai-contact-1",
        workUserId: 201,
      },
      source: "chatai",
    }))).toMatchObject({ code: "payload_invalid", kind: "rejected" });
  });

  it.each(manifest.fixtures.filter(fixture => fixture.stage === "catalog"))(
    "$fixtureId follows the shared fixture result",
    (fixture) => {
      const result = WORKFLOW_EVENT_CATALOG.project(readEvent(fixture.path));
      expect(result.kind === "accepted" ? "accepted" : result.code)
        .toBe(fixture.expected.resultCode);
    },
  );

  it("rejects incomplete event identities and invalid projector output", () => {
    expect(WORKFLOW_EVENT_CATALOG.project(event({
      eventType: "contact.friend_added",
      payload: {
        externalUserId: "wecom-contact-1",
        seatId: 101,
        workUserId: 201,
      },
    }))).toMatchObject({
      code: "payload_invalid",
      kind: "rejected",
    });

    const invalidProjectionCatalog = createWorkflowEventCatalog([{
      eventType: "test.contact_updated",
      payloadSchema: Type.Object({
        accountId: Type.String(),
        change: Type.String(),
      }, { additionalProperties: false }),
      payloadVersion: 1,
      project: () => ({
        match: {},
        subjects: {
          chatai_contact: { seatId: 101, subjectId: "chatai-contact-1" },
        },
        variables: { value: "x".repeat(WORKFLOW_TRIGGER_PROJECTION_MAX_BYTES) },
      }),
      subjectTypes: ["chatai_contact"],
    }]);
    expect(invalidProjectionCatalog.project(event())).toMatchObject({
      code: "projection_invalid",
      kind: "rejected",
    });
  });

  it.each(manifest.fixtures.filter(fixture => fixture.stage === "projection"))(
    "$fixtureId follows the shared projection boundary",
    (fixture) => {
      const projection = JSON.parse(readFileSync(
        new URL(fixture.path, fixtureRoot),
        "utf8",
      ));
      const byteLength = getWorkflowJsonEncodedByteLength(projection);
      const accepted = byteLength !== null
        && byteLength <= WORKFLOW_TRIGGER_PROJECTION_MAX_BYTES
        && getWorkflowJsonDepth(projection) <= WORKFLOW_ENTRY_JSON_MAX_DEPTH
        && Value.Check(WorkflowTriggerProjectionSchema, projection);

      expect(accepted ? "accepted" : "projection_invalid")
        .toBe(fixture.expected.resultCode);
      if (fixture.minimumBytes !== undefined) {
        expect(byteLength).toBeGreaterThanOrEqual(fixture.minimumBytes);
      }
    },
  );

  it("requires closed payload schemas and unique catalog keys", () => {
    expect(() => createWorkflowEventCatalog([{
      eventType: "test.contact_updated",
      payloadSchema: Type.Object({ value: Type.String() }),
      payloadVersion: 1,
      project: () => ({ match: {}, subjects: {}, variables: {} }),
      subjectTypes: ["chatai_contact"],
    }])).toThrow("closed objects");

    const definition = {
      eventType: "test.contact_updated",
      payloadSchema: Type.Object({}, { additionalProperties: false }),
      payloadVersion: 1,
      project: () => ({ match: {}, subjects: {}, variables: {} }),
      subjectTypes: ["chatai_contact" as const],
    };
    expect(() => createWorkflowEventCatalog([definition, definition])).toThrow("Duplicate");
  });
});

function readEvent(path: string): WorkflowEntryEvent {
  const raw = readFileSync(new URL(path, fixtureRoot), "utf8");
  const result = validateWorkflowEntryEvent(JSON.parse(raw), {
    encodedByteLength: Buffer.byteLength(raw),
  });
  if (result.kind !== "accepted") throw new Error(`Invalid event fixture: ${path}`);
  return result.event;
}

function event(overrides: Partial<WorkflowEntryEvent> = {}): WorkflowEntryEvent {
  return {
    eventId: "event-1",
    eventType: "test.contact_updated",
    occurredAt: "2026-08-09T10:30:15.123Z",
    payload: { accountId: "account-a", change: "name" },
    payloadVersion: 1,
    schemaVersion: 1,
    source: "chatai",
    uid: 9,
    ...overrides,
  };
}
