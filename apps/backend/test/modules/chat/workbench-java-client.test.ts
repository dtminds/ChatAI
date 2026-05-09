import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkbenchJavaClient } from "../../../src/modules/chat/workbench-java-client.js";

describe("createWorkbenchJavaClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.JAVA_INTERNAL_API_BASE_URL;
    delete process.env.JAVA_INTERNAL_API_TOKEN;
  });

  it("passes an abort signal to Java internal API requests", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    process.env.JAVA_INTERNAL_API_TOKEN = "internal-token";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ seat: { seatId: "drc" } }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await createWorkbenchJavaClient().takeOverSeat({
      seatId: "drc",
      subUserId: "101",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/internal/workbench/seats/take-over",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });
});
