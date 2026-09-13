import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createJavaClient,
  createMaterialRepository,
  createWorkbenchService,
} from "./workbench-service.test-helpers.js";

describe("MysqlWorkbenchService retry facade", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("retries a failed group text message from async operation msgData", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      optNo: "retry-opt-001",
      status: "accepted",
    });
    const repository = createMaterialRepository({
      findRetryMessage: vi.fn().mockResolvedValue({
        id: 538,
        optNo: "failed-opt-538",
        senderType: "agent",
      }),
      findAsyncOperationByOptNo: vi.fn().mockResolvedValue({
        optParams: JSON.stringify({
          msgData: {
            atLocation: 2,
            atWxSerialNos: ["member-serial-1", "member-serial-2"],
            isHit: 2,
            msgtype: "text",
            quoteOriginText: "hello @张三 world @李四",
            text: "hello @$$ world @$$",
          },
          msgtime: 1783048444904,
          platform: 5,
          sendType: 2,
          source: 1,
          thirdGroupId: "stale-group",
          thirdUserId: "stale-user",
          uid: 272,
        }),
      }),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "conv-group",
        messageSourceThirdUserId: "opening-user",
        platform: 5,
        seatHostSubUserId: "101",
        seatId: "12",
        thirdGroupId: "current-group",
        thirdUserId: "current-user",
        uid: 272,
      }),
    });
    const service = createWorkbenchService(repository, javaClient);

    await expect(
      service.retryMessage("101", {
        conversationId: "conv-group",
        messageSeq: 538,
      }),
    ).resolves.toEqual({
      optNo: "retry-opt-001",
      status: "accepted",
    });

    expect(repository.findRetryMessage).toHaveBeenCalledWith({
      conversationId: "conv-group",
      messageSourceThirdUserId: "opening-user",
      messageSeq: 538,
      platform: 5,
      receptionThirdUserId: "current-user",
      thirdGroupId: "current-group",
      uid: 272,
    });
    expect(repository.findAsyncOperationByOptNo).toHaveBeenCalledWith({
      optNo: "failed-opt-538",
      platform: 5,
      uid: 272,
    });
    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      failMsgId: 538,
      msgData: {
        atLocation: 2,
        atWxSerialNos: ["member-serial-1", "member-serial-2"],
        isHit: 2,
        msgtype: "text",
        quoteOriginText: "hello @张三 world @李四",
        text: "hello @$$ world @$$",
      },
      platform: 5,
      sendType: 2,
      source: 1,
      thirdGroupId: "current-group",
      thirdUserId: "current-user",
      uid: 272,
    });
  });

  it("reads send failReason from Java async-operation get-info by message optNo", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.getAsyncOperationInfo).mockResolvedValue({
      failReason: "当前机器人不在线",
      optNo: "20260907007548741182212507699",
      status: 2,
    });
    const repository = createMaterialRepository({
      findRetryMessage: vi.fn().mockResolvedValue({
        id: 538,
        optNo: "20260907007548741182212507699",
        senderType: "agent",
      }),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "conv-001",
        platform: 5,
        seatHostSubUserId: "101",
        seatId: "12",
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 272,
      }),
    });
    const service = createWorkbenchService(repository, javaClient);

    await expect(
      service.getSendFailReason("101", {
        conversationId: "conv-001",
        messageSeq: 538,
      }),
    ).resolves.toEqual({
      failReason: "当前机器人不在线",
    });

    expect(javaClient.getAsyncOperationInfo).toHaveBeenCalledWith({
      optNo: "20260907007548741182212507699",
      platform: 5,
      uid: 272,
    });
  });

  it("returns an empty send failReason when the failed message has no optNo", async () => {
    const javaClient = createJavaClient();
    const repository = createMaterialRepository({
      findRetryMessage: vi.fn().mockResolvedValue({
        id: 538,
        optNo: null,
        senderType: "agent",
      }),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "conv-001",
        platform: 5,
        seatHostSubUserId: "101",
        seatId: "12",
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 272,
      }),
    });
    const service = createWorkbenchService(repository, javaClient);

    await expect(
      service.getSendFailReason("101", {
        conversationId: "conv-001",
        messageSeq: 538,
      }),
    ).resolves.toEqual({
      failReason: "",
    });
    expect(javaClient.getAsyncOperationInfo).not.toHaveBeenCalled();
  });

  it("reports retry failure when the failed message is missing", async () => {
    const repository = createMaterialRepository({
      findAsyncOperationByOptNo: vi.fn(),
      findRetryMessage: vi.fn().mockResolvedValue(undefined),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "conv-001",
        platform: 5,
        seatHostSubUserId: "101",
        seatId: "12",
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 272,
      }),
    });
    const javaClient = createJavaClient();
    const service = createWorkbenchService(repository, javaClient);

    await expect(
      service.retryMessage("101", {
        conversationId: "conv-001",
        messageSeq: 538,
      }),
    ).rejects.toMatchObject({
      code: "RETRY_MESSAGE_FAILED",
      logDetails: {
        conversationId: "conv-001",
        messageSeq: 538,
        reason: "retry_message_not_found",
      },
      message: "重发失败",
      statusCode: 400,
    });
    expect(repository.findAsyncOperationByOptNo).not.toHaveBeenCalled();
    expect(javaClient.sendMessage).not.toHaveBeenCalled();
  });

  it("rejects retry when the failed message optNo is missing", async () => {
    const repository = createMaterialRepository({
      findAsyncOperationByOptNo: vi.fn(),
      findRetryMessage: vi.fn().mockResolvedValue({
        id: 538,
        optNo: null,
        senderType: "agent",
      }),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "conv-001",
        platform: 5,
        seatHostSubUserId: "101",
        seatId: "12",
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 272,
      }),
    });
    const javaClient = createJavaClient();
    const service = createWorkbenchService(repository, javaClient);

    await expect(
      service.retryMessage("101", {
        conversationId: "conv-001",
        messageSeq: 538,
      }),
    ).rejects.toMatchObject({
      code: "retry_message_opt_no_missing",
      message: "暂不支持重发该消息",
      statusCode: 400,
    });
    expect(repository.findAsyncOperationByOptNo).not.toHaveBeenCalled();
    expect(javaClient.sendMessage).not.toHaveBeenCalled();
  });

  it("reports retry failure when the async operation record is missing", async () => {
    const repository = createMaterialRepository({
      findRetryMessage: vi.fn().mockResolvedValue({
        id: 538,
        optNo: "failed-opt-538",
        senderType: "agent",
      }),
      findAsyncOperationByOptNo: vi.fn().mockResolvedValue(undefined),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "conv-001",
        platform: 5,
        seatHostSubUserId: "101",
        seatId: "12",
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 272,
      }),
    });
    const javaClient = createJavaClient();
    const service = createWorkbenchService(repository, javaClient);

    await expect(
      service.retryMessage("101", {
        conversationId: "conv-001",
        messageSeq: 538,
      }),
    ).rejects.toMatchObject({
      code: "RETRY_MESSAGE_FAILED",
      logDetails: {
        conversationId: "conv-001",
        messageSeq: 538,
        reason: "retry_operation_not_found",
        retryOptNo: "failed-opt-538",
      },
      message: "重发失败",
      statusCode: 400,
    });
    expect(javaClient.sendMessage).not.toHaveBeenCalled();
  });

  it("rejects retry for failed non-agent messages", async () => {
    const repository = createMaterialRepository({
      findRetryMessage: vi.fn().mockResolvedValue({
        id: 538,
        optNo: "failed-opt-538",
        senderType: "customer",
      }),
      findAsyncOperationByOptNo: vi.fn().mockResolvedValue({
        optParams: JSON.stringify({
          msgData: {
            msgtype: "text",
            text: "hello",
          },
        }),
      }),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "conv-001",
        platform: 5,
        seatHostSubUserId: "101",
        seatId: "12",
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 272,
      }),
    });
    const javaClient = createJavaClient();
    const service = createWorkbenchService(repository, javaClient);

    await expect(
      service.retryMessage("101", {
        conversationId: "conv-001",
        messageSeq: 538,
      }),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_RETRY_MESSAGE",
      statusCode: 400,
    });
    expect(repository.findAsyncOperationByOptNo).not.toHaveBeenCalled();
    expect(javaClient.sendMessage).not.toHaveBeenCalled();
  });

  it("rejects retry when async operation msgData type is unsupported", async () => {
    const repository = createMaterialRepository({
      findRetryMessage: vi.fn().mockResolvedValue({
        id: 538,
        optNo: "failed-opt-538",
        senderType: "agent",
      }),
      findAsyncOperationByOptNo: vi.fn().mockResolvedValue({
        optParams: JSON.stringify({
          msgData: {
            msgtype: "weapp",
            transMsgInfoId: 123,
          },
        }),
      }),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "conv-001",
        platform: 5,
        seatHostSubUserId: "101",
        seatId: "12",
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 272,
      }),
    });
    const javaClient = createJavaClient();
    const service = createWorkbenchService(repository, javaClient);

    await expect(
      service.retryMessage("101", {
        conversationId: "conv-001",
        messageSeq: 538,
      }),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_RETRY_MESSAGE",
      statusCode: 400,
    });
    expect(javaClient.sendMessage).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "quote",
      msgData: {
        msgtype: "quote",
        quoteMsgId: 321,
        text: "引用回复",
      },
    },
    {
      label: "image",
      msgData: {
        fileUrl: "https://cdn.example.com/image.jpg",
        msgtype: "image",
      },
    },
    {
      label: "file",
      msgData: {
        fileName: "报价.pdf",
        fileUrl: "https://cdn.example.com/quote.pdf",
        msgtype: "file",
      },
    },
  ])("replays retry %s msgData from async operation params", async ({ msgData }) => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      optNo: "retry-opt-001",
      status: "accepted",
    });
    const repository = createMaterialRepository({
      findRetryMessage: vi.fn().mockResolvedValue({
        id: 538,
        optNo: "failed-opt-538",
        senderType: "agent",
      }),
      findAsyncOperationByOptNo: vi.fn().mockResolvedValue({
        optParams: JSON.stringify({ msgData }),
      }),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "conv-001",
        platform: 5,
        seatHostSubUserId: "101",
        seatId: "12",
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 272,
      }),
    });
    const service = createWorkbenchService(repository, javaClient);

    await service.retryMessage("101", {
      conversationId: "conv-001",
      messageSeq: 538,
    });

    expect(javaClient.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        failMsgId: 538,
        msgData,
        sendType: 1,
        thirdExternalUserid: "external-001",
        thirdUserId: "seat-user-001",
      }),
    );
  });

  it.each([
    ["missing params", null, "retry_operation_params_missing"],
    ["invalid json", "{", "retry_operation_params_invalid_json"],
    ["missing msgData", JSON.stringify({}), "retry_message_data_missing"],
    [
      "missing text",
      JSON.stringify({ msgData: { msgtype: "text" } }),
      "retry_text_invalid",
    ],
    [
      "invalid quote",
      JSON.stringify({ msgData: { msgtype: "quote", text: "引用回复" } }),
      "retry_quote_invalid",
    ],
    [
      "missing image URL",
      JSON.stringify({ msgData: { msgtype: "image" } }),
      "retry_image_url_missing",
    ],
    [
      "invalid file data",
      JSON.stringify({
        msgData: { fileName: "报价.pdf", msgtype: "file" },
      }),
      "retry_file_data_invalid",
    ],
  ])(
    "reports retry failure for %s async operation params",
    async (_label, optParams, reason) => {
      const repository = createMaterialRepository({
        findRetryMessage: vi.fn().mockResolvedValue({
          id: 538,
          optNo: "failed-opt-538",
          senderType: "agent",
        }),
        findAsyncOperationByOptNo: vi.fn().mockResolvedValue({
          optParams,
        }),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "conv-001",
          platform: 5,
          seatHostSubUserId: "101",
          seatId: "12",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 272,
        }),
      });
      const javaClient = createJavaClient();
      const service = createWorkbenchService(repository, javaClient);

      await expect(
        service.retryMessage("101", {
          conversationId: "conv-001",
          messageSeq: 538,
        }),
      ).rejects.toMatchObject({
        code: "RETRY_MESSAGE_FAILED",
        logDetails: {
          conversationId: "conv-001",
          messageSeq: 538,
          reason,
          retryOptNo: "failed-opt-538",
        },
        statusCode: 400,
      });
      expect(javaClient.sendMessage).not.toHaveBeenCalled();
    },
  );
});
