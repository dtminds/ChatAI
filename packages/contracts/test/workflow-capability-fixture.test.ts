import { readFileSync } from "node:fs";
import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import {
  WorkflowCapabilityCommandFixtureSchema,
  WorkflowCapabilityErrorFixtureSchema,
  WorkflowCapabilityResultFixtureSchema,
} from "../src/index.js";

type FixtureManifest = {
  fixtures: Array<{
    expected: { accepted: boolean; resultCode: string };
    fixtureId: string;
    kind: string;
    path: string;
    stage: string;
  }>;
};

const fixtureRoot = new URL("./fixtures/workflow/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", fixtureRoot), "utf8")) as FixtureManifest;

describe("workflow capability shared fixtures", () => {
  it.each(manifest.fixtures.filter(fixture => fixture.kind === "capability-command"))(
    "$fixtureId follows the shared command contract",
    (fixture) => {
      expect(validateFixture(fixture)).toBe(fixture.expected.accepted);
    },
  );

  it.each(manifest.fixtures.filter(fixture => fixture.kind === "capability-result"))(
    "$fixtureId follows the shared result contract",
    (fixture) => {
      expect(validateFixture(fixture)).toBe(fixture.expected.accepted);
    },
  );

  it.each(manifest.fixtures.filter(fixture => fixture.kind === "capability-error"))(
    "$fixtureId follows the shared error contract",
    (fixture) => {
      expect(validateFixture(fixture)).toBe(fixture.expected.accepted);
    },
  );

  it("keeps capability commands independent from Workflow node internals", () => {
    const commands = manifest.fixtures
      .filter(fixture => fixture.kind === "capability-command")
      .map(readFixture);

    for (const command of commands) {
      expect(command).not.toHaveProperty("node");
      expect(command).not.toHaveProperty("nodeConfig");
      expect(command).not.toHaveProperty("selector");
      expect(isRecord(command.command) ? command.command : {}).not.toHaveProperty("nodeConfig");
      expect(isRecord(command.command) ? command.command : {}).not.toHaveProperty("selector");
    }
  });
});

function validateFixture(fixture: FixtureManifest["fixtures"][number]) {
  const value = readFixture(fixture);
  if (fixture.kind === "capability-command") {
    return Value.Check(WorkflowCapabilityCommandFixtureSchema, value);
  }
  if (fixture.kind === "capability-result") {
    return Value.Check(WorkflowCapabilityResultFixtureSchema, value);
  }
  return Value.Check(WorkflowCapabilityErrorFixtureSchema, value);
}

function readFixture(fixture: FixtureManifest["fixtures"][number]) {
  return JSON.parse(readFileSync(new URL(fixture.path, fixtureRoot), "utf8")) as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
