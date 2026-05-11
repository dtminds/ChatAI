import { describe, expect, it } from "vitest";
import {
  getGroupMemberHydrationKey,
  hydrateMessageRows,
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

  it("does not coerce conversations without a last message time to epoch", () => {
    expect(
      mapConversationRow({
        chat_type: 2,
        customer_avatar: "",
        customer_name: null,
        group_avatar: "https://example.com/group.png",
        group_name: "测试群002",
        id: 89,
        last_message_content: null,
        last_message_type: null,
        last_msgtime: null,
        pinned_time: 0,
        seat_id: 12,
        third_external_userid: "",
        third_group_id: "group-2",
        third_userid: "third-user-1",
        unread_cnt: 0,
      }),
    ).toMatchObject({
      conversationId: "89",
      customerName: "测试群002",
      lastMessage: "",
      lastMessageTime: undefined,
      mode: "group",
    });

    expect(
      mapConversationRow({
        chat_type: 2,
        customer_avatar: "",
        customer_name: null,
        group_avatar: "https://example.com/group.png",
        group_name: "测试群003",
        id: 90,
        last_message_content: null,
        last_message_type: null,
        last_msgtime: 0,
        pinned_time: 0,
        seat_id: 12,
        third_external_userid: "",
        third_group_id: "group-3",
        third_userid: "third-user-1",
        unread_cnt: 0,
      }),
    ).toMatchObject({
      conversationId: "90",
      customerName: "测试群003",
      lastMessageTime: undefined,
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
      senderAvatar: "",
      senderName: undefined,
      senderType: "customer",
      seq: 101,
      status: "read",
      thirdExternalUserId: "external-1",
      thirdGroupId: undefined,
      thirdUserId: "third-user-1",
    });
  });

  it("hydrates private message senders from seats and contacts", () => {
    expect(
      hydrateMessageRows(
        [
          messageRow({
            from_type: 1,
            id: 101,
            third_external_id: "external-1",
            third_user_id: "seat-third-user-1",
          }),
          messageRow({
            from_type: 2,
            id: 102,
            third_external_id: "external-2",
            third_user_id: "seat-third-user-1",
          }),
        ],
        {
          contactsByThirdExternalId: new Map([
            [
              "external-2",
              {
                avatar: "https://example.com/customer.png",
                name: "客户名称",
                realName: "客户实名",
              },
            ],
          ]),
          groupMembersByGroupAndThirdUserId: new Map(),
          seatsByThirdUserId: new Map([
            [
              "seat-third-user-1",
              {
                avatar: "https://example.com/seat.png",
                name: "企业成员",
              },
            ],
          ]),
        },
      ).map(mapMessageRow),
    ).toMatchObject([
      {
        senderAvatar: "https://example.com/seat.png",
        senderName: "企业成员",
        senderType: "agent",
      },
      {
        senderAvatar: "https://example.com/customer.png",
        senderName: "客户实名",
        senderType: "customer",
      },
    ]);
  });

  it("hydrates group message senders from group members with id fallback", () => {
    expect(
      hydrateMessageRows(
        [
          messageRow({
            chat_type: 2,
            from_type: 2,
            id: 201,
            third_from_id: "group-member-1",
            third_group_id: "group-1",
          }),
          messageRow({
            chat_type: 2,
            from_type: 2,
            id: 202,
            third_from_id: "group-member-missing",
            third_group_id: "group-1",
          }),
        ],
        {
          contactsByThirdExternalId: new Map(),
          groupMembersByGroupAndThirdUserId: new Map([
            [
              getGroupMemberHydrationKey("group-1", "group-member-1"),
              {
                avatar: "https://example.com/group-member.png",
                name: "群成员名称",
                nickname: "群内昵称",
              },
            ],
          ]),
          seatsByThirdUserId: new Map(),
        },
      ).map(mapMessageRow),
    ).toMatchObject([
      {
        senderAvatar: "https://example.com/group-member.png",
        senderName: "群内昵称",
        senderType: "customer",
      },
      {
        senderAvatar: "",
        senderName: "group-member-missing",
        senderType: "customer",
      },
    ]);
  });

  it("maps group ownership from third_from_id instead of nullable from_type", () => {
    expect(
      [
        messageRow({
          chat_type: 2,
          conversation_group_id: "group-1",
          from_type: null,
          third_from_id: "seat-third-user-1",
          third_group_id: "group-1",
          third_user_id: "seat-third-user-1",
        }),
        messageRow({
          chat_type: 2,
          conversation_group_id: "group-1",
          from_type: null,
          third_from_id: "group-member-1",
          third_group_id: "group-1",
          third_user_id: "seat-third-user-1",
        }),
      ].map(mapMessageRow),
    ).toMatchObject([
      {
        senderType: "agent",
        thirdFromId: "seat-third-user-1",
        thirdUserId: "seat-third-user-1",
      },
      {
        senderType: "customer",
        thirdFromId: "group-member-1",
        thirdUserId: "seat-third-user-1",
      },
    ]);
  });

  it("leaves robot messages without avatar hydration for now", () => {
    expect(
      mapMessageRow(
        hydrateMessageRows(
          [
            messageRow({
              from_type: 3,
              third_external_id: "external-robot",
              third_from_id: "robot-1",
            }),
          ],
          {
            contactsByThirdExternalId: new Map([
              [
                "external-robot",
                {
                  avatar: "https://example.com/robot.png",
                  name: "机器人",
                  realName: "",
                },
              ],
            ]),
            groupMembersByGroupAndThirdUserId: new Map(),
            seatsByThirdUserId: new Map(),
          },
        )[0],
      ),
    ).toMatchObject({
      senderAvatar: "",
      senderName: undefined,
      senderType: "system",
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

  it("does not coerce messages without a valid sent time to epoch", () => {
    expect(
      mapMessageRow(messageRow({
        msgtime: 0,
      })),
    ).toMatchObject({
      createdAt: undefined,
    });

    expect(
      mapMessageRow(messageRow({
        msgtime: "",
      })),
    ).toMatchObject({
      createdAt: undefined,
    });

    expect(
      mapMessageRow(messageRow({
        msgtime: "not-a-date",
      })),
    ).toMatchObject({
      createdAt: undefined,
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

    expect(
      mapMessageRow(messageRow({
        content: JSON.stringify({
          fileUrl: "https://wework.qpic.cn/wwpic3az/wwwx_eed91b8068b6ed56888938eca8bc3751/0",
        }),
        msgtype: "emotion",
      })),
    ).toMatchObject({
      content: {
        alt: "图片",
        imageUrl: "https://wework.qpic.cn/wwpic3az/wwwx_eed91b8068b6ed56888938eca8bc3751/0",
      },
      contentType: "image",
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
          description: "京东购物，多·快·好·省",
          appId: "wx-app-id",
          fileUrl: "s5/20260511/272/2c37da84f0454991ad5a0b3cd56d991b.jpg",
          logoUrl: "https://cdn.example.com/logo.png",
          title: "京东购物丨点外卖领国补",
        }),
        msgtype: "weapp",
      })),
    ).toMatchObject({
      content: {
        appName: "京东购物丨点外卖领国补",
        coverImageUrl: "https://b3.iyouke.com/s5/20260511/272/2c37da84f0454991ad5a0b3cd56d991b.jpg",
        logoUrl: "https://cdn.example.com/logo.png",
        sourceLabel: "小程序",
        title: "京东购物，多·快·好·省",
      },
      contentType: "mini-program",
    });

    expect(
      mapMessageRow(messageRow({
        content: JSON.stringify({
          avatar: "http://wx.qlogo.cn/mmhead/avatar/0",
          company: "微信",
          contactSerialNo: "D91D072C07D9CECFEC1271DB430B5EDF5194F219CF554649F1C4F9C615435A82",
          groupSerialNo: "29F71A2ED8125854B6AA6EB6E582A8A9330A4B02FE42E908C5EF07B05A8F6A33",
          name: "binarywang",
        }),
        msgtype: "card",
      })),
    ).toMatchObject({
      content: {
        avatarUrl: "http://wx.qlogo.cn/mmhead/avatar/0",
        company: "微信",
        contactSerialNo: "D91D072C07D9CECFEC1271DB430B5EDF5194F219CF554649F1C4F9C615435A82",
        groupSerialNo: "29F71A2ED8125854B6AA6EB6E582A8A9330A4B02FE42E908C5EF07B05A8F6A33",
        name: "binarywang",
        sourceLabel: "个人名片",
      },
      contentType: "contact-card",
    });

    expect(
      mapMessageRow(messageRow({
        content: JSON.stringify({
          address: "浙江省杭州市钱塘区学府街515号智慧谷一栋",
          latitude: "30.310369",
          longitude: "120.371184",
          title: "杭州智慧谷移动互联网大厦",
          zoom: "15",
        }),
        msgtype: "location",
      })),
    ).toMatchObject({
      content: {
        address: "浙江省杭州市钱塘区学府街515号智慧谷一栋",
        latitude: 30.310369,
        longitude: 120.371184,
        title: "杭州智慧谷移动互联网大厦",
        zoom: 15,
      },
      contentType: "location",
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
    sender_avatar: "",
    sender_name: undefined,
    third_from_id: "",
    third_external_id: "external-1",
    third_group_id: "",
    third_user_id: "third-user-1",
    ...overrides,
  };
}
