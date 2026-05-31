import { describe, expect, it } from "vitest";
import {
  adaptConversation,
  adaptMessage,
} from "@/pages/chat/api/workbench-adapter";
import type { WorkbenchConversationSummaryDto } from "@chatai/contracts";
import type { Account, CustomerProfile, EmployeeProfile } from "@/pages/chat/chat-types";

describe("workbench adapter", () => {
  it("does not format zero conversation timestamps as epoch dates", () => {
    expect(
      adaptConversation({
        ...conversationDto,
        lastMessageTime: 0,
      }),
    ).toMatchObject({
      quietFor: "",
      updatedAt: "",
      updatedAtMs: undefined,
    });
  });

  it("adapts conversation recognition metadata for temporary sidebar visibility", () => {
    const conversation = adaptConversation({
      ...conversationDto,
      createdAt: 1778832000000,
      verified: false,
    });

    expect(conversation.createdAtMs).toBe(1778832000000);
    expect(conversation.isVerified).toBe(false);
  });

  it("maps conversation custody mode from the workbench DTO", () => {
    expect(adaptConversation(conversationDto).custodyMode).toBe("semi");
    expect(
      adaptConversation({
        ...conversationDto,
        custodyMode: "full",
      }).custodyMode,
    ).toBe("full");
  });

  it("adapts conversation biz status for send availability", () => {
    expect(
      adaptConversation({
        ...conversationDto,
        bizStatus: 2,
      }),
    ).toMatchObject({
      bizStatus: 2,
    });
  });

  it("defaults missing conversation biz status to hidden (0)", () => {
    expect(
      adaptConversation({
        ...conversationDto,
        bizStatus: undefined,
      }),
    ).toMatchObject({
      bizStatus: 0,
    });
  });
});

