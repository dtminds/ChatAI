import { describe, expect, it } from "vitest";
import { hydrateRelationRows } from "../../../src/modules/settings/relation-hydration.js";

describe("hydrateRelationRows", () => {
  it("hydrates entries with falsy source values", () => {
    const hydratedRows = hydrateRelationRows(
      [{ sourceId: 1 }, { sourceId: 2 }],
      new Map([
        [1, ""],
        [2, "active"],
      ]),
      (link) => link.sourceId,
      (link, source) => `${link.sourceId}:${source}`,
    );

    expect(hydratedRows).toEqual(["1:", "2:active"]);
  });
});
