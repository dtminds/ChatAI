import MockAdapter from "axios-mock-adapter";
import { afterEach, describe, expect, it } from "vitest";
import { requestInstance } from "@/lib/request";
import {
  createInsightRescanJob,
  getInsightDetail,
  getInsightFollowUps,
  getInsightMessageContext,
  getInsightOverview,
  getInsightQuality,
  getInsightSettings,
  updateInsightActionStatus,
} from "@/pages/chat/insights/api/insights-service";

const mock = new MockAdapter(requestInstance);

describe("insights service adapter", () => {
  afterEach(() => {
    mock.reset();
  });

  it("uses public /server insights endpoints for P0 APIs", async () => {
    mock.onGet("/server/insights/overview").reply(200, { data: { totalSessions: 1 }, success: true });
    mock.onGet("/server/insights/quality").reply(200, { data: { overview: {} }, success: true });
    mock.onGet("/server/insights/follow-ups").reply(200, { data: { items: [], total: 0 }, success: true });
    mock.onGet("/server/insights/sessions/501").reply(200, { data: { session: {} }, success: true });
    mock.onGet("/server/insights/messages/context").reply(200, { data: { messages: [] }, success: true });
    mock.onPatch("/server/insights/action-items/801/status").reply((config) => [
      200,
      { data: JSON.parse(config.data ?? "{}"), success: true },
    ]);
    mock.onGet("/server/insights/settings").reply(200, { data: { sessionization: {} }, success: true });
    mock.onPost("/server/insights/jobs/rescan").reply((config) => [
      200,
      { data: JSON.parse(config.data ?? "{}"), success: true },
    ]);

    await getInsightOverview({ from: "2026-06-01", to: "2026-06-02" });
    await getInsightQuality();
    await getInsightFollowUps({ priority: "high", status: "open", type: "logistics_check" });
    await getInsightDetail("501");
    await getInsightMessageContext({ conversationId: "301", messageId: "9002" });
    await updateInsightActionStatus("801", "done");
    await getInsightSettings();
    await createInsightRescanJob({ from: "2026-06-01T00:00:00.000Z" });

    expect(mock.history.get[0]?.url).toBe("/server/insights/overview");
    expect(mock.history.get[0]?.params).toEqual({
      from: "2026-06-01",
      to: "2026-06-02",
    });
    expect(mock.history.get[1]?.url).toBe("/server/insights/quality");
    expect(mock.history.get[2]?.url).toBe("/server/insights/follow-ups");
    expect(mock.history.get[2]?.params).toEqual({
      priority: "high",
      status: "open",
      type: "logistics_check",
    });
    expect(mock.history.get[3]?.url).toBe("/server/insights/sessions/501");
    expect(mock.history.get[4]?.url).toBe("/server/insights/messages/context");
    expect(mock.history.get[4]?.params).toEqual({
      conversationId: "301",
      messageId: "9002",
    });
    expect(mock.history.patch[0]?.url).toBe("/server/insights/action-items/801/status");
    expect(JSON.parse(mock.history.patch[0]?.data ?? "{}")).toEqual({ status: "done" });
    expect(mock.history.get[5]?.url).toBe("/server/insights/settings");
    expect(mock.history.post[0]?.url).toBe("/server/insights/jobs/rescan");
    expect(JSON.parse(mock.history.post[0]?.data ?? "{}")).toEqual({
      from: "2026-06-01T00:00:00.000Z",
    });
  });
});
