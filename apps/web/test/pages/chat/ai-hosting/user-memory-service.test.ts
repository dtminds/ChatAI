import MockAdapter from "axios-mock-adapter";
import { afterEach, describe, expect, it } from "vitest";
import { requestInstance } from "@/lib/request";
import { createUserMemoryItem, deleteUserMemoryItem, getUserMemoryCustomer, listUserMemoryCustomers, listUserMemoryRuns, retryUserMemoryRun, updateUserMemorySettings } from "@/pages/chat/ai-hosting/api/user-memory-service";

const mock = new MockAdapter(requestInstance);
describe("user memory service adapter", () => {
  afterEach(() => mock.reset());
  it("uses Agent user-memory endpoints and preserves optimistic versions", async () => {
    mock.onPut("/server/ai-hosting/user-memory/settings").reply(200, { data: { enabled: true }, success: true });
    mock.onGet("/server/ai-hosting/user-memory/runs?cursor=next&pageSize=20").reply(200, { data: { items: [] }, success: true });
    mock.onPost("/server/ai-hosting/user-memory/runs/9/retry-failed").reply(200, { data: { resetCount: 1, skippedCount: 0 }, success: true });
    mock.onGet("/server/ai-hosting/user-memory/customers?pageSize=20&query=%E5%BC%A0%E4%B8%89").reply(200, { data: { items: [] }, success: true });
    mock.onGet("/server/ai-hosting/user-memory/customers/customer%2F1?platform=5").reply(200, { data: { items: [], version: 0 }, success: true });
    mock.onPost("/server/ai-hosting/user-memory/customers/customer%2F1/items?platform=5").reply((config) => [200, { data: JSON.parse(config.data), success: true }]);
    mock.onDelete("/server/ai-hosting/user-memory/customers/customer%2F1/items/3?platform=5").reply((config) => [200, { data: JSON.parse(config.data), success: true }]);

    await updateUserMemorySettings({ enabled: true });
    await listUserMemoryRuns({ cursor: "next", pageSize: 20 });
    await retryUserMemoryRun(9);
    await listUserMemoryCustomers({ pageSize: 20, query: "张三" });
    await getUserMemoryCustomer(5, "customer/1");
    await createUserMemoryItem(5, "customer/1", { category: "manual_note", content: "重点服务", expectedVersion: 2, expiresAt: null });
    await deleteUserMemoryItem(5, "customer/1", 3, { expectedVersion: 3 });

    expect(mock.history.put[0]?.data).toBe(JSON.stringify({ enabled: true }));
    expect(mock.history.post.at(-1)?.data).toContain('"expectedVersion":2');
    expect(mock.history.delete[0]?.data).toBe(JSON.stringify({ expectedVersion: 3 }));
    expect(mock.history.post.some((entry) => entry.url === "/server/ai-hosting/user-memory/runs")).toBe(false);
  });
});
