import { parseFeatureConfigRow, type InsightFeatureConfigRow } from "./insights-feature-config-mapper.js";
import type { InsightWorkerFeatureConfig } from "./insights-worker.js";

export function parseWorkerFeatureConfigRow(row: InsightFeatureConfigRow): InsightWorkerFeatureConfig {
  return {
    ...parseFeatureConfigRow(row),
    uid: typeof row.uid === "number" ? row.uid : Number(row.uid ?? 0),
  };
}
