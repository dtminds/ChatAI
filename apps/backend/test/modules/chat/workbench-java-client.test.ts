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
      new Response(JSON.stringify({ seat: { seatId: "drc" } }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await createWorkbenchJavaClient().takeOverSeat({
      seatId: "drc",
      subUserId: "101",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/internal/workbench/seats/take-over",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
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
});
