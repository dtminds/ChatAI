import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequestNormalizedError } from "@/lib/request";
import { UserMemoryPage } from "@/pages/chat/ai-hosting/user-memory-page";
import { useAuthStore } from "@/store/auth-store";

const service = vi.hoisted(() => ({
  createUserMemoryItem: vi.fn(), deleteUserMemoryItem: vi.fn(), getUserMemoryCustomer: vi.fn(), getUserMemoryEvidence: vi.fn(),
  getUserMemoryOverview: vi.fn(), getUserMemoryRun: vi.fn(), listUserMemoryCustomers: vi.fn(), listUserMemoryRuns: vi.fn(), retryUserMemoryRun: vi.fn(),
  updateUserMemoryItem: vi.fn(), updateUserMemorySettings: vi.fn(),
}));
vi.mock("@/pages/chat/ai-hosting/api/user-memory-service", () => service);
vi.mock("@/pages/chat/ai-hosting/ai-hosting-layout", () => ({
  AiHostingLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AiHostingPageHeader: ({ title }: { title: React.ReactNode }) => <h1>{title}</h1>,
}));

const overview = { enabled: false, executionMode: "sync" as const, customerLimit: 100, schedule: "02:00", timezone: "Asia/Shanghai" };
const run = {
  candidateCustomerCount: 1, candidateSessionCount: 1, candidateSessionLimit: 200, customerLimit: 100,
  executionMode: "sync" as const, failureCount: 0, id: 9, inputTokens: 0, outputTokens: 0,
  phase: "completed" as const, quotaDate: "2026-07-23", scheduledFor: 1, selectedCustomerCount: 1,
  skippedCount: 0, status: "succeeded" as const, successCount: 1,
};

describe("user memory page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState(useAuthStore.getInitialState(), true);
    useAuthStore.getState().setSession({ accountType: "sub", displayName: "管理员", permissions: ["chat.access"], role: "admin", subUserId: "101", uid: 1 });
    service.getUserMemoryOverview.mockResolvedValue(overview);
    service.listUserMemoryRuns.mockResolvedValue({ items: [] });
    service.listUserMemoryCustomers.mockResolvedValue({ items: [] });
    service.updateUserMemorySettings.mockResolvedValue({ ...overview, enabled: true });
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

  it("can refresh the same customer search without issuing requests on every keystroke", async () => {
    const user = userEvent.setup();
    render(<UserMemoryPage />);
    await screen.findByRole("switch", { name: "自动维护" });
    await user.click(screen.getByRole("tab", { name: "记忆管理" }));
    const input = screen.getByRole("textbox", { name: "搜索客户" });
    fireEvent.change(input, { target: { value: "张三" } });
    expect(service.listUserMemoryCustomers).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    await waitFor(() => expect(service.listUserMemoryCustomers).toHaveBeenCalledWith({ pageSize: 20, query: "张三" }));
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    await waitFor(() => expect(service.listUserMemoryCustomers).toHaveBeenCalledTimes(3));
  });

  it("paginates run items beyond the first 100 customers", async () => {
    service.listUserMemoryRuns.mockResolvedValue({ items: [run] });
    service.getUserMemoryRun
      .mockResolvedValueOnce({ run, items: [{ id: 2, platform: 5, thirdExternalUserId: "a", sessionCount: 1, messageCount: 5, status: "succeeded", attemptCount: 1, inputTokens: 1, outputTokens: 1 }], nextItemCursor: "next" })
      .mockResolvedValueOnce({ run, items: [{ id: 1, platform: 5, thirdExternalUserId: "b", sessionCount: 1, messageCount: 5, status: "succeeded", attemptCount: 1, inputTokens: 1, outputTokens: 1 }] });
    render(<UserMemoryPage />);

    fireEvent.click(await screen.findByRole("button", { name: "详情" }));
    const dialog = await screen.findByRole("dialog", { name: "运行详情" });
    fireEvent.click(within(dialog).getByRole("button", { name: "加载更多" }));

    await waitFor(() => expect(service.getUserMemoryRun).toHaveBeenLastCalledWith(9, { itemCursor: "next", itemPageSize: 100 }));
    expect(within(dialog).getByText("b")).toBeInTheDocument();
  });

  it("reloads the latest customer document after an optimistic version conflict", async () => {
    const user = userEvent.setup();
    service.listUserMemoryCustomers.mockResolvedValue({ items: [{ platform: 5, thirdExternalUserId: "customer-1", customerName: "张三", memoryCount: 0, version: 1 }] });
    service.getUserMemoryCustomer
      .mockResolvedValueOnce({ platform: 5, thirdExternalUserId: "customer-1", customerName: "张三", items: [], version: 1 })
      .mockResolvedValueOnce({ platform: 5, thirdExternalUserId: "customer-1", customerName: "张三", items: [], version: 2 });
    service.createUserMemoryItem.mockRejectedValue(new RequestNormalizedError({ code: "AGENT_USER_MEMORY_VERSION_CONFLICT", message: "conflict", status: 400 }));
    render(<UserMemoryPage />);

    await screen.findByRole("switch", { name: "自动维护" });
    await user.click(screen.getByRole("tab", { name: "记忆管理" }));
    fireEvent.click(await screen.findByRole("button", { name: /张三/ }));
    fireEvent.click(await screen.findByRole("button", { name: "新增记忆" }));
    fireEvent.change(screen.getByRole("textbox", { name: "记忆内容" }), { target: { value: "重点服务" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(service.getUserMemoryCustomer).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("版本 2")).toBeInTheDocument();
  });
  it("offers a retry instead of leaving customer detail in a permanent loading state", async () => {
    const user = userEvent.setup();
    service.listUserMemoryCustomers.mockResolvedValue({ items: [{ platform: 5, thirdExternalUserId: "customer-1", customerName: "张三", memoryCount: 0, version: 1 }] });
    service.getUserMemoryCustomer
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ platform: 5, thirdExternalUserId: "customer-1", customerName: "张三", items: [], version: 1 });
    render(<UserMemoryPage />);

    await screen.findByRole("switch", { name: "自动维护" });
    await user.click(screen.getByRole("tab", { name: "记忆管理" }));
    await user.click(await screen.findByRole("button", { name: /张三/ }));
    await user.click(await screen.findByRole("button", { name: "重试" }));

    await waitFor(() => expect(service.getUserMemoryCustomer).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("版本 1")).toBeInTheDocument();
  });

});