describe("adaptMessage", () => {
  const me: EmployeeProfile = {
    id: "third-user-1",
    displayName: "当前客服",
  };

  const accountsById: Record<string, Account> = {
    "seat-1": {
      avatarUrl: "https://example.com/seat.png",
      description: "",
      id: "seat-1",
      metrics: {
        activeCustomers: 0,
        agents: 0,
        stores: 0,
        totalCustomers: 0,
      },
      name: "测试席位",
      operator: "小林",
      phone: "",
      tone: "",
    },
  };

  const customerProfilesById: Record<string, CustomerProfile> = {
    "group-1": {
      avatarUrl: "https://example.com/group.png",
      city: "",
      id: "group-1",
      intentScore: 0,
      metrics: [],
      name: "测试群001",
      notes: [],
      persona: "",
      phone: "",
      stage: "",
      tags: [],
      tasks: [],
    },
  };

  it("does not format zero message timestamps as epoch dates", () => {
    expect(
      adaptMessage(
        {
          ...messageDto,
          createdAt: 0,
        },
        customerProfilesById,
        accountsById,
        me,
      ),
    ).toMatchObject({
      sentAt: "",
    });
  });

  it("preserves revoked message state from backend messages", () => {
    expect(
      adaptMessage(
        {
          ...messageDto,
          isRevoked: true,
        },
        customerProfilesById,
        accountsById,
        me,
      ),
    ).toMatchObject({
      id: "message-1",
      isRevoked: true,
    });
  });

  it("preserves message optNo for optimistic reconciliation", () => {
    expect(
      adaptMessage(
        {
          ...messageDto,
          optNo: "opt-001",
        },
        customerProfilesById,
        accountsById,
        me,
      ),
    ).toMatchObject({
      id: "message-1",
      optNo: "opt-001",
    });
  });

  it("adapts voice playback URL and persisted transcode state", () => {
    expect(
      adaptMessage(
        {
          ...messageDto,
          content: {
            audioUrl: "https://b5.bokr.com.cn/s5/msg/voice.amr",
            durationLabel: "11\"",
            playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/voice.wav",
            transFileUrlPersisted: false,
          },
          contentType: "voice",
        },
        customerProfilesById,
        accountsById,
        me,
      ),
    ).toMatchObject({
      content: {
        audioUrl: "https://b5.bokr.com.cn/s5/msg/voice.amr",
        durationLabel: "11\"",
        playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/voice.wav",
        transFileUrlPersisted: false,
        type: "voice",
      },
    });
  });

  it("treats system content as a system message even when sender type is agent", () => {
    expect(
      adaptMessage(
        {
          ...messageDto,
          content: {
            text: "客户已加入群聊",
          },
          contentType: "system",
          senderType: "agent",
        },
        customerProfilesById,
        accountsById,
        me,
      ),
    ).toMatchObject({
      author: "系统",
      content: {
        text: "客户已加入群聊",
        type: "system",
      },
      role: "system",
    });
  });

  it("reads system message text from the content field without rendering raw JSON", () => {
    expect(
      adaptMessage(
        {
          ...messageDto,
          content: {
            content: "开启了联系人验证，请先发送联系人验证请求",
          },
          contentType: "system",
          senderType: "agent",
        },
        customerProfilesById,
        accountsById,
        me,
      ),
    ).toMatchObject({
      content: {
        text: "开启了联系人验证，请先发送联系人验证请求",
        type: "system",
      },
      role: "system",
    });
  });

  it("marks group messages from the current seat as own messages", () => {
    expect(
      adaptMessage(
        {
          ...messageDto,
          senderAvatar: "",
          senderName: "",
          senderType: "agent",
          thirdFromId: "third-user-1",
          thirdGroupId: "group-1",
          thirdUserId: "third-user-1",
        },
        customerProfilesById,
        accountsById,
        me,
      ),
    ).toMatchObject({
      isGroupConversation: true,
      isOwnMessage: true,
      senderDisplayName: undefined,
    });
  });

  it("keeps other group members on the left and exposes their display name", () => {
    expect(
      adaptMessage(
        {
          ...messageDto,
          senderAvatar: "https://example.com/member.png",
          senderName: "群成员A",
          senderType: "customer",
          thirdFromId: "third-user-2",
          thirdGroupId: "group-1",
          thirdUserId: "third-user-1",
        },
        customerProfilesById,
        accountsById,
        me,
      ),
    ).toMatchObject({
      isGroupConversation: true,
      isOwnMessage: false,
      sender: {
        userId: "third-user-2",
      },
      senderDisplayName: "群成员A",
    });
  });

  it("exposes the single customer external id as the copyable sender user id", () => {
    expect(
      adaptMessage(
        {
          ...messageDto,
          customerId: "customer-1",
          senderName: "客户A",
          senderType: "customer",
          thirdExternalUserId: "external-user-1",
        },
        customerProfilesById,
        accountsById,
        me,
      ),
    ).toMatchObject({
      isGroupConversation: false,
      isOwnMessage: false,
      sender: {
        userId: "external-user-1",
      },
    });
  });

  it("falls back to the member id when the group sender name is missing", () => {
    expect(
      adaptMessage(
        {
          ...messageDto,
          senderAvatar: "",
          senderName: "",
          senderType: "customer",
          thirdFromId: "third-user-2",
          thirdGroupId: "group-1",
          thirdUserId: "third-user-1",
        },
        customerProfilesById,
        accountsById,
        me,
      ),
    ).toMatchObject({
      senderDisplayName: "third-user-2",
    });
  });

  it("keeps mini program logo urls from message content", () => {
    expect(
      adaptMessage(
        {
          ...messageDto,
          content: {
            appName: "京东购物丨点外卖领国补",
            coverImageUrl: "https://b3.iyouke.com/s5/20260511/272/2c37da84f0454991ad5a0b3cd56d991b.jpg",
            logoUrl: "http://mmbiz.qpic.cn/logo.png",
            sourceLabel: "小程序",
            title: "京东购物，多·快·好·省",
          },
          contentType: "mini-program",
        },
        customerProfilesById,
        accountsById,
        me,
      ),
    ).toMatchObject({
      content: {
        appName: "京东购物丨点外卖领国补",
        coverImageUrl: "https://b3.iyouke.com/s5/20260511/272/2c37da84f0454991ad5a0b3cd56d991b.jpg",
        logoUrl: "http://mmbiz.qpic.cn/logo.png",
        title: "京东购物，多·快·好·省",
        type: "mini-program",
      },
    });
  });

  it("adapts file transfer metadata", () => {
    expect(
      adaptMessage(
        {
          ...messageDto,
          content: {
            downloadStatus: "failed",
            extension: "pdf",
            fileName: "报价单.pdf",
            fileSerialNo: "serial-file-001",
            fileSizeLabel: "2 KB",
            fileUrl: "https://b5.bokr.com.cn/chat-files/quote.pdf",
            sourceLabel: "文件",
          },
          contentType: "file",
        },
        customerProfilesById,
        accountsById,
        me,
      ),
    ).toMatchObject({
      content: {
        downloadStatus: "failed",
        extension: "pdf",
        fileName: "报价单.pdf",
        fileSerialNo: "serial-file-001",
        fileUrl: "https://b5.bokr.com.cn/chat-files/quote.pdf",
        type: "file",
      },
      id: "message-1",
      seq: 1,
    });
  });

  it("adapts video transfer metadata", () => {
    expect(
      adaptMessage(
        {
          ...messageDto,
          content: {
            alt: "演示视频",
            coverImageUrl: "https://b5.bokr.com.cn/covers/video.jpg",
            downloadStatus: "finished",
            durationLabel: "",
            fileSerialNo: "serial-video-001",
            fileUrlExpireTime: 1778919538036,
            videoUrl: "https://b5.bokr.com.cn/videos/demo.mp4",
          },
          contentType: "video",
        },
        customerProfilesById,
        accountsById,
        me,
      ),
    ).toMatchObject({
      content: {
        downloadStatus: "finished",
        fileSerialNo: "serial-video-001",
        fileUrlExpireTime: 1778919538036,
        type: "video",
        videoUrl: "https://b5.bokr.com.cn/videos/demo.mp4",
      },
    });
  });

  it("adapts contact card message content", () => {
    expect(
      adaptMessage(
        {
          ...messageDto,
          content: {
            avatarUrl: "http://wx.qlogo.cn/mmhead/avatar/0",
            company: "微信",
            contactSerialNo: "D91D072C07D9CECFEC1271DB430B5EDF5194F219CF554649F1C4F9C615435A82",
            groupSerialNo: "29F71A2ED8125854B6AA6EB6E582A8A9330A4B02FE42E908C5EF07B05A8F6A33",
            name: "binarywang",
            sourceLabel: "个人名片",
          },
          contentType: "contact-card",
        },
        customerProfilesById,
        accountsById,
        me,
      ),
    ).toMatchObject({
      content: {
        avatarUrl: "http://wx.qlogo.cn/mmhead/avatar/0",
        company: "微信",
        contactSerialNo: "D91D072C07D9CECFEC1271DB430B5EDF5194F219CF554649F1C4F9C615435A82",
        groupSerialNo: "29F71A2ED8125854B6AA6EB6E582A8A9330A4B02FE42E908C5EF07B05A8F6A33",
        name: "binarywang",
        sourceLabel: "个人名片",
        type: "contact-card",
      },
    });
  });

  it("adapts location message content", () => {
    expect(
      adaptMessage(
        {
          ...messageDto,
          content: {
            address: "浙江省杭州市钱塘区学府街515号智慧谷一栋",
            latitude: 30.310369,
            longitude: 120.371184,
            title: "杭州智慧谷移动互联网大厦",
            zoom: 15,
          },
          contentType: "location",
        },
        customerProfilesById,
        accountsById,
        me,
      ),
    ).toMatchObject({
      content: {
        address: "浙江省杭州市钱塘区学府街515号智慧谷一栋",
        latitude: 30.310369,
        longitude: 120.371184,
        title: "杭州智慧谷移动互联网大厦",
        type: "location",
        zoom: 15,
      },
    });
  });

  it("adapts sphfeed message content", () => {
    expect(
      adaptMessage(
        {
          ...messageDto,
          content: {
            description: "杭州高架惊现鸵鸟飞奔",
            imageUrl: "https://finder.video.qq.com/cover.jpg",
            sourceLabel: "视频号",
            title: "都市快报",
            url: "https://channels.weixin.qq.com/web/pages/feed?eid=export%2FUzFfBgAAxPiD",
          },
          contentType: "sphfeed",
        },
        customerProfilesById,
        accountsById,
        me,
      ),
    ).toMatchObject({
      content: {
        description: "杭州高架惊现鸵鸟飞奔",
        imageUrl: "https://finder.video.qq.com/cover.jpg",
        sourceLabel: "视频号",
        title: "都市快报",
        type: "sphfeed",
        url: "https://channels.weixin.qq.com/web/pages/feed?eid=export%2FUzFfBgAAxPiD",
      },
    });
  });

  it("adapts solitaire message content", () => {
    expect(
      adaptMessage(
        {
          ...messageDto,
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
        },
        customerProfilesById,
        accountsById,
        me,
      ),
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
        type: "solitaire",
      },
    });
  });

  it("adapts red packet message content", () => {
    expect(
      adaptMessage(
        {
          ...messageDto,
          content: {
            description: "来自哼╭(╯^╰)╮的红包，请进入手机版企业微信领取",
            title: "恭喜发财，大吉大利",
            totalAmount: 1,
            totalCnt: 1,
            type: 1,
          },
          contentType: "redpacket",
        },
        customerProfilesById,
        accountsById,
        me,
      ),
    ).toMatchObject({
      content: {
        description: "来自哼╭(╯^╰)╮的红包，请进入手机版企业微信领取",
        title: "恭喜发财，大吉大利",
        totalAmount: 1,
        totalCnt: 1,
        type: "redpacket",
      },
    });
  });

  it("adapts emotion messages as compact image content", () => {
    expect(
      adaptMessage(
        {
          ...messageDto,
          content: {
            alt: "表情",
            imageUrl: "https://cdn.example.com/emotion.gif",
          },
          contentType: "emotion",
        },
        customerProfilesById,
        accountsById,
        me,
      ),
    ).toMatchObject({
      content: {
        alt: "表情",
        imageUrl: "https://cdn.example.com/emotion.gif",
        type: "image",
        variant: "emotion",
      },
    });
  });

  it("adapts quote message content with normalized preview data", () => {
    expect(
      adaptMessage(
        {
          ...messageDto,
          content: {
            quoteMsgId: "538",
            quotedMessage: {
              contentType: "image",
              imageUrl: "https://cdn.example.com/quote.jpg",
              senderName: "范双飞",
            },
            text: "这是什么活动",
          },
          contentType: "quote",
        },
        customerProfilesById,
        accountsById,
        me,
      ),
    ).toMatchObject({
      content: {
        quoteMsgId: "538",
        quotedMessage: {
          contentType: "image",
          imageUrl: "https://cdn.example.com/quote.jpg",
          senderName: "范双飞",
        },
        text: "这是什么活动",
        type: "quote",
      },
    });
  });
});

const conversationDto: WorkbenchConversationSummaryDto = {
  conversationId: "conversation-1",
  custodyMode: "semi",
  customerAvatar: "",
  customerId: "group-1",
  customerName: "测试群002",
  lastMessage: "",
  mode: "group",
  priority: "medium",
  seatId: "seat-1",
  thirdGroupId: "group-1",
  thirdUserId: "third-user-1",
  unreadCount: 0,
};

const messageDto = {
  clientMessageId: undefined,
  content: {
    text: "hello",
  },
  contentType: "text" as const,
  conversationId: "conversation-1",
  createdAt: 1715237640000,
  customerId: "group-1",
  failReason: undefined,
  messageId: "message-1",
  optNo: undefined,
  seatId: "seat-1",
  senderAvatar: "",
  senderName: "",
  senderType: "customer" as const,
  seq: 1,
  status: "sent" as const,
  thirdExternalUserId: undefined,
  thirdFromId: undefined,
  thirdGroupId: undefined,
  thirdUserId: "third-user-1",
};
