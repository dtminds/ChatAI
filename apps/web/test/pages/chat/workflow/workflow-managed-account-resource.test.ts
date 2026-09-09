// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { listSubAccounts } from "@/pages/chat/settings/settings-service";
import { listWorkflowManagedAccounts } from "@/pages/chat/workflow/workflow-managed-account-resource";

vi.mock("@/pages/chat/settings/settings-service", () => ({
  listSubAccounts: vi.fn(),
}));

describe("workflow managed account resource", () => {
  beforeEach(() => {
    vi.mocked(listSubAccounts).mockReset();
  });

  it("maps tenant managed accounts and drops invalid IDs", async () => {
    vi.mocked(listSubAccounts).mockResolvedValue({
      seats: [
        { avatarUrl: "https://example.com/account.png", name: "销售一组", seatId: "101" },
        { avatarUrl: "", name: "无效账号", seatId: "not-an-id" },
      ],
      subAccounts: [],
    });

    await expect(listWorkflowManagedAccounts()).resolves.toEqual([
      { avatarUrl: "https://example.com/account.png", id: 101, label: "销售一组" },
    ]);
    expect(listSubAccounts).toHaveBeenCalledOnce();
  });
});
