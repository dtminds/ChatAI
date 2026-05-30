import { describe, expect, it } from "vitest";
import {
  mapJavaAttachmentList,
  normalizeAttachmentIds,
} from "../../../src/modules/chat/attachment-mappers.js";

describe("attachment-mappers", () => {
  it("normalizes numeric attachment ids", () => {
    expect(normalizeAttachmentIds(["101", "102", "101", "x"])).toEqual([101, 102]);
  });

  it("maps Java attachment list fields", () => {
    expect(
      mapJavaAttachmentList([
        {
          coverUrl: "https://example.com/cover.png",
          fileName: "产品图.png",
          fileType: 1,
          id: 101,
        },
        {
          appInfo: { nickName: "品牌小程序" },
          fileType: 7,
          id: 102,
        },
      ]),
    ).toEqual({
      attachments: [
        {
          coverUrl: "https://example.com/cover.png",
          fileName: "产品图.png",
          fileType: 1,
          id: 101,
        },
        {
          appInfo: { nickName: "品牌小程序" },
          fileType: 7,
          id: 102,
        },
      ],
    });
  });
});
