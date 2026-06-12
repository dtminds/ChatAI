import type { InsightFeatureConfig } from "@chatai/contracts";
import type { InsightWorkerFeatureConfig } from "./insights-worker.js";

export type InsightFeatureConfigRow = {
  entity_enabled: number | string;
  insight_enabled: number | string;
  intent_enabled: number | string;
  label_enabled: number | string;
  last_enable_time: number | string | null;
  qa_enabled: number | string;
  todo_enabled: number | string;
  uid?: number | string;
};

export function parseFeatureConfigRow(row: InsightFeatureConfigRow): InsightFeatureConfig {
  return {
    entityEnabled: parseNumber(row.entity_enabled) === 1,
    insightEnabled: parseNumber(row.insight_enabled) === 1,
    intentEnabled: parseNumber(row.intent_enabled) === 1,
    labelEnabled: parseNumber(row.label_enabled) === 1,
    lastEnableTime: row.last_enable_time == null ? undefined : parseNumber(row.last_enable_time),
    qaEnabled: parseNumber(row.qa_enabled) === 1,
    todoEnabled: parseNumber(row.todo_enabled) === 1,
  };
}

export function parseWorkerFeatureConfigRow(row: InsightFeatureConfigRow): InsightWorkerFeatureConfig {
  return {
    ...parseFeatureConfigRow(row),
    uid: parseNumber(row.uid),
  };
}

function parseNumber(value: number | string | null | undefined) {
  return typeof value === "number" ? value : Number(value ?? 0);
}
