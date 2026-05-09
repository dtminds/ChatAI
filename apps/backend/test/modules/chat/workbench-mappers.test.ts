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
      mapMessageRow(messageRow({
        content: "{\"text\":\"JSON 文本\"}",
        from_type: 2,
        id: 101,
        msgid: "remote-msg-101",
        msgtime: 1778240200000,
        msgtype: "text",
      })),
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

  it("maps timestamp fields from Date objects and date strings", () => {
    expect(
      mapSeatRow({
        avatar: "",
        host_sub_id: 0,
        id: 12,
        is_online: 0,
        last_message_time: new Date("2026-05-09T08:30:00.000Z"),
        third_user_name: "小可",
        third_userid: "third-user-1",
        unread_count: 0,
      }),
    ).toMatchObject({
      lastMessageTime: 1778315400000,
    });

    expect(
      mapConversationRow({
        chat_type: 1,
        customer_avatar: "",
        customer_name: "客户备注",
        group_avatar: "",
        group_name: "",
        id: 88,
        last_message_content: "",
        last_message_type: "text",
        last_msgtime: "2026-05-09T08:31:00.000Z",
        pinned_time: 0,
        seat_id: 12,
        third_external_userid: "external-1",
        third_group_id: "",
        third_userid: "third-user-1",
        unread_cnt: 0,
      }),
    ).toMatchObject({
      lastMessageTime: 1778315460000,
    });

    expect(
      mapMessageRow(messageRow({
        msgtime: "2026-05-09T08:32:00.000Z",
      })),
    ).toMatchObject({
      createdAt: 1778315520000,
    });
  });

  it("maps image content with complete URLs or object paths", () => {
    expect(
      mapMessageRow(messageRow({
        content: "{\"fileUrl\":\"https://cdn.example.com/a.jpg\"}",
        msgtype: "image",
      })),
    ).toMatchObject({
      content: {
        alt: "图片",
        imageUrl: "https://cdn.example.com/a.jpg",
      },
      contentType: "image",
    });

    expect(
      mapMessageRow(messageRow({
        content: "{\"fileUrl\":\"media/20260508/272/a.jpg\"}",
        msgtype: "image",
      })).content,
    ).toEqual({
      alt: "图片",
      imageUrl: "https://b3.iyouke.com/media/20260508/272/a.jpg",
    });
  });

  it("maps structured card-like message payloads into existing DTO shapes", () => {
    expect(
      mapMessageRow(messageRow({
        content: JSON.stringify({
          coverUrl: "https://cdn.example.com/link.png",
          desc: "链接描述",
          href: "https://example.com/item",
          title: "链接标题",
        }),
        msgtype: "link",
      })),
    ).toMatchObject({
      content: {
        description: "链接描述",
        previewImageUrl: "https://cdn.example.com/link.png",
        sourceLabel: "链接",
        title: "链接标题",
        url: "https://example.com/item",
      },
      contentType: "h5",
    });

    expect(
      mapMessageRow(messageRow({
        content: JSON.stringify({
          appId: "wx-app-id",
          fileUrl: "media/20260508/272/weapp.jpg",
          logoUrl: "https://cdn.example.com/logo.png",
          title: "小程序标题",
        }),
        msgtype: "weapp",
      })),
    ).toMatchObject({
      content: {
        appName: "wx-app-id",
        coverImageUrl: "https://b3.iyouke.com/media/20260508/272/weapp.jpg",
        sourceLabel: "小程序",
        title: "小程序标题",
      },
      contentType: "mini-program",
    });
  });

  it("maps media and file payload fields with complete URLs or object paths", () => {
    expect(
      mapMessageRow(messageRow({
        content: JSON.stringify({
          coverUrl: "https://cdn.example.com/video.jpg",
          fileUrl: "https://cdn.example.com/video.mp4",
        }),
        msgtype: "video",
      })),
    ).toMatchObject({
      content: {
        alt: "视频",
        coverImageUrl: "https://cdn.example.com/video.jpg",
        durationLabel: "",
        videoUrl: "https://cdn.example.com/video.mp4",
      },
      contentType: "video",
    });

    expect(
      mapMessageRow(messageRow({
        content: JSON.stringify({
          fileName: "报价单.pdf",
          fileSize: 6389760,
          fileUrl: "media/20260508/272/file.pdf",
        }),
        msgtype: "file",
      })),
    ).toMatchObject({
      content: {
        extension: "pdf",
        fileName: "报价单.pdf",
        fileSizeLabel: "6.09 MB",
        fileUrl: "https://b3.iyouke.com/media/20260508/272/file.pdf",
        sourceLabel: "文件",
      },
      contentType: "file",
    });
  });

  it("falls back unsupported payloads to readable text", () => {
    expect(
      mapMessageRow(messageRow({
        content: "{\"revokeMsgId\":\"21\",\"revokeOriginMsgId\":\"1019745\"}",
        msgtype: "revoke",
      })),
    ).toMatchObject({
      content: {
        text: "[撤回消息]",
      },
      contentType: "text",
    });

    expect(
      mapMessageRow(messageRow({
        content: "{\"unsupportedDisplayText\":\"该消息类型暂不能展示\"}",
        msgtype: "card",
      })).content,
    ).toEqual({
      text: "该消息类型暂不能展示",
    });

    expect(
      mapMessageRow(messageRow({
        content: JSON.stringify({
          coverUrl: "https://cdn.example.com/sphfeed.jpg",
          title: "视频号动态标题",
          url: "https://channels.example.com/feed",
        }),
        msgtype: "sphfeed",
      })),
    ).toMatchObject({
      content: {
        text: "视频号动态标题",
      },
      contentType: "text",
    });
  });
});

function messageRow(
  overrides: Partial<Parameters<typeof mapMessageRow>[0]>,
): Parameters<typeof mapMessageRow>[0] {
  return {
    chat_type: 1,
    content: null,
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
    ...overrides,
  };
}
