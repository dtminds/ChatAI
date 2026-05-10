import { describe, expect, it } from "vitest";
import {
  normalizeComposerSegments,
  type ComposerSegment,
} from "@/pages/chat/lib/composer-segments";

describe("composer segments", () => {
  it("keeps text and WeChat emoji tokens together while splitting images into their own segments", () => {
    const segments: ComposerSegment[] = [
      { type: "text", text: "第一段[打脸]\n" },
      {
        type: "image",
        alt: "截图 A",
        localUrl: "data:image/png;base64,a",
        width: 120,
        height: 90,
      },
      { type: "text", text: "\n中间[强]" },
      {
        type: "image",
        alt: "截图 B",
        localUrl: "data:image/png;base64,b",
      },
      { type: "text", text: "  最后一句  " },
    ];

    expect(normalizeComposerSegments(segments)).toEqual([
      {
        type: "text",
        text: "第一段[打脸]",
      },
      {
        type: "image",
        alt: "截图 A",
        localUrl: "data:image/png;base64,a",
        width: 120,
        height: 90,
      },
      {
        type: "text",
        text: "中间[强]",
      },
      {
        type: "image",
        alt: "截图 B",
        localUrl: "data:image/png;base64,b",
      },
      {
        type: "text",
        text: "最后一句",
      },
    ]);
  });

  it("drops empty text segments and merges adjacent text segments", () => {
    expect(
      normalizeComposerSegments([
        { type: "text", text: "  " },
        { type: "text", text: "你好" },
        { type: "text", text: "[微笑]" },
        { type: "text", text: "\n\n" },
      ]),
    ).toEqual([
      {
        type: "text",
        text: "你好[微笑]",
      },
    ]);
  });
});
