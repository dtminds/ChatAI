import MockAdapter from "axios-mock-adapter";
import { afterEach, describe, expect, it } from "vitest";
import { requestInstance } from "@/lib/request";
import {
  createInsightEntityDictionaryItem,
  createInsightLabelConfig,
  createInsightQaRuleConfig,
  createInsightRescanJob,
  deleteInsightLabelConfig,
  getInsightBusiness,
  getInsightBusinessRelatedSessions,
  getInsightDetail,
  getInsightFollowUps,
  getInsightMessageContext,
  getInsightOverview,
  getInsightOverviewSessions,
  getInsightQuality,
  getInsightRescanTasks,
  getInsightSettings,
  updateInsightAnalysisPolicy,
  updateInsightActionStatus,
  updateInsightFeatureConfig,
  updateInsightLabelConfig,
  updateInsightLabelConfigStatus,
  updateInsightSessionizationSettings,
} from "@/pages/chat/insights/api/insights-service";

const mock = new MockAdapter(requestInstance);

describe("insights service adapter", () => {
  afterEach(() => {
    mock.reset();
  });

  it("uses public /server insights endpoints for P0 APIs", async () => {
    mock.onGet("/server/insights/overview").reply(200, { data: { totalSessions: 1 }, success: true });
    mock.onGet("/server/insights/overview/sessions").reply(200, { data: { items: [], total: 0 }, success: true });
    mock.onGet("/server/insights/business").reply(200, { data: { totals: {} }, success: true });
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
      { data: { ...JSON.parse(config.data ?? "{}"), jobId: "8801", status: "accepted", taskId: "9901" }, success: true },
    ]);
    mock.onGet(/\/server\/insights\/jobs\/rescan.*/).reply(200, {
      data: { items: [], total: 0 },
      success: true,
    });

    await getInsightOverview({
      from: "2026-06-01",
      to: "2026-06-02",
    });
    await getInsightOverviewSessions({
      analysisStatus: "ready",
      entityName: "白色羽绒服",
      from: "2026-06-01",
      intentCode: "logistics_delay",
      keyword: "物流",
      page: 2,
      pageSize: 20,
      problemScope: "unresolved",
      resolutionStatus: "unresolved",
      tagCode: "logistics_issue",
      to: "2026-06-02",
    });
    await getInsightBusiness({ from: "2026-06-01", to: "2026-06-02" });
    await getInsightQuality();
    await getInsightFollowUps({ priority: "high", status: "open" });
    await getInsightDetail("501");
    await getInsightMessageContext({ conversationId: "301", messageId: "9002" });
    await updateInsightActionStatus("801", "done");
    await getInsightSettings();
    await createInsightRescanJob({
      analysisScope: "classification",
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-06-02T00:00:00.000Z",
    });
    await getInsightRescanTasks();

    expect(mock.history.get[0]?.url).toBe("/server/insights/overview");
    expect(mock.history.get[0]?.params).toEqual({
      from: "2026-06-01",
      to: "2026-06-02",
    });
    expect(mock.history.get[1]?.url).toBe("/server/insights/overview/sessions");
    expect(mock.history.get[1]?.params).toEqual({
      analysisStatus: "ready",
      entityName: "白色羽绒服",
      from: "2026-06-01",
      intentCode: "logistics_delay",
      keyword: "物流",
      page: 2,
      pageSize: 20,
      problemScope: "unresolved",
      resolutionStatus: "unresolved",
      tagCode: "logistics_issue",
      to: "2026-06-02",
    });
    expect(mock.history.get[2]?.url).toBe("/server/insights/business");
    expect(mock.history.get[2]?.params).toEqual({
      from: "2026-06-01",
      to: "2026-06-02",
    });
    expect(mock.history.get[3]?.url).toBe("/server/insights/quality");
    expect(mock.history.get[4]?.url).toBe("/server/insights/follow-ups");
    expect(mock.history.get[4]?.params).toEqual({
      priority: "high",
      status: "open",
    });
    expect(mock.history.get[5]?.url).toBe("/server/insights/sessions/501");
    expect(mock.history.get[6]?.url).toBe("/server/insights/messages/context");
    expect(mock.history.get[6]?.params).toEqual({
      conversationId: "301",
      messageId: "9002",
    });
    expect(mock.history.patch[0]?.url).toBe("/server/insights/action-items/801/status");
    expect(JSON.parse(mock.history.patch[0]?.data ?? "{}")).toEqual({ status: "done" });
    expect(mock.history.get[7]?.url).toBe("/server/insights/settings");
    expect(mock.history.post[0]?.url).toBe("/server/insights/jobs/rescan");
    expect(JSON.parse(mock.history.post[0]?.data ?? "{}")).toEqual({
      analysisScope: "classification",
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-06-02T00:00:00.000Z",
    });
    expect(mock.history.get[8]?.url).toBe("/server/insights/jobs/rescan?page=1&pageSize=10");
  });

  it("uses public /server insights endpoints for settings CRUD", async () => {
    mock.onPut("/server/insights/settings/sessionization").reply((config) => [
      200,
      { data: JSON.parse(config.data ?? "{}"), success: true },
    ]);
    mock.onPut("/server/insights/settings/analysis-policy").reply((config) => [
      200,
      { data: JSON.parse(config.data ?? "{}"), success: true },
    ]);
    mock.onPut("/server/insights/settings/feature-config").reply((config) => [
      200,
      { data: JSON.parse(config.data ?? "{}"), success: true },
    ]);
    mock.onPost("/server/insights/settings/label-configs").reply((config) => [
      200,
      { data: { ...JSON.parse(config.data ?? "{}"), id: "11" }, success: true },
    ]);
    mock.onPut("/server/insights/settings/label-configs/11").reply((config) => [
      200,
      { data: { ...JSON.parse(config.data ?? "{}"), id: "11" }, success: true },
    ]);
    mock.onPatch("/server/insights/settings/label-configs/11/status").reply((config) => [
      200,
      { data: { ...JSON.parse(config.data ?? "{}"), id: "11" }, success: true },
    ]);
    mock.onDelete("/server/insights/settings/label-configs/11").reply(200, {
      data: { deleted: true },
      success: true,
    });
    mock.onPost("/server/insights/settings/qa-rule-configs").reply(200, { data: { id: "21" }, success: true });
    mock.onPost("/server/insights/settings/entity-dictionary").reply(200, { data: { id: "41" }, success: true });

    await updateInsightSessionizationSettings({
      analysisDelayMinutes: 10,
      hardMaxDurationHours: 8,
      idleTimeoutMinutes: 120,
      lateArrivalWindowMinutes: 30,
      preset: "custom",
    });
    await updateInsightAnalysisPolicy({
      finalAnalysisEnabled: true,
      liveAnalysisEnabled: true,
      liveMinIntervalMinutes: 15,
      liveMinNewMeaningfulMessages: 20,
      lowConfidenceThreshold: 0.6,
      ruleFallbackEnabled: true,
    });
    await updateInsightFeatureConfig({
      entityEnabled: true,
      insightEnabled: true,
      intentEnabled: true,
      labelEnabled: true,
      qaEnabled: true,
      todoEnabled: false,
    });
    await createInsightLabelConfig({
      status: 1,
      includeInStatistics: true,
      labelCode: "price_sensitive",
      labelName: "价格敏感",
    });
    await updateInsightLabelConfig("11", {
      status: 1,
      includeInStatistics: true,
      labelCode: "price_sensitive",
      labelName: "价格敏感",
    });
    await updateInsightLabelConfigStatus("11", { status: 0 });
    await deleteInsightLabelConfig("11");
    await createInsightQaRuleConfig({
      status: 1,
      ruleCode: "problem_resolution",
      ruleName: "客户问题是否解决",
      severity: "high",
    });
    await createInsightEntityDictionaryItem({
      aliases: ["白鸭绒外套"],
      canonicalName: "白色羽绒服",
      status: 1,
      entityType: "product",
      includeInAggregation: true,
    });

    expect(mock.history.put[0]?.url).toBe("/server/insights/settings/sessionization");
    expect(mock.history.put[1]?.url).toBe("/server/insights/settings/analysis-policy");
    expect(mock.history.put[2]?.url).toBe("/server/insights/settings/feature-config");
    expect(mock.history.post[0]?.url).toBe("/server/insights/settings/label-configs");
    expect(mock.history.put[3]?.url).toBe("/server/insights/settings/label-configs/11");
    expect(mock.history.patch[0]?.url).toBe("/server/insights/settings/label-configs/11/status");
    expect(JSON.parse(mock.history.patch[0]?.data ?? "{}")).toEqual({ status: 0 });
    expect(mock.history.delete[0]?.url).toBe("/server/insights/settings/label-configs/11");
    expect(mock.history.post[1]?.url).toBe("/server/insights/settings/qa-rule-configs");
    expect(mock.history.post[2]?.url).toBe("/server/insights/settings/entity-dictionary");
  });

  it("passes abort signals to business, quality and follow-up requests", async () => {
    const businessController = new AbortController();
    const relatedSessionsController = new AbortController();
    const qualityController = new AbortController();
    const followUpsController = new AbortController();

    mock.onGet("/server/insights/business").reply(200, { data: { totals: {} }, success: true });
    mock.onGet("/server/insights/business/related-sessions").reply(200, { data: { items: [], total: 0 }, success: true });
    mock.onGet("/server/insights/quality").reply(200, { data: { overview: {} }, success: true });
    mock.onGet("/server/insights/follow-ups").reply(200, { data: { items: [], total: 0 }, success: true });

    await getInsightBusiness(
      { from: "2026-06-01", to: "2026-06-02" },
      { signal: businessController.signal },
    );
    await getInsightBusinessRelatedSessions(
      {
        dimension: "intent",
        page: 1,
        pageSize: 20,
        topicCode: "logistics_delay",
      },
      { signal: relatedSessionsController.signal },
    );
    await getInsightQuality(
      { page: 1, pageSize: 10 },
      { signal: qualityController.signal },
    );
    await getInsightFollowUps(
      { page: 1, pageSize: 10, status: "open" },
      { signal: followUpsController.signal },
    );

    expect(mock.history.get[0]?.signal).toBe(businessController.signal);
    expect(mock.history.get[0]?.params).toEqual({
      from: "2026-06-01",
      to: "2026-06-02",
    });
    expect(mock.history.get[1]?.signal).toBe(relatedSessionsController.signal);
    expect(mock.history.get[1]?.params).toEqual({
      dimension: "intent",
      page: 1,
      pageSize: 20,
      topicCode: "logistics_delay",
    });
    expect(mock.history.get[2]?.signal).toBe(qualityController.signal);
    expect(mock.history.get[2]?.params).toEqual({
      page: 1,
      pageSize: 10,
    });
    expect(mock.history.get[3]?.signal).toBe(followUpsController.signal);
    expect(mock.history.get[3]?.params).toEqual({
      page: 1,
      pageSize: 10,
      status: "open",
    });
  });
});
