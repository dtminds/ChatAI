import { act, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiHostingQuotaOverview } from "@chatai/contracts";
import { getAiHostingQuota } from "@/pages/chat/ai-hosting/agent-service";
import { AiHostingLayout } from "@/pages/chat/ai-hosting/ai-hosting-layout";
import { resetAiHostingQuotaCacheForTest } from "@/pages/chat/ai-hosting/ai-hosting-quota-store";
import { useAuthStore } from "@/store/auth-store";

vi.mock("@/pages/chat/ai-hosting/agent-service", () => ({
  getAiHostingQuota: vi.fn(),
}));

vi.mock("@/pages/chat/components/signed-in-account-menu", () => ({
  SignedInAccountMenu: () => null,
}));

function createQuota(overrides?: {
  usedAgents?: number;
  usedKbDocs?: number;
  usedKbs?: number;
}): AiHostingQuotaOverview {
  return {
    agents: { limit: 20, used: overrides?.usedAgents ?? 2 },
    kbDocs: {
      limit: 1024 * 1024 * 1024,
      used: overrides?.usedKbDocs ?? 20 * 1024 * 1024,
    },
    kbs: { limit: 20, used: overrides?.usedKbs ?? 3 },
  };
}

function setOwner(subUserId: string) {
  useAuthStore.getState().setSession({
    accountType: "sub",
    displayName: "客服主管",
    permissions: ["chat.access", "chat.send", "chat.takeover"],
    role: "admin",
    subUserId,
    uid: 1,
  });
}

function renderLayout() {
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: <AiHostingLayout title="Agent 管理">{null}</AiHostingLayout>,
      },
    ],
    { initialEntries: ["/chat/ai-hosting/agents"] },
  );

  return render(<RouterProvider router={router} />);
}

function quotaPanel() {
  return screen.getByRole("region", { name: "智能体用量" });
}

describe("AI hosting layout quota", () => {
  beforeEach(() => {
    useAuthStore.setState(useAuthStore.getInitialState(), true);
    resetAiHostingQuotaCacheForTest();
    vi.mocked(getAiHostingQuota).mockReset();
    setOwner("101");
  });

  it("clears and reloads sidebar quota when the account owner changes without unmounting", async () => {
    vi.mocked(getAiHostingQuota)
      .mockResolvedValueOnce(createQuota())
      .mockResolvedValueOnce(
        createQuota({
          usedAgents: 7,
          usedKbDocs: 64 * 1024 * 1024,
          usedKbs: 9,
        }),
      );

    renderLayout();

    expect(await screen.findByText("20MB/1GB")).toBeInTheDocument();
    expect(quotaPanel()).toHaveTextContent("2/20");

    act(() => {
      setOwner("202");
    });

    expect(quotaPanel()).not.toHaveTextContent("20MB/1GB");

    await waitFor(() => {
      expect(getAiHostingQuota).toHaveBeenCalledTimes(2);
    });
    expect(quotaPanel()).toHaveTextContent("7/20");
    expect(quotaPanel()).toHaveTextContent("9/20");
    expect(quotaPanel()).toHaveTextContent("64MB/1GB");
  });
});
