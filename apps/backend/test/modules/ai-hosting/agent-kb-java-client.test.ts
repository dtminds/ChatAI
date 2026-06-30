import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AI_HOSTING_INTERNAL_API_FAILED_CODE,
  AI_HOSTING_INTERNAL_API_USER_MESSAGE,
  createAgentKbJavaClient,
} from "../../../src/modules/ai-hosting/agent-kb-java-client.js";

describe("createAgentKbJavaClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.JAVA_INTERNAL_API_BASE_URL;
    delete process.env.JAVA_INTERNAL_API_TOKEN;
  });

  it("submits document create as urlencoded form without FAQ strategy field", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: 1001,
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

    const docId = await createAgentKbJavaClient().createKbDoc({
      docSuffix: "pdf",
      docSize: 4096,
      docType: 2,
      docUrl: "kb-docs/demo.pdf",
      kbId: 88,
      name: "产品手册",
      operatorId: "101",
      uid: 9001,
      volcStrategyResourceId: "kb-strategy-233abb0cd67b8429",
    });

    expect(docId).toBe("1001");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed-agent-kb-doc/create",
      expect.objectContaining({
        body: "uid=9001&kbId=88&docType=2&docUrl=kb-docs%2Fdemo.pdf&docSuffix=pdf&docSize=4096&name=%E4%BA%A7%E5%93%81%E6%89%8B%E5%86%8C&operatorId=101&volcStrategyResourceId=kb-strategy-233abb0cd67b8429",
        headers: expect.objectContaining({
          "content-type": "application/x-www-form-urlencoded",
        }),
        method: "POST",
      }),
    );
  });

  it("submits FAQ create with the init strategy id", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: 2002,
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

    const docId = await createAgentKbJavaClient().createKbDoc({
      docSuffix: "faq.xlsx",
      docSize: 8192,
      docType: 1,
      docUrl: "https://b5.bokr.com.cn/kb-faqs/demo.faq.xlsx",
      kbId: 88,
      name: "快捷话术导入.faq",
      operatorId: "101",
      uid: 9001,
      volcStrategyResourceId: "kb-strategy-def92e30c1456c07",
    });

    expect(docId).toBe("2002");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      "uid=9001&kbId=88&docType=1&docUrl=https%3A%2F%2Fb5.bokr.com.cn%2Fkb-faqs%2Fdemo.faq.xlsx&docSuffix=faq.xlsx&docSize=8192&name=%E5%BF%AB%E6%8D%B7%E8%AF%9D%E6%9C%AF%E5%AF%BC%E5%85%A5.faq&operatorId=101&volcStrategyResourceId=kb-strategy-def92e30c1456c07",
    );
  });

  it("submits chunk add as JSON", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: 601,
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

    const chunkId = await createAgentKbJavaClient().addKbChunk({
      chunkType: "text",
      content: "新增123",
      docId: 26,
      operatorId: "19",
      title: "新增",
      uid: 9001,
    });

    expect(chunkId).toBe("601");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      chunkType: "text",
      content: "新增123",
      docId: 26,
      operatorId: "19",
      title: "新增",
      uid: 9001,
    });
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      "content-type": "application/json",
    });
  });

  it("submits chunk page query as JSON", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          count: 1,
          error: 0,
          list: [
            {
              content: "切片正文",
              createTime: "2026-06-18T15:22:22.000Z",
              docId: 1001,
              id: 501,
              kbId: 1,
              source: 1,
              title: "切片标题",
              type: 2,
              uid: 9001,
              updateTime: "2026-06-18T15:22:22.000Z",
            },
          ],
          page: 1,
          pageSize: 10,
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    const response = await createAgentKbJavaClient().listKbChunks({
      docId: 1001,
      page: 1,
      pageSize: 10,
      uid: 9001,
    });

    expect(response).toEqual({
      count: 1,
      list: [
        expect.objectContaining({
          id: 501,
          title: "切片标题",
        }),
      ],
      page: 1,
      pageSize: 10,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://java.internal/third-internal/wap-embed-agent-kb-chunk/page",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      docId: 1001,
      page: 1,
      pageSize: 10,
      uid: 9001,
    });
  });

  it("submits chunk content filter as JSON", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          count: 0,
          error: 0,
          list: [],
          page: 1,
          pageSize: 10,
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    await createAgentKbJavaClient().listKbChunks({
      content: "核销物码",
      docId: 1001,
      page: 1,
      pageSize: 10,
      uid: 9001,
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      content: "核销物码",
      docId: 1001,
      page: 1,
      pageSize: 10,
      uid: 9001,
    });
  });

  it("submits chunk update as JSON with id", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: true,
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

    await createAgentKbJavaClient().updateKbChunk({
      chunkId: 501,
      content: "更新后的正文",
      operatorId: "19",
      title: "更新后的标题",
      uid: 9001,
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      content: "更新后的正文",
      id: 501,
      operatorId: "19",
      title: "更新后的标题",
      uid: 9001,
    });
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      "content-type": "application/json",
    });
  });

  it("submits doc delete as JSON with id", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: true,
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

    await createAgentKbJavaClient().deleteKbDoc({
      docId: 27,
      operatorId: "19",
      uid: 9001,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed-agent-kb-doc/del",
      expect.objectContaining({
        body: JSON.stringify({
          id: 27,
          operatorId: "19",
          uid: 9001,
        }),
        headers: expect.objectContaining({
          "content-type": "application/json",
        }),
        method: "POST",
      }),
    );
  });

  it("submits doc retry as JSON with id", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: true,
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

    await createAgentKbJavaClient().retryKbDoc({
      docId: 27,
      operatorId: "19",
      uid: 9001,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed-agent-kb-doc/retry",
      expect.objectContaining({
        body: JSON.stringify({
          id: 27,
          operatorId: "19",
          uid: 9001,
        }),
        headers: expect.objectContaining({
          "content-type": "application/json",
        }),
        method: "POST",
      }),
    );
  });

  it("submits chunk delete as JSON with id", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: true,
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

    await createAgentKbJavaClient().deleteKbChunk({
      chunkId: 37,
      operatorId: "19",
      uid: 9001,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed-agent-kb-chunk/del",
      expect.objectContaining({
        body: JSON.stringify({
          id: 37,
          operatorId: "19",
          uid: 9001,
        }),
        headers: expect.objectContaining({
          "content-type": "application/json",
        }),
        method: "POST",
      }),
    );
  });

  it("maps delete not found to KB_DOC_NOT_FOUND", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 40401,
          errorMsg: "DOC_NOT_FOUND",
          success: false,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    await expect(
      createAgentKbJavaClient().deleteKbDoc({
        docId: 1001,
        operatorId: "101",
        uid: 9001,
      }),
    ).rejects.toMatchObject({
      code: "KB_DOC_NOT_FOUND",
      message: "知识不存在",
    });
  });

  it("maps other Java business failures to AI hosting internal errors", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 50001,
          errorMsg: "VDB_CALL_FAILED",
          success: false,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    await expect(
      createAgentKbJavaClient().deleteKbDoc({
        docId: 1001,
        operatorId: "101",
        uid: 9001,
      }),
    ).rejects.toMatchObject({
      code: AI_HOSTING_INTERNAL_API_FAILED_CODE,
      message: "VDB_CALL_FAILED",
      statusCode: 502,
    });
  });
});
