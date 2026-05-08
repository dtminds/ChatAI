import { describe, expect, it } from "vitest";
import { resolveWorkbenchServiceMode } from "@/pages/chat/api/workbench-service";

describe("resolveWorkbenchServiceMode", () => {
  it("uses http mode only when explicitly configured", () => {
    expect(resolveWorkbenchServiceMode("http")).toBe("http");
    expect(resolveWorkbenchServiceMode("mock")).toBe("mock");
  });

  it("falls back to mock mode for unknown values", () => {
    expect(resolveWorkbenchServiceMode(undefined)).toBe("mock");
    expect(resolveWorkbenchServiceMode("unexpected" as "mock")).toBe("mock");
  });
});
