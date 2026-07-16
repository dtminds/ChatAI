/** 会话列表转人工接管提醒前缀，视觉对齐草稿的红色 `[草稿]` */
export const CONVERSATION_HANDOFF_TAKEOVER_PREVIEW_PREFIX = "[接管提醒]";

/** Agent 写入的转人工系统消息，例如：`Agent 转人工处理：客户明确要求转人工，…` */
const AGENT_HANDOFF_PREVIEW_PATTERN =
  /^Agent\s*转人工处理\s*[:：]\s*(.*)$/u;

const EXISTING_HANDOFF_PREFIX_PATTERN =
  /^\[接管提醒\](.*)$/u;

/**
 * 在 `wait_manual` 为真时，把会话预览拆成红色「接管提醒」前缀 + 正文。
 * 正文优先去掉平台已写入的前缀或 Agent 转人工系统文案头，便于列表截断展示。
 */
export function getConversationHandoffTakeoverPreviewParts(
  preview: string | undefined,
): { body: string; prefix: string } {
  const trimmed = preview?.trim() ?? "";

  if (!trimmed) {
    return {
      body: "",
      prefix: CONVERSATION_HANDOFF_TAKEOVER_PREVIEW_PREFIX,
    };
  }

  const existingPrefixMatch = trimmed.match(EXISTING_HANDOFF_PREFIX_PATTERN);

  if (existingPrefixMatch) {
    return {
      body: existingPrefixMatch[1]?.trim() ?? "",
      prefix: CONVERSATION_HANDOFF_TAKEOVER_PREVIEW_PREFIX,
    };
  }

  const agentHandoffMatch = trimmed.match(AGENT_HANDOFF_PREVIEW_PATTERN);

  if (agentHandoffMatch) {
    return {
      body: agentHandoffMatch[1]?.trim() || trimmed,
      prefix: CONVERSATION_HANDOFF_TAKEOVER_PREVIEW_PREFIX,
    };
  }

  return {
    body: trimmed,
    prefix: CONVERSATION_HANDOFF_TAKEOVER_PREVIEW_PREFIX,
  };
}
