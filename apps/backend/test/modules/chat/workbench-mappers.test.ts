import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getGroupMemberHydrationKey,
  hydrateMessageRows,
  mapConversationRow,
  mapMessageRow,
  mapSeatRow,
} from "../../../src/modules/chat/workbench-mappers.js";

describe("workbench MySQL mappers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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
    const conversation = mapConversationRow({
        chat_type: 1,
        create_time: new Date("2026-05-15T08:00:00.000Z"),
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
        verified: 0,
      });

    expect(conversation).toMatchObject({
      conversationId: "88",
      custodyMode: "semi",
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
    expect(conversation.createdAt).toBe(1778832000000);
    expect(conversation.verified).toBe(false);
  });

  it("defaults conversation biz status to hidden when metadata is missing", () => {
    const conversation = mapConversationRow({
      chat_type: 1,
      create_time: null,
      customer_avatar: "",
      customer_name: "",
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
      verified: 0,
    });

    expect(conversation.bizStatus).toBe(0);
  });

  it("does not fall back to customer or group ids for display names", () => {
    expect(
      mapConversationRow({
        chat_type: 1,
        create_time: null,
        customer_avatar: "",
        customer_name: "",
        group_avatar: "",
        group_name: "",
        id: 88,
        last_message_content: null,
        last_message_type: null,
        last_msgtime: null,
        pinned_time: 0,
        seat_id: 12,
        third_external_userid: "external-looks-like-random-id",
        third_group_id: "",
        third_userid: "third-user-1",
        unread_cnt: 0,
      }),
    ).toMatchObject({
      customerName: "未知客户",
    });

    expect(
      mapConversationRow({
        chat_type: 2,
        create_time: null,
        customer_avatar: "",
        customer_name: null,
        group_avatar: "",
        group_name: "",
        id: 89,
        last_message_content: null,
        last_message_type: null,
        last_msgtime: null,
        pinned_time: 0,
        seat_id: 12,
        third_external_userid: "",
        third_group_id: "group-looks-like-random-id",
        third_userid: "third-user-1",
        unread_cnt: 0,
      }),
    ).toMatchObject({
      customerName: "未知群聊",
    });
  });

  it("uses raw conversation preview content only for text messages", () => {
    expect(
      mapConversationRow({
        chat_type: 1,
        create_time: null,
        customer_avatar: "",
        customer_name: "客户备注",
        group_avatar: "",
        group_name: "",
        id: 91,
        last_message_content: "普通文本",
        last_message_type: "text",
        last_msgtime: 1778240100000,
        pinned_time: 0,
        seat_id: 12,
        third_external_userid: "external-1",
        third_group_id: "",
        third_userid: "third-user-1",
        unread_cnt: 0,
        verified: 0,
      }),
    ).toMatchObject({
      lastMessage: "普通文本",
    });

    expect(
      mapConversationRow({
        chat_type: 1,
        create_time: null,
        customer_avatar: "",
        customer_name: "客户备注",
        group_avatar: "",
        group_name: "",
        id: 92,
        last_message_content: "不能直接透出",
        last_message_type: "unknown-msgtype",
        last_msgtime: 1778240100000,
        pinned_time: 0,
        seat_id: 12,
        third_external_userid: "external-1",
        third_group_id: "",
        third_userid: "third-user-1",
        unread_cnt: 0,
        verified: 0,
      }),
    ).toMatchObject({
      lastMessage: "[新消息]",
    });

    expect(
      mapConversationRow({
        chat_type: 1,
        create_time: null,
        customer_avatar: "",
        customer_name: "客户备注",
        group_avatar: "",
        group_name: "",
        id: 93,
        last_message_content: null,
        last_message_type: "",
        last_msgtime: 1778240100000,
        pinned_time: 0,
        seat_id: 12,
        third_external_userid: "external-1",
        third_group_id: "",
        third_userid: "third-user-1",
        unread_cnt: 0,
        verified: 0,
      }),
    ).toMatchObject({
      lastMessage: "[新消息]",
    });
  });

  it("extracts system conversation previews from display fields", () => {
    expect(
      mapConversationRow({
        chat_type: 1,
        create_time: null,
        customer_avatar: "",
        customer_name: "客户备注",
        group_avatar: "",
        group_name: "",
        id: 93,
        last_message_content: JSON.stringify({ content: "客户加入了群聊" }),
        last_message_type: "system",
        last_msgtime: 1778240100000,
        pinned_time: 0,
        seat_id: 12,
        third_external_userid: "external-1",
        third_group_id: "",
        third_userid: "third-user-1",
        unread_cnt: 0,
        verified: 0,
      }),
    ).toMatchObject({
      lastMessage: "客户加入了群聊",
    });

    expect(
      mapConversationRow({
        chat_type: 1,
        create_time: null,
        customer_avatar: "",
        customer_name: "客户备注",
        group_avatar: "",
        group_name: "",
        id: 94,
        last_message_content: JSON.stringify({ type: "unknown" }),
        last_message_type: "system",
        last_msgtime: 1778240100000,
        pinned_time: 0,
        seat_id: 12,
        third_external_userid: "external-1",
        third_group_id: "",
        third_userid: "third-user-1",
        unread_cnt: 0,
        verified: 0,
      }),
    ).toMatchObject({
      lastMessage: "",
    });
  });

  it("does not coerce conversations without a last message time to epoch", () => {
    expect(
      mapConversationRow({
        chat_type: 2,
        create_time: null,
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
        verified: 1,
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
        create_time: null,
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
        verified: 1,
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
        opt_no: "opt-001",
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
      optNo: "opt-001",
      seatId: "12",
      senderAvatar: "",
      senderName: undefined,
      senderType: "customer",
      seq: 101,
      status: "sent",
      thirdExternalUserId: "external-1",
      thirdGroupId: undefined,
      thirdUserId: "third-user-1",
    });
  });

  it("preserves long numeric text message content as raw text", () => {
    expect(
      mapMessageRow(messageRow({
        content: "4200003049202605118042283490",
        msgtype: "text",
      })),
    ).toMatchObject({
      content: {
        text: "4200003049202605118042283490",
      },
      contentType: "text",
    });
  });

  it("preserves JSON string text message content without literal quotes", () => {
    expect(
      mapMessageRow(messageRow({
        content: "\"普通文本\"",
        msgtype: "text",
      })),
    ).toMatchObject({
      content: {
        text: "普通文本",
      },
      contentType: "text",
    });
  });

  it("uses a visible fallback for blank unknown message types without content", () => {
    expect(
      mapMessageRow(messageRow({
        content: null,
        msgtype: "",
      })),
    ).toMatchObject({
      content: {
        text: "[暂不支持显示该消息]",
      },
      contentType: "text",
    });
  });

  it("maps failed audit message status from database rows", () => {
    expect(
      mapMessageRow(messageRow({
        msgid: "remote-msg-failed-001",
        opt_no: "opt-failed-001",
        status: 0,
      })),
    ).toMatchObject({
      messageId: "remote-msg-failed-001",
      optNo: "opt-failed-001",
      status: "failed",
    });
  });

  it("derives voice playback URL and exposes whether transFileUrl was persisted", () => {
    expect(
      mapMessageRow(messageRow({
        content: JSON.stringify({
          fileUrl: "s5/msg/20260525/272/e58b363da0294e87b55472ce471394ff.amr",
          transFileUrl: "",
          transVoiceText: "",
        }),
        msgtype: "voice",
      })),
    ).toMatchObject({
      content: {
        audioUrl: "https://b5.bokr.com.cn/s5/msg/20260525/272/e58b363da0294e87b55472ce471394ff.amr",
        playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260525/272/e58b363da0294e87b55472ce471394ff.wav",
        transFileUrl: "",
        transFileUrlPersisted: false,
        transVoiceText: "",
      },
      contentType: "voice",
    });

    expect(
      mapMessageRow(messageRow({
        content: JSON.stringify({
          fileUrl: "s5/msg/20260525/272/e58b363da0294e87b55472ce471394ff.amr",
          transFileUrl: "s5/playable-voice/20260525/272/persisted.wav",
          transVoiceText: "语音文本",
        }),
        msgtype: "voice",
      })),
    ).toMatchObject({
      content: {
        playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260525/272/persisted.wav",
        transFileUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260525/272/persisted.wav",
        transFileUrlPersisted: true,
        transVoiceText: "语音文本",
      },
      contentType: "voice",
    });
  });

  it("derives voice playback URLs without replacing matching filename segments", () => {
    expect(
      mapMessageRow(messageRow({
        content: JSON.stringify({
          fileUrl: "s5/msg/20260525/272/s5/msg/voice.amr",
          transFileUrl: "",
        }),
        msgtype: "voice",
      })),
    ).toMatchObject({
      content: {
        audioUrl: "https://b5.bokr.com.cn/s5/msg/20260525/272/s5/msg/voice.amr",
        playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260525/272/s5/msg/voice.wav",
      },
      contentType: "voice",
    });
  });

  it("derives voice playback URLs from the configured media host", async () => {
    vi.stubEnv("PLAYABLE_MEDIA_HOST", "media.example.com:8443");

    expect(
      mapMessageRow(messageRow({
        content: JSON.stringify({
          fileUrl: "s5/msg/20260525/272/voice.amr",
          transFileUrl: "",
        }),
        msgtype: "voice",
      })),
    ).toMatchObject({
      content: {
        audioUrl: "https://media.example.com:8443/s5/msg/20260525/272/voice.amr",
        playbackUrl: "https://media.example.com:8443/s5/playable-voice/20260525/272/voice.wav",
      },
      contentType: "voice",
    });
  });

  it("maps quote messages to normalized quote content", () => {
    expect(
      mapMessageRow(messageRow({
        content: JSON.stringify({
          content: "正式引用消息",
          quoteMsgId: 538,
          quoteOriginMsgId: "1022715",
        }),
        msgtype: "quote",
      })),
    ).toMatchObject({
      content: {
        quoteMsgId: "538",
        text: "正式引用消息",
      },
      contentType: "quote",
    });
  });

  it("maps file transfer metadata from audit message content", () => {
    expect(
      mapMessageRow(messageRow({
        content: JSON.stringify({
          downloadStatus: "failed",
          fileExt: "pdf",
          fileName: "报价单.pdf",
          fileSerialNo: "serial-file-001",
          fileSize: 2048,
          fileUrl: "chat-files/quote.pdf",
        }),
        msgtype: "file",
      })),
    ).toMatchObject({
      content: {
        downloadStatus: "failed",
        extension: "pdf",
        fileName: "报价单.pdf",
        fileSerialNo: "serial-file-001",
        fileSizeLabel: "2.00 KB",
        fileUrl: "https://b5.bokr.com.cn/chat-files/quote.pdf",
      },
      contentType: "file",
    });
  });

  it("maps video transfer metadata from audit message content", () => {
    expect(
      mapMessageRow(messageRow({
        content: JSON.stringify({
          coverUrl: "covers/video.jpg",
          downloadStatus: "ing",
          fileSerialNo: "serial-video-001",
          fileUrlExpireTime: 1778919538036,
          fileUrl: "videos/demo.mp4",
        }),
        msgtype: "video",
      })),
    ).toMatchObject({
      content: {
        coverImageUrl: "https://b5.bokr.com.cn/covers/video.jpg",
        downloadStatus: "ing",
        fileSerialNo: "serial-video-001",
        fileUrlExpireTime: 1778919538036,
        videoUrl: "https://b5.bokr.com.cn/videos/demo.mp4",
      },
      contentType: "video",
    });
  });

  it("keeps malformed quote payloads safe", () => {
    expect(
      mapMessageRow(messageRow({
        content: "not-json",
        msgtype: "quote",
      })),
    ).toMatchObject({
      content: {
        quoteMsgId: "",
        text: "",
      },
      contentType: "quote",
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

  it("maps group messages with missing sender identifiers without throwing", () => {
    expect(
      mapMessageRow(messageRow({
        chat_type: 2,
        conversation_group_id: "",
        from_type: null,
        msgid: "missing-sender-msg-1",
        third_from_id: null,
        third_group_id: null,
        third_user_id: undefined,
      })),
    ).toMatchObject({
      customerId: "missing-customer:88:missing-sender-msg-1",
      senderType: "customer",
      thirdFromId: undefined,
      thirdUserId: undefined,
    });
  });

  it("skips group member hydration when sender identifiers are missing", () => {
    expect(
      hydrateMessageRows(
        [
          messageRow({
            chat_type: 2,
            conversation_group_id: "group-1",
            from_type: 2,
            third_from_id: null,
            third_group_id: "group-1",
            third_user_id: undefined,
          }),
        ],
        {
          contactsByThirdExternalId: new Map(),
          groupMembersByGroupAndThirdUserId: new Map([
            [
              getGroupMemberHydrationKey("group-1", ""),
              {
                avatar: "https://example.com/empty-key.png",
                name: "空 key 成员",
                nickname: "空 key 昵称",
              },
            ],
          ]),
          seatsByThirdUserId: new Map(),
        },
      ),
    ).toMatchObject([
      {
        sender_avatar: "",
        sender_name: undefined,
      },
    ]);
  });

  it("skips seat hydration when sender identifiers are missing", () => {
    expect(
      hydrateMessageRows(
        [
          messageRow({
            from_type: 1,
            third_user_id: undefined,
          }),
        ],
        {
          contactsByThirdExternalId: new Map(),
          groupMembersByGroupAndThirdUserId: new Map(),
          seatsByThirdUserId: new Map([
            [
              "",
              {
                avatar: "https://example.com/empty-seat.png",
                name: "空 key 坐席",
              },
            ],
          ]),
        },
      ),
    ).toMatchObject([
      {
        sender_avatar: "",
        sender_name: undefined,
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

  it("maps system msgtype rows to system message DTOs", () => {
    expect(
      mapMessageRow(messageRow({
        content: JSON.stringify({ content: "客户已加入群聊" }),
        from_type: 1,
        msgtype: "system",
      })),
    ).toMatchObject({
      content: {
        text: "客户已加入群聊",
      },
      contentType: "system",
      senderType: "system",
    });
  });

  it("uses system fallback text fields without rendering raw JSON", () => {
    expect(
      mapMessageRow(messageRow({
        content: JSON.stringify({
          type: "unknown",
          unsupportedDisplayText: "暂不支持的系统消息",
        }),
        from_type: 1,
        msgtype: "system",
      })),
    ).toMatchObject({
      content: {
        text: "暂不支持的系统消息",
      },
      contentType: "system",
      senderType: "system",
    });
  });

  it("does not expose raw JSON for system payloads without display text", () => {
    expect(
      mapMessageRow(messageRow({
        content: JSON.stringify({
          revokeMsgId: "21",
          revokeOriginMsgId: "1019745",
          type: "revoke",
        }),
        from_type: 1,
        msgtype: "system",
      })),
    ).toMatchObject({
      content: {
        text: "",
      },
      contentType: "system",
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
      imageUrl: "https://b5.bokr.com.cn/media/20260508/272/a.jpg",
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
      contentType: "emotion",
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
        coverImageUrl: "https://b5.bokr.com.cn/s5/20260511/272/2c37da84f0454991ad5a0b3cd56d991b.jpg",
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

    expect(
      mapMessageRow(messageRow({
        content: JSON.stringify({
          description: "杭州高架惊现鸵鸟飞奔，交警及时赶到引导带路，原来它是离家出走#鸵鸟 \n",
          imageUrl: "https://finder.video.qq.com/cover.jpg",
          linkUrl: "https://channels.weixin.qq.com/web/pages/feed?eid=export%2FUzFfBgAAxPiD",
          title: "都市快报",
        }),
        msgtype: "sphfeed",
      })),
    ).toMatchObject({
      content: {
        description: "杭州高架惊现鸵鸟飞奔，交警及时赶到引导带路，原来它是离家出走#鸵鸟",
        imageUrl: "https://finder.video.qq.com/cover.jpg",
        sourceLabel: "视频号",
        title: "都市快报",
        url: "https://channels.weixin.qq.com/web/pages/feed?eid=export%2FUzFfBgAAxPiD",
      },
      contentType: "sphfeed",
    });

    expect(
      mapMessageRow(messageRow({
        content: JSON.stringify({
          createMemberSerialNo: "7E3068915A444A58F73D7069C81A56F55194F219CF554649F1C4F9C615435A82",
          example: "例 就这样吧",
          items: [
            {
              content: "哼╭(╯^╰)╮",
              memberSerialNo: "7E3068915A444A58F73D7069C81A56F55194F219CF554649F1C4F9C615435A82",
              timestamp: 1778465705,
            },
            {
              content: "缪勇飞 群昵称111",
              memberSerialNo: "9AC41EA35455F6FFD1832E6EB0CD8C445194F219CF554649F1C4F9C615435A82",
              timestamp: 1778486143,
            },
          ],
          tail: "",
          title: "#接龙\n哈哈哈",
        }),
        msgtype: "solitaire",
      })),
    ).toMatchObject({
      content: {
        createMemberSerialNo: "7E3068915A444A58F73D7069C81A56F55194F219CF554649F1C4F9C615435A82",
        example: "例 就这样吧",
        items: [
          {
            content: "哼╭(╯^╰)╮",
            memberSerialNo: "7E3068915A444A58F73D7069C81A56F55194F219CF554649F1C4F9C615435A82",
            timestamp: 1778465705,
          },
          {
            content: "缪勇飞 群昵称111",
            memberSerialNo: "9AC41EA35455F6FFD1832E6EB0CD8C445194F219CF554649F1C4F9C615435A82",
            timestamp: 1778486143,
          },
        ],
        tail: "",
        title: "#接龙\n哈哈哈",
      },
      contentType: "solitaire",
    });

    expect(
      mapMessageRow(messageRow({
        content: JSON.stringify({
          description: "来自哼╭(╯^╰)╮的红包，请进入手机版企业微信领取",
          title: "恭喜发财，大吉大利",
          totalAmount: 1,
          totalCnt: 1,
          type: 1,
        }),
        msgtype: "redpacket",
      })),
    ).toMatchObject({
      content: {
        description: "来自哼╭(╯^╰)╮的红包，请进入手机版企业微信领取",
        title: "恭喜发财，大吉大利",
        totalAmount: 1,
        totalCnt: 1,
      },
      contentType: "redpacket",
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
        fileUrl: "https://b5.bokr.com.cn/media/20260508/272/file.pdf",
        sourceLabel: "文件",
      },
      contentType: "file",
    });
  });

  it("marks revoked original messages independently of content type", () => {
    expect(
      mapMessageRow(messageRow({
        content: JSON.stringify({
          fileName: "报价单.pdf",
          fileSize: 6389760,
          fileUrl: "media/20260508/272/file.pdf",
        }),
        msgtype: "file",
        revoke_status: 1,
      })),
    ).toMatchObject({
      contentType: "file",
      isRevoked: true,
    });
  });

  it("maps revoke event rows as revoke signals", () => {
    expect(
      mapMessageRow(messageRow({
        content: "{\"revokeMsgId\":\"21\",\"revokeOriginMsgId\":\"1019745\"}",
        msgtype: "revoke",
      })),
    ).toMatchObject({
      content: {
        revokeMsgId: "21",
        revokeOriginMsgId: "1019745",
        text: "",
      },
      contentType: "revoke",
      senderType: "system",
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
    opt_no: null,
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
