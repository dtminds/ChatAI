import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WRITABLE_TABLES } from "../../src/db/writable-tables.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaSql = readFileSync(resolve(__dirname, "../../../../docs/db/schema.sql"), "utf8");

describe("database schema document", () => {
  it("defines the final ticket fields on session action items", () => {
    const actionItemTable = extractCreateTable(schemaSql, "xy_wap_embed_session_action_item");

    expect(actionItemTable).toContain("session_id BIGINT UNSIGNED NULL COMMENT '关联接待会话ID'");
    expect(actionItemTable).toContain("anchor_message_id BIGINT UNSIGNED NULL");
    expect(actionItemTable).toContain("description TEXT NULL");
    expect(actionItemTable).toContain("assignee_sub_user_id BIGINT UNSIGNED NULL");
    expect(actionItemTable).toContain("due_at DATETIME NULL");
    expect(actionItemTable).toContain("canceled_at DATETIME NULL");
    expect(actionItemTable).toContain("canceled_by_sub_user_id BIGINT UNSIGNED NULL");
    expect(actionItemTable).toContain("工单类型，当前固定follow_up：跟进");
    expect(actionItemTable).not.toContain("dismissed_at");
    expect(actionItemTable).toContain("open：待处理，in_progress：处理中，done：已完成，canceled：已取消");
  });

  it("defines ticket activities and allows the backend to write them", () => {
    const activityTable = extractCreateTable(schemaSql, "xy_wap_embed_ticket_activity");

    expect(activityTable).toContain("detail_json JSON NULL");
    expect(activityTable).toContain("KEY idx_ticket_activity_uid_ticket_id (uid, ticket_id, id)");
    expect(WRITABLE_TABLES).toContain("xy_wap_embed_ticket_activity");
  });

  it("reuses the tenant-scoped source-message unique key for ticket context lookup", () => {
    const sessionMessageTable = extractCreateTable(schemaSql, "xy_wap_embed_logical_session_message");

    expect(sessionMessageTable).toContain("UNIQUE KEY uk_session_message_source_uid (uid, source_message_id)");
    expect(sessionMessageTable).not.toContain("idx_session_message_ticket_context");
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
