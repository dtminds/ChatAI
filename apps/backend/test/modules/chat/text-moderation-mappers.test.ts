import { describe, expect, it } from "vitest";
import { mapJavaTextModerationPlus } from "../../../src/modules/chat/text-moderation-mappers.js";

describe("mapJavaTextModerationPlus", () => {
  it("returns null result when riskItems is empty", () => {
    expect(
      mapJavaTextModerationPlus({
        riskItems: [],
        riskLevel: "none",
      }),
    ).toEqual({ result: null });
  });

  it("returns null result when only non-risk items are present", () => {
    expect(
      mapJavaTextModerationPlus({
        riskItems: [
          {
            description: "未检测出风险",
            label: "nonLabel",
          },
        ],
        riskLevel: "none",
      }),
    ).toEqual({ result: null });
  });

  it("maps descriptions to categoryLabel and deduplicates risk words", () => {
    expect(
      mapJavaTextModerationPlus({
        riskItems: [
          {
            customizedHit: [
              { keyWords: "最好" },
              { keyWords: "第一" },
            ],
            description: "命中极限词",
            label: "customized",
            riskWords: "太好用了",
          },
          {
            description: "垃圾信息",
            label: "spam",
            riskWords: "极致,最好",
          },
        ],
        riskLevel: "high",
      }),
    ).toEqual({
      result: {
        categoryLabel: "命中极限词,垃圾信息",
        words: ["最好", "第一", "极致"],
      },
    });
  });

  it("uses riskWords for non-customized items", () => {
    expect(
      mapJavaTextModerationPlus({
        riskItems: [
          {
            description: "违禁词",
            label: "ad_law",
            riskWords: "违规词A",
          },
        ],
        riskLevel: "medium",
      }),
    ).toEqual({
      result: {
        categoryLabel: "违禁词",
        words: ["违规词A"],
      },
    });
  });

  it("supports customizedHit as a single object", () => {
    expect(
      mapJavaTextModerationPlus({
        riskItems: [
          {
            customizedHit: {
              keyWords: "最好,第一",
            },
            description: "自定义库命中",
            label: "customized",
          },
        ],
        riskLevel: "high",
      }),
    ).toEqual({
      result: {
        categoryLabel: "自定义库命中",
        words: ["最好", "第一"],
      },
    });
  });

  it("unwraps envelope data field before mapping", () => {
    expect(
      mapJavaTextModerationPlus({
        data: {
          riskItems: [
            {
              description: "违禁词",
              label: "ad_law",
              riskWords: "违规词A",
            },
          ],
          riskLevel: "medium",
        },
        error: 0,
        success: true,
      }),
    ).toEqual({
      result: {
        categoryLabel: "违禁词",
        words: ["违规词A"],
      },
    });
  });
});
