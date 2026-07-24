import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WRITABLE_TABLES } from "../../src/db/writable-tables.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaSql = readFileSync(resolve(__dirname, "../../../../docs/db/schema.sql"), "utf8");
const changeLogMarkdown = readFileSync(resolve(__dirname, "../../../../docs/db/change-log.md"), "utf8");

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

  it("keeps ID-ordered ticket list indexes free of update_time", () => {
    const actionItemTable = extractCreateTable(schemaSql, "xy_wap_embed_session_action_item");
    const ticketIndexes = actionItemTable
      .split("\n")
      .filter((line) => line.includes("KEY idx_ticket_"))
      .join("\n");

    expect(ticketIndexes).toContain("KEY idx_ticket_uid_assignee_status_id (uid, assignee_sub_user_id, status, id)");
    expect(ticketIndexes).toContain("KEY idx_ticket_uid_conversation_status_id (uid, conversation_id, status, id)");
    expect(ticketIndexes).toContain("KEY idx_ticket_uid_conversation_id (uid, conversation_id, id)");
    expect(ticketIndexes).toContain("KEY idx_ticket_uid_status_id (uid, status, id)");
    expect(ticketIndexes).toContain("KEY idx_ticket_uid_status_due_at (uid, status, due_at)");
    expect(ticketIndexes).toContain("KEY idx_ticket_uid_creator_id (uid, created_by_sub_user_id, id)");
    expect(ticketIndexes).toContain("KEY idx_ticket_uid_source_status_id (uid, source_type, status, id)");
    expect(ticketIndexes).not.toContain("update_time");
  });

  it("documents one main-baseline ticket migration that clears test data without backfill", () => {
    const migration = extractChangeLogEntry(changeLogMarkdown, "2026-07-30");

    expect(migration).toContain("DELETE FROM xy_wap_embed_insight_evidence");
    expect(migration).toContain("DELETE FROM xy_wap_embed_session_action_item");
    expect(migration).toContain("DROP COLUMN updated_by_sub_user_id");
    expect(migration).toContain("RENAME INDEX idx_action_uid_conversation_status");
    expect(migration).toContain("COMMENT = '工单主表'");
    expect(migration).toContain("idx_ticket_uid_status_due_at                 (uid, status, due_at)");
    expect(migration).toContain("'updated_by_sub_user_id',");
    expect(migration).toContain("'anchor_message_id',");
    expect(migration).not.toContain("SET canceled_at");
    expect(migration).not.toContain("idx_ticket_uid_assignee_status_updated");
  });

  it("keeps current_snapshot_id as the only logical session snapshot pointer", () => {
    const logicalSessionTable = extractCreateTable(schemaSql, "xy_wap_embed_logical_session");

    expect(logicalSessionTable).toContain("current_snapshot_id BIGINT UNSIGNED NULL");
    expect(logicalSessionTable).not.toContain("final_snapshot_id");
  });

  it("defines the bounded Agent user-memory schema without backlog state", () => {
    const config = extractCreateTable(schemaSql, "xy_wap_embed_agent_user_memory_config");
    const memory = extractCreateTable(schemaSql, "xy_wap_embed_agent_user_memory");
    const run = extractCreateTable(schemaSql, "xy_wap_embed_agent_user_memory_run");
    const item = extractCreateTable(schemaSql, "xy_wap_embed_agent_user_memory_run_item");
    const logicalSession = extractCreateTable(schemaSql, "xy_wap_embed_logical_session");

    expect(config).toContain("UNIQUE KEY uk_agent_user_memory_config_uid (uid)");
    expect(memory).toContain("UNIQUE KEY uk_agent_user_memory_customer");
    expect(run).toContain("UNIQUE KEY uk_agent_user_memory_run_day (uid, quota_date)");
    expect(run).toContain("candidate_session_limit INT UNSIGNED NOT NULL");
    expect(run).toContain("KEY idx_agent_user_memory_run_claim (status, run_after, lease_until, id)");
    expect(run).toContain("KEY idx_agent_user_memory_run_terminal (status, finished_at, id)");
    expect(item).toContain("UNIQUE KEY uk_agent_user_memory_run_customer");
    expect(logicalSession).toContain("KEY idx_logical_session_uid_ended_message (uid, ended_at, message_count, id)");

    for (const table of [config, memory, run, item]) {
      expect(table).not.toMatch(/pending_after|pending_through|discovery_cursor|cooldown_until|selection_order_at/);
    }
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

function extractChangeLogEntry(markdown: string, date: string) {
  const match = new RegExp(`## ${date}\\n[\\s\\S]*?(?=\\n## |$)`).exec(markdown);

  if (!match) {
    throw new Error(`Missing change-log entry for ${date}`);
  }

  return match[0];
}
