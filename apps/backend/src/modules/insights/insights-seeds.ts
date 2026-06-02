import type { InsightSettingsResponse } from "@chatai/contracts";

export const DEFAULT_INSIGHT_SETTINGS: InsightSettingsResponse = {
  analysisPolicy: {
    finalAnalysisEnabled: true,
    liveAnalysisEnabled: true,
    liveMinIntervalMinutes: 15,
    liveMinNewMeaningfulMessages: 20,
    lowConfidenceThreshold: 0.6,
    ruleFallbackEnabled: true,
  },
  entityDictionary: [
    {
      aliases: ["白鸭绒外套", "直播间羽绒服"],
      canonicalName: "白色羽绒服",
      enabled: true,
      entityType: "product",
      id: "1",
      includeInAggregation: true,
    },
  ],
  labelConfigs: [
    {
      enabled: true,
      id: "1",
      includeInStatistics: true,
      labelCode: "price_sensitive",
      labelName: "价格敏感",
    },
    {
      enabled: true,
      id: "2",
      includeInStatistics: true,
      labelCode: "high_intent",
      labelName: "高意向",
    },
  ],
  qaRuleConfigs: [
    {
      enabled: true,
      id: "1",
      ruleCode: "problem_resolution",
      ruleName: "客户问题是否解决",
      severity: "high",
    },
    {
      enabled: true,
      id: "2",
      ruleCode: "clear_next_step",
      ruleName: "是否明确下一步",
      severity: "medium",
    },
  ],
  sessionization: {
    analysisDelayMinutes: 10,
    hardMaxDurationHours: 8,
    idleTimeoutMinutes: 120,
    lateArrivalWindowMinutes: 30,
    preset: "custom",
  },
};
