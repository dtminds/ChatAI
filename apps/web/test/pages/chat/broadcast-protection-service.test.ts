// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBroadcastProtectionStatus } from "@/pages/chat/api/broadcast-protection-service";

const request = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("@/lib/request", () => ({
  http: request,
}));

describe("broadcast protection service", () => {
  beforeEach(() => {
    request.get.mockReset();
  });

  it("loads the authenticated UID status through the workbench API", async () => {
    const controller = new AbortController();
    const status = {
      degradeCallbackCnt: 1800,
      degradeCallbackRate: 120,
      normalCallbackCnt: 8,
      normalCallbackRate: 600,
    };
    request.get.mockResolvedValue(status);

    await expect(
      getBroadcastProtectionStatus({ signal: controller.signal }),
    ).resolves.toEqual(status);
    expect(request.get).toHaveBeenCalledWith("/server/broadcast-protection", {
      signal: controller.signal,
    });
  });
});
