/**
 * Node 后端允许写入（INSERT/UPDATE/DELETE）的表白名单。
 * 未在此列表中的 xy_wap_embed_* 表默认只读，属于平台层维护。
 * 需要修改只读表的数据时，必须通过平台提供的 API 接口，不得直接操作数据库。
 */
export const WRITABLE_TABLES = [
  "xy_wap_embed_analysis_run",
  "xy_wap_embed_sub_user",
  "xy_wap_embed_sub_user_session",
  "xy_wap_embed_user_seat",
  "xy_wap_embed_user_seat_sub_relation",
  "xy_wap_embed_conversation",
  "xy_wap_embed_insight_analysis_policy",
  "xy_wap_embed_insight_entity_dictionary",
  "xy_wap_embed_insight_evidence",
  "xy_wap_embed_insight_job",
  "xy_wap_embed_insight_intent_config",
  "xy_wap_embed_insight_label_config",
  "xy_wap_embed_insight_qa_rule_config",
  "xy_wap_embed_insight_rescan_task",
  "xy_wap_embed_insight_sync_cursor",
  "xy_wap_embed_logical_session",
  "xy_wap_embed_logical_session_message",
  "xy_wap_embed_model_profile",
  "xy_wap_embed_model_provider",
  "xy_wap_embed_session_action_item",
  "xy_wap_embed_session_entity",
  "xy_wap_embed_session_faq_candidate",
  "xy_wap_embed_session_insight_current",
  "xy_wap_embed_session_insight_snapshot",
  "xy_wap_embed_session_intent",
  "xy_wap_embed_session_problem_resolution",
  "xy_wap_embed_session_qa_finding",
  "xy_wap_embed_session_risk",
  "xy_wap_embed_session_sentiment",
  "xy_wap_embed_session_summary",
  "xy_wap_embed_session_tag",
  "xy_wap_embed_sessionization_config",
  "xy_wap_embed_sider_bar_config",
] as const;

export type WritableTable = (typeof WRITABLE_TABLES)[number];
