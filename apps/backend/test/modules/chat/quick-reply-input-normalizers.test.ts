import { describe, expect, it } from "vitest";
import {
  normalizeQuickReplyBatchCreateRequest,
  normalizeQuickReplyCategoryEnsureRequest,
} from "../../../src/modules/chat/quick-reply-input-normalizers.js";

describe("quick reply input normalizers", () => {
  it("rejects array-shaped category records", () => {
    expect(normalizeQuickReplyCategoryEnsureRequest([[]])).toEqual({
      errors: [{ message: "分类数据无效", rowNumber: 1 }],
      ok: false,
    });
  });

  it("rejects array-shaped quick reply records", () => {
    expect(normalizeQuickReplyBatchCreateRequest([[]])).toEqual({
      errors: [{ message: "话术数据无效", rowNumber: 1 }],
      ok: false,
    });
  });
});
