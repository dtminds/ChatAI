import { describe, expect, it } from "vitest";
import { resolveWorkbenchServiceMode } from "@/pages/chat/api/workbench-service";

describe("resolveWorkbenchServiceMode", () => {
  it("respects explicit service mode configuration", () => {
    expect(resolveWorkbenchServiceMode("http")).toBe("http");
    expect(resolveWorkbenchServiceMode("mock")).toBe("mock");
  });

  it("uses mock mode by default in tests", () => {
    expect(resolveWorkbenchServiceMode(undefined)).toBe("mock");
    expect(resolveWorkbenchServiceMode("unexpected" as "mock")).toBe("mock");
  });
});
