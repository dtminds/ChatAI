import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkbenchJavaClient } from "../../../src/modules/chat/workbench-java-client.js";

describe("createWorkbenchJavaClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.JAVA_INTERNAL_API_BASE_URL;
    delete process.env.JAVA_INTERNAL_API_TOKEN;
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

  it("posts conversation delete payload to the Java internal API", async () => {
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
      "https://java.internal/third-internal/wap-embed/conversation/delete",
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
        message: {
          msgContent: "今天统一看群公告",
          msgNum: 1,
          msgType: 2001,
        },
        platform: 5,
        sendType: 2,
        thirdGroupId: "group-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    ).resolves.toEqual({
      clientMessageId: "local-001",
      messageId: "opt-001",
      optNo: "opt-001",
      status: "accepted",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed/conversation/send-message",
      expect.objectContaining({
        body: JSON.stringify({
          msgDatas: [
            {
              msgContent: "今天统一看群公告",
              msgNum: 1,
              msgType: 2001,
            },
          ],
          platform: 5,
          sendType: 2,
          thirdGroupId: "group-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
        method: "POST",
      }),
    );
  });

  it("posts quoteContentBase64 in Java send-message msg data", async () => {
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
      message: {
        msgContent: "正式引用消息",
        msgNum: 1,
        msgType: 2001,
        quoteContentBase64: "base64-quote-content",
      },
      platform: 5,
      sendType: 1,
      thirdExternalUserid: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed/conversation/send-message",
      expect.objectContaining({
        body: JSON.stringify({
          msgDatas: [
            {
              msgContent: "正式引用消息",
              msgNum: 1,
              msgType: 2001,
              quoteContentBase64: "base64-quote-content",
            },
          ],
          platform: 5,
          sendType: 1,
          thirdExternalUserid: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
        method: "POST",
      }),
    );
  });
});
