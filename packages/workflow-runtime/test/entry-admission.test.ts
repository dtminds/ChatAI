import type { WorkflowEntryPolicy } from "@chatai/contracts";
import { describe, expect, it } from "vitest";
import { InMemoryWorkflowRuntimeRepository } from "../src/index.js";

describe("workflow entry admission", () => {
  it("deduplicates an entry event before applying the entry policy", async () => {
    const repository = createRepository();
    const first = await repository.createRunWithInitialTask(createInput({
      entryPolicy: { mode: "never" },
    }));
    const duplicate = await repository.createRunWithInitialTask(createInput({
      entryPolicy: { mode: "never" },
    }));

    expect(first.kind).toBe("success");
    expect(duplicate).toMatchObject({ deduplicated: true, kind: "success" });
    expect(repository.snapshot().runs).toHaveLength(1);
  });

  it("atomically allows only one active Run for different entry events", async () => {
    const repository = createRepository();
    const results = await Promise.all(Array.from({ length: 10 }, (_, index) =>
      repository.createRunWithInitialTask(createInput({
        entryEventId: `event-${index}`,
        entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
      })),
    ));

    expect(results.filter(result => result.kind === "success")).toHaveLength(1);
    expect(results.filter(result => result.kind === "active-run-rejected")).toHaveLength(9);
    expect(repository.snapshot().runs).toHaveLength(1);
  });

  it("applies entry policy again after the previous Run becomes terminal", async () => {
    const repository = createRepository();
    const entryPolicy: WorkflowEntryPolicy = {
      maxEntries: 2,
      mode: "lifetime_limit",
    };
    await repository.createRunWithInitialTask(createInput({ entryPolicy }));
    await expect(repository.createRunWithInitialTask(createInput({
      entryEventId: "event-2",
      entryPolicy,
    }))).resolves.toMatchObject({ kind: "active-run-rejected" });

    repository.runs[0]!.status = "completed";
    await expect(repository.createRunWithInitialTask(createInput({
      entryEventId: "event-2",
      entryPolicy,
    }))).resolves.toMatchObject({ deduplicated: false, kind: "success" });
    repository.runs[1]!.status = "completed";
    await expect(repository.createRunWithInitialTask(createInput({
      entryEventId: "event-3",
      entryPolicy,
    }))).resolves.toMatchObject({ kind: "entry-policy-rejected" });
  });

  it("uses repository time for rolling-window admission and counts terminal runs", async () => {
    let now = new Date("2026-07-01T00:00:00.000Z");
    const repository = createRepository(() => now);
    const entryPolicy: WorkflowEntryPolicy = {
      maxEntries: 2,
      mode: "rolling_window",
      windowSize: 24,
      windowUnit: "hour",
    };

    await repository.createRunWithInitialTask(createInput({ entryEventId: "event-1", entryPolicy }));
    repository.runs[0]!.status = "completed";
    now = new Date("2026-07-01T12:00:00.000Z");
    await repository.createRunWithInitialTask(createInput({ entryEventId: "event-2", entryPolicy }));
    repository.runs[1]!.status = "completed";
    now = new Date("2026-07-01T23:00:00.000Z");
    await expect(repository.createRunWithInitialTask(createInput({ entryEventId: "event-3", entryPolicy })))
      .resolves.toMatchObject({ kind: "entry-policy-rejected" });
    now = new Date("2026-07-02T00:01:00.000Z");
    await expect(repository.createRunWithInitialTask(createInput({ entryEventId: "event-4", entryPolicy })))
      .resolves.toMatchObject({ kind: "success" });
  });
});

function createRepository(now: () => Date = () => new Date("2026-07-01T00:00:00.000Z")) {
  return new InMemoryWorkflowRuntimeRepository(
    async () => ({ bizStatus: 1, runtimeStatus: "active" }),
    now,
  );
}

function createInput(overrides: {
  entryEventId?: string;
  entryPolicy: WorkflowEntryPolicy;
}) {
  return {
    context: { trigger: { eventType: "contact.friend_added" } },
    entryEventId: overrides.entryEventId ?? "event-1",
    entryPolicy: overrides.entryPolicy,
    initialNodeId: "start",
    initialNodeKind: "start" as const,
    occurredAt: new Date("2020-01-01T00:00:00.000Z"),
    revision: 1,
    shardId: 7,
    subjectId: "external-user-1",
    subjectType: "chatai_contact" as const,
    uid: 9,
    workflowId: "31",
    workflowType: "chatai_sop" as const,
  };
}
