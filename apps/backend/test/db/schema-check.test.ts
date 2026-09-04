import { describe, expect, it } from "vitest";
import { checkSchema } from "../../src/db/schema-check.js";

describe("checkSchema", () => {
  it("verifies the UTC+8 database contract once per database instance", async () => {
    const db = createDatabaseMock(28_800);

    await expect(checkSchema(db.database)).resolves.toMatchObject({ ok: true });
    await expect(checkSchema(db.database)).resolves.toMatchObject({ ok: true });

    expect(db.timezoneChecks).toBe(1);
  });

  it("rejects readiness when the database is not using UTC+8", async () => {
    const db = createDatabaseMock(0);

    await expect(checkSchema(db.database)).rejects.toThrow(
      "MySQL session timezone must be UTC+8",
    );
  });
});

function createDatabaseMock(offsetSeconds: number) {
  let schemaChecks = 0;
  let timezoneChecks = 0;
  const database = {
    selectNoFrom(selection: (builder: {
      val(value: number): { as(alias: string): unknown };
    }) => unknown) {
      selection({
        val(value: number) {
          return { as: (alias: string) => ({ alias, value }) };
        },
      });
      return {
        executeTakeFirstOrThrow: async () => {
          if (schemaChecks === timezoneChecks) {
            schemaChecks += 1;
            return { schema_check: 1 };
          }
          timezoneChecks += 1;
          return { timezone_offset_seconds: offsetSeconds };
        },
      };
    },
  } as never;
  return {
    database,
    get timezoneChecks() { return timezoneChecks; },
  };
}
