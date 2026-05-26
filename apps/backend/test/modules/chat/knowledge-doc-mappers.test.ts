import { describe, expect, it } from "vitest";
import {
  mapJavaKnowledgeDocPage,
  normalizeKnowledgeId,
} from "../../../src/modules/chat/knowledge-doc-mappers.js";

describe("mapJavaKnowledgeDocPage", () => {
  it("maps top-level list from Java page envelope", () => {
    expect(
      mapJavaKnowledgeDocPage({
        count: 2,
        error: 0,
        list: [
          {
            id: 1001,
            title: "敏感肌如何护理",
          },
          {
            id: 1002,
            name: "产品使用方法",
          },
        ],
        page: 1,
        pageSize: 9999,
        success: true,
      }),
    ).toEqual({
      list: [
        {
          id: "1001",
          name: "敏感肌如何护理",
        },
        {
          id: "1002",
          name: "产品使用方法",
        },
      ],
    });
  });

  it("returns empty list when top-level list is missing", () => {
    expect(mapJavaKnowledgeDocPage({ error: 0, success: true })).toEqual({ list: [] });
  });
});

describe("normalizeKnowledgeId", () => {
  it("accepts string uuid ids", () => {
    expect(normalizeKnowledgeId("W7zU2fWkVSp65OTAjDd3-w")).toBe("W7zU2fWkVSp65OTAjDd3-w");
  });

  it("accepts numeric string ids", () => {
    expect(normalizeKnowledgeId("101")).toBe("101");
  });

  it("rejects empty ids", () => {
    expect(normalizeKnowledgeId("")).toBeUndefined();
    expect(normalizeKnowledgeId("   ")).toBeUndefined();
  });
});
