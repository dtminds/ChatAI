/**
 * Node 后端允许写入（INSERT/UPDATE/DELETE）的表白名单。
 * 未在此列表中的 xy_wap_embed_* 表默认只读，属于平台层维护。
 * 需要修改只读表的数据时，必须通过平台提供的 API 接口，不得直接操作数据库。
 */
export const WRITABLE_TABLES = [
  "xy_wap_embed_sub_user",
  "xy_wap_embed_sub_user_session",
  "xy_wap_embed_user_seat",
  "xy_wap_embed_user_seat_sub_relation",
  "xy_wap_embed_conversation",
  "xy_wap_embed_sider_bar_config",
] as const;

export type WritableTable = (typeof WRITABLE_TABLES)[number];
