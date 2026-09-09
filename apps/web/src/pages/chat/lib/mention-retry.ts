import type { GroupMember } from "@/pages/chat/chat-types";

export type MentionRetryDialogState = {
  conversationId: string;
  displayName: string;
  groupMemberId: string;
  refreshedOnce: boolean;
};

export function getMentionRetryDialogCopy(
  state: Pick<MentionRetryDialogState, "displayName" | "refreshedOnce">,
) {
  if (state.refreshedOnce) {
    return {
      description: `${state.displayName} 可能已退群，暂不支持 @Ta`,
      title: "刷新后仍未找到该成员",
    };
  }

  return {
    description: `${state.displayName} 暂不支持 @Ta，请刷新群成员后重试`,
    title: "该成员已退群或群成员数据未更新",
  };
}

export function findGroupMemberForMention<T extends { id: string }>(
  members: T[],
  groupMemberId: string,
) {
  return members.find((member) => member.id === groupMemberId);
}

export function resolveMentionRetryRefresh(options: {
  activeConversationId: string | undefined;
  currentDialogState: MentionRetryDialogState | null;
  dialogState: MentionRetryDialogState;
  members: GroupMember[];
}):
  | { type: "stale" }
  | { type: "missing"; nextState: MentionRetryDialogState }
  | { type: "found"; member: GroupMember } {
  const { activeConversationId, currentDialogState, dialogState, members } =
    options;
  const isStillActiveRetry =
    activeConversationId === dialogState.conversationId &&
    currentDialogState?.conversationId === dialogState.conversationId &&
    currentDialogState?.groupMemberId === dialogState.groupMemberId;

  if (!isStillActiveRetry) {
    return { type: "stale" };
  }

  const member = findGroupMemberForMention(members, dialogState.groupMemberId);

  if (!member) {
    return {
      nextState: {
        ...dialogState,
        refreshedOnce: true,
      },
      type: "missing",
    };
  }

  return {
    member,
    type: "found",
  };
}
