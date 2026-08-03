import { describe, expect, it } from "vitest";
import type { Conversation } from "@/pages/chat/chat-types";
import {
  mergeConversationSearchResults,
  searchLocalConversations,
} from "@/pages/chat/lib/conversation-search";

describe("conversation search", () => {
  it("finds loaded single and shadow-group conversations with their conversation ids", () => {
    const singleConversation = createConversation({
      contactOriginalName: "微信昵称：西瓜糖",
      customerName: "老客户",
      id: "conversation-single",
      mode: "single",
      thirdExternalUserId: "external-001",
    });
    const groupConversation = createConversation({
      customerName: "接待群备注",
      groupOriginalName: "西瓜交流群",
      id: "conversation-group",
      mode: "group",
      thirdGroupId: "group-001",
    });

    expect(
      searchLocalConversations([singleConversation, groupConversation], "西瓜"),
    ).toEqual({
      contacts: [
        {
          avatar: singleConversation.customerAvatarUrl,
          conversationId: "conversation-single",
          name: "老客户",
          realName: "微信昵称：西瓜糖",
          thirdExternalUserId: "external-001",
        },
      ],
      groups: [
        {
          avatar: groupConversation.customerAvatarUrl,
          conversationId: "conversation-group",
          name: "西瓜交流群",
          remark: "接待群备注",
          thirdGroupId: "group-001",
        },
      ],
    });
  });

  it("keeps different emoji distinct during local matching", () => {
    const conversation = createConversation({
      customerName: "西瓜🍉群",
      id: "conversation-group",
      mode: "group",
      thirdGroupId: "group-001",
    });

    expect(searchLocalConversations([conversation], "🍬")).toEqual({
      contacts: [],
      groups: [],
    });
  });

  it("keeps local results first and deduplicates server results by target id", () => {
    const localResults = searchLocalConversations(
      [
        createConversation({
          customerName: "本地群",
          id: "conversation-group",
          mode: "group",
          thirdGroupId: "group-001",
        }),
      ],
      "群",
    );

    expect(
      mergeConversationSearchResults(localResults, {
        contacts: [],
        groups: [
          {
            avatar: "https://example.com/server-group.png",
            name: "服务端重复群",
            thirdGroupId: "group-001",
          },
          {
            avatar: "https://example.com/server-only-group.png",
            name: "服务端补充群",
            thirdGroupId: "group-002",
          },
        ],
      }),
    ).toEqual({
      contacts: [],
      groups: [
        {
          avatar: "https://example.com/conversation-group.png",
          conversationId: "conversation-group",
          name: "本地群",
          thirdGroupId: "group-001",
        },
        {
          avatar: "https://example.com/server-only-group.png",
          name: "服务端补充群",
          thirdGroupId: "group-002",
        },
      ],
    });
  });
});

function createConversation(
  overrides: Partial<Conversation> & Pick<Conversation, "id" | "mode">,
): Conversation {
  return {
    accountId: "seat-001",
    conversationAIHostingSwitch: false,
    customerAvatarUrl: `https://example.com/${overrides.id}.png`,
    customerId: `customer-${overrides.id}`,
    customerName: "测试会话",
    handoffMsgId: 0,
    preview: "最近消息",
    priority: "medium",
    quietFor: "刚刚",
    unread: 0,
    updatedAt: "刚刚",
    ...overrides,
  };
}
