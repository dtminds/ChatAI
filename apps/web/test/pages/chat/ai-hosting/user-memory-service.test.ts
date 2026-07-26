import MockAdapter from "axios-mock-adapter";
import { afterEach, describe, expect, it } from "vitest";
import { requestInstance } from "@/lib/request";
import { createUserMemoryItem, deleteUserMemoryItem, getUserMemoryCustomer, getUserMemoryEvidence, getUserMemoryOverview, getUserMemoryRun, listUserMemoryCustomers, listUserMemoryRuns, retryUserMemoryRun, updateUserMemoryItem, updateUserMemorySettings } from "@/pages/chat/ai-hosting/api/user-memory-service";

const mock = new MockAdapter(requestInstance);
describe("user memory service adapter", () => {
  afterEach(() => mock.reset());
  it("uses Agent user-memory endpoints and preserves optimistic versions", async () => {
    mock.onGet("/server/ai-hosting/user-memory/overview").reply(200, { data: { enabled: false }, success: true });
    mock.onPut("/server/ai-hosting/user-memory/settings").reply(200, { data: { enabled: true }, success: true });
    mock.onGet("/server/ai-hosting/user-memory/runs?cursor=next&pageSize=20").reply(200, { data: { items: [] }, success: true });
    mock.onGet("/server/ai-hosting/user-memory/runs/9?itemCursor=item-next&itemPageSize=100&status=failed").reply(200, { data: { items: [] }, success: true });
    mock.onPost("/server/ai-hosting/user-memory/runs/9/retry-failed").reply(200, { data: { resetCount: 1, skippedCount: 0 }, success: true });
    mock.onGet("/server/ai-hosting/user-memory/customers?page=1&pageSize=20&query=%E5%BC%A0%E4%B8%89").reply(200, { data: { items: [], page: 1, pageSize: 20, total: 0 }, success: true });
    mock.onGet("/server/ai-hosting/user-memory/customers/customer%2F1").reply(200, { data: { items: [], version: 0 }, success: true });
    mock.onGet("/server/ai-hosting/user-memory/customers/customer%2F1/items/3/evidence").reply(200, { data: { messages: [] }, success: true });
    mock.onPost("/server/ai-hosting/user-memory/customers/customer%2F1/items").reply((config) => [200, { data: JSON.parse(config.data), success: true }]);
    mock.onPatch("/server/ai-hosting/user-memory/customers/customer%2F1/items/3").reply((config) => [200, { data: JSON.parse(config.data), success: true }]);
    mock.onDelete("/server/ai-hosting/user-memory/customers/customer%2F1/items/3").reply((config) => [200, { data: JSON.parse(config.data), success: true }]);

    await getUserMemoryOverview();
    await updateUserMemorySettings({ enabled: true });
    await listUserMemoryRuns({ cursor: "next", pageSize: 20 });
    await getUserMemoryRun(9, { itemCursor: "item-next", itemPageSize: 100, status: "failed" });
    await retryUserMemoryRun(9);
    await listUserMemoryCustomers({ page: 1, pageSize: 20, query: "张三" });
    await getUserMemoryCustomer("customer/1");
    await getUserMemoryEvidence("customer/1", 3);
    await createUserMemoryItem("customer/1", { category: "preference", content: "只在下午联系", expectedVersion: 2, expiresAt: null });
    await updateUserMemoryItem("customer/1", 3, { category: "preference", content: "仅发送文字消息", expectedVersion: 3, expiresAt: null });
    await deleteUserMemoryItem("customer/1", 3, { expectedVersion: 4 });

    expect(mock.history.put[0]?.data).toBe(JSON.stringify({ enabled: true }));
    expect(mock.history.post.at(-1)?.data).toContain('"expectedVersion":2');
    expect(mock.history.patch[0]?.data).toContain('"expectedVersion":3');
    expect(mock.history.delete[0]?.data).toBe(JSON.stringify({ expectedVersion: 4 }));
    expect(mock.history.post.some((entry) => entry.url === "/server/ai-hosting/user-memory/runs")).toBe(false);
  });
});
