import { afterEach, describe, expect, it, vi } from "vitest";
import {
  JAVA_INTERNAL_API_USER_MESSAGE,
  WORKBENCH_INTERNAL_API_BUSINESS_FAILED_CODE,
  WORKBENCH_INTERNAL_API_CONTRACT_INVALID_CODE,
  WORKBENCH_INTERNAL_API_FAILED_CODE,
  createWorkbenchJavaClient,
} from "../../../src/modules/chat/workbench-java-client.js";

describe("createWorkbenchJavaClient", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete process.env.JAVA_INTERNAL_API_BASE_URL;
    delete process.env.JAVA_INTERNAL_API_TOKEN;
    delete process.env.JAVA_INTERNAL_API_STREAM_IDLE_TIMEOUT_MS;
    delete process.env.JAVA_INTERNAL_API_TIMEOUT_MS;
  });

  it("logs structured context when download message file request fails", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    const logger = createLoggerMock();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));

    await expect(
      createWorkbenchJavaClient(logger).downloadMsgFile({
        msgInfoId: 1001,
        platform: 5,
        uid: 9001,
      }),
    ).rejects.toMatchObject({
      code: WORKBENCH_INTERNAL_API_FAILED_CODE,
      message: JAVA_INTERNAL_API_USER_MESSAGE,
      statusCode: 502,
    });

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        msgInfoId: 1001,
        operation: "download-message-file",
        path: "/third-internal/wap-embed/conversation/download-msg-file",
        platform: 5,
        reason: "TypeError",
        uid: 9001,
      }),
      "内部接口调用失败",
    );
  });

  it("maps Java envelope business failures to business errors and preserves Java errorMsg", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 123,
          errorMsg: "secret-url=https://example.com?a=b",
          success: false,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    await expect(
      createWorkbenchJavaClient().getUploadCredential({ uid: 9001 }),
    ).rejects.toMatchObject({
      code: WORKBENCH_INTERNAL_API_BUSINESS_FAILED_CODE,
      message: "secret-url=https://example.com?a=b",
      statusCode: 200,
      details: {
        error: 123,
        errorMsg: "secret-url=https://example.com?a=b",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("passes through Java HTTP failure status codes", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Service Unavailable", {
        status: 503,
      }),
    );

    await expect(
      createWorkbenchJavaClient().getUploadCredential({ uid: 9001 }),
    ).rejects.toMatchObject({
      code: WORKBENCH_INTERNAL_API_FAILED_CODE,
      message: JAVA_INTERNAL_API_USER_MESSAGE,
      statusCode: 503,
      details: {
        status: 503,
      },
    });
  });

  it("maps Java HTTP auth failures to bad gateway without hiding the upstream status", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Unauthorized", {
        status: 401,
      }),
    );

    await expect(
      createWorkbenchJavaClient().getUploadCredential({ uid: 9001 }),
    ).rejects.toMatchObject({
      code: WORKBENCH_INTERNAL_API_FAILED_CODE,
      message: JAVA_INTERNAL_API_USER_MESSAGE,
      statusCode: 502,
      details: {
        status: 401,
      },
    });
  });

  it("passes an abort signal to Java internal API requests", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    process.env.JAVA_INTERNAL_API_TOKEN = "internal-token";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: true, error: 0, errorMsg: "", success: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await createWorkbenchJavaClient().takeOverSeat({
      platform: 5,
      subId: 101,
      thirdUserId: "zhangsan",
      uid: 9001,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed/user-seat/host",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("posts seat takeover payload to the Java internal API", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: true, error: 0, errorMsg: "", success: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await createWorkbenchJavaClient().takeOverSeat({
      platform: 5,
      subId: 101,
      thirdUserId: "zhangsan",
      uid: 9001,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed/user-seat/host",
      expect.objectContaining({
        body: JSON.stringify({
          platform: 5,
          subId: 101,
          thirdUserId: "zhangsan",
          uid: 9001,
        }),
        method: "POST",
      }),
    );
  });

  it("posts smart heartbeat payload to the Java internal API", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: true, error: 0, errorMsg: "", success: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await createWorkbenchJavaClient().sendSmartHeartbeat({
      platform: 5,
      thirdExternalUserId: "external-customer-001",
      thirdUserId: "zhangsan",
      uid: 9001,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed-customer-bind-relation/smart-heartbeat",
      expect.objectContaining({
        body: JSON.stringify({
          platform: 5,
          thirdExternalUserId: "external-customer-001",
          thirdUserId: "zhangsan",
          uid: 9001,
        }),
        method: "POST",
      }),
    );
  });

  it("forwards request id to Java internal API headers and logs failures with it", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    const logger = createLoggerMock();
    logger.requestId = "req-001";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));

    await expect(
      createWorkbenchJavaClient(logger).downloadMsgFile({
        msgInfoId: 1002,
        platform: 5,
        uid: 9001,
      }),
    ).rejects.toMatchObject({
      code: WORKBENCH_INTERNAL_API_FAILED_CODE,
      message: JAVA_INTERNAL_API_USER_MESSAGE,
    });

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        msgInfoId: 1002,
        operation: "download-message-file",
        path: "/third-internal/wap-embed/conversation/download-msg-file",
        requestId: "req-001",
        reason: "TypeError",
      }),
      "内部接口调用失败",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed/conversation/download-msg-file",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-request-id": "req-001",
        }),
      }),
    );
  });

  it("posts conversation mark-read payload to the Java internal API", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: true, error: 0, errorMsg: "", success: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await createWorkbenchJavaClient().markConversationRead({
      conversationId: "88",
      platform: 5,
      uid: 9001,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed/conversation/mark-read",
      expect.objectContaining({
        body: JSON.stringify({
          conversationId: 88,
          platform: 5,
          uid: 9001,
        }),
        method: "POST",
      }),
    );
  });

  it("posts conversation mark-unread payload to the Java internal API", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: true, error: 0, errorMsg: "", success: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await createWorkbenchJavaClient().markConversationUnread({
      conversationId: "88",
      platform: 5,
      uid: 9001,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed/conversation/mark-unread",
      expect.objectContaining({
        body: JSON.stringify({
          conversationId: 88,
          platform: 5,
          uid: 9001,
        }),
        method: "POST",
      }),
    );
  });

  it("posts conversation pin payload to the Java internal API", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: true, error: 0, errorMsg: "", success: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await createWorkbenchJavaClient().pinConversation({
      conversationId: "88",
      platform: 5,
      uid: 9001,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed/conversation/pin",
      expect.objectContaining({
        body: JSON.stringify({
          conversationId: 88,
          platform: 5,
          uid: 9001,
        }),
        method: "POST",
      }),
    );
  });

  it("posts conversation unpin payload to the Java internal API", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: true, error: 0, errorMsg: "", success: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await createWorkbenchJavaClient().unpinConversation({
      conversationId: "88",
      platform: 5,
      uid: 9001,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed/conversation/unpin",
      expect.objectContaining({
        body: JSON.stringify({
          conversationId: 88,
          platform: 5,
          uid: 9001,
        }),
        method: "POST",
      }),
    );
  });

  it("posts message content update payload to the Java internal API using audit id as updateId", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: "", error: 0, errorMsg: "", success: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await createWorkbenchJavaClient().updateMessageContent({
      content: "{\"fileUrl\":\"s5/msg/voice.amr\",\"transFileUrl\":\"s5/playable-voice/voice.wav\"}",
      platform: 5,
      uid: 9001,
      updateId: 538,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed/conversation/update-message-content",
      expect.objectContaining({
        body: JSON.stringify({
          content: "{\"fileUrl\":\"s5/msg/voice.amr\",\"transFileUrl\":\"s5/playable-voice/voice.wav\"}",
          platform: 5,
          uid: 9001,
          updateId: 538,
        }),
        method: "POST",
      }),
    );
  });

  it("posts sentence recognition payload to the Java internal API using the voice URL", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: "这是一条语音识别文本",
          error: 0,
          errorMsg: "",
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    await expect(
      createWorkbenchJavaClient().recognizeSentence({
        voiceUrl: "https://b5.bokr.com.cn/s5/msg/20260525/272/voice.amr",
      }),
    ).resolves.toBe("这是一条语音识别文本");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/tencent-cloud/sentence-recognition",
      expect.objectContaining({
        body: JSON.stringify({
          voiceUrl: "https://b5.bokr.com.cn/s5/msg/20260525/272/voice.amr",
        }),
        method: "POST",
      }),
    );
  });

  it("preserves Java errorMsg when sentence recognition fails", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 1201,
          errorMsg: "语音识别音频无法解析",
          success: false,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    await expect(
      createWorkbenchJavaClient().recognizeSentence({
        voiceUrl: "https://b5.bokr.com.cn/s5/msg/20260525/272/voice.amr",
      }),
    ).rejects.toMatchObject({
      details: {
        error: 1201,
        errorMsg: "语音识别音频无法解析",
      },
      message: "语音识别音频无法解析",
    });
  });

  it("posts conversation hide payload to the Java internal API", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: true, error: 0, errorMsg: "", success: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await createWorkbenchJavaClient().deleteConversation({
      conversationId: "88",
      platform: 5,
      uid: 9001,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed/conversation/hide",
      expect.objectContaining({
        body: JSON.stringify({
          conversationId: 88,
          platform: 5,
          uid: 9001,
        }),
        method: "POST",
      }),
    );
  });

  it("posts manual-new conversation payload to the Java internal API", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: 99887766, error: 0, errorMsg: "", success: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await expect(
      createWorkbenchJavaClient().createConversation({
        chatType: 1,
        platform: 5,
        thirdExternalUserId: "external-001",
        thirdGroupId: undefined,
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    ).resolves.toEqual({ conversationId: "99887766" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed/conversation/manual-new",
      expect.objectContaining({
        body: JSON.stringify({
          chatType: 1,
          platform: 5,
          thirdExternalUserid: "external-001",
          thirdGroupId: undefined,
          thirdUserid: "seat-user-001",
          uid: 9001,
        }),
        method: "POST",
      }),
    );
  });

  it("requests COS upload credentials from the Java internal API with tenant uid", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    const uploadCredential = {
      allowPerfixs: ["chat-images/"],
      bucket: "examplebucket-1250000000",
      credentials: {
        sessionToken: "session-token",
        tmpSecretId: "tmp-secret-id",
        tmpSecretKey: "tmp-secret-key",
        token: "token",
      },
      expiration: "2026-05-13T12:00:00Z",
      expiredTime: 1778673600,
      region: "ap-guangzhou",
      requestId: "request-001",
      startTime: 1778670000,
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: uploadCredential,
          error: 0,
          errorMsg: "",
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    await expect(
      createWorkbenchJavaClient().getUploadCredential({ uid: 9001 }),
    ).resolves.toEqual(uploadCredential);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/file/get-upload-credential",
      expect.objectContaining({
        body: JSON.stringify({
          uid: 9001,
        }),
        method: "POST",
      }),
    );
  });

  it("posts message file transfer payload to the Java internal API", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: true, error: 0, errorMsg: "", success: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await createWorkbenchJavaClient().downloadMsgFile({
      msgInfoId: 1001,
      platform: 5,
      uid: 9001,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed/conversation/download-msg-file",
      expect.objectContaining({
        body: JSON.stringify({
          msgInfoId: 1001,
          platform: 5,
          uid: 9001,
        }),
        method: "POST",
      }),
    );
  });

  it("posts revoke message payload and preserves Java errorMsg", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { optNo: "revoke-opt-001" }, error: 0, errorMsg: "", success: true }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 601, errorMsg: "已超过撤回时间", success: false }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );

    await expect(
      createWorkbenchJavaClient().revokeMessage({
        platform: 5,
        revokeMsgId: 321,
        uid: 9001,
      }),
    ).resolves.toEqual({ optNo: "revoke-opt-001" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://java.internal/third-internal/wap-embed/conversation/revoke-message",
      expect.objectContaining({
        body: JSON.stringify({
          platform: 5,
          revokeMsgId: 321,
          uid: 9001,
        }),
        method: "POST",
      }),
    );

    await expect(
      createWorkbenchJavaClient().revokeMessage({
        platform: 5,
        revokeMsgId: 322,
        uid: 9001,
      }),
    ).rejects.toMatchObject({
      details: {
        error: 601,
        errorMsg: "已超过撤回时间",
      },
      message: "已超过撤回时间",
    });
  });

  it("posts a single text message to the Java send-message API", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { optNo: "opt-001" },
          error: 0,
          errorMsg: "",
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    await expect(
      createWorkbenchJavaClient().sendMessage({
        clientMessageId: "local-001",
        msgData: {
          msgtype: "text",
          text: "今天统一看群公告",
        },
        platform: 5,
        sendType: 2,
        source: 1,
        thirdGroupId: "group-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    ).resolves.toEqual({
      clientMessageId: "local-001",
      optNo: "opt-001",
      status: "accepted",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed/conversation/send-message",
      expect.objectContaining({
        body: JSON.stringify({
          msgData: {
            msgtype: "text",
            text: "今天统一看群公告",
          },
          platform: 5,
          sendType: 2,
          source: 1,
          thirdGroupId: "group-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
        method: "POST",
      }),
    );
  });

  it("posts failMsgId for retry send-message requests", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { optNo: "opt-retry-001" },
          error: 0,
          errorMsg: "",
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    await createWorkbenchJavaClient().sendMessage({
      clientMessageId: "local-retry-001",
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

    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed/conversation/send-message",
      expect.objectContaining({
        body: JSON.stringify({
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
        }),
        method: "POST",
      }),
    );
  });

  it("posts local quote msgData to the Java send-message API", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { optNo: "opt-quote-001" },
          error: 0,
          errorMsg: "",
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    await createWorkbenchJavaClient().sendMessage({
      clientMessageId: "local-quote-001",
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

    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed/conversation/send-message",
      expect.objectContaining({
        body: JSON.stringify({
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
        }),
        method: "POST",
      }),
    );
  });

  it("posts h5 link msgData to the Java send-message API", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { optNo: "opt-link-001" },
          error: 0,
          errorMsg: "",
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    await createWorkbenchJavaClient().sendMessage({
      clientMessageId: "local-link-001",
      msgData: {
        coverUrl: "https://example.com/cover.png",
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

    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed/conversation/send-message",
      expect.objectContaining({
        body: JSON.stringify({
          msgData: {
            coverUrl: "https://example.com/cover.png",
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
        }),
        method: "POST",
      }),
    );
  });

  it("requests user history answer list with conversation scope fields", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              analyseMsgId: 1001,
              assistantName: "护肤小助手",
              recommendAnswer: "您好",
              status: 2,
            },
          ],
          error: 0,
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    await expect(
      createWorkbenchJavaClient().listUserHistoryAnswers({
        chatType: 1,
        msgIds: [1001],
        thirdExternalId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    ).resolves.toEqual({
      suggestions: [
        {
          assistantName: "护肤小助手",
          content: "您好",
          generateStatus: 2,
          messageId: "1001",
          pollComplete: true,
          status: "ready",
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed-msg-audit-recommend-answer/user-history-answer-list",
      expect.objectContaining({
        body: JSON.stringify({
          chatType: 1,
          msgIds: [1001],
          thirdExternalId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
          withCacheSeat: true,
        }),
        method: "POST",
      }),
    );
  });

  it("treats error:0 as success when Java returns success:false for empty smart reply list", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [],
          error: 0,
          success: false,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    await expect(
      createWorkbenchJavaClient().listUserHistoryAnswers({
        chatType: 1,
        msgIds: [1001],
        thirdExternalId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    ).resolves.toEqual({ suggestions: [] });
  });

  it("posts general-answer requests with smart reply scope fields", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            analyseMsgId: 1121,
            assistantName: "护肤小助手",
            recommendAnswer: "您好",
            status: 0,
          },
          error: 0,
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    await expect(
      createWorkbenchJavaClient().requestGeneralAnswer({
        chatType: 1,
        msgId: 1121,
        questionImgs: ["https://example.com/image.png"],
        thirdExternalId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    ).resolves.toEqual({
      suggestion: {
        assistantName: "护肤小助手",
        content: "您好",
        generateStatus: 0,
        messageId: "1121",
        status: "thinking",
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed-msg-audit-recommend-answer/general-answer",
      expect.objectContaining({
        body: JSON.stringify({
          chatType: 1,
          msgId: 1121,
          questionImgs: ["https://example.com/image.png"],
          thirdExternalId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
        method: "POST",
      }),
    );
  });

  it("preserves Java errorMsg when general-answer request fails", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 999,
          errorMsg: "当前未配置可用AI助手",
          success: false,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    await expect(
      createWorkbenchJavaClient().requestGeneralAnswer({
        chatType: 1,
        msgId: 1324,
        questionImgs: [],
        thirdExternalId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 272,
      }),
    ).rejects.toMatchObject({
      code: WORKBENCH_INTERNAL_API_BUSINESS_FAILED_CODE,
      details: {
        error: 999,
        errorMsg: "当前未配置可用AI助手",
      },
      message: "当前未配置可用AI助手",
      statusCode: 200,
    });
  });

  it("accepts string ids from auto-general-answer", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: "EUBrlqBJuTzR6E1LVFl0xg",
          },
          error: 0,
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    await expect(
      createWorkbenchJavaClient().requestAutoGeneralAnswer({
        chatType: 1,
        msgId: 1418,
        thirdExternalId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 272,
      }),
    ).resolves.toEqual({
      id: "EUBrlqBJuTzR6E1LVFl0xg",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed-msg-audit-recommend-answer/auto-general-answer",
      expect.objectContaining({
        body: JSON.stringify({
          chatType: 1,
          msgId: 1418,
          thirdExternalId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 272,
        }),
        method: "POST",
      }),
    );
  });

  it("reports contract errors when auto-general-answer has no id", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {},
          error: 0,
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    await expect(
      createWorkbenchJavaClient().requestAutoGeneralAnswer({
        chatType: 1,
        msgId: 1418,
        thirdExternalId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 272,
      }),
    ).rejects.toMatchObject({
      code: WORKBENCH_INTERNAL_API_CONTRACT_INVALID_CODE,
      message: JAVA_INTERNAL_API_USER_MESSAGE,
      statusCode: 502,
    });
  });

  it("posts attachment list requests with ids and uid", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              fileName: "产品图.png",
              fileType: 1,
              id: 101,
            },
          ],
          error: 0,
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    await expect(
      createWorkbenchJavaClient().listAttachments({
        ids: [101, 102],
        uid: 9001,
      }),
    ).resolves.toEqual({
      attachments: [
        {
          fileName: "产品图.png",
          fileType: 1,
          id: 101,
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/attachment/list",
      expect.objectContaining({
        body: JSON.stringify({
          ids: [101, 102],
          uid: 9001,
        }),
        method: "POST",
      }),
    );
  });

  it("posts knowledge page requests with page, pageSize and uid", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          count: 1,
          error: 0,
          list: [
            {
              id: 101,
              name: "护肤知识集",
            },
          ],
          page: 1,
          pageSize: 9999,
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    const client = createWorkbenchJavaClient(createLoggerMock());
    const response = await client.listKnowledgePage({
      page: 1,
      pageSize: 9999,
      uid: 9001,
    });

    expect(response).toEqual({
      list: [
        {
          id: "101",
          name: "护肤知识集",
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed-knowledge/page",
      expect.objectContaining({
        body: JSON.stringify({
          page: 1,
          pageSize: 9999,
          uid: 9001,
        }),
        method: "POST",
      }),
    );
  });

  it("posts knowledge doc page requests with knowledgeId, page, pageSize and uid", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          count: 1,
          error: 0,
          list: [
            {
              id: 1001,
              title: "敏感肌如何护理",
            },
          ],
          page: 1,
          pageSize: 9999,
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    const client = createWorkbenchJavaClient(createLoggerMock());
    const response = await client.listKnowledgeDocPage({
      knowledgeId: "W7zU2fWkVSp65OTAjDd3-w",
      page: 1,
      pageSize: 9999,
      uid: 9001,
    });

    expect(response).toEqual({
      list: [
        {
          id: "1001",
          name: "敏感肌如何护理",
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed-knowledge-doc/page",
      expect.objectContaining({
        body: JSON.stringify({
          knowledgeId: "W7zU2fWkVSp65OTAjDd3-w",
          page: 1,
          pageSize: 9999,
          uid: 9001,
        }),
        method: "POST",
      }),
    );
  });

  it("posts knowledge faq add requests with docId, source, uid and list", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: "zJd3NJJ8B9PmN2vpdbmUKg",
          error: 0,
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    const client = createWorkbenchJavaClient(createLoggerMock());
    const response = await client.addKnowledgeFaq({
      docId: "zJd3NJJ8B9PmN2vpdbmUKg",
      list: [
        {
          answer: "测试答案",
          attachIds: "101,102",
          question: "测试问题",
          similarQuestion: "相似1\n相似2",
        },
      ],
      source: 1,
      uid: 9001,
    });

    expect(response).toEqual({
      docId: "zJd3NJJ8B9PmN2vpdbmUKg",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed-knowledge-faq/add",
      expect.objectContaining({
        body: JSON.stringify({
          docId: "zJd3NJJ8B9PmN2vpdbmUKg",
          list: [
            {
              answer: "测试答案",
              attachIds: "101,102",
              question: "测试问题",
              similarQuestion: "相似1\n相似2",
            },
          ],
          source: 1,
          uid: 9001,
        }),
        method: "POST",
      }),
    );
  });

  it("calls text moderation plus with content and type", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            riskItems: [
              {
                customizedHit: {
                  keyWords: "最好",
                  libName: "广告法_通用禁用极限词",
                },
                description: "广告法_通用禁用极限词",
                label: "customized",
                riskWords: "最好",
              },
            ],
            riskLevel: "high",
          },
          error: 0,
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    const client = createWorkbenchJavaClient(createLoggerMock());
    const response = await client.checkTextModerationPlus({
      content: "这是最好的产品",
      uid: 9001,
    });

    expect(response).toEqual({
      result: {
        categoryLabel: "广告法_通用禁用极限词",
        words: ["最好"],
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/ai-helper/text-moderation-plus?uid=9001",
      expect.objectContaining({
        body: JSON.stringify({
          content: "这是最好的产品",
          type: "plus",
        }),
        method: "POST",
      }),
    );
  });

  it("loads msg audit knowledge config by uid", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            automaticCheckIllegalWords: 1,
          },
          error: 0,
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    const client = createWorkbenchJavaClient(createLoggerMock());
    const response = await client.getKnowledgeConfig({
      uid: 9001,
    });

    expect(response).toEqual({
      config: {
        automaticCheckIllegalWords: 1,
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/msg-audit-knowledge/get-knowledge-config?uid=9001",
      expect.objectContaining({
        body: JSON.stringify({}),
        method: "POST",
      }),
    );
  });

  it("loads ai helper template config param id", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            configData: [{ id: 30, name: "content" }],
          },
          error: 0,
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    const client = createWorkbenchJavaClient(createLoggerMock());
    const configParamId = await client.getAiHelperTemplate({
      templateId: 17,
      uid: 9001,
    });

    expect(configParamId).toBe(30);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/ai-helper/get-template",
      expect.objectContaining({
        body: JSON.stringify({
          templateId: 17,
          uid: 9001,
        }),
        method: "POST",
      }),
    );
  });

  it("submits ai helper generate ask and returns generateId", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            generateId: "gen-001",
          },
          error: 0,
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    const client = createWorkbenchJavaClient(createLoggerMock());
    const response = await client.submitAiHelperGenerateAsk({
      params: [
        {
          id: 30,
          value: ["当前智能回答内容"],
        },
      ],
      templateId: 17,
      uid: 9001,
    });

    expect(response).toEqual({ generateId: "gen-001" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/ai-helper/generate-ask?uid=9001",
      expect.objectContaining({
        body: JSON.stringify({
          params: [
            {
              id: 30,
              value: ["当前智能回答内容"],
            },
          ],
          templateId: 17,
        }),
        method: "POST",
      }),
    );
  });

  it("posts send-answer requests with real answer and attach ids", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: true,
          error: 0,
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    const client = createWorkbenchJavaClient(createLoggerMock());
    await client.sendRecommendAnswer({
      realAnswer: "您好，这是发送的话术",
      realAttachIds: ["101", "102"],
      recordId: "88001",
      uid: 9001,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed-msg-audit-recommend-answer/send-answer",
      expect.objectContaining({
        body: JSON.stringify({
          realAnswer: "您好，这是发送的话术",
          realAttachIds: ["101", "102"],
          recordId: 88001,
          uid: 9001,
        }),
        method: "POST",
      }),
    );
  });

  it("streams ai helper ask and returns trimmed content", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("  更短的话术  ", {
        headers: { "content-type": "text/event-stream;charset=UTF-8" },
        status: 200,
      }),
    );

    const client = createWorkbenchJavaClient(createLoggerMock());
    const content = await client.streamAiHelperAsk({
      generateId: "2571",
      uid: 9001,
    });

    expect(content).toBe("更短的话术");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/ai-helper/ask?uid=9001",
      expect.objectContaining({
        body: JSON.stringify({ generateId: 2571 }),
        headers: expect.objectContaining({
          accept: "text/event-stream",
        }),
        method: "POST",
      }),
    );
  });

  it("uses the stream idle timeout instead of the generic Java timeout while reading ai helper streams", async () => {
    vi.useFakeTimers();
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    process.env.JAVA_INTERNAL_API_TIMEOUT_MS = "5";
    process.env.JAVA_INTERNAL_API_STREAM_IDLE_TIMEOUT_MS = "60";
    const encoder = new TextEncoder();
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      const signal = init?.signal as AbortSignal;

      return Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              signal.addEventListener("abort", () => {
                controller.error(new DOMException("Aborted", "AbortError"));
              });
              setTimeout(() => {
                controller.enqueue(encoder.encode("  慢生成结果  "));
                controller.close();
              }, 10);
            },
          }),
          {
            headers: { "content-type": "text/event-stream;charset=UTF-8" },
            status: 200,
          },
        ),
      );
    });

    const contentPromise = createWorkbenchJavaClient(createLoggerMock())
      .streamAiHelperAsk({
        generateId: "2571",
        uid: 9001,
      });

    await vi.advanceTimersByTimeAsync(10);

    await expect(contentPromise).resolves.toBe("慢生成结果");
  });

  it("aborts ai helper streams when no chunk arrives before the stream idle timeout", async () => {
    vi.useFakeTimers();
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    process.env.JAVA_INTERNAL_API_STREAM_IDLE_TIMEOUT_MS = "20";
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      const signal = init?.signal as AbortSignal;

      return Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              signal.addEventListener("abort", () => {
                controller.error(new DOMException("Aborted", "AbortError"));
              });
            },
          }),
          {
            headers: { "content-type": "text/event-stream;charset=UTF-8" },
            status: 200,
          },
        ),
      );
    });

    const contentPromise = createWorkbenchJavaClient(createLoggerMock())
      .streamAiHelperAsk({
        generateId: "2571",
        uid: 9001,
      });
    const rejectionExpectation = expect(contentPromise).rejects.toMatchObject({
      code: WORKBENCH_INTERNAL_API_FAILED_CODE,
      message: JAVA_INTERNAL_API_USER_MESSAGE,
    });

    await vi.advanceTimersByTimeAsync(20);

    await rejectionExpectation;
  });
});

function createLoggerMock() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    requestId: undefined,
  } as ReturnType<typeof createLoggerMock> & { requestId?: string };
}
