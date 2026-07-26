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
  AiHostingPageHeader: ({ title, titleActions }: { title: React.ReactNode; titleActions?: React.ReactNode }) => <div><h1>{title}</h1>{titleActions}</div>,
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
    service.listUserMemoryCustomers.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
    service.updateUserMemorySettings.mockResolvedValue({ ...overview, enabled: true });
  });

  it("loads the daily overview and lets an admin enable maintenance", async () => {
    render(<UserMemoryPage />);
    const toggle = await screen.findByRole("switch", { name: "用户记忆" });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => expect(service.updateUserMemorySettings).toHaveBeenCalledWith({ enabled: true }));
  });

  it("keeps settings read-only for viewers", async () => {
    useAuthStore.getState().setSession({ accountType: "sub", displayName: "访客", permissions: ["chat.access"], role: "viewer", subUserId: "102", uid: 1 });
    render(<UserMemoryPage />);
    expect(await screen.findByRole("switch", { name: "用户记忆" })).toBeDisabled();
  });

  it("can refresh the same customer search without issuing requests on every keystroke", async () => {
    const user = userEvent.setup();
    render(<UserMemoryPage />);
    await screen.findByRole("switch", { name: "用户记忆" });
    await user.click(screen.getByRole("tab", { name: "记忆明细" }));
    const input = screen.getByRole("textbox", { name: "搜索客户" });
    fireEvent.change(input, { target: { value: "张三" } });
    expect(service.listUserMemoryCustomers).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    await waitFor(() => expect(service.listUserMemoryCustomers).toHaveBeenCalledWith({ page: 1, pageSize: 20, query: "张三" }));
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
    service.listUserMemoryCustomers.mockResolvedValue({ items: [{ platform: 5, thirdExternalUserId: "customer-1", customerName: "张三", memoryCount: 1, updatedAt: 1, version: 1 }], page: 1, pageSize: 20, total: 1 });
    service.getUserMemoryCustomer
      .mockResolvedValueOnce({ platform: 5, thirdExternalUserId: "customer-1", customerName: "张三", items: [], version: 1 })
      .mockResolvedValueOnce({ platform: 5, thirdExternalUserId: "customer-1", customerName: "张三", items: [], version: 2 });
    service.createUserMemoryItem
      .mockRejectedValueOnce(new RequestNormalizedError({ code: "AGENT_USER_MEMORY_VERSION_CONFLICT", message: "conflict", status: 400 }))
      .mockResolvedValueOnce({ platform: 5, thirdExternalUserId: "customer-1", customerName: "张三", items: [], version: 3 });
    render(<UserMemoryPage />);

    await screen.findByRole("switch", { name: "用户记忆" });
    await user.click(screen.getByRole("tab", { name: "记忆明细" }));
    fireEvent.click(await screen.findByRole("button", { name: "查看张三记忆" }));
    fireEvent.click(await screen.findByRole("button", { name: "新增记忆" }));
    fireEvent.change(screen.getByRole("textbox", { name: "记忆内容" }), { target: { value: "重点服务" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(service.getUserMemoryCustomer).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(service.createUserMemoryItem).toHaveBeenLastCalledWith("customer-1", {
      category: "customer_profile", content: "重点服务", expectedVersion: 2, expiresAt: null,
    }));
  });

  it("clears a recent intent expiry when switching to another memory category", async () => {
    const user = userEvent.setup();
    const customer = { platform: 5, thirdExternalUserId: "customer-1", customerName: "张三", memoryCount: 1, updatedAt: 1, version: 1 };
    const detail = { platform: 5, thirdExternalUserId: "customer-1", customerName: "张三", items: [], version: 1 };
    service.listUserMemoryCustomers.mockResolvedValue({ items: [customer], page: 1, pageSize: 20, total: 1 });
    service.getUserMemoryCustomer.mockResolvedValue(detail);
    service.createUserMemoryItem.mockResolvedValue(detail);
    render(<UserMemoryPage />);

    await user.click(await screen.findByRole("tab", { name: "记忆明细" }));
    await user.click(await screen.findByRole("button", { name: "查看张三记忆" }));
    await user.click(await screen.findByRole("button", { name: "新增记忆" }));
    await user.click(screen.getByRole("radio", { name: "近期意向" }));
    await user.click(screen.getByRole("button", { name: "7天" }));
    await user.click(screen.getByRole("radio", { name: "客户画像" }));
    fireEvent.change(screen.getByRole("textbox", { name: "记忆内容" }), { target: { value: "家有儿童" } });
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(service.createUserMemoryItem).toHaveBeenCalledWith("customer-1", {
      category: "customer_profile", content: "家有儿童", expectedVersion: 1, expiresAt: null,
    }));
  });

  it("offers a retry instead of leaving customer detail in a permanent loading state", async () => {
    const user = userEvent.setup();
    service.listUserMemoryCustomers.mockResolvedValue({ items: [{ platform: 5, thirdExternalUserId: "customer-1", customerName: "张三", memoryCount: 1, updatedAt: 1, version: 1 }], page: 1, pageSize: 20, total: 1 });
    service.getUserMemoryCustomer
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ platform: 5, thirdExternalUserId: "customer-1", customerName: "张三", items: [], version: 1 });
    render(<UserMemoryPage />);

    await screen.findByRole("switch", { name: "用户记忆" });
    await user.click(screen.getByRole("tab", { name: "记忆明细" }));
    await user.click(await screen.findByRole("button", { name: "查看张三记忆" }));
    await user.click(await screen.findByRole("button", { name: "重试" }));

    await waitFor(() => expect(service.getUserMemoryCustomer).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("button", { name: "新增记忆" })).toBeInTheDocument();
  });

  it("shows expired memories in customer details with an expired status", async () => {
    const user = userEvent.setup();
    const expiresAt = Date.parse("2026-07-01T00:00:00+08:00");
    service.listUserMemoryCustomers.mockResolvedValue({
      items: [{ platform: 5, thirdExternalUserId: "customer-1", customerName: "张三", memoryCount: 1, updatedAt: 1, version: 1 }],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    service.getUserMemoryCustomer.mockResolvedValue({
      platform: 5,
      thirdExternalUserId: "customer-1",
      customerName: "张三",
      items: [{
        id: 1,
        category: "recent_intent",
        content: "上周计划购买礼服",
        createdAt: expiresAt - 1,
        updatedAt: expiresAt - 1,
        expiresAt,
        source: "manual",
        updatedBySubUserId: 101,
      }],
      version: 1,
    });
    render(<UserMemoryPage />);

    await user.click(await screen.findByRole("tab", { name: "记忆明细" }));
    await user.click(await screen.findByRole("button", { name: "查看张三记忆" }));

    expect(await screen.findByText("上周计划购买礼服")).toBeInTheDocument();
    expect(screen.getByText(/^记忆 1 \/ 20，最近更新于 /)).toBeInTheDocument();
    expect(screen.getByText("近期意向")).toBeInTheDocument();
    expect(screen.getByText("人工")).toBeInTheDocument();
    expect(screen.getByText(/^短期记忆：已于 .* 到期$/)).toBeInTheDocument();
    expect(screen.getByText(/^更新于 /)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "记忆操作" }));
    expect(screen.getByRole("menuitem", { name: "编辑" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "删除" })).toBeInTheDocument();
  });

  it("uses standard pagination to replace the current customer page", async () => {
    const user = userEvent.setup();
    const first = { platform: 5, thirdExternalUserId: "first", customerName: "第一页客户", memoryCount: 1, updatedAt: 200, version: 1 };
    const second = { platform: 5, thirdExternalUserId: "second", customerName: "第二页客户", memoryCount: 1, updatedAt: 100, version: 1 };
    service.listUserMemoryCustomers
      .mockResolvedValueOnce({ items: [first], page: 1, pageSize: 20, total: 21 })
      .mockResolvedValueOnce({ items: [second], page: 2, pageSize: 20, total: 21 });
    render(<UserMemoryPage />);

    await user.click(await screen.findByRole("tab", { name: "记忆明细" }));
    expect(await screen.findByText("第一页客户")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "下一页" }));

    await waitFor(() => expect(service.listUserMemoryCustomers).toHaveBeenLastCalledWith({
      page: 2,
      pageSize: 20,
      query: undefined,
    }));
    expect(await screen.findByText("第二页客户")).toBeInTheDocument();
    expect(screen.queryByText("第一页客户")).not.toBeInTheDocument();
  });

  it("orders customer memories by update time and opens the selected detail", async () => {
    const user = userEvent.setup();
    const newer = { platform: 5, thirdExternalUserId: "newer", customerName: "新客户", memoryCount: 2, updatedAt: 200, version: 2 };
    const older = { platform: 5, thirdExternalUserId: "older", customerName: "旧客户", memoryCount: 1, updatedAt: 100, version: 1 };
    service.listUserMemoryCustomers.mockResolvedValue({ items: [older, newer], page: 1, pageSize: 20, total: 2 });
    service.getUserMemoryCustomer.mockResolvedValue({ platform: 5, thirdExternalUserId: "newer", customerName: "新客户", items: [], version: 2 });
    render(<UserMemoryPage />);

    await user.click(await screen.findByRole("tab", { name: "记忆明细" }));
    const rows = await screen.findAllByRole("row");
    expect(within(rows[1]!).getByText("新客户")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("旧客户")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "查看新客户记忆" }));
    expect(await screen.findByRole("dialog", { name: "新客户" })).toBeInTheDocument();
  });

});
