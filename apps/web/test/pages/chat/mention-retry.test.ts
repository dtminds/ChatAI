// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { GroupMember } from "@/pages/chat/chat-types";
import {
  findGroupMemberForMention,
  getMentionRetryDialogCopy,
  resolveMentionRetryRefresh,
  type MentionRetryDialogState,
} from "@/pages/chat/lib/mention-retry";

const members: GroupMember[] = [
  {
    displayName: "成员甲",
    id: "member-001",
    type: 0,
  },
  {
    displayName: "缪勇飞 群昵称111",
    id: "member-006",
    type: 0,
  },
];

const dialogState: MentionRetryDialogState = {
  conversationId: "conv-004",
  displayName: "缪勇飞 群昵称111",
  groupMemberId: "member-006",
  refreshedOnce: false,
};

describe("mention retry", () => {
  it("switches copy after a failed refresh", () => {
    expect(getMentionRetryDialogCopy(dialogState)).toEqual({
      description: "缪勇飞 群昵称111 暂不支持 @Ta，请刷新群成员后重试",
      title: "该成员已退群或群成员数据未更新",
    });
    expect(
      getMentionRetryDialogCopy({
        ...dialogState,
        refreshedOnce: true,
      }),
    ).toEqual({
      description: "缪勇飞 群昵称111 可能已退群，暂不支持 @Ta",
      title: "刷新后仍未找到该成员",
    });
  });

  it("inserts a mention when refresh finds the member and keeps the dialog when it does not", () => {
    expect(findGroupMemberForMention(members, "member-006")?.displayName).toBe(
      "缪勇飞 群昵称111",
    );
    expect(
      resolveMentionRetryRefresh({
        activeConversationId: "conv-004",
        currentDialogState: dialogState,
        dialogState,
        members,
      }),
    ).toEqual({
      member: members[1],
      type: "found",
    });
    expect(
      resolveMentionRetryRefresh({
        activeConversationId: "conv-004",
        currentDialogState: dialogState,
        dialogState,
        members: [members[0]],
      }),
    ).toEqual({
      nextState: {
        ...dialogState,
        refreshedOnce: true,
      },
      type: "missing",
    });
    expect(
      resolveMentionRetryRefresh({
        activeConversationId: "conv-001",
        currentDialogState: dialogState,
        dialogState,
        members,
      }),
    ).toEqual({ type: "stale" });
  });
});
