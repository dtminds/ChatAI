import { describe, expect, it } from "vitest";
import { mapJavaKnowledgePage } from "../../../src/modules/chat/knowledge-mappers.js";

describe("mapJavaKnowledgePage", () => {
  it("maps top-level list from Java page envelope", () => {
    expect(
      mapJavaKnowledgePage({
        count: 2,
        error: 0,
        list: [
          {
            createTimestamp: 1710000000,
            docNum: 12,
            id: 101,
            name: "护肤知识集",
            remark: "备注",
          },
          {
            id: 102,
            name: "售后知识集",
          },
        ],
        page: 1,
        pageSize: 9999,
        success: true,
      }),
    ).toEqual({
      list: [
        {
          createTimestamp: 1710000000,
          docNum: 12,
          id: "101",
          name: "护肤知识集",
          remark: "备注",
        },
        {
          id: "102",
          name: "售后知识集",
        },
      ],
    });
  });

  it("maps knowledgeId when id is missing", () => {
    expect(
      mapJavaKnowledgePage({
        list: [
          {
            knowledgeId: 88,
            name: "租户知识集",
          },
        ],
      }),
    ).toEqual({
      list: [
        {
          id: "88",
          name: "租户知识集",
        },
      ],
    });
  });

  it("returns empty list when top-level list is missing", () => {
    expect(mapJavaKnowledgePage({ error: 0, success: true })).toEqual({ list: [] });
    expect(mapJavaKnowledgePage({ list: [] })).toEqual({ list: [] });
  });

  it("ignores nested data.list and only reads top-level list", () => {
    expect(
      mapJavaKnowledgePage({
        data: {
          list: [
            {
              id: 201,
              name: "嵌套知识集",
            },
          ],
        },
        error: 0,
        list: [],
        success: true,
      }),
    ).toEqual({ list: [] });
  });
});
