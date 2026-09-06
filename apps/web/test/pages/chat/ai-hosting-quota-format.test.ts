// @vitest-environment node

import { describe, expect, it } from "vitest";
import { formatStorageSize } from "@/pages/chat/ai-hosting/ai-hosting-layout";

describe("formatStorageSize", () => {
  it("formats megabytes with one decimal place below 1GB", () => {
    expect(formatStorageSize(512 * 1024)).toBe("0.5MB");
  });

  it("returns zero without a unit below 0.1MB", () => {
    expect(formatStorageSize(64 * 1024)).toBe("0");
  });

  it("formats gigabytes without an unnecessary decimal", () => {
    expect(formatStorageSize(1024 * 1024 * 1024)).toBe("1GB");
  });
});
