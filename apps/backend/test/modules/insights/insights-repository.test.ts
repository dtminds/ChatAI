import { describe, expect, it, vi } from "vitest";
import { InsightsRepository } from "../../../src/modules/insights/insights.repository";
import { MysqlInsightWorkerRepository } from "../../../src/modules/insights/insights-worker.repository";

describe("InsightsRepository", () => {
  it("does not update an action item outside the current uid scope", async () => {
    const updateExecute = vi.fn(async () => ({ numAffectedRows: 1n }));
    const db = {
      selectFrom: vi.fn(() => createSelectBuilder([])),
      updateTable: vi.fn(() => createUpdateBuilder(updateExecute)),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.updateActionStatus({ uid: 9001 }, "801", "done"),
    ).resolves.toBe(false);

    expect(updateExecute).not.toHaveBeenCalled();
  });

  it("returns an existing rescan job when the idempotency key already exists", async () => {
    const duplicateKeyError = Object.assign(new Error("Duplicate entry"), {
      code: "ER_DUP_ENTRY",
      errno: 1062,
    });
    const db = {
      insertInto: vi.fn(() =>
        createInsertBuilder(async () => {
          throw duplicateKeyError;
        }),
      ),
      selectFrom: vi.fn(() => createSelectBuilder([{ id: 8801 }])),
    };
    const repository = new InsightsRepository(db as never);

    await expect(
      repository.createRescanJob(
        { uid: 9001 },
        new Date("2026-06-01T00:00:00.000Z"),
        "rescan:9001:2026-06-01T00:00:00.000Z",
      ),
    ).resolves.toBe("8801");
  });
});

describe("MysqlInsightWorkerRepository", () => {
  it("does not claim an analysis job when another worker wins the status update", async () => {
    const db = {
      selectFrom: vi.fn(() =>
        createSelectBuilder([
          {
            analysis_scope: "all",
            id: 701,
            idempotency_key: "analyze_session:9001:501:live:2026-06-01T00:00:00.000Z",
            job_type: "analyze_session",
            target_id: "501",
            uid: 9001,
          },
        ]),
      ),
      updateTable: vi.fn(() => createUpdateBuilder(async () => ({ numAffectedRows: 0n }))),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(repository.claimNextAnalyzeJob()).resolves.toBeUndefined();
  });

  it("does not claim a sync job when another worker wins the status update", async () => {
    const db = {
      selectFrom: vi.fn(() =>
        createSelectBuilder([
          {
            id: 702,
            target_id: "2026-06-01T00:00:00.000Z",
            uid: 9001,
          },
        ]),
      ),
      updateTable: vi.fn(() => createUpdateBuilder(async () => ({ numAffectedRows: 0n }))),
    };
    const repository = new MysqlInsightWorkerRepository(db as never);

    await expect(repository.claimNextSyncMessagesJob({})).resolves.toBeUndefined();
  });
});

function createSelectBuilder(rows: unknown[]) {
  const builder = {
    execute: async () => rows,
    executeTakeFirst: async () => rows[0],
    innerJoin: () => builder,
    limit: () => builder,
    orderBy: () => builder,
    select: () => builder,
    where: () => builder,
    whereRef: () => builder,
  };

  return builder;
}

function createInsertBuilder(executeTakeFirstOrThrow: () => Promise<unknown>) {
  const builder = {
    executeTakeFirstOrThrow,
    values: () => builder,
  };

  return builder;
}

function createUpdateBuilder(executeTakeFirst: () => Promise<unknown>) {
  const builder = {
    executeTakeFirst,
    set: () => builder,
    where: () => builder,
  };

  return builder;
}
