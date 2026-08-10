import { readFileSync } from "node:fs";
import {
  getWorkflowJsonDepth,
  getWorkflowJsonEncodedByteLength,
  WORKFLOW_ENTRY_JSON_MAX_DEPTH,
  validateWorkflowEntryEvent,
  type WorkflowEntryEvent,
} from "@chatai/contracts";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import {
  createWorkflowEventCatalog,
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
  const catalog = createWorkflowEventCatalog([{
    eventType: "test.contact_updated",
    payloadSchema: Type.Object({
      accountId: Type.String({ minLength: 1 }),
      change: Type.String({ minLength: 1 }),
    }, { additionalProperties: false }),
    payloadVersion: 1,
    project: event => ({
      match: { accountId: event.payload.accountId },
      variables: { change: event.payload.change },
    }),
    subjectTypes: ["chatai_contact", "wecom_contact"],
  }]);

  it("projects a validated shared fixture without retaining the raw payload", () => {
    const event = readEvent("entry/v1/valid/chatai-contact.json");
    const expectedProjection = JSON.parse(readFileSync(
      new URL("trigger-projection/v1/contact-updated.json", fixtureRoot),
      "utf8",
    ));

    expect(catalog.project(event)).toEqual({
      kind: "accepted",
      projection: expectedProjection,
    });
  });

  it.each(manifest.fixtures.filter(fixture => fixture.stage === "catalog"))(
    "$fixtureId follows the shared fixture result",
    (fixture) => {
      const result = catalog.project(readEvent(fixture.path));
      expect(result.kind === "accepted" ? "accepted" : result.code)
        .toBe(fixture.expected.resultCode);
    },
  );

  it("rejects incompatible subjects and invalid projector output", () => {
    expect(catalog.project(event({ subjectType: "miniapp_member" }))).toMatchObject({
      code: "subject_type_unsupported",
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
      project: () => ({ match: {}, variables: {} }),
      subjectTypes: ["chatai_contact"],
    }])).toThrow("closed objects");

    const definition = {
      eventType: "test.contact_updated",
      payloadSchema: Type.Object({}, { additionalProperties: false }),
      payloadVersion: 1,
      project: () => ({ match: {}, variables: {} }),
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
    source: "engine-test",
    subjectId: "contact-1",
    subjectType: "chatai_contact",
    uid: 9,
    ...overrides,
  };
}
