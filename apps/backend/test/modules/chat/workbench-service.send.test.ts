import { afterEach, describe, expect, it, vi } from "vitest";
import { MATERIAL_COLLECTION_BIZ_TYPE } from "@chatai/contracts";
import type { WorkbenchRepository } from "../../../src/modules/chat/workbench-repository.js";
import { createJavaClient, createWorkbenchService } from "./workbench-service.test-helpers.js";

describe("MysqlWorkbenchService send facade", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maps a group text send with any-position mentions to the Java send-message payload", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      optNo: "opt-001",
      status: "accepted",
    });
    const getConversationLookup = vi.fn().mockResolvedValue({
      id: "88",
      platform: 5,
      seatId: "12",
      seatHostSubUserId: "101",
      thirdGroupId: "group-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup,
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.sendMessage("101", {
        conversationId: "88",
        mention: {
          location: "any",
          memberIds: ["member-user", "member-rui"],
        },
        atOriginText: "hello @张三 world @李四",
        seatId: "12",
        segment: {
          text: "hello @$$ world @$$",
          type: "text",
        },
      }),
    ).resolves.toEqual({
      optNo: "opt-001",
      status: "accepted",
    });
    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      msgData: {
        atLocation: 2,
        atWxSerialNos: ["member-user", "member-rui"],
        isHit: 2,
        msgtype: "text",
        atOriginText: "hello @张三 world @李四",
        text: "hello @$$ world @$$",
      },
      platform: 5,
      sendType: 2,
      source: 1,
      thirdGroupId: "group-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
    expect(getConversationLookup).toHaveBeenCalledWith("88");
  });

  it("maps a group text send with mention-all to the Java send-message payload", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      optNo: "opt-all-001",
      status: "accepted",
    });
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          thirdGroupId: "group-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await service.sendMessage("101", {
      conversationId: "88",
      mention: {
        all: true,
        location: "start",
        memberIds: [],
      },
      seatId: "12",
      segment: {
        text: "大家看一下",
        type: "text",
      },
    });

    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      msgData: {
        atLocation: 0,
        isHit: 1,
        msgtype: "text",
        text: "大家看一下",
      },
      platform: 5,
      sendType: 2,
      source: 1,
      thirdGroupId: "group-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("passes failMsgId to Java when retrying a failed message", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      optNo: "opt-retry-001",
      status: "accepted",
    });
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await service.sendMessage("101", {
      conversationId: "88",
      failMsgId: "538",
      seatId: "12",
      segment: {
        text: "重试消息",
        type: "text",
      },
    });

    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      failMsgId: 538,
      msgData: {
        msgtype: "text",
        text: "重试消息",
      },
      platform: 5,
      sendType: 1,
      source: 1,
      thirdExternalUserid: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("maps a quoted text send to the Java local quote payload", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      optNo: "opt-quote-001",
      status: "accepted",
    });
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await service.sendMessage("101", {
      conversationId: "88",
      quote: {
        quoteMsgId: "538",
      },
      seatId: "12",
      segment: {
        text: "正式引用消息",
        type: "text",
      },
    });

    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      msgData: {
        msgtype: "quote",
        quoteMsgId: 538,
        text: "正式引用消息",
      },
      platform: 5,
      sendType: 1,
      source: 1,
      thirdExternalUserid: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("maps a single-chat image send to the Java send-message payload", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      optNo: "opt-image-001",
      status: "accepted",
    });
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await service.sendMessage("101", {
      conversationId: "88",
      seatId: "12",
      segment: {
        alt: "截图",
        type: "image",
        url: "https://b5.bokr.com.cn/s5/upload/a.png",
      },
    });

    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      msgData: {
        fileUrl: "https://b5.bokr.com.cn/s5/upload/a.png",
        msgtype: "image",
      },
      platform: 5,
      sendType: 1,
      source: 1,
      thirdExternalUserid: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("maps an imageUrl-only image send to the Java send-message payload", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      optNo: "opt-image-url-001",
      status: "accepted",
    });
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await service.sendMessage("101", {
      conversationId: "88",
      seatId: "12",
      segment: {
        alt: "商品图",
        imageUrl: "https://b5.bokr.com.cn/s5/upload/product.png",
        type: "image",
      },
    });

    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      msgData: {
        fileUrl: "https://b5.bokr.com.cn/s5/upload/product.png",
        msgtype: "image",
      },
      platform: 5,
      sendType: 1,
      source: 1,
      thirdExternalUserid: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("maps an image material send from the collected file url", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      optNo: "opt-image-material-001",
      status: "accepted",
    });
    const repository = {
      canAccessSeat: vi.fn().mockResolvedValue(true),
      findMaterialCollectionForForward: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          fileUrl: "s5/msg/20260624/272/product.png",
        }),
        msgInfoId: "2197",
      }),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "88",
        platform: 5,
        seatId: "12",
        seatHostSubUserId: "101",
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    } as unknown as WorkbenchRepository;
    const service = createWorkbenchService(repository, javaClient);

    await service.sendMessage("101", {
      conversationId: "88",
      seatId: "12",
      segment: {
        materialCollectionId: "material-image-001",
        type: "image",
      },
    });

    expect(repository.findMaterialCollectionForForward).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.IMAGE,
      id: "material-image-001",
      uid: 9001,
    });
    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      msgData: {
        fileUrl: "https://b5.bokr.com.cn/s5/msg/20260624/272/product.png",
        msgtype: "image",
      },
      platform: 5,
      sendType: 1,
      source: 1,
      thirdExternalUserid: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("ignores quote payload for image sends", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      optNo: "opt-image-quote-001",
      status: "accepted",
    });
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await service.sendMessage("101", {
      conversationId: "88",
      quote: {
        quoteMsgId: "538",
      },
      seatId: "12",
      segment: {
        alt: "截图",
        type: "image",
        url: "https://b5.bokr.com.cn/s5/upload/a.png",
      },
    });

    expect(javaClient.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        msgData: {
          fileUrl: "https://b5.bokr.com.cn/s5/upload/a.png",
          msgtype: "image",
        },
      }),
    );
  });

  it("maps a collected file material send to the Java file payload", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      optNo: "opt-file-001",
      status: "accepted",
    });
    const repository = {
      canAccessSeat: vi.fn().mockResolvedValue(true),
      findMaterialCollectionForForward: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          fileName: "报价单.pdf",
          fileUrl: "chat-files/quote.pdf",
        }),
        msgInfoId: "9101",
      }),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "88",
        platform: 5,
        seatId: "12",
        seatHostSubUserId: "101",
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    } as unknown as WorkbenchRepository;
    const service = createWorkbenchService(
      repository,
      javaClient,
    );

    await service.sendMessage("101", {
      conversationId: "88",
      seatId: "12",
      segment: {
        materialCollectionId: "66",
        type: "file",
      },
    });

    expect(repository.findMaterialCollectionForForward).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      id: "66",
      uid: 9001,
    });
    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      msgData: {
        fileName: "报价单.pdf",
        fileUrl: "https://b5.bokr.com.cn/chat-files/quote.pdf",
        msgtype: "file",
      },
      platform: 5,
      sendType: 1,
      source: 1,
      thirdExternalUserid: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("sends quick reply file snapshots from inline fields without material lookup", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      optNo: "opt-file-quick-reply-001",
      status: "accepted",
    });
    const repository = {
      canAccessSeat: vi.fn().mockResolvedValue(true),
      findMaterialCollectionForForward: vi.fn(),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "88",
        platform: 5,
        seatId: "12",
        seatHostSubUserId: "101",
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    } as unknown as WorkbenchRepository;
    const service = createWorkbenchService(repository, javaClient);

    await service.sendMessage("101", {
      conversationId: "88",
      seatId: "12",
      segment: {
        fileName: "快捷话术报价单.pdf",
        type: "file",
        url: "https://b5.bokr.com.cn/chat-files/quick-reply-quote.pdf",
      },
    });

    expect(repository.findMaterialCollectionForForward).not.toHaveBeenCalled();
    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      msgData: {
        fileName: "快捷话术报价单.pdf",
        fileUrl: "https://b5.bokr.com.cn/chat-files/quick-reply-quote.pdf",
        msgtype: "file",
      },
      platform: 5,
      sendType: 1,
      source: 1,
      thirdExternalUserid: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("maps a collected H5 material send to the Java link payload", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      optNo: "opt-h5-001",
      status: "accepted",
    });
    const repository = {
      canAccessSeat: vi.fn().mockResolvedValue(true),
      findMaterialCollectionForForward: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          desc: "恭喜发财，大吉大利",
          href: "https://example.com/redpacket",
          title: "红包来啦",
        }),
        msgInfoId: "9102",
      }),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "88",
        platform: 5,
        seatId: "12",
        seatHostSubUserId: "101",
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    } as unknown as WorkbenchRepository;
    const service = createWorkbenchService(
      repository,
      javaClient,
    );

    await service.sendMessage("101", {
      conversationId: "88",
      seatId: "12",
      segment: {
        materialCollectionId: "77",
        type: "h5",
      },
    });

    expect(repository.findMaterialCollectionForForward).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
      id: "77",
      uid: 9001,
    });
    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      msgData: {
        coverUrl: "https://b5.bokr.com.cn/dist/default-cover.png",
        desc: "恭喜发财，大吉大利",
        href: "https://example.com/redpacket",
        msgtype: "link",
        title: "红包来啦",
      },
      platform: 5,
      sendType: 1,
      source: 1,
      thirdExternalUserid: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("sends quick reply H5 snapshots from inline fields without material lookup", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      optNo: "opt-h5-quick-reply-001",
      status: "accepted",
    });
    const repository = {
      canAccessSeat: vi.fn().mockResolvedValue(true),
      findMaterialCollectionForForward: vi.fn(),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "88",
        platform: 5,
        seatId: "12",
        seatHostSubUserId: "101",
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    } as unknown as WorkbenchRepository;
    const service = createWorkbenchService(repository, javaClient);

    await service.sendMessage("101", {
      conversationId: "88",
      seatId: "12",
      segment: {
        coverUrl: "https://b5.bokr.com.cn/dist/quick-reply-cover.png",
        desc: "快捷话术说明",
        href: "https://example.com/quick-reply",
        title: "快捷话术链接",
        type: "h5",
      },
    });

    expect(repository.findMaterialCollectionForForward).not.toHaveBeenCalled();
    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      msgData: {
        coverUrl: "https://b5.bokr.com.cn/dist/quick-reply-cover.png",
        desc: "快捷话术说明",
        href: "https://example.com/quick-reply",
        msgtype: "link",
        title: "快捷话术链接",
      },
      platform: 5,
      sendType: 1,
      source: 1,
      thirdExternalUserid: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("uses the default cover when direct H5 link send has no cover", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      optNo: "opt-h5-default-cover-001",
      status: "accepted",
    });
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await service.sendMessage("101", {
      conversationId: "88",
      seatId: "12",
      segment: {
        desc: "恭喜发财，大吉大利",
        href: "https://example.com/redpacket",
        title: "红包来啦",
        type: "h5",
      },
    });

    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      msgData: {
        coverUrl: "https://b5.bokr.com.cn/dist/default-cover.png",
        desc: "恭喜发财，大吉大利",
        href: "https://example.com/redpacket",
        msgtype: "link",
        title: "红包来啦",
      },
      platform: 5,
      sendType: 1,
      source: 1,
      thirdExternalUserid: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("maps an expression material send to the Java emotion payload", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      optNo: "opt-emotion-001",
      status: "accepted",
    });
    const repository = {
      canAccessSeat: vi.fn().mockResolvedValue(true),
      findMaterialCollectionForForward: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          fileUrl: "https://example.com/expression.gif",
        }),
        msgInfoId: "9103",
      }),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "88",
        platform: 5,
        seatId: "12",
        seatHostSubUserId: "101",
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    } as unknown as WorkbenchRepository;
    const service = createWorkbenchService(
      repository,
      javaClient,
    );

    await service.sendMessage("101", {
      conversationId: "88",
      seatId: "12",
      segment: {
        materialCollectionId: "65",
        type: "emotion",
      },
    });

    expect(repository.findMaterialCollectionForForward).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
      id: "65",
      subUserId: "101",
      uid: 9001,
    });
    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      msgData: {
        fileUrl: "https://example.com/expression.gif",
        msgtype: "emotion",
      },
      platform: 5,
      sendType: 1,
      source: 1,
      thirdExternalUserid: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("rejects expression material sends when the stored file url is missing", async () => {
    const javaClient = createJavaClient();
    const repository = {
      canAccessSeat: vi.fn().mockResolvedValue(true),
      findMaterialCollectionForForward: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          url: "https://example.com/legacy-expression.gif",
        }),
        msgInfoId: "9104",
      }),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "88",
        platform: 5,
        seatId: "12",
        seatHostSubUserId: "101",
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    } as unknown as WorkbenchRepository;
    const service = createWorkbenchService(repository, javaClient);

    await expect(
      service.sendMessage("101", {
        conversationId: "88",
        seatId: "12",
        segment: {
          materialCollectionId: "65",
          type: "emotion",
        },
      }),
    ).rejects.toMatchObject({
      code: "INVALID_EMOTION_MESSAGE",
      statusCode: 400,
    });
    expect(javaClient.sendMessage).not.toHaveBeenCalled();
  });

  it("maps a mini-program forward send to the Java send-message payload", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      optNo: "opt-weapp-001",
      status: "accepted",
    });
    const repository = {
      canAccessSeat: vi.fn().mockResolvedValue(true),
      findMaterialCollectionForForward: vi.fn().mockResolvedValue({
        msgInfoId: "9105",
      }),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "88",
        platform: 5,
        seatId: "12",
        seatHostSubUserId: "101",
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    } as unknown as WorkbenchRepository;
    const service = createWorkbenchService(
      repository,
      javaClient,
    );

    await service.sendMessage("101", {
      conversationId: "88",
      seatId: "12",
      segment: {
        materialCollectionId: "66",
        type: "weapp",
      },
    });

    expect(repository.findMaterialCollectionForForward).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM,
      id: "66",
      uid: 9001,
    });
    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      msgData: {
        msgtype: "weapp",
        transMsgInfoId: 9105,
      },
      platform: 5,
      sendType: 1,
      source: 1,
      thirdExternalUserid: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("forwards quick reply mini-program snapshots by msgInfoId without material lookup", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      optNo: "opt-weapp-quick-reply-001",
      status: "accepted",
    });
    const repository = {
      canAccessSeat: vi.fn().mockResolvedValue(true),
      findMaterialCollectionForForward: vi.fn(),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "88",
        platform: 5,
        seatId: "12",
        seatHostSubUserId: "101",
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    } as unknown as WorkbenchRepository;
    const service = createWorkbenchService(repository, javaClient);

    await service.sendMessage("101", {
      conversationId: "88",
      seatId: "12",
      segment: {
        msgInfoId: "9106",
        type: "weapp",
      },
    });

    expect(repository.findMaterialCollectionForForward).not.toHaveBeenCalled();
    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      msgData: {
        msgtype: "weapp",
        transMsgInfoId: 9106,
      },
      platform: 5,
      sendType: 1,
      source: 1,
      thirdExternalUserid: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("forwards collected sphfeed materials by their source message", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      optNo: "opt-sphfeed-001",
      status: "accepted",
    });
    const repository = {
      canAccessSeat: vi.fn().mockResolvedValue(true),
      findMaterialCollectionForForward: vi.fn().mockResolvedValue({
        msgInfoId: "9107",
        msgid: "msg-sphfeed-001",
      }),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "88",
        platform: 5,
        seatId: "12",
        seatHostSubUserId: "101",
        thirdGroupId: "group-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    } as unknown as WorkbenchRepository;
    const service = createWorkbenchService(
      repository,
      javaClient,
    );

    await service.sendMessage("101", {
      conversationId: "88",
      seatId: "12",
      segment: {
        materialCollectionId: "77",
        type: "sphfeed",
      },
    });

    expect(repository.findMaterialCollectionForForward).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED,
      id: "77",
      uid: 9001,
    });
    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      msgData: {
        msgtype: "sphfeed",
        transMsgInfoId: 9107,
      },
      platform: 5,
      sendType: 2,
      source: 1,
      thirdGroupId: "group-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("forwards collected video materials by their source message", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      optNo: "opt-video-001",
      status: "accepted",
    });
    const repository = {
      canAccessSeat: vi.fn().mockResolvedValue(true),
      findMaterialCollectionForForward: vi.fn().mockResolvedValue({
        msgInfoId: "2205",
      }),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "88",
        platform: 5,
        seatId: "12",
        seatHostSubUserId: "101",
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    } as unknown as WorkbenchRepository;
    const service = createWorkbenchService(
      repository,
      javaClient,
    );

    await service.sendMessage("101", {
      conversationId: "88",
      seatId: "12",
      segment: {
        materialCollectionId: "77",
        type: "video",
      },
    });

    expect(repository.findMaterialCollectionForForward).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.VIDEO,
      id: "77",
      uid: 9001,
    });
    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      msgData: {
        msgtype: "video",
        transMsgInfoId: 2205,
      },
      platform: 5,
      sendType: 1,
      source: 1,
      thirdExternalUserid: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("forwards quick reply sphfeed snapshots by msgInfoId without material lookup", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      optNo: "opt-sphfeed-quick-reply-001",
      status: "accepted",
    });
    const repository = {
      canAccessSeat: vi.fn().mockResolvedValue(true),
      findMaterialCollectionForForward: vi.fn(),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "88",
        platform: 5,
        seatId: "12",
        seatHostSubUserId: "101",
        thirdGroupId: "group-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    } as unknown as WorkbenchRepository;
    const service = createWorkbenchService(repository, javaClient);

    await service.sendMessage("101", {
      conversationId: "88",
      seatId: "12",
      segment: {
        msgInfoId: "9108",
        type: "sphfeed",
      },
    });

    expect(repository.findMaterialCollectionForForward).not.toHaveBeenCalled();
    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      msgData: {
        msgtype: "sphfeed",
        transMsgInfoId: 9108,
      },
      platform: 5,
      sendType: 2,
      source: 1,
      thirdGroupId: "group-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("rejects forward sends when the material collection is not visible", async () => {
    const javaClient = createJavaClient();
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        findMaterialCollectionForForward: vi.fn().mockResolvedValue(undefined),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.sendMessage("101", {
        conversationId: "88",
        seatId: "12",
        segment: {
          materialCollectionId: "66",
          type: "weapp",
        },
      }),
    ).rejects.toMatchObject({
      code: "MATERIAL_COLLECTION_NOT_FOUND",
      statusCode: 404,
    });
    expect(javaClient.sendMessage).not.toHaveBeenCalled();
  });

  it("rejects forward sends when the stored source message info id is blank", async () => {
    const javaClient = createJavaClient();
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        findMaterialCollectionForForward: vi.fn().mockResolvedValue({
          msgInfoId: "   ",
        }),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.sendMessage("101", {
        conversationId: "88",
        seatId: "12",
        segment: {
          materialCollectionId: "66",
          type: "weapp",
        },
      }),
    ).rejects.toMatchObject({
      code: "INVALID_TRANS_MESSAGE_INFO_ID",
      statusCode: 400,
    });
    expect(javaClient.sendMessage).not.toHaveBeenCalled();
  });

  it("ignores quote payload for file sends", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      optNo: "opt-file-quote-001",
      status: "accepted",
    });
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await service.sendMessage("101", {
      conversationId: "88",
      quote: {
        quoteMsgId: "538",
      },
      seatId: "12",
      segment: {
        extension: "pdf",
        fileName: "报价单.pdf",
        fileSizeLabel: "6.09 MB",
        type: "file",
        url: "https://b5.bokr.com.cn/chat-files/quote.pdf",
      },
    });

    expect(javaClient.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        msgData: {
          fileName: "报价单.pdf",
          fileUrl: "https://b5.bokr.com.cn/chat-files/quote.pdf",
          msgtype: "file",
        },
      }),
    );
  });

  it("rejects image send without a sendable URL before calling Java", async () => {
    const javaClient = createJavaClient();
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.sendMessage("101", {
        conversationId: "88",
        seatId: "12",
        segment: {
          alt: "截图",
          type: "image",
        },
      }),
    ).rejects.toMatchObject({
      code: "INVALID_IMAGE_MESSAGE",
      statusCode: 400,
    });
    expect(javaClient.sendMessage).not.toHaveBeenCalled();
  });

  it("rejects multi-segment payloads before calling Java", async () => {
    const javaClient = createJavaClient();
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.sendMessage("101", {
        conversationId: "88",
        seatId: "12",
        segments: [
          {
            text: "第一段",
            type: "text",
          },
          {
            text: "第二段",
            type: "text",
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_SEND_MESSAGE",
      statusCode: 400,
    });
    expect(javaClient.sendMessage).not.toHaveBeenCalled();
  });
});
