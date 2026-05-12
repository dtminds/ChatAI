import { describe, expect, it } from "vitest";
import { createWorkbenchService } from "@/pages/chat/api/workbench-service";

describe("createWorkbenchService", () => {
  it("uses the HTTP workbench service by default", async () => {
    const service = createWorkbenchService();

    await expect(service.getMe()).rejects.toMatchObject({
      message: expect.any(String),
    });
  });
});
