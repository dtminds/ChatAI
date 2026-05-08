import { describe, expect, it } from "vitest";
import {
  mapConversationRow,
  mapMessageRow,
  mapSeatRow,
} from "../../../src/modules/chat/workbench-mappers.js";

describe("workbench MySQL mappers", () => {
  it("maps a user seat row into the public seat DTO", () => {
    expect(
      mapSeatRow({
        avatar: "https://example.com/avatar.png",
        host_sub_id: 3,
        id: 12,
        is_online: 1,
        last_message_time: 1778240000000,
        third_user_name: "小可",
        third_userid: "third-user-1",
        unread_count: 5,
      }),
    ).toEqual({
      avatar: "https://example.com/avatar.png",
      description: "",
      hostSubUserId: "3",
      lastMessageTime: 1778240000000,
      loginStatus: "online",
      name: "小可",
      operatorName: "小可",
      phone: "",
      seatId: "12",
      thirdUserId: "third-user-1",
      unreadCount: 5,
    });
  });

  it("maps a single conversation row with customer metadata", () => {
    expect(
      mapConversationRow({
        chat_type: 1,
        customer_avatar: "https://example.com/customer.png",
        customer_name: "客户备注",
        group_avatar: "",
        group_name: "",
        id: 88,
        last_message_content: "最近一条文本",
        last_message_type: "text",
        last_msgtime: 1778240100000,
        pinned_time: 0,
        seat_id: 12,
        third_external_userid: "external-1",
        third_group_id: "",
        third_userid: "third-user-1",
        unread_cnt: 2,
      }),
    ).toMatchObject({
      conversationId: "88",
      customerAvatar: "https://example.com/customer.png",
      customerId: "external-1",
      customerName: "客户备注",
      lastMessage: "最近一条文本",
      mode: "single",
      seatId: "12",
      thirdExternalUserId: "external-1",
      thirdUserId: "third-user-1",
      unreadCount: 2,
    });
  });

  it("maps audit message rows and keeps unknown payloads safe", () => {
    expect(
      mapMessageRow({
        chat_type: 1,
        content: "{\"text\":\"JSON 文本\"}",
        conversation_external_id: "external-1",
        conversation_group_id: "",
        conversation_id: 88,
        from_type: 2,
        id: 101,
        msgid: "remote-msg-101",
        msgtime: 1778240200000,
        msgtype: "text",
        seat_id: 12,
        third_external_id: "external-1",
        third_group_id: "",
        third_user_id: "third-user-1",
      }),
    ).toEqual({
      content: {
        text: "JSON 文本",
      },
      contentType: "text",
      conversationId: "88",
      createdAt: 1778240200000,
      customerId: "external-1",
      messageId: "remote-msg-101",
      seatId: "12",
      senderType: "customer",
      seq: 101,
      status: "read",
      thirdExternalUserId: "external-1",
      thirdUserId: "third-user-1",
    });
  });
});
