import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserMemoryPage } from "@/pages/chat/ai-hosting/user-memory-page";
import { useAuthStore } from "@/store/auth-store";

const service = vi.hoisted(() => ({
  createUserMemoryItem: vi.fn(), deleteUserMemoryItem: vi.fn(), getUserMemoryCustomer: vi.fn(), getUserMemoryEvidence: vi.fn(),
  getUserMemoryOverview: vi.fn(), listUserMemoryCustomers: vi.fn(), listUserMemoryRuns: vi.fn(), retryUserMemoryRun: vi.fn(),
  updateUserMemoryItem: vi.fn(), updateUserMemorySettings: vi.fn(),
}));
vi.mock("@/pages/chat/ai-hosting/api/user-memory-service", () => service);
vi.mock("@/pages/chat/ai-hosting/ai-hosting-layout", () => ({
  AiHostingLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AiHostingPageHeader: ({ title }: { title: React.ReactNode }) => <h1>{title}</h1>,
}));

describe("user memory page", () => {
  beforeEach(() => {
    useAuthStore.setState(useAuthStore.getInitialState(), true);
    useAuthStore.getState().setSession({ accountType: "sub", displayName: "管理员", permissions: ["chat.access"], role: "admin", subUserId: "101", uid: 1 });
    service.getUserMemoryOverview.mockResolvedValue({ enabled: false, executionMode: "sync", customerLimit: 100, schedule: "02:00", timezone: "Asia/Shanghai" });
    service.listUserMemoryRuns.mockResolvedValue({ items: [] });
    service.listUserMemoryCustomers.mockResolvedValue({ items: [] });
    service.updateUserMemorySettings.mockResolvedValue({ enabled: true, executionMode: "sync", customerLimit: 100, schedule: "02:00", timezone: "Asia/Shanghai" });
  });
  it("loads the daily overview and lets an admin enable maintenance", async () => {
    render(<UserMemoryPage />);
    const toggle = await screen.findByRole("switch", { name: "自动维护" });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => expect(service.updateUserMemorySettings).toHaveBeenCalledWith({ enabled: true }));
  });
  it("keeps settings read-only for viewers", async () => {
    useAuthStore.getState().setSession({ accountType: "sub", displayName: "访客", permissions: ["chat.access"], role: "viewer", subUserId: "102", uid: 1 });
    render(<UserMemoryPage />);
    expect(await screen.findByRole("switch", { name: "自动维护" })).toBeDisabled();
  });
});
