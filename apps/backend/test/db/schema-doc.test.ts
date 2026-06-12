import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaSql = readFileSync(resolve(__dirname, "../../../../docs/db/schema.sql"), "utf8");

describe("database schema document", () => {
  it("requires session action items to reference a logical session", () => {
    const actionItemTable = extractCreateTable(schemaSql, "xy_wap_embed_session_action_item");

    expect(actionItemTable).toContain("session_id BIGINT UNSIGNED NOT NULL COMMENT '逻辑会话ID'");
  });

  it("does not keep non-tenant-prefixed action item status priority index", () => {
    const actionItemTable = extractCreateTable(schemaSql, "xy_wap_embed_session_action_item");

    expect(actionItemTable).not.toContain("idx_action_status_priority");
  });

  it("keeps current_snapshot_id as the only logical session snapshot pointer", () => {
    const logicalSessionTable = extractCreateTable(schemaSql, "xy_wap_embed_logical_session");

    expect(logicalSessionTable).toContain("current_snapshot_id BIGINT UNSIGNED NULL");
    expect(logicalSessionTable).not.toContain("final_snapshot_id");
  });

  it("keeps analysis policy enabled column used by runtime queries", () => {
    const analysisPolicyTable = extractCreateTable(schemaSql, "xy_wap_embed_insight_analysis_policy");

    expect(analysisPolicyTable).toMatch(/\n  enabled TINYINT UNSIGNED NOT NULL DEFAULT 1\b/);
  });
});

function extractCreateTable(sql: string, tableName: string) {
  const match = new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName} \\([\\s\\S]*?\\n\\) COMMENT`).exec(sql);

  if (!match) {
    throw new Error(`Missing CREATE TABLE for ${tableName}`);
  }

  return match[0];
}
